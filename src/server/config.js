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

export function validateRuntimeConfiguration(env) {
  if (env.NODE_ENV !== "production") return;

  requireString(env, "APP_ACCESS_CODE", 6);
  requireString(env, "SESSION_SECRET", 32);
  requireString(env, "DATA_ENCRYPTION_KEY", 32);

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

