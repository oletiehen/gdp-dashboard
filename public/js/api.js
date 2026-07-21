export class ApiError extends Error {
  constructor(message, { status = 0, code = "NETWORK_ERROR", retryable = false, payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.payload = payload;
  }
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...options, headers: { ...(options.headers || {}) } });
  } catch {
    throw new ApiError("Der Server ist gerade nicht erreichbar. Deine Änderung bleibt auf diesem Gerät gespeichert.", { code: "OFFLINE", retryable: true });
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json().catch(() => ({})) : await response.arrayBuffer();
  if (!response.ok) {
    const detail = payload?.error || {};
    throw new ApiError(detail.message || "Die Anfrage konnte nicht verarbeitet werden.", { status: response.status, code: detail.code || "REQUEST_FAILED", retryable: Boolean(detail.retryable), payload });
  }
  return payload;
}

export const api = {
  health: () => request("/api/health"),
  login: accessCode => request("/api/session/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessCode }) }),
  session: () => request("/api/session"),
  logout: () => request("/api/session/logout", { method: "POST" }),
  getSync: () => request("/api/sync"),
  putSync: (expectedRevision, envelope) => request("/api/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision, envelope }) }),
  deleteSync: () => request("/api/sync", { method: "DELETE" }),
  assistant: (message, context) => request("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, context }) }),
  analyzePlan: file => {
    const body = new FormData();
    body.append("document", file);
    return request("/api/analyze-plan", { method: "POST", body });
  },
  listDocuments: () => request("/api/documents"),
  putDocument: (id, encrypted) => request(`/api/documents/${id}`, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: encrypted }),
  getDocument: id => request(`/api/documents/${id}`),
  deleteDocument: id => request(`/api/documents/${id}`, { method: "DELETE" }),
  pushStatus: () => request("/api/push/status"),
  pushKey: () => request("/api/push/public-key"),
  pushSubscribe: subscription => request("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription }) }),
  pushUnsubscribe: endpoint => request("/api/push/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint }) }),
  putReminders: reminders => request("/api/push/reminders", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ reminders }) }),
  pushTest: () => request("/api/push/test", { method: "POST" }),
  deleteAll: () => request("/api/account/data", { method: "DELETE" })
};
