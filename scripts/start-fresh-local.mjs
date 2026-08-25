import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp } from "../src/server/app.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, "..");
const MINIMUM_CODE_LENGTH = 6;
const MAXIMUM_CODE_LENGTH = 128;
const VERIFIER_ITERATIONS = 310_000;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function verifierDigest(code, salt, iterations = VERIFIER_ITERATIONS) {
  return crypto.pbkdf2Sync(String(code), Buffer.from(salt, "base64"), iterations, 32, "sha256");
}

export function validateNewAccessCode(code, confirmation) {
  const value = String(code || "");
  if (value !== value.trim()) return "Der Code darf nicht mit einem Leerzeichen beginnen oder enden.";
  if (value.length < MINIMUM_CODE_LENGTH) return `Der neue Code braucht mindestens ${MINIMUM_CODE_LENGTH} Zeichen.`;
  if (value.length > MAXIMUM_CODE_LENGTH) return `Der neue Code darf höchstens ${MAXIMUM_CODE_LENGTH} Zeichen lang sein.`;
  if (value !== String(confirmation || "")) return "Die beiden Eingaben stimmen noch nicht überein.";
  return "";
}

export function createAccessVerifier(code) {
  const salt = crypto.randomBytes(16).toString("base64");
  return {
    version: 1,
    algorithm: "pbkdf2-sha256",
    iterations: VERIFIER_ITERATIONS,
    salt,
    digest: verifierDigest(code, salt).toString("base64"),
    createdAt: new Date().toISOString()
  };
}

export function verifyAccessCode(code, verifier) {
  if (!verifier || verifier.version !== 1 || verifier.algorithm !== "pbkdf2-sha256") return false;
  const expected = Buffer.from(String(verifier.digest || ""), "base64");
  const actual = verifierDigest(code, String(verifier.salt || ""), Number(verifier.iterations || 0));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function createFreshEnvironment(baseEnvironment, { code, dataDir }) {
  return {
    ...baseEnvironment,
    NODE_ENV: "development",
    APP_ACCESS_CODE: code,
    SESSION_SECRET: code,
    DATA_ENCRYPTION_KEY: code,
    COOKIE_SECURE: "false",
    DATA_DIR: dataDir,
    VAULT_SALT: "",
    PRIVATE_PROFILE_JSON: "",
    PRIVATE_PROFILE_FILE: path.join(dataDir, "keine-alte-grundkonfiguration.json"),
    ALLOW_ACCESS_CODE_LOGIN: "true"
  };
}

async function readVerifier(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeVerifier(file, verifier) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(verifier), { mode: 0o600 });
  await fs.rename(temporary, file);
}

