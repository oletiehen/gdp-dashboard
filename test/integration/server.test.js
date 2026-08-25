import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import request from "supertest";
import { decryptBytes, deriveVaultKey, encryptBytes } from "../../public/js/crypto-vault.js";
import { createApp } from "../../src/server/app.js";

function pushFixture(configured = true) {
  let subscribed = false;
  return {
    configured,
    publicKey: configured ? "synthetic-public-key" : "",
    startScheduler: () => () => {},
    subscribe: async () => { subscribed = true; return { endpointHash: "synthetic" }; },
    unsubscribe: async () => { const value = subscribed; subscribed = false; return value; },
    replaceReminders: async reminders => reminders.length,
    sendTest: async () => subscribed ? 1 : 0
  };
}

function webauthnFixture() {
  let registrationCount = 0;
  let authenticationCount = 0;
  return {
    generateRegistrationOptions: async options => ({
      challenge: `synthetic-registration-${++registrationCount}`,
      rp: { id: options.rpID, name: options.rpName },
      user: { id: Buffer.from(options.userID).toString("base64url"), name: options.userName, displayName: options.userDisplayName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      timeout: options.timeout,
      attestation: "none",
      excludeCredentials: options.excludeCredentials,
      authenticatorSelection: options.authenticatorSelection
    }),
    verifyRegistrationResponse: async ({ response, expectedChallenge }) => {
      if (response?.syntheticChallenge !== expectedChallenge || response?.manipulated) throw new Error("synthetic invalid registration");
      return {
        verified: true,
        registrationInfo: {
          credential: { id: response.id, publicKey: new Uint8Array([1, 2, 3, 4]), counter: 0, transports: ["internal"] },
          credentialDeviceType: "multiDevice",
          credentialBackedUp: true,
          userVerified: true
        }
      };
    },
    generateAuthenticationOptions: async options => ({
      challenge: `synthetic-authentication-${++authenticationCount}`,
      rpId: options.rpID,
      timeout: options.timeout,
      allowCredentials: options.allowCredentials,
      userVerification: "required"
    }),
    verifyAuthenticationResponse: async ({ response, expectedChallenge, credential }) => {
      if (response?.syntheticChallenge !== expectedChallenge || response?.manipulated || response?.id !== credential.id) throw new Error("synthetic invalid authentication");
      return { verified: true, authenticationInfo: { newCounter: Number(credential.counter || 0) + 1, userVerified: true } };
    }
  };
}

function productionEnvironment(dataDir) {
  return {
    NODE_ENV: "production",
    APP_ACCESS_CODE: "synthetic-access-code",
    SESSION_SECRET: "S".repeat(48),
    DATA_ENCRYPTION_KEY: "D".repeat(48),
    VAULT_SALT: Buffer.alloc(16, 7).toString("base64"),
    PASSKEY_RP_ID: "candidate.invalid",
    PASSKEY_ORIGIN: "https://candidate.invalid",
    VAPID_PUBLIC_KEY: "P".repeat(87),
    VAPID_PRIVATE_KEY: "V".repeat(43),
    VAPID_CONTACT: "https://candidate.invalid",
    DATA_DIR: dataDir,
    OPENAI_API_KEY: "synthetic-key",
    PRIVATE_PROFILE_JSON: JSON.stringify({
      profile: { displayName: "Testperson" },
      tasks: [{ id: "synthetic-task", group: "Test", title: "Synthetische Aufgabe" }]
    })
  };
}

test("configured vault salt survives an ephemeral data-directory reset and rejects mismatches", async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-vault-salt-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const env = productionEnvironment(dataDir);

  const firstApp = await createApp({ env, push: pushFixture(), publicDir: "public" });
  const firstLogin = await request(firstApp).post("/api/session/login").send({ accessCode: env.APP_ACCESS_CODE }).expect(200);
  assert.equal(firstLogin.body.vaultSalt, env.VAULT_SALT);

  await fs.rm(dataDir, { recursive: true, force: true });
  const restoredApp = await createApp({ env, push: pushFixture(), publicDir: "public" });
  const restoredLogin = await request(restoredApp).post("/api/session/login").send({ accessCode: env.APP_ACCESS_CODE }).expect(200);
  assert.equal(restoredLogin.body.vaultSalt, env.VAULT_SALT);

  await assert.rejects(
    () => createApp({ env: { ...env, VAULT_SALT: Buffer.alloc(16, 8).toString("base64") }, push: pushFixture(), publicDir: "public" }),
    error => error.code === "VAULT_SALT_MISMATCH"
  );
});

