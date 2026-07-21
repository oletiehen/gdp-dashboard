const DB_NAME = "olafs-reha-kompass-secure-v1";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("vault")) db.createObjectStore("vault");
      if (!db.objectStoreNames.contains("pendingDocuments")) db.createObjectStore("pendingDocuments");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(storeName, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export const localVault = {
  getEnvelope: () => transact("vault", "readonly", store => store.get("state")),
  putEnvelope: envelope => transact("vault", "readwrite", store => store.put(envelope, "state")),
  clear: async () => {
    await transact("vault", "readwrite", store => store.clear());
    await transact("pendingDocuments", "readwrite", store => store.clear());
  },
  putPendingDocument: (id, buffer) => transact("pendingDocuments", "readwrite", store => store.put(buffer, id)),
  getPendingDocument: id => transact("pendingDocuments", "readonly", store => store.get(id)),
  deletePendingDocument: id => transact("pendingDocuments", "readwrite", store => store.delete(id))
};