function pageHeaders(contentType = "text/html; charset=utf-8") {
  return {
    "cache-control": "no-store",
    "content-type": contentType,
    "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  };
}

function brandMark() {
  return `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#101821"/><rect x="4" y="4" width="56" height="56" rx="12" fill="none" stroke="#d8a938"/><circle cx="32" cy="32" r="20" fill="#0b1016" stroke="#f0c65a" stroke-width="2.5"/><path d="M22 46c2-8 5-12 10-16 6-4 8-8 9-15" fill="none" stroke="#f0c65a" stroke-width="4" stroke-linecap="round"/><path d="m41 12 5 7-8 1z" fill="#ffe39a"/><circle cx="22" cy="46" r="3" fill="#0b1016" stroke="#f0c65a" stroke-width="2"/></svg>`;
}

function setupPage({ existing, error = "" }) {
  const title = existing ? "Neuen Zugang bestätigen" : "Komplett neu beginnen";
  const intro = existing
    ? "Diese getrennte Nullversion ist bereits angelegt. Bestätige den dafür gewählten Code, um sie wieder zu starten."
    : "Lege jetzt den ersten Zugang für eine vollständig frische Reha-Kompass-Version fest.";
  const confirmation = existing ? "" : `
            <label for="confirmation">Neuen Code wiederholen</label>
            <input id="confirmation" name="confirmation" type="password" autocomplete="new-password" minlength="${MINIMUM_CODE_LENGTH}" maxlength="${MAXIMUM_CODE_LENGTH}" required>
            <label class="remember"><input name="remembered" type="checkbox" value="yes" required><span>Ich habe meinen neuen Code sicher notiert. Ohne diesen Code lassen sich die verschlüsselten Daten nicht wiederherstellen.</span></label>`;
  const button = existing ? "Nullversion mit meinem Code starten" : "Neuen Reha-Kompass einrichten";
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <meta name="theme-color" content="#0a0e13">
    <title>${title} · Olafs Reha-Kompass</title>
    <style>
      :root { color-scheme: dark; --ink:#f5f0e6; --muted:#b7bec6; --gold:#d8a938; --gold-bright:#ffdc73; --panel:#151f29; --deep:#070a0e; }
      * { box-sizing:border-box; }
      body { min-height:100vh; margin:0; display:grid; place-items:center; padding:28px 16px; background:radial-gradient(circle at 75% 0,#263542 0,#111820 42%,var(--deep) 100%); color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      main { width:min(100%,680px); padding:clamp(28px,6vw,54px); border:1.5px solid var(--gold); border-radius:34px; background:linear-gradient(145deg,rgba(29,42,53,.99),rgba(10,15,21,.99)); box-shadow:0 30px 90px rgba(0,0,0,.48),0 0 36px rgba(216,169,56,.1); }
      .brand-lockup { display:flex; align-items:center; gap:14px; margin-bottom:26px; }
      .brand-lockup span,.brand-lockup strong,.brand-lockup small { display:block; }
      .brand-lockup strong { color:var(--gold-bright); font-size:12px; letter-spacing:.16em; text-transform:uppercase; }
      .brand-lockup small { margin-top:5px; color:var(--muted); font-size:12px; }
      .mark { width:58px; height:58px; flex:0 0 auto; border-radius:14px; box-shadow:0 0 20px rgba(216,169,56,.14); }
      .eyebrow { margin:0 0 24px; color:var(--gold-bright); font-size:12px; font-weight:800; letter-spacing:.19em; text-transform:uppercase; }
      h1 { margin:0; font-size:clamp(38px,8vw,62px); line-height:.98; letter-spacing:-.055em; }
      .intro { margin:24px 0; color:var(--muted); font-size:18px; line-height:1.55; }
      .safe { margin:28px 0; padding:20px; border:1px solid rgba(216,169,56,.52); border-radius:20px; background:rgba(5,8,12,.4); }
      .safe strong { display:block; margin-bottom:10px; color:var(--gold-bright); }
      .safe ul { margin:0; padding-left:20px; color:var(--muted); line-height:1.6; }
      form { display:grid; gap:13px; margin-top:30px; }
      label { font-size:14px; font-weight:750; }
      input[type="password"] { width:100%; min-height:54px; padding:12px 16px; border:1px solid rgba(216,169,56,.62); border-radius:15px; background:#090d12; color:#fff; font:inherit; font-size:18px; }
      input:focus { outline:3px solid rgba(217,184,95,.3); outline-offset:2px; }
      .remember { display:flex; align-items:flex-start; gap:11px; margin:8px 0; color:var(--muted); font-weight:500; line-height:1.5; }
      .remember input { width:20px; height:20px; margin-top:2px; accent-color:var(--gold); flex:0 0 auto; }
      button { min-height:56px; margin-top:8px; padding:13px 18px; border:1px solid var(--gold); border-radius:999px; background:var(--gold); color:#0a1723; font:inherit; font-weight:850; cursor:pointer; }
      button:hover { background:#efd279; }
      .error { margin:18px 0 0; padding:13px 15px; border-left:3px solid #ff9f8f; background:rgba(128,28,20,.28); color:#ffd9d2; border-radius:8px; }
      .privacy { margin:22px 0 0; color:#95a5b3; font-size:13px; line-height:1.5; }
    </style>
  </head>
  <body>
    <main>
      <div class="brand-lockup">${brandMark()}<span><strong>Olaf Tiehen</strong><small>Persönlicher Reha-Kompass</small></span></div>
      <p class="eyebrow">Geschützte lokale Nullversion</p>
      <h1>${title}</h1>
      <p class="intro">${intro}</p>
      <section class="safe" aria-label="Was bei diesem Neustart gilt">
        <strong>Deine bisherige Version bleibt erhalten.</strong>
        <ul><li>keine alten Sitzungen oder Browserdaten</li><li>keine alten Termine, Aufgaben, Notizen oder Dokumente</li><li>ein eigener neuer verschlüsselter Tresor</li></ul>
      </section>
      ${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ""}
      <form method="post" action="/setup">
        <label for="accessCode">${existing ? "Code dieser Nullversion" : "Neuen persönlichen Zugangscode festlegen"}</label>
        <input id="accessCode" name="accessCode" type="password" autocomplete="${existing ? "current-password" : "new-password"}" minlength="${MINIMUM_CODE_LENGTH}" maxlength="${MAXIMUM_CODE_LENGTH}" required autofocus>
        ${confirmation}
        <button type="submit">${button}</button>
      </form>
      <p class="privacy">Der Code wird nicht in den Projektdateien gespeichert. Er bleibt nur im laufenden lokalen Prozess; auf dem Datenträger liegt ausschließlich ein gesalzener Prüfwert.</p>
    </main>
  </body>
</html>`;
}

function startingPage() {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a0e13">
    <title>Neuer Reha-Kompass wird geöffnet</title>
    <style>body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:#070a0e;color:#f5f0e6;font-family:Inter,system-ui,sans-serif;text-align:center}main{width:min(100%,620px);padding:48px;border:1.5px solid #d8a938;border-radius:30px;background:linear-gradient(145deg,#1d2a35,#0a0f15)}.mark{width:64px;height:64px;border-radius:15px}h1{color:#ffdc73;font-size:clamp(34px,7vw,54px);line-height:1.02}p{color:#b7bec6;font-size:18px;line-height:1.55}</style>
  </head>
  <body><main>${brandMark()}<h1>Dein neuer Kompass wird vorbereitet.</h1><p>Gleich erscheint die frische Anmeldeseite. Gib dort deinen gerade festgelegten Code noch einmal ein.</p></main>
    <script>const wait=async()=>{try{const response=await fetch('/api/health',{cache:'no-store'});const data=await response.json();if(response.ok&&data.ok){location.replace('/?frischer-start=1');return}}catch{}setTimeout(wait,350)};setTimeout(wait,350);</script>
  </body>
</html>`;
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw Object.assign(new Error("Die Eingabe ist zu groß."), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function validPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error("FRESH_PORT muss zwischen 1024 und 65535 liegen.");
  return port;
}

function validHost(value) {
  const host = String(value || "").trim();
  if (!new Set(["127.0.0.1", "0.0.0.0"]).has(host)) throw new Error("FRESH_HOST muss 127.0.0.1 oder 0.0.0.0 sein.");
  return host;
}

export async function startFreshLocal(environment = process.env) {
  const host = validHost(environment.FRESH_HOST || "127.0.0.1");
  const port = validPort(environment.FRESH_PORT || 4175);
  const dataDir = path.resolve(environment.FRESH_DATA_DIR || path.join(projectRoot, ".data", "local-fresh-start"));
  const verifierFile = path.join(dataDir, "access-verifier.json");
  let verifier = await readVerifier(verifierFile);
  let starting = false;
  let mainServer = null;
  let stopScheduler = () => {};

  const setupServer = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${host}:${port}`);
      if (request.method === "GET" && url.pathname === "/api/health") {
        response.writeHead(503, pageHeaders("application/json; charset=utf-8"));
        response.end(JSON.stringify({ ok: false, setupRequired: true }));
        return;
      }
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, pageHeaders());
        response.end(setupPage({ existing: Boolean(verifier) }));
        return;
      }
      if (request.method !== "POST" || url.pathname !== "/setup") {
        response.writeHead(404, pageHeaders("text/plain; charset=utf-8"));
        response.end("Nicht gefunden");
        return;
      }
      if (starting) {
        response.writeHead(409, pageHeaders());
        response.end(startingPage());
        return;
      }

      const form = new URLSearchParams(await readBody(request));
      const code = String(form.get("accessCode") || "");
      let error = "";
      if (verifier) {
        if (!verifyAccessCode(code, verifier)) error = "Der Code dieser Nullversion ist nicht korrekt.";
      } else {
        error = validateNewAccessCode(code, form.get("confirmation"));
        if (!error && form.get("remembered") !== "yes") error = "Bitte bestätige, dass du den neuen Code sicher notiert hast.";
      }
      if (error) {
        response.writeHead(400, pageHeaders());
        response.end(setupPage({ existing: Boolean(verifier), error }));
        return;
      }

      starting = true;
      if (!verifier) {
        verifier = createAccessVerifier(code);
        await writeVerifier(verifierFile, verifier);
      }
      const appEnvironment = createFreshEnvironment(environment, { code, dataDir });
      const app = await createApp({ env: appEnvironment });
      response.writeHead(200, pageHeaders());
      response.end(startingPage());
      response.on("finish", () => {
        setupServer.close(() => {
          mainServer = app.listen(port, host, () => {
            stopScheduler = app.locals.services.push.startScheduler();
            console.log(JSON.stringify({ event: "fresh_local_started", host, port, storage: "isolated", version: "1.0.0" }));
          });
        });
      });
    } catch (error) {
      starting = false;
      response.writeHead(Number(error.status || 500), pageHeaders());
      response.end(setupPage({ existing: Boolean(verifier), error: error.status ? error.message : "Der sichere Erststart konnte noch nicht vorbereitet werden." }));
    }
  });

  function shutdown() {
    stopScheduler();
    if (mainServer) mainServer.close(() => process.exit(0));
    else setupServer.close(() => process.exit(0));
  }

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  await new Promise((resolve, reject) => {
    setupServer.once("error", reject);
    setupServer.listen(port, host, resolve);
  });
  console.log(JSON.stringify({ event: "fresh_local_setup_ready", host, port, existing: Boolean(verifier), storage: "isolated" }));
  return { host, port, dataDir, setupServer };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  startFreshLocal().catch(error => {
    console.error(JSON.stringify({ event: "fresh_local_failed", code: String(error.code || "FRESH_LOCAL_FAILED") }));
    process.exitCode = 1;
  });
}