async function fixture() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-test-"));
  const app = await createApp({
    env: {
      NODE_ENV: "test",
      COOKIE_SECURE: "false",
      APP_ACCESS_CODE: "synthetic-access-code",
      DATA_DIR: dataDir,
      OPENAI_API_KEY: "synthetic-key",
      AI_MOCK_MODE: "true",
      PRIVATE_PROFILE_JSON: JSON.stringify({ profile: { displayName: "Testperson" }, tasks: [{ id: "synthetic-task", group: "Test", title: "Synthetische Aufgabe" }] })
    },
    push: pushFixture(),
    webauthn: webauthnFixture()
  });
  return { app, dataDir };
}

test("local HTTP assets stay usable while production keeps HTTPS enforcement", async t => {
  const localDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-local-headers-"));
  const productionDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-production-headers-"));
  t.after(() => Promise.all([
    fs.rm(localDataDir, { recursive: true, force: true }),
    fs.rm(productionDataDir, { recursive: true, force: true })
  ]));

  const localApp = await createApp({
    env: { NODE_ENV: "development", COOKIE_SECURE: "false", APP_ACCESS_CODE: "synthetic-access-code", DATA_DIR: localDataDir },
    push: pushFixture(false),
    publicDir: "public"
  });
  const localAsset = await request(localApp).get("/styles.css").expect(200);
  assert.doesNotMatch(localAsset.headers["content-security-policy"], /upgrade-insecure-requests/);
  assert.equal(localAsset.headers["strict-transport-security"], undefined);

  const productionApp = await createApp({ env: productionEnvironment(productionDataDir), push: pushFixture(), publicDir: "public" });
  const productionAsset = await request(productionApp).get("/styles.css").expect(200);
  assert.match(productionAsset.headers["content-security-policy"], /upgrade-insecure-requests/);
  assert.match(productionAsset.headers["strict-transport-security"], /max-age=/);
});

test("protected session, encrypted sync and document archive enforce access", async t => {
  const { app, dataDir } = await fixture();
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const unauthenticated = request(app);
  await unauthenticated.get("/api/documents").expect(401);

  const agent = request.agent(app);
  const login = await agent.post("/api/session/login").send({ accessCode: "synthetic-access-code" }).expect(200);
  assert.equal(login.body.profileSeed.profile.displayName, "Testperson");
  const envelope = { v: 1, iv: Buffer.alloc(12, 1).toString("base64"), data: Buffer.alloc(64, 2).toString("base64") };
  const first = await agent.put("/api/sync").send({ expectedRevision: 0, envelope }).expect(200);
  assert.equal(first.body.revision, 1);
  await agent.put("/api/sync").send({ expectedRevision: 0, envelope }).expect(409);

  const id = "11111111-1111-4111-8111-111111111111";
  await agent.put(`/api/documents/${id}`).set("content-type", "application/octet-stream").send(Buffer.alloc(40, 8)).expect(201);
  const downloaded = await agent.get(`/api/documents/${id}`).expect(200);
  assert.equal(downloaded.body.length, 40);
  await unauthenticated.get(`/api/documents/${id}`).expect(401);
  await agent.delete(`/api/documents/${id}`).expect(200);
  await agent.get(`/api/documents/${id}`).expect(404);
});

test("production login, secure cookie, logout and restart behavior are fail-closed", async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-production-session-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const env = productionEnvironment(dataDir);
  const firstApp = await createApp({ env, push: pushFixture(), publicDir: "public" });

  await request(firstApp).post("/api/session/login").send({ accessCode: "" }).expect(401);
  await request(firstApp).post("/api/session/login").send({ accessCode: "wrong-synthetic-code" }).expect(401);
  await request(firstApp).get("/api/session").expect(401);

  const firstAgent = request.agent(firstApp);
  const login = await firstAgent.post("/api/session/login").send({ accessCode: env.APP_ACCESS_CODE }).expect(200);
  const setCookie = login.headers["set-cookie"]?.[0] || "";
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Secure/i);
  assert.equal(setCookie.includes(env.APP_ACCESS_CODE), false);
  const sessionCookie = setCookie.split(";")[0];
  await request(firstApp).get("/api/session").set("Cookie", `${sessionCookie}tampered`).expect(401);

  const envelope = { v: 1, iv: Buffer.alloc(12, 9).toString("base64"), data: Buffer.alloc(48, 4).toString("base64") };
  await request(firstApp).put("/api/sync").set("Cookie", sessionCookie).send({ expectedRevision: 0, envelope }).expect(200);

  const restartedApp = await createApp({ env, push: pushFixture(), publicDir: "public" });
  await request(restartedApp).get("/api/session").set("Cookie", sessionCookie).expect(200);
  assert.equal((await request(restartedApp).get("/api/sync").set("Cookie", sessionCookie).expect(200)).body.revision, 1);

  const rotated = { ...env, SESSION_SECRET: "R".repeat(48) };
  const rotatedApp = await createApp({ env: rotated, push: pushFixture(), publicDir: "public" });
  await request(rotatedApp).get("/api/session").set("Cookie", sessionCookie).expect(401);

  const logout = await request(firstApp).post("/api/session/logout").set("Cookie", sessionCookie).expect(200);
  assert.match(logout.headers["set-cookie"]?.[0] || "", /Max-Age=0/i);
});

