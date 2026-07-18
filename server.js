import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen. Bitte versuche es in einigen Minuten erneut." }
});

const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Zu viele Dokumentanalysen. Bitte warte kurz." }
});

function safeEqual(a = "", b = "") {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireAccess(req, res, next) {
  const configured = process.env.APP_ACCESS_CODE;
  if (!configured) return res.status(503).json({ error: "Der persoenliche Zugangscode ist auf dem Server noch nicht eingerichtet." });
  if (!safeEqual(req.get("x-app-access-code"), configured)) return res.status(401).json({ error: "Der Zugangscode ist nicht korrekt." });
  next();
}

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("Die KI ist auf dem Server noch nicht eingerichtet.");
    error.status = 503;
    throw error;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function cleanContext(value) {
  if (!value || typeof value !== "object") return {};
  return {
    admissionDate: String(value.admissionDate || "").slice(0, 10),
    today: Array.isArray(value.today) ? value.today.slice(0, 12).map(String) : [],
    upcoming: Array.isArray(value.upcoming) ? value.upcoming.slice(0, 12).map(String) : [],
    recentJournal: Array.isArray(value.recentJournal) ? value.recentJournal.slice(-5).map(String) : [],
    currentGuideStep: String(value.currentGuideStep || "").slice(0, 500),
    cleanAtAdmission: value.cleanAtAdmission === true,
    currentWeight: Number.isFinite(Number(value.currentWeight)) ? Number(value.currentWeight) : 75,
    targetWeight: Number.isFinite(Number(value.targetWeight)) ? Number(value.targetWeight) : 85
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    version: "0.7.0",
    runtime: "node",
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    accessConfigured: Boolean(process.env.APP_ACCESS_CODE)
  });
});

app.post("/api/assistant", apiLimiter, requireAccess, async (req, res, next) => {
  try {
    const message = String(req.body?.message || "").trim().slice(0, 4000);
    if (!message) return res.status(400).json({ error: "Bitte schreibe zuerst eine Nachricht." });
    const context = cleanContext(req.body?.context);
    const response = await getClient().responses.create({
      model,
      instructions: [
        "Du bist Olafs persoenlicher Reha-Begleiter: ruhig, warm, konkret und respektvoll.",
        "Antworte auf Deutsch und sprich Olaf mit Namen an, aber nicht in jedem Satz.",
        "Nutze nur den uebergebenen Kontext und erfinde keine Termine, Diagnosen oder Klinikfakten.",
        "Olaf geht clean in die Reha. Der Schwerpunkt liegt auf Stabilisierung und Rueckfallpraevention bei frueherem Diazepam-/Benzodiazepin- und Kokainkonsum, nicht auf einem von dir geplanten akuten Entzug.",
        "Olafs dokumentiertes Gewichtsziel ist von 75 auf 85 kg. Behandle es als Ziel fuer die aerztliche und ernaehrungsfachliche Therapieplanung, nicht als Anlass fuer pauschale Kalorien-, Supplement- oder Medikamentenvorgaben.",
        "Du ersetzt keine medizinische Behandlung. Aendere niemals Medikamente oder Therapien.",
        "Bei akuter Gefahr, Suizidgedanken oder medizinischem Notfall: sofort 112 und eine reale Vertrauens- oder Fachperson empfehlen.",
        "Gib zuerst eine kurze Einordnung und dann hoechstens drei machbare naechste Schritte."
      ].join(" "),
      input: `Kontext:\n${JSON.stringify(context)}\n\nOlaf schreibt:\n${message}`,
      max_output_tokens: 700
    });
    res.json({ reply: response.output_text || "Ich konnte gerade keine Antwort formulieren." });
  } catch (error) {
    next(error);
  }
});

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, allowedTypes.has(file.mimetype))
});

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "events", "warnings"],
  properties: {
    title: { type: "string" },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "weekday", "start", "end", "title", "location", "details", "confidence"],
        properties: {
          date: { type: ["string", "null"], description: "YYYY-MM-DD oder null" },
          weekday: { type: ["string", "null"] },
          start: { type: ["string", "null"], description: "HH:MM oder null" },
          end: { type: ["string", "null"], description: "HH:MM oder null" },
          title: { type: "string" },
          location: { type: ["string", "null"] },
          details: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        }
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  }
};

app.post("/api/analyze-plan", scanLimiter, requireAccess, upload.single("document"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Bitte waehle eine PDF-, JPG-, PNG- oder WebP-Datei bis 12 MB." });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    const documentInput = req.file.mimetype === "application/pdf"
      ? { type: "input_file", filename: req.file.originalname, file_data: dataUrl }
      : { type: "input_image", image_url: dataUrl, detail: "high" };
    const response = await getClient().responses.create({
      model,
      instructions: "Lies den Therapieplan sorgfaeltig. Extrahiere nur eindeutig sichtbare Termine. Erfinde nichts. Unsichere oder fehlende Angaben kommen als null und werden in warnings erklaert. Keine medizinische Interpretation.",
      input: [{ role: "user", content: [
        { type: "input_text", text: "Analysiere diesen Therapieplan. Gib alle Termine chronologisch zur Kontrolle zurueck." },
        documentInput
      ] }],
      text: { format: { type: "json_schema", name: "therapy_plan", strict: true, schema: planSchema } },
      max_output_tokens: 2500
    });
    const parsed = JSON.parse(response.output_text);
    res.json(parsed);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(publicDir, { maxAge: "1h", etag: true }));
app.get("/{*splat}", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((error, _req, res, _next) => {
  console.error(error?.name || "Error", error?.message || error);
  if (error instanceof multer.MulterError) return res.status(400).json({ error: "Die Datei ist zu gross oder konnte nicht gelesen werden." });
  const status = Number(error?.status || 500);
  const message = String(error?.message || "");
  if (status === 429 && /quota|billing|credit/i.test(message)) {
    return res.status(429).json({ error: "Die KI ist momentan pausiert, weil kein API-Guthaben verfuegbar ist. Deine Aufgaben, Checklisten, Termine und Eintraege funktionieren weiterhin ohne KI." });
  }
  if (status === 429) return res.status(429).json({ error: "Die KI hat gerade zu viele Anfragen erhalten. Bitte versuche es in einigen Minuten erneut." });
  res.status(status).json({ error: status >= 500 ? "Der Dienst ist gerade nicht erreichbar. Bitte versuche es spaeter erneut." : error.message });
});

app.listen(port, "0.0.0.0", () => console.log(`Reha-Kompass laeuft auf Port ${port}`));
