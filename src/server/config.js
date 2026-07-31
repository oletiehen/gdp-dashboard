import path from "node:path";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function configurationError(name, reason = "fehlt oder ist ungueltig") {
  const error = new Error(`Produktionskonfiguration ungueltig: ${name} ${reason}.`);
  error.code = "INVALID_PRODUCTION_CONFIG";
  error.variable = name;
  return error;
}

function requireString(env, name, minimumLength = 1) {
  const value = String(env[name] || "");
  if (value.length < minimumLength) throw configurationError(name);
  return value;
}

function validatePrivateProfile(value) {
  let profile;
  try {
    profile = JSON.parse(value);
  } catch {
    throw configurationError("PRIVATE_PROFILE_JSON", "ist kein gueltiges JSON");
  }
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw configurationError("PRIVATE_PROFILE_JSON", "muss ein JSON-Objekt sein");
  }
  if (!profile.profile || typeof profile.profile !== "object" || Array.isArray(profile.profile)) {
    throw configurationError("PRIVATE_PROFILE_JSON", "enthaelt kein Profilobjekt");
  }
  if (!Array.isArray(profile.tasks)) {
    throw configurationError("PRIVATE_PROFILE_JSON", "enthaelt keine Aufgabenliste");
  }
}

function validatePasskeyConfiguration(env) {
  const rpID = requireString(env, "PASSKEY_RP_ID", 3).toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(rpID)) {
    throw configurationError("PASSKEY_RP_ID", "muss ein Hostname ohne Protokoll oder Pfad sein");
  }
  const rawOrigin = requireString(env, "PASSKEY_ORIGIN", 10);
  let origin;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw configurationError("PASSKEY_ORIGIN", "muss eine gueltige HTTPS-Adresse sein");
  }
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || (origin.hostname !== rpID && !origin.hostname.endsWith(`.${rpID}`))) {
    throw configurationError("PASSKEY_ORIGIN", "muss eine passende HTTPS-Origin ohne Pfad sein");
  }
  for (const [name, fallback, minimum, maximum] of [
    ["PASSKEY_SESSION_DAYS", 30, 1, 90],
    ["SESSION_ROTATION_HOURS", 24, 1, 168]
  ]) {
    const value = Number(env[name] || fallback);
    if (!Number.isFinite(value) || value < minimum || value > maximum) throw configurationError(name);
  }
}

export function validateRuntimeConfiguration(env) {
  if (env.NODE_ENV !== "production") return;

  if (env.COOKIE_SECURE === "false") throw configurationError("COOKIE_SECURE", "darf in Produktion nicht deaktiviert werden");

  requireString(env, "APP_ACCESS_CODE", 6);
  requireString(env, "SESSION_SECRET", 32);
  requireString(env, "DATA_ENCRYPTION_KEY", 32);
  validatePasskeyConfiguration(env);

  const vapidPublic = requireString(env, "VAPID_PUBLIC_KEY", 80);
  const vapidPrivate = requireString(env, "VAPID_PRIVATE_KEY", 40);
  if (!BASE64URL_PATTERN.test(vapidPublic)) throw configurationError("VAPID_PUBLIC_KEY");
  if (!BASE64URL_PATTERN.test(vapidPrivate)) throw configurationError("VAPID_PRIVATE_KEY");

  const contact = requireString(env, "VAPID_CONTACT", 8);
  if (!/^(?:mailto:|https:\/\/)/i.test(contact)) throw configurationError("VAPID_CONTACT");

  const dataDir = requireString(env, "DATA_DIR", 2);
  if (!path.isAbsolute(dataDir) || path.resolve(dataDir) === path.parse(path.resolve(dataDir)).root) {
    throw configurationError("DATA_DIR", "muss ein absolutes, begrenztes Verzeichnis sein");
  }

  validatePrivateProfile(requireString(env, "PRIVATE_PROFILE_JSON", 2));
}
