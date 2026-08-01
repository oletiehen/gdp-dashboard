import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import webPush from "web-push";
import { createAiService, publicAiError } from "./ai.js";
import { validateRuntimeConfiguration } from "./config.js";
import { createPasskeyService } from "./passkeys.js";
import { createPushService } from "./push.js";
import { createFileStore } from "./store.js";
import { createSealer, createSessionManager, safeEqual, sameOrigin } from "./security.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, "../..");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "application/json"]);
const ALLOWED_SCAN_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function makeError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

async function loadPrivateProfile(env) {
  if (env.PRIVATE_PROFILE_JSON) return JSON.parse(env.PRIVATE_PROFILE_JSON);
  if (env.PRIVATE_PROFILE_FILE) return JSON.parse(await fs.readFile(path.resolve(env.PRIVATE_PROFILE_FILE), "utf8"));
  try {
    return JSON.parse(await fs.readFile(path.join(projectRoot, ".data", "private-profile.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function resolvePublicDirectory(env, override) {
  if (override) return path.resolve(override);
  const source = path.join(projectRoot, "public");
  if (env.NODE_ENV !== "production") return source;
  const build = path.join(projectRoot, "dist");
  try {
    await fs.access(path.join(build, "index.html"));
    return build;
  } catch {
    // Keeps the existing Render service available if it starts before its
    // build command has been updated. The release build remains preferred.
    return source;
  }
}

function validateCipherEnvelope(envelope) {
  const valid = envelope && envelope.v === 1 && typeof envelope.iv === "string" && typeof envelope.data === "string";
  if (!valid || envelope.iv.length > 128 || envelope.data.length > 12_000_000) throw makeError(400, "INVALID_ENVELOPE", "Die verschlüsselte Sicherung ist ungültig oder zu groß.");
  return { v: 1, iv: envelope.iv, data: envelope.data };
}

function cleanAssistantContext(value) {
  if (!value || typeof value !== "object") return {};
  return {
    displayName: String(value.displayName || "").slice(0, 80),
    admission: value.admission && typeof value.admission === "object" ? {
      date: String(value.admission.date || "").slice(0, 10),
      status: ["open", "expected", "confirmed"].includes(value.admission.status) ? value.admission.status : "open"
    } : { date: "", status: "open" },
    nextTask: String(value.nextTask || "").slice(0, 500),
    upcoming: Array.isArray(value.upcoming) ? value.upcoming.slice(0, 10).map(item => String(item).slice(0, 300)) : [],
    recentCheckins: Array.isArray(value.recentCheckins) ? value.recentCheckins.slice(-5).map(item => String(item).slice(0, 400)) : [],
    goals: Array.isArray(value.goals) ? value.goals.slice(0, 10).map(item => String(item).slice(0, 300)) : [],
    careTeam: Array.isArray(value.careTeam) ? value.careTeam.slice(0, 8).map(item => ({ role: String(item.role || "").slice(0, 80), name: String(item.name || "").slice(0, 120) })) : []
  };
}

function deriveVaultKeyMaterial(accessCode, saltBase64) {
  return crypto.pbkdf2Sync(accessCode, Buffer.from(saltBase64, "base64"), 310_000, 32, "sha256").toString("base64");
}

export async function createApp(options = {}) {
  const env = options.env || process.env;
  validateRuntimeConfiguration(env);
  const accessCode = String(env.APP_ACCESS_CODE || "");
  const allowAccessCodeLogin = env.ALLOW_ACCESS_CODE_LOGIN !== "false";
  const secureCookies = env.NODE_ENV !== "test" && env.COOKIE_SECURE !== "false";
  const sealerSecret = env.DATA_ENCRYPTION_KEY || accessCode;
  const sealer = sealerSecret ? createSealer(sealerSecret) : null;
  const store = options.store || createFileStore({
    dataDir: env.DATA_DIR || path.join(projectRoot, ".data"),
    sealer,
    initialVaultSalt: env.VAULT_SALT
  });
  await store.initialize();
  const session = createSessionManager({
    accessCode: accessCode || "development-disabled",
    sessionSecret: env.SESSION_SECRET,
    store,
    secureCookies,
    passkeyTtlMs: Number(env.PASSKEY_SESSION_DAYS || 30) * 24 * 60 * 60 * 1000,
    rotationMs: Number(env.SESSION_ROTATION_HOURS || 24) * 60 * 60 * 1000
  });
  const passkeys = createPasskeyService({ store, env, implementation: options.webauthn });
  if (!allowAccessCodeLogin && !(await passkeys.status()).configured) {
    throw makeError(503, "PASSKEY_SETUP_REQUIRED", "Die Code-Anmeldung darf erst nach einer bestätigten Passkey-Einrichtung deaktiviert werden.");
  }
  const ai = options.ai || createAiService({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || "gpt-5.4-mini",
    mockMode: env.NODE_ENV === "test" && env.AI_MOCK_MODE === "true"
  });
  const push = options.push || createPushService({
    webPush: options.webPush || webPush,
    store,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    contact: env.VAPID_CONTACT || "mailto:admin@example.invalid"
  });
  const privateProfile = await loadPrivateProfile(env).catch(() => null);
  const publicDir = await resolvePublicDirectory(env, options.publicDir);
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        mediaSrc: ["'self'", "blob:"],
        frameSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "no-referrer" }
  }));
  app.use(express.json({ limit: "10mb" }));

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(env.LOGIN_RATE_LIMIT || 12), standardHeaders: "draft-8", legacyHeaders: false, message: { error: { code: "LOGIN_RATE_LIMIT", message: "Zu viele Anmeldeversuche. Bitte warte einige Minuten." } } });
  const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 80, standardHeaders: "draft-8", legacyHeaders: false, message: { error: { code: "API_RATE_LIMIT", message: "Zu viele Anfragen. Bitte warte kurz." } } });
  const scanLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false, message: { error: { code: "SCAN_RATE_LIMIT", message: "Zu viele Dokumentanalysen. Bitte warte kurz." } } });

  app.get("/api/health", async (_req, res) => {
    const passkey = await passkeys.status();
    res.json({
      ok: true,
      version: "1.0.0",
      runtime: "node",
      aiConfigured: ai.configured,
      accessConfigured: Boolean(accessCode),
      accessCodeLoginAllowed: allowAccessCodeLogin,
      passkeyConfigured: passkey.configured,
      syncConfigured: Boolean(accessCode),
      pushConfigured: push.configured,
      storage: "client-encrypted-file-store"
    });
  });

  async function sessionPayload({ includeVaultKey = false, authMethod = "access-code" } = {}) {
    const vaultSalt = await store.getVaultSalt();
    return {
      ok: true,
      vaultSalt,
      profileSeed: privateProfile,
      profileSeedConfigured: Boolean(privateProfile),
      authMethod,
      ...(includeVaultKey ? { vaultKey: deriveVaultKeyMaterial(accessCode, vaultSalt) } : {})
    };
  }

  app.post("/api/session/login", loginLimiter, sameOrigin, async (req, res) => {
    if (!allowAccessCodeLogin) return res.status(404).json({ error: { code: "ACCESS_CODE_LOGIN_DISABLED", message: "Bitte bestätige deinen persönlichen Zugang mit Face ID, Touch ID oder Gerätecode." } });
    if (!accessCode) return res.status(503).json({ error: { code: "ACCESS_NOT_CONFIGURED", message: "Der persönliche Zugang ist auf dem Server noch nicht eingerichtet." } });
    const submitted = String(req.body?.accessCode || "");
    if (!safeEqual(submitted, accessCode)) return res.status(401).json({ error: { code: "LOGIN_FAILED", message: "Der Zugangscode ist nicht korrekt." } });
    await session.revokeCurrent(req, res);
    await session.issue(res, { authMethod: "access-code", userAgent: req.get("user-agent") });
    res.set("Cache-Control", "no-store").json(await sessionPayload());
  });

  app.post("/api/auth/passkey/options", loginLimiter, sameOrigin, async (req, res) => {
    res.set("Cache-Control", "no-store").json(await passkeys.authenticationOptions({ req }));
  });
  app.post("/api/auth/passkey/verify", loginLimiter, sameOrigin, async (req, res) => {
    const credential = await passkeys.verifyAuthentication({ req, flowId: req.body?.flowId, response: req.body?.response });
    await session.revokeCurrent(req, res);
    await session.issue(res, {
      authMethod: "passkey",
      credentialId: credential.id,
      deviceId: credential.deviceId,
      userAgent: req.get("user-agent")
    });
    res.set("Cache-Control", "no-store").json(await sessionPayload({ includeVaultKey: true, authMethod: "passkey" }));
  });

  app.post("/api/auth/passkey/register/options", loginLimiter, sameOrigin, session.requireSession, async (req, res) => {
    res.set("Cache-Control", "no-store").json(await passkeys.registrationOptions({ req, session: req.authSession, deviceName: req.body?.deviceName }));
  });
  app.post("/api/auth/passkey/register/verify", loginLimiter, sameOrigin, session.requireSession, async (req, res) => {
    const credential = await passkeys.verifyRegistration({ req, session: req.authSession, flowId: req.body?.flowId, response: req.body?.response });
    await session.revokeCurrent(req, res);
    await session.issue(res, {
      authMethod: "passkey",
      credentialId: credential.id,
      deviceId: credential.deviceId,
      userAgent: req.get("user-agent")
    });
    res.set("Cache-Control", "no-store").json({ ok: true, device: { id: credential.deviceId, name: credential.name } });
  });

  app.get("/api/session", session.requireSession, async (req, res) => {
    if (req.authSession.authMethod !== "passkey") {
      return res.set("Cache-Control", "no-store").json({ ok: true, authMethod: "access-code", requiresCode: true, passkeyConfigured: (await passkeys.status()).configured });
    }
    res.set("Cache-Control", "no-store").json(await sessionPayload({ includeVaultKey: true, authMethod: "passkey" }));
  });
  app.post("/api/session/logout", session.requireSession, sameOrigin, async (req, res) => {
    await session.revokeCurrent(req, res);
    res.json({ ok: true });
  });

  app.use("/api", session.requireSession);
  app.use("/api", sameOrigin);

  app.get("/api/auth/devices", async (req, res) => res.json({ devices: await passkeys.devices(req.authSession) }));
  app.delete("/api/auth/devices/:id", async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) throw makeError(400, "INVALID_DEVICE_ID", "Die Geräte-ID ist ungültig.");
    const result = await passkeys.revokeDevice(req.params.id, { currentSession: req.authSession, allowCodeLogin: allowAccessCodeLogin });
    if (result.current) session.clearCookie(res);
    res.json(result);
  });

  app.get("/api/sync", async (_req, res) => {
    const current = await store.getSyncEnvelope();
    res.json(current || { revision: 0, updatedAt: null, envelope: null });
  });
  app.put("/api/sync", async (req, res) => {
    const envelope = validateCipherEnvelope(req.body?.envelope);
    const result = await store.putSyncEnvelope({ expectedRevision: req.body?.expectedRevision, envelope });
    if (result.conflict) return res.status(409).json({ error: { code: "SYNC_CONFLICT", message: "Auf einem anderen Gerät wurden neuere Änderungen gespeichert." }, current: result.current });
    res.json(result.current);
  });
  app.delete("/api/sync", async (_req, res) => {
    await store.clearSyncEnvelope();
    res.json({ ok: true });
  });

  app.get("/api/documents", async (_req, res) => res.json({ documents: await store.listDocuments() }));
  app.put("/api/documents/:id", express.raw({ type: "application/octet-stream", limit: "18mb" }), async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) throw makeError(400, "INVALID_DOCUMENT_ID", "Die Dokument-ID ist ungültig.");
    if (!Buffer.isBuffer(req.body) || req.body.byteLength < 20) throw makeError(400, "INVALID_DOCUMENT", "Die verschlüsselte Datei ist leer oder ungültig.");
    const record = await store.putDocument(req.params.id, req.body);
    res.status(201).json(record);
  });
  app.get("/api/documents/:id", async (req, res, next) => {
    if (!UUID_PATTERN.test(req.params.id)) return res.status(404).end();
    try {
      const buffer = await store.getDocument(req.params.id);
      res.set({ "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "Content-Disposition": "attachment" });
      res.send(buffer);
    } catch (error) {
      if (error.code === "ENOENT") return res.status(404).json({ error: { code: "DOCUMENT_NOT_FOUND", message: "Das Dokument wurde nicht gefunden." } });
      next(error);
    }
  });
  app.delete("/api/documents/:id", async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) return res.status(404).end();
    const removed = await store.deleteDocument(req.params.id);
    res.json({ removed });
  });

  app.get("/api/push/status", async (_req, res) => {
    const data = await store.readPushData().catch(() => ({ subscriptions: [], reminders: [] }));
    res.json({ configured: push.configured, subscribed: data.subscriptions.length > 0, reminders: data.reminders.length });
  });
  app.get("/api/push/public-key", (_req, res) => res.json({ configured: push.configured, publicKey: push.publicKey }));
  app.post("/api/push/subscribe", async (req, res) => res.status(201).json(await push.subscribe(req.body?.subscription)));
  app.post("/api/push/unsubscribe", async (req, res) => res.json({ removed: await push.unsubscribe(String(req.body?.endpoint || "")) }));
  app.put("/api/push/reminders", async (req, res) => {
    const reminders = Array.isArray(req.body?.reminders) ? req.body.reminders : [];
    res.json({ count: await push.replaceReminders(reminders) });
  });
  app.post("/api/push/test", async (_req, res) => res.json({ sent: await push.sendTest() }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024, files: 1 }
  });
  app.post("/api/analyze-plan", scanLimiter, upload.single("document"), async (req, res) => {
    if (!req.file) throw makeError(400, "SCAN_FILE_REQUIRED", "Bitte wähle eine PDF-, JPG-, PNG- oder WebP-Datei bis 12 MB.");
    const detected = await fileTypeFromBuffer(req.file.buffer);
    const mimetype = detected?.mime || (req.file.buffer.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : "");
    if (!ALLOWED_SCAN_TYPES.has(mimetype)) throw makeError(400, "SCAN_FILE_TYPE", "Dieser Dateityp kann nicht als Therapieplan analysiert werden.");
    try {
      const result = await ai.analyzePlan({ mimetype, filename: String(req.file.originalname || "therapieplan").slice(0, 180), buffer: req.file.buffer });
      res.json(result);
    } catch (error) {
      error.isAiError = true;
      throw error;
    }
  });
  app.post("/api/assistant", apiLimiter, async (req, res) => {
    const message = String(req.body?.message || "").trim().slice(0, 4000);
    if (!message) throw makeError(400, "MESSAGE_REQUIRED", "Bitte schreibe zuerst eine Nachricht.");
    try {
      const reply = await ai.assistant({ message, context: cleanAssistantContext(req.body?.context) });
      res.json({ reply });
    } catch (error) {
      error.isAiError = true;
      throw error;
    }
  });

  app.delete("/api/account/data", async (_req, res) => res.json({ ok: true, ...(await store.clearAll()) }));

  app.use(express.static(publicDir, { maxAge: env.NODE_ENV === "production" ? "1h" : 0, etag: true, index: "index.html" }));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

  app.use((error, req, res, _next) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: { code: "UPLOAD_FAILED", message: "Die Datei ist zu groß oder konnte nicht gelesen werden." } });
    if (error?.isAiError || String(error?.code || "").startsWith("AI_") || error?.name?.startsWith("API")) {
      const safe = publicAiError(error);
      return res.status(safe.status).json({ error: safe });
    }
    const status = Number(error?.status || 500);
    const code = String(error?.code || "INTERNAL_ERROR");
    if (status >= 500) console.error(JSON.stringify({ event: "request_failed", status, code, path: req.path }));
    res.status(status).json({ error: { code, message: status >= 500 ? "Der Dienst ist vorübergehend nicht erreichbar. Bitte versuche es später erneut." : String(error?.message || "Die Anfrage konnte nicht verarbeitet werden.") } });
  });

  app.locals.services = { store, ai, push, passkeys, session };
  return app;
}

export { ALLOWED_DOCUMENT_TYPES };
