import crypto from "node:crypto";

const SESSION_COOKIE = "rehakompass_session";

export function safeEqual(left = "", right = "") {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function deriveKey(secret, purpose) {
  return crypto.hkdfSync(
    "sha256",
    Buffer.from(String(secret)),
    Buffer.from("rehakompass-v1"),
    Buffer.from(purpose),
    32
  );
}

export function createSessionManager({
  accessCode,
  sessionSecret,
  store,
  secureCookies = true,
  passkeyTtlMs = 30 * 24 * 60 * 60 * 1000,
  codeTtlMs = 12 * 60 * 60 * 1000,
  rotationMs = 24 * 60 * 60 * 1000
}) {
  const secret = sessionSecret || accessCode;
  const signingKey = deriveKey(secret, "session-signing");

  function tokenHash(token) {
    return crypto.createHmac("sha256", signingKey).update(String(token)).digest("base64url");
  }

  function sessionLifetime(authMethod) {
    return authMethod === "passkey" ? passkeyTtlMs : codeTtlMs;
  }

  function createRecord({ token, authMethod, credentialId = null, deviceId = null, userAgent = "" }) {
    const now = Date.now();
    return {
      id: crypto.randomUUID(),
      tokenHash: tokenHash(token),
      authMethod,
      credentialId,
      deviceId,
      createdAt: new Date(now).toISOString(),
      rotatedAt: new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(now + sessionLifetime(authMethod)).toISOString(),
      revokedAt: null,
      userAgent: String(userAgent || "").slice(0, 240)
    };
  }

  function readCookie(req) {
    const cookies = String(req.headers.cookie || "").split(";");
    for (const entry of cookies) {
      const [name, ...rest] = entry.trim().split("=");
      if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
    }
    return "";
  }

  function setCookie(res, token, maxAgeSeconds) {
    const flags = [
      `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${Math.max(1, Math.floor(maxAgeSeconds))}`
    ];
    if (secureCookies) flags.push("Secure");
    res.setHeader("Set-Cookie", flags.join("; "));
  }

  function clearCookie(res) {
    const flags = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
    if (secureCookies) flags.push("Secure");
    res.setHeader("Set-Cookie", flags.join("; "));
  }

  async function issue(res, details) {
    const token = crypto.randomBytes(32).toString("base64url");
    const record = createRecord({ token, ...details });
    await store.mutateAuthData(data => {
      const now = Date.now();
      data.sessions = data.sessions
        .filter(item => !item.revokedAt && Number(new Date(item.expiresAt)) > now)
        .slice(-49);
      data.sessions.push(record);
    });
    setCookie(res, token, sessionLifetime(record.authMethod) / 1000);
    return record;
  }

  async function find(req, { touch = true, rotate = true } = {}) {
    const rawToken = readCookie(req);
    if (!rawToken) return null;
    const hash = tokenHash(rawToken);
    const data = await store.readAuthData();
    const now = Date.now();
    const current = data.sessions.find(item => safeEqual(item.tokenHash, hash));
    if (!current || current.revokedAt || Number(new Date(current.expiresAt)) <= now) return null;
    if (current.credentialId) {
      const credential = data.credentials.find(item => item.id === current.credentialId);
      if (!credential || credential.revokedAt) return null;
    }
    if (touch && now - Number(new Date(current.lastSeenAt || 0)) > 5 * 60 * 1000) {
      await store.mutateAuthData(auth => {
        const session = auth.sessions.find(item => item.id === current.id);
        if (session && !session.revokedAt) session.lastSeenAt = new Date(now).toISOString();
      });
      current.lastSeenAt = new Date(now).toISOString();
    }
    current.rawToken = rawToken;
    current.rotationRequired = rotate && current.authMethod === "passkey" && now - Number(new Date(current.rotatedAt || current.createdAt)) > rotationMs;
    return current;
  }

  async function rotateSession(req, res, current) {
    const token = crypto.randomBytes(32).toString("base64url");
    const next = createRecord({
      token,
      authMethod: current.authMethod,
      credentialId: current.credentialId,
      deviceId: current.deviceId,
      userAgent: req.get("user-agent") || current.userAgent
    });
    await store.mutateAuthData(data => {
      const previous = data.sessions.find(item => item.id === current.id);
      if (previous) previous.revokedAt = new Date().toISOString();
      data.sessions = data.sessions.filter(item => !item.revokedAt || item.id === current.id).slice(-49);
      data.sessions.push(next);
    });
    setCookie(res, token, sessionLifetime(next.authMethod) / 1000);
    return next;
  }

  async function requireSession(req, res, next) {
    try {
      let current = await find(req);
      if (!current) return res.status(401).json({ error: { code: "SESSION_REQUIRED", message: "Deine sichere Sitzung ist abgelaufen. Bitte bestätige deinen Zugang erneut." } });
      if (current.rotationRequired) current = await rotateSession(req, res, current);
      req.authSession = current;
      next();
    } catch (error) {
      next(error);
    }
  }

  async function revokeCurrent(req, res) {
    const current = await find(req, { touch: false, rotate: false });
    if (current) {
      await store.mutateAuthData(data => {
        const record = data.sessions.find(item => item.id === current.id);
        if (record) record.revokedAt = new Date().toISOString();
      });
    }
    clearCookie(res);
  }

  return { issue, find, readCookie, clearCookie, requireSession, revokeCurrent };
}

export function createSealer(secret) {
  const key = deriveKey(secret, "server-data-sealing");
  return {
    seal(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const plaintext = Buffer.from(JSON.stringify(value));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return {
        v: 1,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: ciphertext.toString("base64")
      };
    },
    open(envelope) {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.data, "base64")),
        decipher.final()
      ]);
      return JSON.parse(plaintext.toString("utf8"));
    }
  };
}

export function sameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next();
  let expected;
  try {
    expected = `${req.protocol}://${req.get("host")}`;
  } catch {
    return res.status(403).json({ error: { code: "ORIGIN_REJECTED", message: "Die Anfrage wurde aus Sicherheitsgründen abgewiesen." } });
  }
  if (origin !== expected) return res.status(403).json({ error: { code: "ORIGIN_REJECTED", message: "Die Anfrage wurde aus Sicherheitsgründen abgewiesen." } });
  next();
}

export { SESSION_COOKIE };
