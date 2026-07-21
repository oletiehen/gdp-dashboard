import OpenAI from "openai";

export const planSchema = {
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isQuotaError(error) {
  return Number(error?.status) === 429 && /quota|billing|credit|insufficient_quota/i.test(String(error?.message || error?.code || ""));
}

function isRetryable(error) {
  return !isQuotaError(error) && ([408, 409, 429, 500, 502, 503, 504].includes(Number(error?.status)) || error?.name === "APIConnectionTimeoutError");
}

async function withControlledRetry(operation) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === 1) throw error;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError;
}

function validatePlan(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.events) || !Array.isArray(value.warnings)) throw Object.assign(new Error("invalid_provider_response"), { code: "INVALID_AI_RESPONSE", status: 502 });
  for (const event of value.events) {
    if (!event || typeof event.title !== "string" || typeof event.confidence !== "number") throw Object.assign(new Error("invalid_provider_response"), { code: "INVALID_AI_RESPONSE", status: 502 });
  }
  return value;
}

export function createAiService({ apiKey, model = "gpt-5.4-mini", mockMode = false }) {
  const client = apiKey ? new OpenAI({ apiKey, timeout: 25_000, maxRetries: 0 }) : null;

  function requireClient() {
    if (!client && !mockMode) throw Object.assign(new Error("ai_not_configured"), { code: "AI_NOT_CONFIGURED", status: 503 });
  }

  async function assistant({ message, context }) {
    requireClient();
    if (mockMode) {
      if (message.includes("[TEST_429]")) throw Object.assign(new Error("rate_limit"), { status: 429, code: "RATE_LIMIT" });
      return "Ich bleibe bei einem kleinen Schritt: Prüfe zuerst die nächste offene Aufgabe und entscheide danach neu.";
    }
    const response = await withControlledRetry(() => client.responses.create({
      model,
      instructions: [
        "Du bist ein persönlicher Reha-Begleiter: ruhig, konkret, respektvoll und nicht bevormundend.",
        "Nutze ausschließlich den übergebenen Kontext. Erfinde keine Diagnosen, Termine, Klinikregeln oder persönlichen Angaben.",
        "Du organisierst, strukturierst und hilfst bei der Gesprächsvorbereitung. Du stellst keine Diagnose und änderst keine Medikamente oder Therapie.",
        "Bei akuter Gefahr, Suizidgedanken oder medizinischem Notfall verweist du sofort auf 112 und eine reale Fach- oder Vertrauensperson.",
        "Gib zuerst eine kurze Einordnung und danach höchstens drei kleine, machbare nächste Schritte."
      ].join(" "),
      input: `Geschützter Kontext:\n${JSON.stringify(context)}\n\nNachricht:\n${message}`,
      max_output_tokens: 700
    }));
    const reply = String(response.output_text || "").trim();
    if (!reply) throw Object.assign(new Error("invalid_provider_response"), { code: "INVALID_AI_RESPONSE", status: 502 });
    return reply;
  }

  async function analyzePlan({ mimetype, filename, buffer }) {
    requireClient();
    if (mockMode) {
      return {
        title: "Synthetischer Therapieplan",
        events: [{ date: "2030-06-03", weekday: "Montag", start: "09:00", end: "09:45", title: "Testgruppe", location: "Raum 2", details: null, confidence: 0.72 }],
        warnings: ["Bitte alle Angaben kontrollieren."]
      };
    }
    const dataUrl = `data:${mimetype};base64,${buffer.toString("base64")}`;
    const documentInput = mimetype === "application/pdf"
      ? { type: "input_file", filename, file_data: dataUrl }
      : { type: "input_image", image_url: dataUrl, detail: "high" };
    const response = await withControlledRetry(() => client.responses.create({
      model,
      instructions: "Lies den Therapieplan sorgfältig. Extrahiere nur sichtbar belegte Termine. Erfinde nichts. Unsichere oder fehlende Angaben werden null und zusätzlich als Warnung erklärt. Keine medizinische Interpretation.",
      input: [{ role: "user", content: [
        { type: "input_text", text: "Analysiere diesen Therapieplan und gib alle Einträge chronologisch zur verpflichtenden Nutzerkontrolle zurück." },
        documentInput
      ] }],
      text: { format: { type: "json_schema", name: "therapy_plan", strict: true, schema: planSchema } },
      max_output_tokens: 2500
    }));
    try {
      return validatePlan(JSON.parse(response.output_text));
    } catch (error) {
      if (error.code === "INVALID_AI_RESPONSE") throw error;
      throw Object.assign(new Error("invalid_provider_response"), { code: "INVALID_AI_RESPONSE", status: 502 });
    }
  }

  return { assistant, analyzePlan, configured: Boolean(apiKey) || mockMode };
}

export function publicAiError(error) {
  const status = Number(error?.status || 500);
  const code = String(error?.code || "");
  if (status === 429 && isQuotaError(error)) return { status: 429, code: "AI_QUOTA", retryable: false, message: "Die KI ist momentan pausiert, weil kein API-Guthaben verfügbar ist. Alle lokalen Funktionen bleiben nutzbar." };
  if (status === 429) return { status: 429, code: "AI_BUSY", retryable: true, message: "Die KI ist gerade ausgelastet. Dein Text bleibt erhalten; du kannst später erneut senden." };
  if (code === "AI_NOT_CONFIGURED" || status === 503) return { status: 503, code: "AI_UNAVAILABLE", retryable: true, message: "Die KI ist gerade nicht verfügbar. Der Reha-Kompass arbeitet mit seinen Offline-Hilfen weiter." };
  if (code === "INVALID_AI_RESPONSE" || status === 502) return { status: 502, code: "AI_INVALID_RESPONSE", retryable: true, message: "Die Antwort konnte nicht sicher ausgewertet werden. Es wurde nichts automatisch übernommen." };
  if (error?.name === "APIConnectionTimeoutError" || status === 408) return { status: 504, code: "AI_TIMEOUT", retryable: true, message: "Die KI hat zu lange gebraucht. Dein Text bleibt erhalten und kann erneut gesendet werden." };
  return { status: status >= 400 && status < 500 ? status : 503, code: "AI_UNAVAILABLE", retryable: true, message: "Die KI ist vorübergehend nicht erreichbar. Alle übrigen Funktionen bleiben verfügbar." };
}
