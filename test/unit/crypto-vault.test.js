import assert from "node:assert/strict";
import test from "node:test";
import { decryptBytes, decryptJson, deriveVaultKey, encryptBytes, encryptJson } from "../../public/js/crypto-vault.js";

test("state and document bytes round-trip through authenticated encryption", async () => {
  const salt = Buffer.alloc(16, 7).toString("base64");
  const key = await deriveVaultKey("synthetic-test-secret", salt);
  const envelope = await encryptJson(key, { title: "Synthetic", value: 42 });
  assert.notEqual(envelope.data.includes("Synthetic"), true);
  assert.deepEqual(await decryptJson(key, envelope), { title: "Synthetic", value: 42 });
  const original = new TextEncoder().encode("synthetic document");
  const encrypted = await encryptBytes(key, original);
  assert.equal(new TextDecoder().decode(await decryptBytes(key, encrypted)), "synthetic document");
});

test("a wrong vault key cannot decrypt data", async () => {
  const salt = Buffer.alloc(16, 3).toString("base64");
  const first = await deriveVaultKey("first-test-secret", salt);
  const second = await deriveVaultKey("second-test-secret", salt);
  const envelope = await encryptJson(first, { safe: true });
  await assert.rejects(() => decryptJson(second, envelope));
});