test("authentication rejects foreign origins and rate-limits repeated failures", async t => {
  const originDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-origin-"));
  const rateDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-login-rate-"));
  t.after(() => Promise.all([
    fs.rm(originDataDir, { recursive: true, force: true }),
    fs.rm(rateDataDir, { recursive: true, force: true })
  ]));

  const originApp = await createApp({
    env: {
      ...productionEnvironment(originDataDir),
      NODE_ENV: "test",
      COOKIE_SECURE: "false",
      LOGIN_RATE_LIMIT: "50"
    },
    push: pushFixture(false),
    webauthn: webauthnFixture(),
    publicDir: "public"
  });
  await request(originApp)
    .post("/api/session/login")
    .set("Origin", "https://untrusted.invalid")
    .send({ accessCode: "synthetic-access-code" })
    .expect(403)
    .expect(response => assert.equal(response.body.error.code, "ORIGIN_REJECTED"));
  await request(originApp)
    .post("/api/auth/passkey/options")
    .set("Origin", "https://untrusted.invalid")
    .expect(403)
    .expect(response => assert.equal(response.body.error.code, "ORIGIN_REJECTED"));

  const rateApp = await createApp({
    env: {
      ...productionEnvironment(rateDataDir),
      NODE_ENV: "test",
      COOKIE_SECURE: "false",
      LOGIN_RATE_LIMIT: "2"
    },
    push: pushFixture(false),
    webauthn: webauthnFixture(),
    publicDir: "public"
  });
  await request(rateApp).post("/api/session/login").send({ accessCode: "wrong-one" }).expect(401);
  await request(rateApp).post("/api/session/login").send({ accessCode: "wrong-two" }).expect(401);
  await request(rateApp)
    .post("/api/session/login")
    .send({ accessCode: "wrong-three" })
    .expect(429)
    .expect(response => assert.equal(response.body.error.code, "LOGIN_RATE_LIMIT"));
});

test("passkey setup is owner-controlled, replay-safe and creates a revocable long-lived session", async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-passkey-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const env = { ...productionEnvironment(dataDir), NODE_ENV: "test", COOKIE_SECURE: "false" };
  const app = await createApp({ env, push: pushFixture(false), webauthn: webauthnFixture(), publicDir: "public" });

  await request(app).post("/api/auth/passkey/register/options").send({ deviceName: "Unberechtigt" }).expect(401);
  await request(app).post("/api/auth/passkey/options").expect(409);

  const setupAgent = request.agent(app);
  await setupAgent.post("/api/session/login").send({ accessCode: env.APP_ACCESS_CODE }).expect(200);
  const options = await setupAgent.post("/api/auth/passkey/register/options").send({ deviceName: "Synthetisches iPhone" }).expect(200);
  const credentialId = "c3ludGhldGljLXBlcnNvbmFsLXBhc3NrZXk";
  const registration = await setupAgent.post("/api/auth/passkey/register/verify").send({
    flowId: options.body.flowId,
    response: { id: credentialId, syntheticChallenge: options.body.options.challenge }
  }).expect(200);
  assert.equal(registration.body.device.name, "Synthetisches iPhone");
  const sealedAuth = await fs.readFile(path.join(dataDir, "auth.enc.json"));
  assert.equal(sealedAuth.includes(Buffer.from("Synthetisches iPhone")), false);
  assert.equal(sealedAuth.includes(Buffer.from(credentialId)), false);
  assert.equal((await fs.stat(path.join(dataDir, "auth.enc.json"))).mode & 0o777, 0o600);
  await setupAgent.post("/api/auth/passkey/register/verify").send({
    flowId: options.body.flowId,
    response: { id: credentialId, syntheticChallenge: options.body.options.challenge }
  }).expect(400);

  const passkeyAgent = request.agent(app);
  const authOptions = await passkeyAgent.post("/api/auth/passkey/options").expect(200);
  const passkeyLogin = await passkeyAgent.post("/api/auth/passkey/verify").send({
    flowId: authOptions.body.flowId,
    response: { id: credentialId, syntheticChallenge: authOptions.body.options.challenge }
  }).expect(200);
  assert.equal(passkeyLogin.body.authMethod, "passkey");
  assert.equal(typeof passkeyLogin.body.vaultKey, "string");
  assert.equal(JSON.stringify(passkeyLogin.body).includes(env.APP_ACCESS_CODE), false);
  const passkeyCookie = passkeyLogin.headers["set-cookie"]?.[0] || "";
  assert.match(passkeyCookie, /HttpOnly/i);
  assert.match(passkeyCookie, /SameSite=Strict/i);
  assert.match(passkeyCookie, /Max-Age=2592000/i);

  const devices = await passkeyAgent.get("/api/auth/devices").expect(200);
  assert.equal(devices.body.devices.length, 1);
  assert.equal(devices.body.devices[0].current, true);
  await passkeyAgent.delete(`/api/auth/devices/${devices.body.devices[0].id}`).expect(200);
  await passkeyAgent.get("/api/session").expect(401);
});

