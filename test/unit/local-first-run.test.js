import assert from "node:assert/strict";
import test from "node:test";
import { createAccessVerifier, createFreshEnvironment, validateNewAccessCode, verifyAccessCode } from "../../scripts/start-fresh-local.mjs";

test("a new local access code must be deliberate and repeated", () => {
  assert.match(validateNewAccessCode("kurz", "kurz"), /mindestens 6/);
  assert.match(validateNewAccessCode("neuer-code", "anderer-code"), /stimmen noch nicht/);
  assert.match(validateNewAccessCode(" neuer-code", " neuer-code"), /Leerzeichen/);
  assert.equal(validateNewAccessCode("neuer-code", "neuer-code"), "");
});

test("the local verifier confirms a code without storing it in plaintext", () => {
  const verifier = createAccessVerifier("ein-ganz-neuer-code");
  assert.equal(verifyAccessCode("ein-ganz-neuer-code", verifier), true);
  assert.equal(verifyAccessCode("falscher-code", verifier), false);
  assert.doesNotMatch(JSON.stringify(verifier), /ein-ganz-neuer-code/);
});

test("the fresh environment is isolated from private profile and prior vault settings", () => {
  const environment = createFreshEnvironment({ PRIVATE_PROFILE_JSON: "alt", VAULT_SALT: "alt" }, { code: "neuer-code", dataDir: "/tmp/rehakompass-nullversion" });
  assert.equal(environment.APP_ACCESS_CODE, "neuer-code");
  assert.equal(environment.DATA_DIR, "/tmp/rehakompass-nullversion");
  assert.equal(environment.PRIVATE_PROFILE_JSON, "");
  assert.match(environment.PRIVATE_PROFILE_FILE, /keine-alte-grundkonfiguration\.json$/);
  assert.equal(environment.VAULT_SALT, "");
  assert.equal(environment.COOKIE_SECURE, "false");
});
