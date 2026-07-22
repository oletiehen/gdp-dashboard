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

function productionEnvironment(dataDir) {
  return {
    NODE_ENV: "production",
    APP_ACCESS_CODE: "synthetic-access-code",
    SESSION_SECRET: "S".repeat(48),
    DATA_ENCRYPTION_KEY: "D".repeat(48),
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
    push: pushFixture()
  });
  return { app, dataDir };
}

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