test("passkey challenges reject manipulation and code fallback can be disabled after setup", async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-passkey-locked-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const baseEnv = { ...productionEnvironment(dataDir), NODE_ENV: "test", COOKIE_SECURE: "false" };
  const webauthn = webauthnFixture();
  await assert.rejects(
    () => createApp({ env: { ...baseEnv, ALLOW_ACCESS_CODE_LOGIN: "false" }, push: pushFixture(false), webauthn, publicDir: "public" }),
    error => error.code === "PASSKEY_SETUP_REQUIRED"
  );
  const setupApp = await createApp({ env: baseEnv, push: pushFixture(false), webauthn, publicDir: "public" });
  const setupAgent = request.agent(setupApp);
  await setupAgent.post("/api/session/login").send({ accessCode: baseEnv.APP_ACCESS_CODE }).expect(200);
  const options = await setupAgent.post("/api/auth/passkey/register/options").send({ deviceName: "Sicherer Testzugang" }).expect(200);
  const credentialId = "c3ludGhldGljLWxvY2tlZC1wYXNza2V5";
  await setupAgent.post("/api/auth/passkey/register/verify").send({ flowId: options.body.flowId, response: { id: credentialId, syntheticChallenge: options.body.options.challenge } }).expect(200);

  const lockedEnv = { ...baseEnv, ALLOW_ACCESS_CODE_LOGIN: "false" };
  const lockedApp = await createApp({ env: lockedEnv, push: pushFixture(false), webauthn, publicDir: "public" });
  await request(lockedApp).post("/api/session/login").send({ accessCode: baseEnv.APP_ACCESS_CODE }).expect(404);
  const manipulatedOptions = await request(lockedApp).post("/api/auth/passkey/options").expect(200);
  await request(lockedApp).post("/api/auth/passkey/verify").send({ flowId: manipulatedOptions.body.flowId, response: { id: credentialId, syntheticChallenge: "wrong", manipulated: true } }).expect(401);

  const agent = request.agent(lockedApp);
  const authOptions = await agent.post("/api/auth/passkey/options").expect(200);
  await agent.post("/api/auth/passkey/verify").send({ flowId: authOptions.body.flowId, response: { id: credentialId, syntheticChallenge: authOptions.body.options.challenge } }).expect(200);
  const devices = await agent.get("/api/auth/devices").expect(200);
  await agent.delete(`/api/auth/devices/${devices.body.devices[0].id}`).expect(409);
  await agent.get("/api/session").expect(200);
});

