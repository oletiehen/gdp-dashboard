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

export function createSessionManager({ accessCode, sessionSecret, secureCookies = true }) {
  const secret = sessionSecret || accessCode;
  const signingKey = deriveKey(secret, "session-signing");

  function sign(payload) {
    return crypto.createHmac("sha256", signingKey).update(payload).digest("base64url");
  }

  function issue() {
    const body = Buffer.from(JSON.stringify({
      sub: "personal-pilot",
      iat: Date.now(),
      exp: Date.now() + 12 * 60 * 60 * 1000,
      nonce: crypto.randomBytes(12).toString("base64url")
    })).toString("base64url");
    return `${body}.${sign(body)}`;
  }

  function verify(token = "") {
    const [body, signature, extra] = String(token).split(".");
    if (!body || !signature || extra || !safeEqual(sign(body), signature)) return false;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      return payload.sub === "personal-pilot" && Number(payload.exp) > Date.now();
    } catch {
      return false;
    }
  }

  function readCookie(req) {
    const cookies = String(req.headers.cookie || "").split(";");
    for (const entry of cookies) {
      const [name, ...rest] = entry.trim().split("=");
      if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
    }
    return "";
  }

  function setCookie(res, token) {
    const flags = [
      `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      "Max-Age=43200"
    ];
    if (secureCookies) flags.push("Secure");
    res.setHeader("Set-Cookie", flags.join("; "));
  }

  function clearCookie(res) {
    const flags = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
    if (secureCookies) flags.push("Secure");
    res.setHeader("Set-Cookie", flags.join("; "));
  }

  function requireSession(req, res, next) {
    if (!verify(readCookie(req))) return res.status(401).json({ error: { code: "SESSION_REQUIRED", message: "Bitte entsperre deinen Reha-Kompass erneut." } });
    next();
  }

  return { issue, verify, readCookie, setCookie, clearCookie, requireSession };
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
