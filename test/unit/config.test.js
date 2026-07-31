import assert from "node:assert/strict";
import test from "node:test";
import { validateRuntimeConfiguration } from "../../src/server/config.js";

function validProductionEnvironment() {
  return {
    NODE_ENV: "production",
    APP_ACCESS_CODE: "synthetic-access-code",
    SESSION_SECRET: "S".repeat(48),
    DATA_ENCRYPTION_KEY: "D".repeat(48),
    PASSKEY_RP_ID: "candidate.invalid",
    PASSKEY_ORIGIN: "https://candidate.invalid",
    VAPID_PUBLIC_KEY: "P".repeat(87),
    VAPID_PRIVATE_KEY: "V".repeat(43),
    VAPID_CONTACT: "https://candidate.invalid",
    DATA_DIR: "/var/data/rehakompass",
    PRIVATE_PROFILE_JSON: JSON.stringify({
      profile: { displayName: "Testperson" },
      tasks: []
    })
  };
}

test("development and test environments do not require production secrets", () => {
  assert.doesNotThrow(() => validateRuntimeConfiguration({ NODE_ENV: "test" }));
  assert.doesNotThrow(() => validateRuntimeConfiguration({ NODE_ENV: "development" }));
});

test("the complete production configuration is accepted without exposing values", () => {
  assert.doesNotThrow(() => validateRuntimeConfiguration(validProductionEnvironment()));
});

test("every mandatory production variable fails closed when missing", () => {
  const mandatory = [
    "APP_ACCESS_CODE",
    "SESSION_SECRET",
    "DATA_ENCRYPTION_KEY",
    "PASSKEY_RP_ID",
    "PASSKEY_ORIGIN",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_CONTACT",
    "DATA_DIR",
    "PRIVATE_PROFILE_JSON"
  ];
  for (const name of mandatory) {
    const env = validProductionEnvironment();
    delete env[name];
    assert.throws(
      () => validateRuntimeConfiguration(env),
      error => error.code === "INVALID_PRODUCTION_CONFIG" && error.variable === name && !error.message.includes("synthetic-access-code")
    );
  }
});

test("invalid private profile JSON and unsafe data roots fail closed", () => {
  const invalidJson = validProductionEnvironment();
  invalidJson.PRIVATE_PROFILE_JSON = "{";
  assert.throws(() => validateRuntimeConfiguration(invalidJson), error => error.variable === "PRIVATE_PROFILE_JSON");

  const unsafeRoot = validProductionEnvironment();
  unsafeRoot.DATA_DIR = "/";
  assert.throws(() => validateRuntimeConfiguration(unsafeRoot), error => error.variable === "DATA_DIR");

  const unsafePasskeyOrigin = validProductionEnvironment();
  unsafePasskeyOrigin.PASSKEY_ORIGIN = "http://candidate.invalid/path";
  assert.throws(() => validateRuntimeConfiguration(unsafePasskeyOrigin), error => error.variable === "PASSKEY_ORIGIN");

  const insecureCookie = validProductionEnvironment();
  insecureCookie.COOKIE_SECURE = "false";
  assert.throws(() => validateRuntimeConfiguration(insecureCookie), error => error.variable === "COOKIE_SECURE");
});