test("passkey sessions rotate, invalidate the previous token and expire", async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-passkey-session-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const app = await createApp({
    env: {
      NODE_ENV: "test",
      COOKIE_SECURE: "false",
      APP_ACCESS_CODE: "synthetic-access-code",
      SESSION_SECRET: "S".repeat(48),
      DATA_ENCRYPTION_KEY: "D".repeat(48),
      DATA_DIR: dataDir,
      PASSKEY_SESSION_DAYS: "0.00001",
      SESSION_ROTATION_HOURS: "0.000001"
    },
    push: pushFixture(false),
    webauthn: webauthnFixture()
  });
  const login = await request(app).post("/api/session/login").send({ accessCode: "synthetic-access-code" }).expect(200);
  const codeCookie = (login.headers["set-cookie"]?.[0] || "").split(";")[0];
  const options = await request(app).post("/api/auth/passkey/register/options").set("Cookie", codeCookie).send({ deviceName: "Rotationsgerät" }).expect(200);
  const credentialId = "c3ludGhldGljLXJvdGF0aW9uLXBhc3NrZXk";
  const registered = await request(app).post("/api/auth/passkey/register/verify").set("Cookie", codeCookie).send({
    flowId: options.body.flowId,
    response: { id: credentialId, syntheticChallenge: options.body.options.challenge }
  }).expect(200);
  const firstPasskeyCookie = (registered.headers["set-cookie"]?.at(-1) || "").split(";")[0];
  await new Promise(resolve => setTimeout(resolve, 15));
  const rotated = await request(app).get("/api/session").set("Cookie", firstPasskeyCookie).expect(200);
  const rotatedCookie = (rotated.headers["set-cookie"]?.[0] || "").split(";")[0];
  assert.notEqual(rotatedCookie, firstPasskeyCookie);
  await request(app).get("/api/session").set("Cookie", firstPasskeyCookie).expect(401);
  await new Promise(resolve => setTimeout(resolve, 950));
  await request(app).get("/api/session").set("Cookie", rotatedCookie).expect(401);
});

test("encrypted archive persists across restart and is removed without plaintext residue", async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-production-archive-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const env = productionEnvironment(dataDir);
  const firstApp = await createApp({ env, push: pushFixture(), publicDir: "public" });
  const login = await request(firstApp).post("/api/session/login").send({ accessCode: env.APP_ACCESS_CODE }).expect(200);
  const sessionCookie = (login.headers["set-cookie"]?.[0] || "").split(";")[0];

  const vaultKey = await deriveVaultKey(env.APP_ACCESS_CODE, login.body.vaultSalt);
  const plaintext = new TextEncoder().encode("SYNTHETIC-ARCHIVE-PLAINTEXT");
  const encrypted = Buffer.from(await encryptBytes(vaultKey, plaintext));
  const id = "33333333-3333-4333-8333-333333333333";

  await request(firstApp).put(`/api/documents/${id}`).set("Cookie", sessionCookie).set("content-type", "application/octet-stream").send(encrypted).expect(201);
  await request(firstApp).put("/api/documents/not-a-uuid").set("Cookie", sessionCookie).set("content-type", "application/octet-stream").send(encrypted).expect(400);
  await request(firstApp).put(`/api/documents/${id}`).set("Cookie", sessionCookie).set("content-type", "text/plain").send("synthetic").expect(400);

  const storedPath = path.join(dataDir, "documents", `${id}.bin`);
  const stored = await fs.readFile(storedPath);
  assert.equal(stored.includes(Buffer.from("SYNTHETIC-ARCHIVE-PLAINTEXT")), false);
  assert.equal((await fs.stat(storedPath)).mode & 0o777, 0o600);

  const restartedApp = await createApp({ env, push: pushFixture(), publicDir: "public" });
  const restartedLogin = await request(restartedApp).post("/api/session/login").send({ accessCode: env.APP_ACCESS_CODE }).expect(200);
  const restartedCookie = (restartedLogin.headers["set-cookie"]?.[0] || "").split(";")[0];
  const downloaded = await request(restartedApp).get(`/api/documents/${id}`).set("Cookie", restartedCookie).expect(200);
  const decrypted = await decryptBytes(vaultKey, downloaded.body);
  assert.equal(new TextDecoder().decode(decrypted), "SYNTHETIC-ARCHIVE-PLAINTEXT");

  await request(restartedApp).delete(`/api/documents/${id}`).set("Cookie", restartedCookie).expect(200);
  await assert.rejects(() => fs.access(storedPath));
  assert.deepEqual(await request(restartedApp).get("/api/documents").set("Cookie", restartedCookie).expect(200).then(response => response.body.documents), []);
});

