import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicWrite(file, value, binary = false) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  await fs.writeFile(temporary, binary ? value : JSON.stringify(value), { mode: 0o600 });
  await fs.rename(temporary, file);
}

export function createFileStore({ dataDir, sealer }) {
  const root = path.resolve(dataDir);
  const syncFile = path.join(root, "sync-envelope.json");
  const metaFile = path.join(root, "meta.json");
  const docsDir = path.join(root, "documents");
  const docsIndexFile = path.join(docsDir, "index.json");
  const pushFile = path.join(root, "push.enc.json");
  let queue = Promise.resolve();

  function locked(operation) {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  }

  async function initialize() {
    await fs.mkdir(docsDir, { recursive: true, mode: 0o700 });
    const meta = await readJson(metaFile, null);
    if (!meta?.vaultSalt) {
      await atomicWrite(metaFile, { vaultSalt: crypto.randomBytes(16).toString("base64"), createdAt: new Date().toISOString() });
    }
  }

  async function getVaultSalt() {
    await initialize();
    return (await readJson(metaFile, {})).vaultSalt;
  }

  async function getSyncEnvelope() {
    await initialize();
    return readJson(syncFile, null);
  }

  async function putSyncEnvelope({ expectedRevision, envelope }) {
    return locked(async () => {
      const current = await readJson(syncFile, null);
      const revision = Number(current?.revision || 0);
      if (Number(expectedRevision) !== revision) return { conflict: true, current };
      const next = {
        revision: revision + 1,
        updatedAt: new Date().toISOString(),
        envelope
      };
      await atomicWrite(syncFile, next);
      return { conflict: false, current: next };
    });
  }

  async function clearSyncEnvelope() {
    await fs.rm(syncFile, { force: true });
  }

  async function listDocuments() {
    await initialize();
    return readJson(docsIndexFile, []);
  }

  async function putDocument(id, buffer) {
    return locked(async () => {
      const index = await readJson(docsIndexFile, []);
      const existing = index.find(item => item.id === id);
      const record = {
        id,
        size: buffer.byteLength,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await atomicWrite(path.join(docsDir, `${id}.bin`), buffer, true);
      await atomicWrite(docsIndexFile, [...index.filter(item => item.id !== id), record]);
      return record;
    });
  }

  async function getDocument(id) {
    return fs.readFile(path.join(docsDir, `${id}.bin`));
  }

  async function deleteDocument(id) {
    return locked(async () => {
      const index = await readJson(docsIndexFile, []);
      await fs.rm(path.join(docsDir, `${id}.bin`), { force: true });
      await atomicWrite(docsIndexFile, index.filter(item => item.id !== id));
      return index.some(item => item.id === id);
    });
  }

  async function readPushData() {
    if (!sealer) return { subscriptions: [], reminders: [] };
    const sealed = await readJson(pushFile, null);
    if (!sealed) return { subscriptions: [], reminders: [] };
    return sealer.open(sealed);
  }

  async function writePushData(value) {
    if (!sealer) throw Object.assign(new Error("push_storage_unavailable"), { code: "PUSH_NOT_CONFIGURED" });
    await atomicWrite(pushFile, sealer.seal(value));
  }

  async function putSubscription(subscription) {
    return locked(async () => {
      const data = await readPushData();
      const endpointHash = crypto.createHash("sha256").update(subscription.endpoint).digest("hex");
      const record = { endpointHash, subscription, updatedAt: new Date().toISOString() };
      data.subscriptions = [...data.subscriptions.filter(item => item.endpointHash !== endpointHash), record];
      await writePushData(data);
      return { endpointHash };
    });
  }

  async function removeSubscription(endpoint) {
    return locked(async () => {
      const data = await readPushData();
      const endpointHash = crypto.createHash("sha256").update(endpoint).digest("hex");
      const before = data.subscriptions.length;
      data.subscriptions = data.subscriptions.filter(item => item.endpointHash !== endpointHash);
      await writePushData(data);
      return before !== data.subscriptions.length;
    });
  }

  async function replaceReminders(reminders) {
    return locked(async () => {
      const data = await readPushData();
      data.reminders = reminders;
      await writePushData(data);
      return reminders.length;
    });
  }

  async function mutatePushData(mutator) {
    return locked(async () => {
      const data = await readPushData();
      const result = await mutator(data);
      await writePushData(data);
      return result;
    });
  }

  async function clearAll() {
    const documents = await listDocuments();
    await Promise.all(documents.map(item => fs.rm(path.join(docsDir, `${item.id}.bin`), { force: true })));
    await Promise.all([fs.rm(syncFile, { force: true }), fs.rm(docsIndexFile, { force: true }), fs.rm(pushFile, { force: true })]);
    return { documents: documents.length };
  }

  return {
    root,
    initialize,
    getVaultSalt,
    getSyncEnvelope,
    putSyncEnvelope,
    clearSyncEnvelope,
    listDocuments,
    putDocument,
    getDocument,
    deleteDocument,
    readPushData,
    putSubscription,
    removeSubscription,
    replaceReminders,
    mutatePushData,
    clearAll
  };
}