test("AI timeout is translated without crashing or exposing provider details", async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-ai-timeout-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const timeoutError = Object.assign(new Error("synthetic provider timeout with internal detail"), { name: "APIConnectionTimeoutError", status: 408 });
  const app = await createApp({
    env: { NODE_ENV: "test", COOKIE_SECURE: "false", APP_ACCESS_CODE: "synthetic-access-code", DATA_DIR: dataDir },
    ai: {
      configured: true,
      assistant: async () => { throw timeoutError; },
      analyzePlan: async () => { throw timeoutError; }
    },
    push: pushFixture(false)
  });
  const agent = request.agent(app);
  await agent.post("/api/session/login").send({ accessCode: "synthetic-access-code" }).expect(200);
  const response = await agent.post("/api/assistant").send({ message: "Synthetische Frage", context: {} }).expect(504);
  assert.equal(response.body.error.code, "AI_TIMEOUT");
  assert.equal(/internal|provider|stack/i.test(response.body.error.message), false);
  await agent.get("/api/sync").expect(200);
});

test("AI quota-style failure is safe and the mock therapy plan requires client confirmation", async t => {
  const { app, dataDir } = await fixture();
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const agent = request.agent(app);
  await agent.post("/api/session/login").send({ accessCode: "synthetic-access-code" }).expect(200);
  const limited = await agent.post("/api/assistant").send({ message: "[TEST_429]", context: {} }).expect(429);
  assert.equal(limited.body.error.code, "AI_BUSY");
  assert.equal(/quota|billing|docs/i.test(limited.body.error.message), false);

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const scan = await agent.post("/api/analyze-plan").attach("document", png, { filename: "synthetic.png", contentType: "image/png" }).expect(200);
  assert.equal(scan.body.events.length, 1);
  assert.equal(scan.body.events[0].confidence < 0.8, true);
});

test("push subscribe, test and unsubscribe endpoints are functional", async t => {
  const { app, dataDir } = await fixture();
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const agent = request.agent(app);
  await agent.post("/api/session/login").send({ accessCode: "synthetic-access-code" }).expect(200);
  const subscription = { endpoint: "https://push.invalid/synthetic", keys: { auth: "synthetic", p256dh: "synthetic" } };
  await agent.post("/api/push/subscribe").send({ subscription }).expect(201);
  assert.equal((await agent.post("/api/push/test").expect(200)).body.sent, 1);
  assert.equal((await agent.post("/api/push/unsubscribe").send({ endpoint: subscription.endpoint }).expect(200)).body.removed, true);
  assert.equal((await agent.post("/api/push/test").expect(200)).body.sent, 0);
});

test("controlled data deletion clears sync and documents and keeps a safe error channel", async t => {
  const { app, dataDir } = await fixture();
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const agent = request.agent(app);
  await agent.post("/api/session/login").send({ accessCode: "synthetic-access-code" }).expect(200);
  const envelope = { v: 1, iv: Buffer.alloc(12, 3).toString("base64"), data: Buffer.alloc(64, 4).toString("base64") };
  await agent.put("/api/sync").send({ expectedRevision: 0, envelope }).expect(200);
  const id = "22222222-2222-4222-8222-222222222222";
  await agent.put(`/api/documents/${id}`).set("content-type", "application/octet-stream").send(Buffer.alloc(40, 5)).expect(201);
  await agent.delete("/api/account/data").expect(200);
  assert.equal((await agent.get("/api/sync").expect(200)).body.revision, 0);
  await agent.get(`/api/documents/${id}`).expect(404);

  const invalid = await agent.post("/api/analyze-plan").attach("document", Buffer.from("synthetic text"), { filename: "synthetic.txt", contentType: "text/plain" }).expect(400);
  assert.equal(invalid.body.error.code, "SCAN_FILE_TYPE");
  assert.equal(/stack|buffer|openai/i.test(invalid.body.error.message), false);
});

test("a missing AI provider does not disable protected core endpoints", async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rehakompass-no-ai-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const app = await createApp({
    env: { NODE_ENV: "test", COOKIE_SECURE: "false", APP_ACCESS_CODE: "synthetic-access-code", DATA_DIR: dataDir },
    push: {
      configured: false,
      publicKey: "",
      subscribe: async () => { throw Object.assign(new Error("push_not_configured"), { status: 503, code: "PUSH_NOT_CONFIGURED" }); },
      unsubscribe: async () => false,
      replaceReminders: async reminders => reminders.length,
      sendTest: async () => 0,
      startScheduler: () => () => {}
    }
  });
  const agent = request.agent(app);
  await agent.post("/api/session/login").send({ accessCode: "synthetic-access-code" }).expect(200);
  const unavailable = await agent.post("/api/assistant").send({ message: "Synthetische Frage", context: {} }).expect(503);
  assert.equal(unavailable.body.error.code, "AI_UNAVAILABLE");
  await agent.get("/api/documents").expect(200);
  await agent.get("/api/sync").expect(200);
});
