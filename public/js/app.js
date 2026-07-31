import { api } from "./api.js";
import { CLINIC_DOSSIER, CRISIS_TEXT, coachingMessage } from "./content.js";
import { createBaseState, makeRecord, mergeStates, migrateLegacyState, normalizeState, removeRecord, touchState } from "./data-model.js";
import { base64UrlToUint8Array, decryptBytes, decryptJson, deriveVaultKey, encryptBytes, encryptJson, importVaultKey } from "./crypto-vault.js";
import { localVault } from "./idb.js";
import { addDateDays, buildTimeline, isRoutineOnDate, materializeTimelineTasks, nextSuggestedTask } from "./timeline.js";
import { authenticatePasskey, createPasskey, passkeySupported } from "./webauthn-client.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const LEGACY_KEYS = ["olafs-reha-kompass-v05", "olafs-reha-kompass-v08"];
const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

let state = null;
let vaultKey = null;
let syncRevision = 0;
let profileSeed = null;
let legacyState = null;
let selectedDate = new Date().toISOString().slice(0, 10);
let calendarMode = "day";
let activeTaskGroup = "";
let activeCoachCategory = "motivation";
let syncTimer = null;
let toastTimer = null;
let scanResult = null;
let planSourceUrl = "";
let documentPreviewUrl = "";
let activeVoiceTarget = "journal";
let mediaRecorder = null;
let voiceStream = null;
let voiceChunks = [];
let voiceBlob = null;
let speechRecognition = null;
let lastAssistantMessage = "";
let assistantRetries = 0;
let systemHealth = null;
let currentAuthMethod = "";
let syncBlocked = false;

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function displayDate(value) {
  if (!value) return "Noch offen";
  return DATE_FORMAT.format(new Date(`${value}T12:00:00`));
}

function displayDateTime(value) {
  if (!value) return "";
  return DATE_TIME_FORMAT.format(new Date(value));
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 3300);
}

function download(name, content, type = "application/octet-stream") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function readLegacy() {
  for (const key of LEGACY_KEYS) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (value && typeof value === "object") return { key, value };
    } catch {
      // Eine beschädigte Altdatei bleibt unangetastet und kann manuell exportiert werden.
    }
  }
  return null;
}

function vaultMismatchError() {
  const error = new Error("Der vorhandene Datentresor wurde mit einem anderen Schlüssel eingerichtet. Die alten verschlüsselten Daten bleiben erhalten und werden nicht überschrieben.");
  error.code = "VAULT_DECRYPT_FAILED";
  return error;
}

async function initializeVaultWithKey(currentKey, login, fallbackSecret = "") {
  const previousSalt = localStorage.getItem("rehakompass-vault-salt");
  vaultKey = currentKey;
  profileSeed = login.profileSeed || null;
  const [localEnvelope, remote] = await Promise.all([
    localVault.getEnvelope().catch(() => null),
    api.getSync().catch(error => {
      if (error.code === "OFFLINE") return { revision: 0, envelope: null };
      throw error;
    })
  ]);
  syncRevision = Number(remote.revision || 0);
  let localState = null;
  let remoteState = null;
  let localFailed = false;
  let remoteFailed = false;
  if (localEnvelope) {
    try {
      const localKey = fallbackSecret && previousSalt && previousSalt !== login.vaultSalt
        ? await deriveVaultKey(fallbackSecret, previousSalt)
        : currentKey;
      localState = normalizeState(await decryptJson(localKey, localEnvelope), profileSeed);
    } catch {
      localFailed = true;
      await localVault.archiveEnvelope(localEnvelope, { reason: "vault-key-mismatch", vaultSalt: previousSalt || "" }).catch(() => {});
    }
  }
  if (remote.envelope) {
    try {
      remoteState = normalizeState(await decryptJson(currentKey, remote.envelope), profileSeed);
    } catch {
      remoteFailed = true;
    }
  }
  if ((localFailed && !remoteState) || (remoteFailed && !localState)) throw vaultMismatchError();
  syncBlocked = remoteFailed;
  if (localState && remoteState) state = mergeStates(localState, remoteState);
  else state = localState || remoteState || createBaseState(profileSeed);
  localStorage.setItem("rehakompass-vault-salt", login.vaultSalt);
  legacyState = readLegacy();
  await persist({ render: false, immediateSync: Boolean(!remote.envelope && !legacyState) });
}

async function initializeVault(accessCode, login) {
  await initializeVaultWithKey(await deriveVaultKey(accessCode, login.vaultSalt), login, accessCode);
}

async function initializePasskeyVault(login) {
  if (!login.vaultKey) throw new Error("Der sichere Geräteschlüssel wurde nicht bereitgestellt.");
  await initializeVaultWithKey(await importVaultKey(login.vaultKey), login);
}

async function initializeOfflineVault(accessCode) {
  const salt = localStorage.getItem("rehakompass-vault-salt");
  const envelope = await localVault.getEnvelope();
  if (!salt || !envelope) throw new Error("Auf diesem Gerät ist noch kein verschlüsselter Offline-Tresor eingerichtet.");
  vaultKey = await deriveVaultKey(accessCode, salt);
  try {
    state = normalizeState(await decryptJson(vaultKey, envelope));
  } catch {
    throw vaultMismatchError();
  }
  syncRevision = Number(state.sync?.revision || 0);
  profileSeed = null;
  legacyState = readLegacy();
}

async function persist({ render = true, immediateSync = false } = {}) {
  if (!state || !vaultKey) return;
  touchState(state);
  const envelope = await encryptJson(vaultKey, state);
  await localVault.putEnvelope(envelope);
  if (render) renderAll();
  clearTimeout(syncTimer);
  if (immediateSync) await synchronize();
  else syncTimer = setTimeout(() => synchronize().catch(() => {}), 800);
}

async function synchronize(retryConflict = true) {
  if (!navigator.onLine || !state || !vaultKey || syncBlocked) return false;
  const envelope = await encryptJson(vaultKey, state);
  try {
    const result = await api.putSync(syncRevision, envelope);
    syncRevision = Number(result.revision);
    state.sync = { revision: syncRevision, pending: false, lastSuccessAt: result.updatedAt };
    await localVault.putEnvelope(await encryptJson(vaultKey, state));
    await flushPendingDocuments();
    await updateServerReminders();
    renderSystemStatus();
    return true;
  } catch (error) {
    if (error.code === "SYNC_CONFLICT" && retryConflict && error.payload?.current?.envelope) {
      const remoteState = normalizeState(await decryptJson(vaultKey, error.payload.current.envelope), profileSeed);
      state = mergeStates(state, remoteState);
      syncRevision = Number(error.payload.current.revision || 0);
      await localVault.putEnvelope(await encryptJson(vaultKey, state));
      return synchronize(false);
    }
    state.sync = { ...(state.sync || {}), pending: true };
    renderSystemStatus();
    return false;
  }
}

function unlockApp() {
  $("#lockScreen").hidden = true;
  $("#appShell").hidden = false;
  $("#migrationCard").hidden = !legacyState;
  selectedDate = new Date().toISOString().slice(0, 10);
  $("#calendarDate").value = selectedDate;
  route();
  renderAll();
  refreshPushStatus();
}

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const input = $("#accessCode");
  const button = $("#loginButton");
  $("#loginError").textContent = "";
  button.disabled = true;
  button.textContent = "Datentresor wird geöffnet …";
  try {
    try {
      const login = await api.login(input.value);
      await initializeVault(input.value, login);
      currentAuthMethod = "access-code";
    } catch (error) {
      if (error.code !== "OFFLINE") throw error;
      await initializeOfflineVault(input.value);
      toast("Offline-Tresor geöffnet. Synchronisierung folgt, sobald der Server wieder erreichbar ist.");
    }
    currentAuthMethod = "access-code";
    input.value = "";
    unlockApp();
  } catch (error) {
    $("#loginError").textContent = error.message || "Der Kompass konnte nicht geöffnet werden.";
  } finally {
    button.disabled = false;
    button.textContent = "Einmalig mit Code öffnen";
  }
});

async function performPasskeyLogin() {
  const button = $("#passkeyLogin");
  const status = $("#passkeyStatus");
  $("#loginError").textContent = "";
  button.disabled = true;
  status.textContent = "Persönliche Bestätigung wird vorbereitet …";
  try {
    const challenge = await api.passkeyOptions();
    status.textContent = "Bitte bestätige Face ID, Touch ID oder deinen Gerätecode.";
    const response = await authenticatePasskey(challenge.options);
    const login = await api.passkeyVerify(challenge.flowId, response);
    await initializePasskeyVault(login);
    currentAuthMethod = "passkey";
    status.textContent = "Dieses Gerät wurde erfolgreich bestätigt.";
    unlockApp();
  } catch (error) {
    status.textContent = error.message || "Der persönliche Zugang konnte nicht bestätigt werden.";
  } finally {
    button.disabled = false;
  }
}

$("#passkeyLogin").addEventListener("click", performPasskeyLogin);

function route() {
  if (!state) return;
  const routeName = (location.hash.match(/^#\/([a-z]+)/) || [])[1] || "heute";
  const allowed = new Set(["heute", "kalender", "listen", "tagebuch", "dokumente", "coach", "mehr"]);
  const current = allowed.has(routeName) ? routeName : "heute";
  $$(".view").forEach(view => view.classList.toggle("active", view.dataset.view === current));
  $$(`[data-route]`).forEach(link => link.classList.toggle("active", link.dataset.route === current));
  document.title = `${current === "heute" ? "Heute" : current[0].toUpperCase() + current.slice(1)} · Olafs Reha-Kompass`;
  $("#main").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

addEventListener("hashchange", route);
addEventListener("offline", () => { $("#offlineBanner").hidden = false; renderSystemStatus(); });
addEventListener("online", () => { $("#offlineBanner").hidden = true; synchronize().then(() => toast("Änderungen wurden wieder synchronisiert.")); });
addEventListener("rehakompass-session-expired", () => {
  if (!state) return;
  state = null;
  vaultKey = null;
  profileSeed = null;
  currentAuthMethod = "";
  location.reload();
});

function currentTask() {
  return nextSuggestedTask(state.tasks);
}

function rotateCoach(category, advance = true) {
  activeCoachCategory = category;
  const counters = state.coaching.counters || {};
  const count = Number(counters[category] || 0);
  const task = currentTask()?.title || "einen kleinen, sicheren nächsten Schritt wählen";
  $("#compassMessage").textContent = coachingMessage(category, count, task);
  $$("[data-coach]").forEach(button => button.classList.toggle("active", button.dataset.coach === category));
  if (advance) {
    state.coaching.counters = { ...counters, [category]: count + 1 };
    persist({ render: false });
  }
}

function renderCockpit() {
  const name = state.profile.displayName || "Olaf";
  const hour = new Date().getHours();
  $("#greeting").textContent = `${hour < 11 ? "Guten Morgen" : hour < 17 ? "Guten Tag" : "Guten Abend"}, ${name}`;
  const admission = state.profile.admission;
  $("#admissionSummary").textContent = admission.status === "confirmed" ? `Aufnahme bestätigt: ${displayDate(admission.date)}` : admission.status === "expected" ? `Vorläufig erwartet: ${displayDate(admission.date)} – noch nicht bestätigt` : "Aufnahmetermin noch offen";
  const task = currentTask();
  $("#todayTitle").textContent = task?.title || "Heute ist kein vorbereiteter Schritt offen";
  $("#nextWhy").textContent = task?.why || "Du kannst den Tag ruhig planen oder einen eigenen Punkt ergänzen.";
  $("#nextMeta").innerHTML = task ? `<span class="badge gold">${escapeHtml(task.group || "Aufgabe")}</span>${task.dueDate ? `<span class="badge">${escapeHtml(displayDate(task.dueDate))}</span>` : ""}<span class="badge">Priorität ${Number(task.priority || 1)}</span>` : "";
  $("#nextActions").hidden = !task;
  $("#nextActions").dataset.taskId = task?.id || "";
  const open = state.tasks.filter(item => item.status === "open").length;
  const done = state.tasks.filter(item => item.status === "done").length;
  const today = state.events.filter(item => item.date === selectedDate && item.status !== "cancelled").length;
  $("#todayStats").innerHTML = `<div class="mini-stat"><strong>${open}</strong><small>offen</small></div><div class="mini-stat"><strong>${today}</strong><small>heute</small></div><div class="mini-stat"><strong>${done}</strong><small>erledigt</small></div>`;
  const secondary = state.tasks.filter(item => item.status === "open" && item.id !== task?.id).slice(0, 3);
  $("#secondarySteps").innerHTML = secondary.map(item => `<div class="secondary-step"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.group || "")}${item.dueDate ? ` · ${escapeHtml(displayDate(item.dueDate))}` : ""}</small></div>`).join("");
  const simple = Boolean(state.profile.preferences.simpleMode);
  $("#simpleMode").checked = simple;
  $("#simpleModeSettings").checked = simple;
  $(".quick-tiles").hidden = simple;
  $("#secondarySteps").hidden = simple;
  if (!$("#compassMessage").textContent || activeCoachCategory === "next") rotateCoach(activeCoachCategory, false);
}

function openTaskAction(type, taskId) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;
  $("#taskActionId").value = task.id;
  $("#taskActionType").value = type;
  $("#taskActionTitle").textContent = type === "postpone" ? "Aufgabe verschieben" : "Aufgabe für jetzt überspringen";
  $("#taskActionDate").value = type === "postpone" ? (task.dueDate || addDateDays(new Date().toISOString().slice(0, 10), 1)) : addDateDays(new Date().toISOString().slice(0, 10), 1);
  $("#taskActionReason").value = task.note || "";
  $("#taskActionDialog").showModal();
}

$("#nextActions").addEventListener("click", event => {
  const button = event.target.closest("[data-task-action]");
  if (!button) return;
  const taskId = event.currentTarget.dataset.taskId;
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;
  if (button.dataset.taskAction === "done") {
    task.status = "done";
    task.updatedAt = new Date().toISOString();
    persist();
    toast("Erledigt. Der Kompass zeigt dir jetzt den nächsten Schritt.");
  } else openTaskAction(button.dataset.taskAction, taskId);
});

$("#taskActionForm").addEventListener("submit", event => {
  event.preventDefault();
  const task = state.tasks.find(item => item.id === $("#taskActionId").value);
  if (!task) return;
  const type = $("#taskActionType").value;
  if (type === "postpone") task.dueDate = $("#taskActionDate").value;
  else task.skippedUntil = $("#taskActionDate").value;
  task.note = $("#taskActionReason").value.trim();
  task.updatedAt = new Date().toISOString();
  $("#taskActionDialog").close();
  persist();
  toast(type === "postpone" ? "Aufgabe wurde verschoben." : "Der Schritt bleibt erhalten und wird später erneut angeboten.");
});

function entriesForDate(date) {
  const events = state.events.filter(item => item.date === date && item.status !== "cancelled").map(item => ({ ...item, sourceType: "event", sort: item.start || "23:58" }));
  const routines = state.routines.filter(item => isRoutineOnDate(item, date)).map(item => ({ ...item, date, sourceType: "routine", sort: item.start || "23:57" }));
  const tasks = state.tasks.filter(item => item.dueDate === date && item.status === "open").map(item => ({ ...item, sourceType: "task", kind: "task", start: item.dueTime || "", sort: item.dueTime || "23:59" }));
  return [...events, ...routines, ...tasks].sort((a, b) => a.sort.localeCompare(b.sort));
}

function renderDayEntry(item) {
  const kind = item.kind === "therapy" ? "Therapie" : item.sourceType === "routine" ? "Routine" : item.sourceType === "task" ? "Aufgabe" : "Termin";
  const actions = item.sourceType === "event" ? `<div class="entry-actions"><button class="icon-button" data-edit-event="${item.id}" aria-label="${escapeHtml(item.title)} bearbeiten">✎</button><button class="icon-button" data-cancel-event="${item.id}" aria-label="${escapeHtml(item.title)} absagen">×</button>${item.kind === "therapy" ? `<button class="icon-button" data-after-event="${item.id}" aria-label="${escapeHtml(item.title)} nachbereiten">●</button>` : ""}</div>` : item.sourceType === "task" ? `<div class="entry-actions"><button class="icon-button" data-complete-task="${item.id}" aria-label="${escapeHtml(item.title)} erledigen">✓</button></div>` : "";
  return `<div class="day-entry"><time>${escapeHtml(item.start || "–")}</time><span class="line-dot" aria-hidden="true"></span><div><strong>${escapeHtml(item.title)}</strong><small>${kind}${item.end ? ` · bis ${escapeHtml(item.end)}` : ""}${item.location ? ` · ${escapeHtml(item.location)}` : ""}</small></div>${actions}</div>`;
}

function weekDates(date) {
  const value = new Date(`${date}T12:00:00`);
  const mondayOffset = value.getDay() === 0 ? -6 : 1 - value.getDay();
  const monday = addDateDays(date, mondayOffset);
  return Array.from({ length: 7 }, (_, index) => addDateDays(monday, index));
}

function renderCalendar() {
  $("#calendarDate").value = selectedDate;
  $("#admissionDate").value = state.profile.admission.date || "";
  $("#admissionStatus").value = state.profile.admission.status || "open";
  $("#admissionSource").value = state.profile.admission.source || "";
  $$("[data-calendar-mode]").forEach(button => button.classList.toggle("active", button.dataset.calendarMode === calendarMode));
  const content = $("#calendarContent");
  if (calendarMode === "day") {
    const entries = entriesForDate(selectedDate);
    content.innerHTML = `<p class="kicker">${escapeHtml(displayDate(selectedDate))}</p>${entries.map(renderDayEntry).join("")}`;
    $("#calendarEmpty").hidden = entries.length > 0;
  } else if (calendarMode === "week") {
    $("#calendarEmpty").hidden = true;
    content.innerHTML = weekDates(selectedDate).map(date => {
      const entries = entriesForDate(date);
      return `<section><h3>${escapeHtml(displayDate(date))}</h3>${entries.length ? entries.map(renderDayEntry).join("") : `<p class="privacy">Keine Einträge</p>`}</section>`;
    }).join("");
  } else {
    $("#calendarEmpty").hidden = true;
    const end = addDateDays(selectedDate, 60);
    const dates = new Set([...state.events.map(item => item.date), ...state.tasks.map(item => item.dueDate)].filter(date => date >= selectedDate && date <= end));
    content.innerHTML = [...dates].sort().map(date => `<section><h3>${escapeHtml(displayDate(date))}</h3>${entriesForDate(date).map(renderDayEntry).join("")}</section>`).join("") || `<div class="empty-state">Keine kommenden Einträge.</div>`;
  }
  const timeline = buildTimeline(state.profile.admission);
  $("#timelineStatus").textContent = state.profile.admission.status === "confirmed" ? "Aus bestätigtem Datum berechnet" : state.profile.admission.status === "expected" ? "Vorläufig – nicht bestätigt" : "Termin noch offen";
  $("#timelineList").innerHTML = timeline.map(item => `<div class="timeline-item ${item.status}"><strong>${escapeHtml(displayDate(item.date))}</strong><br>${escapeHtml(item.title)}<br><small>${item.status === "expected" ? "Vorläufig – nicht bestätigt" : "Aus bestätigtem Datum berechnet"}</small></div>`).join("") || `<p class="privacy">Ein Datum mit Status „erwartet“ zeigt eine Vorschau. Nur „bestätigt“ erzeugt verbindliche Aufgaben.</p>`;
}

$("#admissionForm").addEventListener("submit", event => {
  event.preventDefault();
  const status = $("#admissionStatus").value;
  const date = $("#admissionDate").value;
  if (status !== "open" && !date) return toast("Bitte trage für einen erwarteten oder bestätigten Termin ein Datum ein.");
  state.profile.admission = { date: status === "open" ? "" : date, status, source: $("#admissionSource").value.trim(), updatedAt: new Date().toISOString() };
  state = materializeTimelineTasks(state);
  persist();
  toast(status === "confirmed" ? "Bestätigte Zeitachse wurde neu berechnet." : status === "expected" ? "Vorläufige Vorschau gespeichert – noch nicht als bestätigt behandelt." : "Aufnahmetermin bleibt offen.");
});

function openEventDialog(item = null) {
  $("#eventId").value = item?.id || "";
  $("#eventDialogTitle").textContent = item ? "Eintrag bearbeiten" : "Termin oder Routine";
  $("#eventTitle").value = item?.title || "";
  $("#eventDate").value = item?.date || selectedDate;
  $("#eventKind").value = item?.kind || "appointment";
  $("#eventStart").value = item?.start || "";
  $("#eventEnd").value = item?.end || "";
  $("#eventLocation").value = item?.location || "";
  $("#eventRepeat").value = item?.repeat || "once";
  $("#eventDialog").showModal();
}

$("#eventForm").addEventListener("submit", event => {
  event.preventDefault();
  const id = $("#eventId").value || crypto.randomUUID();
  const repeat = $("#eventRepeat").value;
  const value = {
    id,
    title: $("#eventTitle").value.trim(),
    date: $("#eventDate").value,
    kind: $("#eventKind").value,
    start: $("#eventStart").value,
    end: $("#eventEnd").value,
    location: $("#eventLocation").value.trim(),
    repeat,
    weekday: new Date(`${$("#eventDate").value}T12:00:00`).getDay(),
    status: "confirmed",
    source: "user",
    updatedAt: new Date().toISOString()
  };
  if (value.end && value.start && value.end <= value.start) return toast("Die Endzeit muss nach dem Beginn liegen.");
  if (repeat === "once") state.events = [...state.events.filter(item => item.id !== id), value];
  else state.routines = [...state.routines.filter(item => item.id !== id), value];
  $("#eventDialog").close();
  persist();
  toast("Kalendereintrag gespeichert.");
});

function renderLists() {
  const groups = [...new Set(state.tasks.map(item => item.group || "Eigene Aufgaben"))].sort((a, b) => a.localeCompare(b, "de"));
  if (!groups.includes(activeTaskGroup)) activeTaskGroup = groups[0] || "Eigene Aufgaben";
  $("#taskGroup").innerHTML = groups.map(group => `<option ${group === activeTaskGroup ? "selected" : ""}>${escapeHtml(group)}</option>`).join("");
  const filter = $("#taskFilter").value || "open";
  const all = state.tasks.filter(item => (item.group || "Eigene Aufgaben") === activeTaskGroup);
  const items = all.filter(item => filter === "all" || filter === "done" && item.status === "done" || filter === "postponed" && (item.skippedUntil || item.status === "postponed") || filter === "open" && item.status === "open");
  $("#taskList").innerHTML = items.map(item => `<div class="check-row ${item.status === "done" ? "done" : ""}"><input type="checkbox" data-toggle-task="${item.id}" ${item.status === "done" ? "checked" : ""} aria-label="${escapeHtml(item.title)} erledigt"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.why || "Eigener Punkt")}${item.dueDate ? ` · ${escapeHtml(displayDate(item.dueDate))}` : ""}${item.skippedUntil ? ` · bis ${escapeHtml(displayDate(item.skippedUntil))} ausgeblendet` : ""}</small></div><div><button class="icon-button" data-edit-task="${item.id}" aria-label="${escapeHtml(item.title)} bearbeiten">✎</button>${["user", "legacy-custom", "legacy-manual"].includes(item.source) ? `<button class="icon-button" data-delete-task="${item.id}" aria-label="${escapeHtml(item.title)} löschen">×</button>` : ""}</div></div>`).join("");
  $("#taskEmpty").hidden = items.length > 0;
  const done = all.filter(item => item.status === "done").length;
  const percent = all.length ? Math.round(done / all.length * 100) : 0;
  $("#taskProgress").textContent = `${percent} %`;
  $("#taskProgressBar").value = percent;
  $("#taskProgressBar").textContent = `${percent} %`;
}

function openTaskDialog(item = null) {
  $("#taskId").value = item?.id || "";
  $("#taskDialogTitle").textContent = item ? "Aufgabe bearbeiten" : "Eigene Aufgabe";
  $("#taskTitle").value = item?.title || "";
  $("#taskGroupInput").value = item?.group || activeTaskGroup || "Eigene Aufgaben";
  $("#taskDue").value = item?.dueDate || "";
  $("#taskPriority").value = String(item?.priority || 2);
  $("#taskWhy").value = item?.why || "";
  $("#taskDialog").showModal();
}

$("#taskForm").addEventListener("submit", event => {
  event.preventDefault();
  const id = $("#taskId").value || crypto.randomUUID();
  const existing = state.tasks.find(item => item.id === id);
  const value = {
    ...(existing || {}),
    id,
    title: $("#taskTitle").value.trim(),
    group: $("#taskGroupInput").value.trim(),
    dueDate: $("#taskDue").value,
    priority: Number($("#taskPriority").value),
    why: $("#taskWhy").value.trim() || "Eigener Punkt",
    status: existing?.status || "open",
    source: existing?.source || "user",
    updatedAt: new Date().toISOString()
  };
  if (/arbeitgeber/i.test(value.title)) return toast("Diese persönliche Pilotkonfiguration erzeugt keine Arbeitgeberaufgabe.");
  state.tasks = [...state.tasks.filter(item => item.id !== id), value];
  activeTaskGroup = value.group;
  $("#taskDialog").close();
  persist();
  toast("Aufgabe gespeichert.");
});

const CHECKIN_METRICS = [
  ["mood", "Stimmung", 1, 10, 6],
  ["energy", "Energie", 1, 10, 5],
  ["sleep", "Schlaf", 1, 10, 6],
  ["appetite", "Appetit", 1, 10, 6],
  ["overwhelmed", "Überforderung", 0, 10, 3],
  ["loneliness", "Einsamkeit", 0, 10, 3],
  ["craving", "Suchtdruck", 0, 10, 0]
];

function renderMetricInputs() {
  if ($("#checkinMetrics").children.length) return;
  $("#checkinMetrics").innerHTML = CHECKIN_METRICS.map(([id, label, min, max, value]) => `<label class="metric" for="metric-${id}"><span>${label}: <output id="metric-${id}-value">${value}</output>/${max}</span><input class="field" id="metric-${id}" type="range" min="${min}" max="${max}" value="${value}" data-metric="${id}"></label>`).join("");
  $$("[data-metric]").forEach(input => input.addEventListener("input", () => $(`#metric-${input.dataset.metric}-value`).textContent = input.value));
}

function renderJournal() {
  renderMetricInputs();
  const entries = [
    ...state.journal.map(item => ({ ...item, collection: "journal", heading: item.type || "Tagebuch" })),
    ...state.sessionNotes.map(item => ({ ...item, collection: "sessionNotes", heading: item.type || "Sitzung" })),
    ...state.voiceNotes.map(item => ({ ...item, collection: "voiceNotes", heading: "Sprachnotiz" }))
  ].sort((a, b) => String(b.createdAt || b.updatedAt).localeCompare(String(a.createdAt || a.updatedAt))).slice(0, 30);
  $("#journalHistory").innerHTML = entries.map(item => {
    const body = item.collection === "sessionNotes" ? [item.topics, item.insights, item.questions, item.steps, item.feelings, item.next].filter(Boolean).join(" · ") : item.text || item.transcript || item.summary || "Kein Text gespeichert";
    const voiceActions = item.collection === "voiceNotes" ? `<div class="actions">${item.audioDocumentId ? `<button class="button ghost" data-delete-voice="audio" data-voice-id="${item.id}">Audio löschen</button>` : ""}${item.transcript ? `<button class="button ghost" data-delete-voice="transcript" data-voice-id="${item.id}">Transkript löschen</button>` : ""}${item.summary ? `<button class="button ghost" data-delete-voice="summary" data-voice-id="${item.id}">Zusammenfassung löschen</button>` : ""}</div>` : "";
    return `<article class="entry-card"><small>${escapeHtml(displayDateTime(item.createdAt || item.updatedAt))} · ${escapeHtml(item.heading)}</small><p>${escapeHtml(body)}</p>${voiceActions}<button class="icon-button" data-delete-entry="${item.collection}:${item.id}" aria-label="Eintrag löschen">×</button></article>`;
  }).join("") || `<div class="empty-state">Noch keine Einträge. Ein kurzer Satz reicht für den Anfang.</div>`;
  const recent = [...state.checkins].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 7).reverse();
  $("#trendView").innerHTML = recent.map(item => `<div class="trend-bar"><small>${escapeHtml(new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(new Date(item.createdAt)))}</small><meter min="0" max="10" value="${Math.max(0, Math.min(10, Number(item.metrics?.mood || 0)))}" aria-label="Stimmung ${Number(item.metrics?.mood || 0)} von 10"></meter><strong>${Number(item.metrics?.mood || 0)}</strong></div>`).join("") || `<p class="privacy">Nach mehreren Check-ins erscheint hier ein schlichter Verlauf.</p>`;
}

$("#checkinForm").addEventListener("submit", event => {
  event.preventDefault();
  const metrics = Object.fromEntries($$("[data-metric]").map(input => [input.dataset.metric, Number(input.value)]));
  state.checkins.push(makeRecord({ createdAt: new Date().toISOString(), metrics, note: $("#checkinNote").value.trim(), source: "user" }));
  $("#checkinNote").value = "";
  persist();
  toast("Check-in gespeichert – ohne Bewertung oder Punktesystem.");
});

$("#journalForm").addEventListener("submit", event => {
  event.preventDefault();
  const text = $("#journalText").value.trim();
  if (!text) return toast("Schreibe oder sprich zuerst einen kurzen Eintrag.");
  state.journal.push(makeRecord({ type: "Tagebuch", createdAt: new Date().toISOString(), text, source: "user" }));
  $("#journalText").value = "";
  persist();
  toast("Tagebucheintrag verschlüsselt gespeichert.");
});

function openSessionDialog() {
  $("#sessionForm").reset();
  $("#sessionId").value = "";
  $("#sessionVoiceStatus").textContent = "Keine Aufnahme oder Transkription aktiv.";
  $("#sessionDialog").showModal();
}

$("#sessionForm").addEventListener("submit", event => {
  event.preventDefault();
  const value = makeRecord({
    id: $("#sessionId").value || undefined,
    createdAt: new Date().toISOString(),
    type: $("#sessionType").value,
    contact: $("#sessionContact").value.trim(),
    topics: $("#sessionTopics").value.trim(),
    insights: $("#sessionInsights").value.trim(),
    questions: $("#sessionQuestions").value.trim(),
    steps: $("#sessionSteps").value.trim(),
    feelings: $("#sessionFeelings").value.trim(),
    next: $("#sessionNext").value.trim(),
    source: "user"
  });
  state.sessionNotes = [...state.sessionNotes.filter(item => item.id !== value.id), value];
  $("#sessionDialog").close();
  persist();
  toast("Sitzungsnachbereitung gespeichert.");
});

function openVoiceDialog(target) {
  activeVoiceTarget = target;
  voiceBlob = null;
  voiceChunks = [];
  $("#voiceConsent").checked = false;
  $("#voiceTranscript").value = "";
  $("#voiceSummary").value = "";
  $("#voiceIndicator").textContent = "Nicht aktiv";
  $("#voiceIndicator").classList.remove("recording");
  $("#voiceDialog").showModal();
}

function stopVoiceCapture() {
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  if (speechRecognition) {
    speechRecognition.stop();
    speechRecognition = null;
  }
  voiceStream?.getTracks().forEach(track => track.stop());
  voiceStream = null;
  $("#voiceIndicator").textContent = voiceBlob ? "Aufnahme beendet – noch nicht gespeichert" : "Nicht aktiv";
  $("#voiceIndicator").classList.remove("recording");
}

$("#voiceRecord").addEventListener("click", async () => {
  if (!$("#voiceConsent").checked) return toast("Bitte bestätige zuerst ausdrücklich, dass du die Aufnahme jetzt starten möchtest.");
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Dieser Browser unterstützt keine lokale Audioaufnahme. Du kannst den Text manuell eingeben.");
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceChunks = [];
    mediaRecorder = new MediaRecorder(voiceStream);
    mediaRecorder.addEventListener("dataavailable", event => { if (event.data.size) voiceChunks.push(event.data); });
    mediaRecorder.addEventListener("stop", () => {
      voiceBlob = new Blob(voiceChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      voiceStream?.getTracks().forEach(track => track.stop());
      voiceStream = null;
      $("#voiceIndicator").textContent = `Aufnahme beendet · ${Math.ceil(voiceBlob.size / 1024)} KB · noch nicht gespeichert`;
      $("#voiceIndicator").classList.remove("recording");
    });
    mediaRecorder.start();
    $("#voiceIndicator").textContent = "● Aufnahme läuft sichtbar – mit Beenden stoppen";
    $("#voiceIndicator").classList.add("recording");
  } catch {
    toast("Der Mikrofonzugriff wurde nicht erlaubt oder ist nicht verfügbar.");
  }
});

$("#voiceRecognize").addEventListener("click", () => {
  if (!$("#voiceConsent").checked) return toast("Bitte bestätige zuerst die sichtbare Einwilligung.");
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return toast("Die Browser-Spracherkennung ist hier nicht verfügbar. Nutze die Tastatur oder lokale Audioaufnahme.");
  speechRecognition = new Recognition();
  speechRecognition.lang = "de-DE";
  speechRecognition.continuous = true;
  speechRecognition.interimResults = false;
  speechRecognition.addEventListener("result", event => {
    const text = [...event.results].map(result => result[0]?.transcript || "").join(" ");
    $("#voiceTranscript").value = [$("#voiceTranscript").value.trim(), text.trim()].filter(Boolean).join(" ");
  });
  speechRecognition.addEventListener("end", () => {
    speechRecognition = null;
    if (!mediaRecorder || mediaRecorder.state !== "recording") $("#voiceIndicator").textContent = "Browser-Transkription beendet";
  });
  try {
    speechRecognition.start();
    $("#voiceIndicator").textContent = "Browser-Transkription läuft sichtbar";
    $("#voiceIndicator").classList.add("recording");
  } catch {
    toast("Die Browser-Spracherkennung konnte nicht gestartet werden.");
  }
});

$("#voiceStop").addEventListener("click", stopVoiceCapture);
$("#deleteVoiceAudio").addEventListener("click", () => { stopVoiceCapture(); voiceBlob = null; voiceChunks = []; $("#voiceIndicator").textContent = "Audio gelöscht"; });
$("#deleteVoiceTranscript").addEventListener("click", () => { $("#voiceTranscript").value = ""; });
$("#deleteVoiceSummary").addEventListener("click", () => { $("#voiceSummary").value = ""; });

$("#voiceForm").addEventListener("submit", async event => {
  event.preventDefault();
  stopVoiceCapture();
  let audioDocumentId = "";
  if (voiceBlob) {
    const file = new File([voiceBlob], `sprachnotiz-${Date.now()}.webm`, { type: voiceBlob.type || "audio/webm" });
    const metadata = await storeEncryptedDocument(file, "Sprachnotiz", "Sprachnotiz", { allowAudio: true });
    audioDocumentId = metadata.id;
  }
  const transcript = $("#voiceTranscript").value.trim();
  const summary = $("#voiceSummary").value.trim();
  if (!audioDocumentId && !transcript && !summary) return toast("Es gibt noch keine Aufnahme, kein Transkript und keine Zusammenfassung.");
  const note = makeRecord({ createdAt: new Date().toISOString(), target: activeVoiceTarget, audioDocumentId, transcript, summary, source: "user" });
  state.voiceNotes.push(note);
  if (activeVoiceTarget === "journal") $("#journalText").value = [transcript, summary].filter(Boolean).join("\n\n");
  if (activeVoiceTarget === "assistant") $("#assistantMessage").value = [transcript, summary].filter(Boolean).join("\n\n");
  if (activeVoiceTarget === "session") {
    $("#sessionTopics").value = transcript;
    $("#sessionInsights").value = summary;
    $("#sessionVoiceStatus").textContent = "Sprachnotiz getrennt gespeichert. Felder bleiben editierbar.";
  }
  $("#voiceDialog").close();
  await persist();
  toast("Audio, Transkript und Zusammenfassung wurden getrennt verwaltet.");
});

async function storeEncryptedDocument(file, displayName, category, { allowAudio = false } = {}) {
  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "application/json"];
  if (!allowAudio && !allowed.includes(file.type)) throw new Error("Dieser Dateityp ist im geschützten Archiv nicht zugelassen.");
  if (file.size > 16 * 1024 * 1024) throw new Error("Die Datei ist größer als 16 MB.");
  const id = crypto.randomUUID();
  const encrypted = await encryptBytes(vaultKey, await file.arrayBuffer());
  let uploadStatus = "stored";
  try {
    await api.putDocument(id, encrypted);
  } catch (error) {
    if (!error.retryable && error.code !== "OFFLINE") throw error;
    await localVault.putPendingDocument(id, encrypted);
    uploadStatus = "pending";
  }
  const metadata = makeRecord({ id, name: displayName || file.name, originalName: file.name, category, mime: file.type || "application/octet-stream", size: file.size, createdAt: new Date().toISOString(), uploadStatus, source: "user" });
  state.documents.push(metadata);
  return metadata;
}

async function flushPendingDocuments() {
  const pending = state?.documents?.filter(item => item.uploadStatus === "pending") || [];
  for (const metadata of pending) {
    const buffer = await localVault.getPendingDocument(metadata.id);
    if (!buffer) continue;
    try {
      await api.putDocument(metadata.id, buffer);
      metadata.uploadStatus = "stored";
      metadata.updatedAt = new Date().toISOString();
      await localVault.deletePendingDocument(metadata.id);
    } catch {
      break;
    }
  }
}

async function loadEncryptedDocument(metadata) {
  let encrypted;
  if (metadata.uploadStatus === "pending") encrypted = await localVault.getPendingDocument(metadata.id);
  else encrypted = await api.getDocument(metadata.id);
  if (!encrypted) throw new Error("Das verschlüsselte Dokument ist nicht verfügbar.");
  return decryptBytes(vaultKey, encrypted);
}

function renderDocuments() {
  const query = $("#documentSearch").value.trim().toLocaleLowerCase("de");
  const documents = state.documents.filter(item => !query || `${item.name} ${item.category}`.toLocaleLowerCase("de").includes(query));
  $("#documentList").innerHTML = documents.map(item => `<article class="document-row"><div class="row-between"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)} · ${Math.max(1, Math.round(item.size / 1024))} KB · ${item.uploadStatus === "pending" ? "wartet auf Synchronisierung" : "verschlüsselt gespeichert"}</small></div><div><button class="icon-button" data-view-document="${item.id}" aria-label="${escapeHtml(item.name)} ansehen">⌕</button><button class="icon-button" data-download-document="${item.id}" aria-label="${escapeHtml(item.name)} herunterladen">↓</button><button class="icon-button" data-delete-document="${item.id}" aria-label="${escapeHtml(item.name)} löschen">×</button></div></div></article>`).join("") || `<div class="empty-state">Noch keine Dokumente im Archiv.</div>`;
}

async function previewEncryptedDocument(metadata) {
  const plain = await loadEncryptedDocument(metadata);
  if (documentPreviewUrl) URL.revokeObjectURL(documentPreviewUrl);
  documentPreviewUrl = "";
  $("#documentPreviewTitle").textContent = metadata.name;
  const container = $("#documentPreviewContent");
  container.replaceChildren();
  if (["text/plain", "application/json"].includes(metadata.mime)) {
    const pre = document.createElement("pre");
    const text = new TextDecoder().decode(plain);
    pre.textContent = text.length > 200_000 ? `${text.slice(0, 200_000)}\n\n[Vorschau aus Sicherheits- und Leistungsgründen gekürzt]` : text;
    container.append(pre);
  } else {
    documentPreviewUrl = URL.createObjectURL(new Blob([plain], { type: metadata.mime }));
    if (metadata.mime.startsWith("image/")) {
      const image = document.createElement("img");
      image.alt = `Vorschau von ${metadata.name}`;
      image.src = documentPreviewUrl;
      container.append(image);
    } else {
      const frame = document.createElement("iframe");
      frame.title = `Vorschau von ${metadata.name}`;
      frame.src = documentPreviewUrl;
      container.append(frame);
    }
  }
  $("#documentPreviewDialog").showModal();
}

$("#archiveFile").addEventListener("change", event => {
  if (!$("#archiveName").value && event.target.files[0]) $("#archiveName").value = event.target.files[0].name.replace(/\.[^.]+$/, "");
});

$("#archiveForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const file = $("#archiveFile").files[0];
  if (!file) return toast("Bitte wähle zuerst ein Dokument.");
  const button = event.submitter;
  button.disabled = true;
  try {
    await storeEncryptedDocument(file, $("#archiveName").value.trim(), $("#archiveCategory").value);
    form.reset();
    await persist();
    toast("Dokument wurde vor dem Upload verschlüsselt.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

$("#planFile").addEventListener("change", event => {
  const file = event.target.files[0];
  if (planSourceUrl) URL.revokeObjectURL(planSourceUrl);
  planSourceUrl = file ? URL.createObjectURL(file) : "";
  const preview = $("#planSource");
  preview.hidden = !file;
  if (!file) return preview.replaceChildren();
  preview.innerHTML = file.type === "application/pdf" ? `<iframe title="Quelldokument zur Kontrolle" src="${planSourceUrl}"></iframe>` : `<img alt="Ausgewählter Therapieplan zur Kontrolle" src="${planSourceUrl}">`;
});

function renderScanResult() {
  const container = $("#scanResult");
  if (!scanResult) return container.replaceChildren();
  container.innerHTML = `<h3>${escapeHtml(scanResult.title || "Erkannte Termine")}</h3><p class="privacy">Jeden Eintrag kontrollieren und bei Bedarf korrigieren. Niedrige Sicherheit ist gold markiert.</p>${scanResult.events.map((item, index) => `<div class="scan-event ${Number(item.confidence) < .8 ? "uncertain" : ""}" data-scan-row="${index}"><input type="checkbox" data-scan-include="${index}" checked aria-label="Eintrag übernehmen"><label><span class="label">Datum</span><input class="field" type="date" data-scan-field="date" value="${escapeHtml(item.date || "")}"></label><label><span class="label">Beginn</span><input class="field" type="time" data-scan-field="start" value="${escapeHtml(item.start || "")}"></label><label><span class="label">Ende</span><input class="field" type="time" data-scan-field="end" value="${escapeHtml(item.end || "")}"></label><label><span class="label">Bezeichnung</span><input class="field" data-scan-field="title" value="${escapeHtml(item.title || "")}"></label><label><span class="label">Raum</span><input class="field" data-scan-field="location" value="${escapeHtml(item.location || "")}"></label><button class="icon-button" data-remove-scan="${index}" aria-label="Erkannten Eintrag löschen">×</button><small>Sicherheit ${Math.round(Number(item.confidence || 0) * 100)} %</small></div>`).join("")}<p class="privacy">${(scanResult.warnings || []).map(escapeHtml).join(" · ")}</p><div class="actions"><button class="button" id="confirmScan">Kontrollierte Einträge übernehmen</button><button class="button ghost" id="discardScan">Analyse verwerfen</button></div>`;
}

$("#scanPlan").addEventListener("click", async () => {
  const file = $("#planFile").files[0];
  if (!file) return toast("Bitte wähle zuerst ein Foto oder PDF.");
  const button = $("#scanPlan");
  button.disabled = true;
  button.textContent = "Dokument wird gelesen …";
  try {
    scanResult = await api.analyzePlan(file);
    renderScanResult();
    toast("Analyse fertig. Noch wurde kein Termin gespeichert.");
  } catch (error) {
    scanResult = null;
    $("#scanResult").innerHTML = `<div class="entry-card"><strong>Automatische Erkennung nicht verfügbar</strong><p>${escapeHtml(error.message)}</p><button class="button secondary" data-route-target="kalender" data-open-event>Termin manuell eintragen</button></div>`;
    toast("Die restliche App bleibt vollständig nutzbar.");
  } finally {
    button.disabled = false;
    button.textContent = "Dokument analysieren";
  }
});

function addChatBubble(text, kind = "assistant", isError = false) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${kind}${isError ? " error" : ""}`;
  bubble.textContent = text;
  $("#chatLog").append(bubble);
  bubble.scrollIntoView({ block: "nearest" });
}

function assistantContext() {
  const next = currentTask();
  return {
    displayName: state.profile.displayName,
    admission: state.profile.admission,
    nextTask: next ? `${next.title} – ${next.why || ""}` : "",
    upcoming: state.events.filter(item => item.status !== "cancelled" && item.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)).slice(0, 8).map(item => `${item.date} ${item.start}: ${item.title}`),
    recentCheckins: state.checkins.slice(-3).map(item => `${item.createdAt}: Stimmung ${item.metrics?.mood ?? "offen"}, Energie ${item.metrics?.energy ?? "offen"}, Überforderung ${item.metrics?.overwhelmed ?? "offen"}`),
    goals: state.goals.filter(item => item.status !== "done").slice(0, 6).map(item => item.title),
    careTeam: state.contacts.slice(0, 8).map(item => ({ role: item.role, name: item.name }))
  };
}

async function sendAssistantMessage(message, { retry = false } = {}) {
  const button = $("#assistantSend");
  button.disabled = true;
  button.textContent = "Coach denkt …";
  if (!retry) addChatBubble(message, "user");
  try {
    const result = await api.assistant(message, assistantContext());
    addChatBubble(result.reply, "assistant");
    $("#assistantMessage").value = "";
    $("#assistantRetry").hidden = true;
    assistantRetries = 0;
  } catch (error) {
    const fallback = coachingMessage("next", Number(state.coaching.counters?.next || 0), currentTask()?.title || "eine reale Ansprechperson oder einen kleinen sicheren Schritt wählen");
    addChatBubble(`${error.message}\n\nOffline-Hilfe: ${fallback}`, "assistant", true);
    $("#assistantMessage").value = message;
    lastAssistantMessage = message;
    $("#assistantRetry").hidden = !error.retryable || assistantRetries >= 2;
  } finally {
    button.disabled = false;
    button.textContent = "Nachricht senden";
  }
}

$("#assistantForm").addEventListener("submit", event => {
  event.preventDefault();
  const message = $("#assistantMessage").value.trim();
  if (!message) return toast("Schreibe oder diktiere zuerst eine Nachricht.");
  lastAssistantMessage = message;
  assistantRetries = 0;
  sendAssistantMessage(message);
});

$("#assistantRetry").addEventListener("click", async () => {
  if (!lastAssistantMessage || assistantRetries >= 2) return;
  assistantRetries += 1;
  $("#assistantRetry").disabled = true;
  await new Promise(resolve => setTimeout(resolve, 700 * 2 ** (assistantRetries - 1)));
  await sendAssistantMessage(lastAssistantMessage, { retry: true });
  $("#assistantRetry").disabled = false;
});

function renderCoach() {
  $("#crisisTitle").textContent = CRISIS_TEXT.title;
  $("#crisisText").textContent = CRISIS_TEXT.text;
  $("#crisisContacts").innerHTML = CRISIS_TEXT.contacts.map(item => `<li>${escapeHtml(item)}</li>`).join("");
  const counter = Number(state.coaching.counters?.offline || 0);
  $("#offlineCoachText").textContent = coachingMessage("overwhelmed", counter, currentTask()?.title);
}

$("#offlineCoachNext").addEventListener("click", () => {
  const count = Number(state.coaching.counters?.offline || 0) + 1;
  state.coaching.counters = { ...state.coaching.counters, offline: count };
  $("#offlineCoachText").textContent = coachingMessage("overwhelmed", count, currentTask()?.title);
  persist({ render: false });
});

function renderProfile() {
  const weight = state.profile.weight || { current: null, target: null, unit: "kg", entries: [] };
  $("#profileDisplayName").value = state.profile.displayName || "Olaf";
  $("#profileWeightCurrent").value = weight.current ?? "";
  $("#profileWeightTarget").value = weight.target ?? "";
  if (!$("#weightEntryDate").value) $("#weightEntryDate").value = new Date().toISOString().slice(0, 10);
  const entries = [...(weight.entries || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  $("#weightHistory").innerHTML = entries.map(item => `<article class="entry-card"><div class="row-between"><div><strong>${Number(item.value).toLocaleString("de-DE", { maximumFractionDigits: 1 })} kg</strong><small>${escapeHtml(displayDate(item.date))}</small></div><button class="icon-button" data-delete-weight="${item.id}" aria-label="Gewichtseintrag vom ${escapeHtml(displayDate(item.date))} löschen">×</button></div></article>`).join("") || `<div class="empty-state">Noch kein Verlauf eingetragen.</div>`;
  $("#goalList").innerHTML = state.goals.map(item => `<div class="check-row ${item.status === "done" ? "done" : ""}"><input type="checkbox" data-toggle-goal="${item.id}" ${item.status === "done" ? "checked" : ""} aria-label="${escapeHtml(item.title)} erreicht"><div><strong>${escapeHtml(item.title)}</strong><small>${item.status === "done" ? "Als erreicht markiert" : "Offen – mit dem Fachteam konkretisieren"}</small></div><button class="icon-button" data-delete-goal="${item.id}" aria-label="${escapeHtml(item.title)} löschen">×</button></div>`).join("") || `<div class="empty-state">Noch keine persönlichen Ziele gespeichert.</div>`;
}

$("#profileForm").addEventListener("submit", event => {
  event.preventDefault();
  const current = $("#profileWeightCurrent").value === "" ? null : Number($("#profileWeightCurrent").value);
  const target = $("#profileWeightTarget").value === "" ? null : Number($("#profileWeightTarget").value);
  state.profile.displayName = $("#profileDisplayName").value.trim() || "Olaf";
  state.profile.weight = { ...(state.profile.weight || {}), current, target, unit: "kg", entries: state.profile.weight?.entries || [] };
  persist();
  toast("Persönliches Profil verschlüsselt gespeichert.");
});

$("#weightEntryForm").addEventListener("submit", event => {
  event.preventDefault();
  const value = Number($("#weightEntryValue").value);
  if (!Number.isFinite(value)) return toast("Bitte trage ein gültiges Gewicht ein.");
  const entry = makeRecord({ date: $("#weightEntryDate").value, value, source: "user" });
  const weight = state.profile.weight || { current: null, target: null, unit: "kg", entries: [] };
  weight.current = value;
  weight.entries = [...(weight.entries || []), entry];
  state.profile.weight = weight;
  $("#weightEntryValue").value = "";
  persist();
  toast("Gewichtseintrag ohne Bewertung gespeichert.");
});

$("#goalForm").addEventListener("submit", event => {
  event.preventDefault();
  const title = $("#goalTitle").value.trim();
  if (!title) return;
  state.goals.push(makeRecord({ title, status: "active", source: "user" }));
  $("#goalTitle").value = "";
  persist();
});

function renderContacts() {
  $("#contactList").innerHTML = state.contacts.map(item => `<article class="contact-card"><div class="row-between"><div><strong>${escapeHtml(item.role || "Kontakt")}</strong><p>${escapeHtml(item.name || "Noch offen")}</p><small>${escapeHtml(item.phone || "")}${item.email ? ` · ${escapeHtml(item.email)}` : ""}${item.availability ? ` · ${escapeHtml(item.availability)}` : ""}<br>${item.source === "document" ? "Dokumentenangabe" : item.source === "system" ? "Systemvorschlag – noch bestätigen" : "Nutzerangabe"}</small></div><div><button class="icon-button" data-edit-contact="${item.id}" aria-label="Kontakt bearbeiten">✎</button><button class="icon-button" data-delete-contact="${item.id}" aria-label="Kontakt löschen">×</button></div></div>${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}</article>`).join("") || `<div class="empty-state">Noch keine Namen hinterlegt. Offene Rollen dürfen bewusst leer bleiben.</div>`;
  $("#contactOptions").innerHTML = state.contacts.map(item => `<option value="${escapeHtml([item.role, item.name].filter(Boolean).join(" – "))}"></option>`).join("");
}

function openContactDialog(item = null) {
  $("#contactId").value = item?.id || "";
  $("#contactRole").value = item?.role || "";
  $("#contactName").value = item?.name || "";
  $("#contactPhone").value = item?.phone || "";
  $("#contactEmail").value = item?.email || "";
  $("#contactAvailability").value = item?.availability || "";
  $("#contactSource").value = item?.source || "user";
  $("#contactNotes").value = item?.notes || "";
  $("#contactDialog").showModal();
}

$("#contactForm").addEventListener("submit", event => {
  event.preventDefault();
  const id = $("#contactId").value || crypto.randomUUID();
  const value = makeRecord({
    id,
    role: $("#contactRole").value.trim(),
    name: $("#contactName").value.trim(),
    phone: $("#contactPhone").value.trim(),
    email: $("#contactEmail").value.trim(),
    availability: $("#contactAvailability").value.trim(),
    source: $("#contactSource").value,
    notes: $("#contactNotes").value.trim()
  });
  state.contacts = [...state.contacts.filter(item => item.id !== id), value];
  $("#contactDialog").close();
  persist();
  toast("Kontakt gespeichert.");
});

$("#contactExport").addEventListener("click", () => {
  const text = ["GESPRÄCHSVORBEREITUNG", `Erstellt: ${displayDateTime(new Date().toISOString())}`, "", ...state.contacts.map(item => [item.role, item.name || "Noch offen", item.phone || "", item.email || "", item.availability || "", item.notes || ""].filter(Boolean).join("\n")), "", "Hinweis: Nutzerangaben, Dokumentenangaben und unbestätigte Vorschläge vor Nutzung prüfen."].join("\n\n");
  download(`gespraechsvorbereitung-${new Date().toISOString().slice(0, 10)}.txt`, text, "text/plain;charset=utf-8");
});

function renderClinic() {
  $("#clinicVerified").textContent = `Offizielle Angaben geprüft am ${CLINIC_DOSSIER.verifiedAt}`;
  $("#clinicTitle").textContent = CLINIC_DOSSIER.title;
  $("#clinicFacts").innerHTML = CLINIC_DOSSIER.facts.map(item => `<article class="fact"><strong>${escapeHtml(item.area)}</strong><p>${escapeHtml(item.text)}</p><span class="badge gold">${escapeHtml(item.status)}</span><a class="source" href="${escapeHtml(item.source)}" target="_blank" rel="noopener noreferrer">Offizielle Quelle öffnen ↗</a></article>`).join("");
  $("#clinicTips").innerHTML = CLINIC_DOSSIER.practicalTips.map(item => `<p>• ${escapeHtml(item)}</p>`).join("");
  $("#clinicDownloads").innerHTML = CLINIC_DOSSIER.downloads.map(item => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(item.title)}</span><span>↗</span></a>`).join("");
  $("#clinicQuestions").innerHTML = state.clinicQuestions.map(item => `<div class="check-row ${item.status === "done" ? "done" : ""}"><input type="checkbox" data-toggle-question="${item.id}" ${item.status === "done" ? "checked" : ""} aria-label="Frage geklärt"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.answer || "Noch offen")}</small></div><button class="icon-button" data-delete-question="${item.id}" aria-label="Frage löschen">×</button></div>`).join("") || `<p class="privacy">Noch keine persönliche Vorab-Frage gespeichert.</p>`;
}

$("#clinicQuestionForm").addEventListener("submit", event => {
  event.preventDefault();
  const title = $("#clinicQuestion").value.trim();
  if (!title) return;
  state.clinicQuestions.push(makeRecord({ title, answer: "", status: "open", source: "user" }));
  $("#clinicQuestion").value = "";
  persist();
});

async function refreshPushStatus() {
  const element = $("#pushStatus");
  if (!state || !element) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    element.textContent = "Dieser Browser unterstützt hier kein zuverlässiges Web Push. Kalender und lokale Aufgaben bleiben nutzbar.";
    return;
  }
  try {
    const status = await api.pushStatus();
    element.textContent = !status.configured ? "Push ist serverseitig noch nicht eingerichtet. Es wird keine funktionslose Aktivierung vorgetäuscht." : status.subscribed ? `Hintergrund-Push aktiv · ${status.reminders} neutrale Erinnerung(en) vorgemerkt` : "Push ist verfügbar, aber noch nicht aktiviert.";
    $("#pushEnable").disabled = !status.configured || status.subscribed;
    $("#pushTest").disabled = !status.configured || !status.subscribed;
    $("#pushDisable").disabled = !status.subscribed;
  } catch (error) {
    element.textContent = error.message;
  }
}

async function enablePush() {
  const key = await api.pushKey();
  if (!key.configured || !key.publicKey) throw new Error("Push ist auf dem Server noch nicht vollständig eingerichtet.");
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent) && !standalone) throw new Error("Auf iPhone oder iPad zuerst in Safari „Zum Home-Bildschirm“ wählen und die installierte App öffnen.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Benachrichtigungen wurden nicht erlaubt. Du kannst das später in den Geräteeinstellungen ändern.");
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(key.publicKey) });
  await api.pushSubscribe(subscription.toJSON());
  await updateServerReminders();
}

function inQuietHours(date) {
  const start = state.profile.preferences.quietStart || "21:30";
  const end = state.profile.preferences.quietEnd || "07:00";
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return start <= end ? time >= start && time < end : time >= start || time < end;
}

async function updateServerReminders() {
  if (!navigator.onLine || !systemHealth?.pushConfigured) return;
  const lead = Number(state.profile.preferences.reminderMinutes || 15) * 60_000;
  const now = Date.now();
  const entries = [
    ...state.events.filter(item => item.status !== "cancelled" && item.date && item.start).map(item => ({ id: `event-${item.id}`, at: new Date(`${item.date}T${item.start}:00`) })),
    ...state.tasks.filter(item => item.status === "open" && item.dueDate && item.dueTime).map(item => ({ id: `task-${item.id}`, at: new Date(`${item.dueDate}T${item.dueTime}:00`) }))
  ];
  const reminders = entries.flatMap(item => {
    const fireAt = new Date(item.at.getTime() - lead);
    if (fireAt.getTime() <= now || fireAt.getTime() > now + 120 * 86_400_000 || inQuietHours(fireAt)) return [];
    return [{ id: item.id, fireAt: fireAt.toISOString() }];
  });
  await api.putReminders(reminders).catch(() => {});
}

$("#pushEnable").addEventListener("click", async () => {
  try {
    await enablePush();
    await refreshPushStatus();
    toast("Neutrale Hintergrund-Erinnerungen sind aktiviert.");
  } catch (error) {
    toast(error.message);
  }
});

$("#pushDisable").addEventListener("click", async () => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await api.pushUnsubscribe(subscription.endpoint);
      await subscription.unsubscribe();
    }
    await refreshPushStatus();
    toast("Push-Anmeldung und Subscription wurden entfernt.");
  } catch (error) {
    toast(error.message);
  }
});

$("#pushTest").addEventListener("click", async () => {
  try {
    const result = await api.pushTest();
    toast(result.sent ? "Neutraler Hintergrund-Test wurde gesendet." : "Keine aktive Subscription gefunden.");
  } catch (error) {
    toast(error.message);
  }
});

function renderPushSettings() {
  $("#reminderMinutes").value = String(state.profile.preferences.reminderMinutes || 15);
  $("#quietStart").value = state.profile.preferences.quietStart || "21:30";
  $("#quietEnd").value = state.profile.preferences.quietEnd || "07:00";
}

$("#savePushSettings").addEventListener("click", async () => {
  state.profile.preferences.reminderMinutes = Number($("#reminderMinutes").value);
  state.profile.preferences.quietStart = $("#quietStart").value;
  state.profile.preferences.quietEnd = $("#quietEnd").value;
  await persist();
  await updateServerReminders();
  toast("Push-Vorlauf und Ruhezeit gespeichert.");
});

function renderSystemStatus() {
  if (!state || !$("#systemStatus")) return;
  const items = [
    [navigator.onLine, navigator.onLine ? "Online" : "Offline – lokale Warteschlange aktiv"],
    [!state.sync?.pending, state.sync?.pending ? "Verschlüsselte Synchronisierung wartet" : `Synchronisiert${state.sync?.lastSuccessAt ? ` · ${displayDateTime(state.sync.lastSuccessAt)}` : ""}`],
    [Boolean(systemHealth?.aiConfigured), systemHealth?.aiConfigured ? "KI optional verfügbar" : "KI nicht verfügbar – Offline-Kern aktiv"],
    [Boolean(systemHealth?.pushConfigured), systemHealth?.pushConfigured ? "Web-Push-Infrastruktur bereit" : "Web-Push noch nicht serverseitig eingerichtet"],
    [currentAuthMethod === "passkey", currentAuthMethod === "passkey" ? "Persönlicher Passkey und widerrufbare Gerätesitzung aktiv" : "Einmalige Code-Sitzung aktiv – Passkey kann unter Zugang eingerichtet werden"],
    [true, "Lokaler Datentresor: AES-GCM; Schlüssel nur während der entsperrten Sitzung im Arbeitsspeicher"]
  ];
  $("#systemStatus").innerHTML = items.map(([ok, text]) => `<div class="status-pill ${ok ? "ok" : "warn"}">${escapeHtml(text)}</div>`).join("");
}

function icsEscape(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function exportCalendar() {
  const events = state.events.filter(item => item.status !== "cancelled" && item.date);
  const tasks = state.tasks.filter(item => item.status === "open" && item.dueDate);
  const components = [
    ...events.map(item => {
      const date = item.date.replaceAll("-", "");
      const start = item.start ? `${date}T${item.start.replace(":", "")}00` : date;
      const end = item.end ? `${date}T${item.end.replace(":", "")}00` : "";
      return ["BEGIN:VEVENT", `UID:${item.id}@olafs-kompass`, item.start ? `DTSTART;TZID=Europe/Berlin:${start}` : `DTSTART;VALUE=DATE:${start}`, end ? `DTEND;TZID=Europe/Berlin:${end}` : "", `SUMMARY:${icsEscape(item.title)}`, item.location ? `LOCATION:${icsEscape(item.location)}` : "", "END:VEVENT"].filter(Boolean).join("\r\n");
    }),
    ...state.routines.filter(item => item.status !== "cancelled").map(item => {
      const date = selectedDate.replaceAll("-", "");
      const start = `${date}T${(item.start || "08:00").replace(":", "")}00`;
      const rule = item.repeat === "weekdays" ? "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" : item.repeat === "weekly" ? "FREQ=WEEKLY" : "FREQ=DAILY";
      return ["BEGIN:VEVENT", `UID:${item.id}@olafs-kompass`, `DTSTART;TZID=Europe/Berlin:${start}`, `RRULE:${rule}`, `SUMMARY:${icsEscape(item.title)}`, "END:VEVENT"].join("\r\n");
    }),
    ...tasks.map(item => ["BEGIN:VTODO", `UID:${item.id}@olafs-kompass`, `DUE;VALUE=DATE:${item.dueDate.replaceAll("-", "")}`, `SUMMARY:${icsEscape(item.title)}`, "END:VTODO"].join("\r\n"))
  ];
  if (!components.length) return toast("Noch keine exportierbaren Termine oder Aufgaben vorhanden.");
  download("Olafs-Reha-Kalender.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "CALSCALE:GREGORIAN", "PRODID:-//Olafs Reha-Kompass//DE", ...components, "END:VCALENDAR", ""].join("\r\n"), "text/calendar;charset=utf-8");
}

function showMoreTab(name) {
  $$("[data-more-tab]").forEach(button => button.classList.toggle("active", button.dataset.moreTab === name));
  $$("[data-more-panel]").forEach(panel => panel.hidden = panel.dataset.morePanel !== name);
  if (name === "push") refreshPushStatus();
  if (name === "access") refreshDevices();
}

async function refreshDevices() {
  const list = $("#deviceList");
  if (!state || !list) return;
  list.innerHTML = `<p class="privacy">Die bestätigten Zugänge werden geladen …</p>`;
  try {
    const result = await api.devices();
    list.innerHTML = result.devices.length ? result.devices.map(device => `
      <div class="device-card ${device.current ? "current" : ""}">
        <div><strong>${escapeHtml(device.name)}</strong><small>${device.current ? "Dieses Gerät · " : ""}Bestätigt ${escapeHtml(displayDateTime(device.createdAt))}${device.lastUsedAt ? ` · zuletzt ${escapeHtml(displayDateTime(device.lastUsedAt))}` : ""}</small></div>
        <button class="button ghost" data-revoke-device="${device.id}">${device.current ? "Abmelden und entziehen" : "Zugriff entziehen"}</button>
      </div>`).join("") : `<p class="privacy">Noch kein Passkey eingerichtet. Bestätige dieses Gerät zuerst.</p>`;
  } catch (error) {
    list.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`;
  }
}

$("#passkeyRegister").addEventListener("click", async () => {
  const button = $("#passkeyRegister");
  const status = $("#passkeyRegisterStatus");
  if (!passkeySupported()) {
    status.textContent = "Dieser Browser unterstützt Passkeys nicht. Bitte verwende aktuelles Safari, Chrome oder Edge.";
    return;
  }
  button.disabled = true;
  status.textContent = "Sicherer Passkey wird vorbereitet …";
  try {
    const challenge = await api.passkeyRegistrationOptions($("#passkeyDeviceName").value.trim());
    status.textContent = "Bitte bestätige Face ID, Touch ID oder deinen Gerätecode.";
    const response = await createPasskey(challenge.options);
    const result = await api.passkeyRegistrationVerify(challenge.flowId, response);
    currentAuthMethod = "passkey";
    systemHealth = { ...(systemHealth || {}), passkeyConfigured: true };
    status.textContent = `${result.device.name} wurde erfolgreich bestätigt.`;
    $("#passkeyDeviceName").value = "";
    await refreshDevices();
    renderSystemStatus();
  } catch (error) {
    status.textContent = error.message || "Der Passkey konnte nicht eingerichtet werden.";
  } finally {
    button.disabled = false;
  }
});

$("#refreshDevices").addEventListener("click", refreshDevices);
$("#deviceList").addEventListener("click", async event => {
  const button = event.target.closest("[data-revoke-device]");
  if (!button) return;
  const confirmed = await confirmAction("Zugriff wirklich entziehen?", "Der ausgewählte Passkey und alle zugehörigen Sitzungen werden serverseitig widerrufen. Auf diesem Zugang ist danach erneut eine sichere Bestätigung erforderlich.");
  if (!confirmed) return;
  try {
    const result = await api.revokeDevice(button.dataset.revokeDevice);
    if (result.current) return location.reload();
    await refreshDevices();
    toast("Der bestätigte Zugang wurde widerrufen.");
  } catch (error) {
    toast(error.message);
  }
});

function confirmAction(title, text) {
  const dialog = $("#confirmDialog");
  $("#confirmTitle").textContent = title;
  $("#confirmText").textContent = text;
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }));
}

$("#legacyBackup").addEventListener("click", () => {
  if (!legacyState) return;
  download(`rehakompass-v0.8.0-sicherung-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(legacyState.value, null, 2), "application/json");
  toast("Unveränderte Sicherung der alten lokalen Daten wurde erstellt.");
});

$("#legacyMigrate").addEventListener("click", async () => {
  if (!legacyState) return;
  if (!profileSeed) {
    toast("Die geschützte persönliche Grundkonfiguration fehlt auf dem Server. Die Alt-Daten bleiben unverändert; bitte zuerst PRIVATE_PROFILE_JSON einrichten.");
    return;
  }
  state = migrateLegacyState(legacyState.value, profileSeed);
  await persist({ immediateSync: true });
  localStorage.removeItem(legacyState.key);
  legacyState = null;
  $("#migrationCard").hidden = true;
  toast("Version 0.8.0 wurde in den verschlüsselten Datentresor übernommen. Das Aufnahmedatum bleibt bis zur erneuten Bestätigung vorläufig.");
});

$("#backupPlain").addEventListener("click", () => {
  download(`rehakompass-lesbare-sicherung-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), "application/json");
  toast("Lesbare Sicherung erstellt. Bitte geschützt aufbewahren.");
});

$("#backupEncrypted").addEventListener("click", async () => {
  const envelope = await encryptJson(vaultKey, state);
  download(`rehakompass-verschluesselt-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: "rehakompass-encrypted-v1", envelope }, null, 2), "application/json");
  toast("Verschlüsselte Sicherung erstellt.");
});

$("#restoreFile").addEventListener("change", async event => {
  try {
    const parsed = JSON.parse(await event.target.files[0].text());
    const restored = parsed.format === "rehakompass-encrypted-v1" ? await decryptJson(vaultKey, parsed.envelope) : parsed;
    state = normalizeState(restored, profileSeed);
    await persist({ immediateSync: true });
    toast("Sicherung wurde geprüft und wiederhergestellt.");
  } catch {
    toast("Die Sicherung ist ungültig, beschädigt oder wurde mit einem anderen Zugangscode verschlüsselt.");
  } finally {
    event.target.value = "";
  }
});

$("#deleteAll").addEventListener("click", async () => {
  const confirmed = await confirmAction("Alle persönlichen Daten löschen?", "Diese Aktion löscht synchronisierte Daten, Dokumente, Push-Anmeldungen und den lokalen Datentresor. Eine Wiederherstellung ist nur aus einer vorherigen Sicherung möglich.");
  if (!confirmed) return;
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager?.getSubscription();
      if (subscription) await subscription.unsubscribe();
    }
    await api.deleteAll();
    await localVault.clear();
    LEGACY_KEYS.forEach(key => localStorage.removeItem(key));
    await api.logout().catch(() => {});
    location.reload();
  } catch (error) {
    toast(`Löschung nicht vollständig abgeschlossen: ${error.message}`);
  }
});

async function secureLogout() {
  await synchronize().catch(() => {});
  await api.logout().catch(() => {});
  state = null;
  vaultKey = null;
  profileSeed = null;
  currentAuthMethod = "";
  location.reload();
}

$("#logout").addEventListener("click", secureLogout);
$("#logoutSettings").addEventListener("click", secureLogout);

$("#journalExport").addEventListener("click", () => {
  const lines = [
    "PERSÖNLICHE REHA-DOKUMENTATION",
    `Erstellt: ${displayDateTime(new Date().toISOString())}`,
    "",
    ...state.checkins.map(item => `CHECK-IN ${displayDateTime(item.createdAt)}\n${Object.entries(item.metrics || {}).map(([key, value]) => `${key}: ${value}/10`).join(" · ")}\n${item.note || ""}`),
    ...state.journal.map(item => `TAGEBUCH ${displayDateTime(item.createdAt || item.updatedAt)}\n${item.text}`),
    ...state.sessionNotes.map(item => `SITZUNG ${displayDateTime(item.createdAt)} · ${item.type}\nThemen: ${item.topics}\nErkenntnisse: ${item.insights}\nOffene Fragen: ${item.questions}\nNächste Schritte: ${item.steps}\nGefühle: ${item.feelings}\nNächster Termin: ${item.next}`),
    "",
    "Hinweis: Eigene Dokumentation, keine Diagnose oder medizinische Bewertung."
  ];
  download(`rehakompass-dokumentation-${new Date().toISOString().slice(0, 10)}.txt`, lines.join("\n\n"), "text/plain;charset=utf-8");
});

$("#simpleMode").addEventListener("change", event => {
  state.profile.preferences.simpleMode = event.target.checked;
  persist();
});
$("#simpleModeSettings").addEventListener("change", event => {
  state.profile.preferences.simpleMode = event.target.checked;
  persist();
});
$("#calendarDate").addEventListener("change", event => { selectedDate = event.target.value || selectedDate; renderCalendar(); });
$("#datePrevious").addEventListener("click", () => { selectedDate = addDateDays(selectedDate, calendarMode === "week" ? -7 : -1); renderCalendar(); });
$("#dateNext").addEventListener("click", () => { selectedDate = addDateDays(selectedDate, calendarMode === "week" ? 7 : 1); renderCalendar(); });
$("#eventOpen").addEventListener("click", () => openEventDialog());
$("#taskOpen").addEventListener("click", () => openTaskDialog());
$("#contactOpen").addEventListener("click", () => openContactDialog());
$("#exportIcs").addEventListener("click", exportCalendar);
$("#taskGroup").addEventListener("change", event => { activeTaskGroup = event.target.value; renderLists(); });
$("#taskFilter").addEventListener("change", renderLists);
$("#documentSearch").addEventListener("input", renderDocuments);
$("#quickOpen").addEventListener("click", () => $("#quickDialog").showModal());
$("#quickOpenMobile").addEventListener("click", () => $("#quickDialog").showModal());

$("#resetGroup").addEventListener("click", async () => {
  const confirmed = await confirmAction("Liste zurücksetzen?", `Der Erledigt- und Verschieben-Status der Grundpunkte in „${activeTaskGroup}“ wird zurückgesetzt. Eigene Punkte bleiben erhalten.`);
  if (!confirmed) return;
  for (const task of state.tasks.filter(item => item.group === activeTaskGroup && !["user", "legacy-custom", "legacy-manual"].includes(item.source))) {
    task.status = "open";
    task.skippedUntil = "";
    task.updatedAt = new Date().toISOString();
  }
  persist();
});

document.addEventListener("click", async event => {
  const target = event.target.closest("button,a,input");
  if (!target) return;
  if (target.matches("[data-close-dialog]")) target.closest("dialog")?.close();
  if (target.dataset.routeTarget) {
    location.hash = `#/${target.dataset.routeTarget}`;
    if (target.dataset.focus) setTimeout(() => $(`#${target.dataset.focus}`)?.focus(), 120);
  }
  if (target.dataset.quickRoute) {
    location.hash = `#/${target.dataset.quickRoute}`;
    $("#quickDialog").close();
    if (target.dataset.focus) setTimeout(() => $(`#${target.dataset.focus}`)?.focus(), 120);
  }
  if (target.dataset.openEvent !== undefined) setTimeout(() => openEventDialog(), 100);
  if (target.dataset.openTask !== undefined) setTimeout(() => openTaskDialog(), 100);
  if (target.dataset.sessionOpen !== undefined) setTimeout(openSessionDialog, 100);
  if (target.dataset.voiceOpen) openVoiceDialog(target.dataset.voiceOpen);
  if (target.dataset.coach) rotateCoach(target.dataset.coach, true);
  if (target.dataset.calendarMode) { calendarMode = target.dataset.calendarMode; renderCalendar(); }
  if (target.dataset.moreTab) showMoreTab(target.dataset.moreTab);
  if (target.dataset.toggleTask) {
    const task = state.tasks.find(item => item.id === target.dataset.toggleTask);
    if (task) { task.status = target.checked ? "done" : "open"; task.updatedAt = new Date().toISOString(); persist(); }
  }
  if (target.dataset.completeTask) {
    const task = state.tasks.find(item => item.id === target.dataset.completeTask);
    if (task) { task.status = "done"; task.updatedAt = new Date().toISOString(); persist(); }
  }
  if (target.dataset.editTask) openTaskDialog(state.tasks.find(item => item.id === target.dataset.editTask));
  if (target.dataset.deleteTask) {
    const confirmed = await confirmAction("Eigene Aufgabe löschen?", "Der Punkt wird aus der verschlüsselten Liste entfernt.");
    if (confirmed) { removeRecord(state, "tasks", target.dataset.deleteTask); persist(); }
  }
  if (target.dataset.editEvent) openEventDialog(state.events.find(item => item.id === target.dataset.editEvent));
  if (target.dataset.cancelEvent) {
    const item = state.events.find(entry => entry.id === target.dataset.cancelEvent);
    if (item) { item.status = "cancelled"; item.updatedAt = new Date().toISOString(); persist(); toast("Termin wurde als abgesagt markiert."); }
  }
  if (target.dataset.afterEvent) {
    const item = state.events.find(entry => entry.id === target.dataset.afterEvent);
    openSessionDialog();
    $("#sessionType").value = item?.kind === "therapy" ? "Gruppentherapie" : "Sonstiges Gespräch";
    $("#sessionTopics").value = item?.title || "";
  }
  if (target.dataset.removeScan !== undefined && scanResult) {
    scanResult.events.splice(Number(target.dataset.removeScan), 1);
    renderScanResult();
  }
  if (target.id === "discardScan") { scanResult = null; renderScanResult(); }
  if (target.id === "confirmScan" && scanResult) {
    const selected = [];
    $$("[data-scan-row]").forEach(row => {
      if (!$("[data-scan-include]", row).checked) return;
      const value = Object.fromEntries($$("[data-scan-field]", row).map(input => [input.dataset.scanField, input.value.trim()]));
      if (value.date && value.title) selected.push(makeRecord({ ...value, kind: "therapy", status: "confirmed", source: "therapy-plan-user-confirmed" }));
    });
    if (!selected.length) return toast("Mindestens ein kontrollierter Eintrag braucht Datum und Bezeichnung.");
    state.events.push(...selected);
    scanResult = null;
    await persist();
    location.hash = "#/kalender";
    toast(`${selected.length} kontrollierte Termine übernommen.`);
  }
  if (target.dataset.viewDocument) {
    const metadata = state.documents.find(item => item.id === target.dataset.viewDocument);
    if (!metadata) return;
    try { await previewEncryptedDocument(metadata); }
    catch (error) { toast(error.message); }
  }
  if (target.dataset.downloadDocument) {
    const metadata = state.documents.find(item => item.id === target.dataset.downloadDocument);
    if (!metadata) return;
    try {
      const plain = await loadEncryptedDocument(metadata);
      download(metadata.originalName || metadata.name, new Blob([plain], { type: metadata.mime }));
    } catch (error) { toast(error.message); }
  }
  if (target.dataset.deleteDocument) {
    const metadata = state.documents.find(item => item.id === target.dataset.deleteDocument);
    const confirmed = await confirmAction("Dokument endgültig löschen?", `„${metadata?.name || "Dokument"}“ wird aus Archiv und Datentresor entfernt.`);
    if (confirmed) {
      await api.deleteDocument(target.dataset.deleteDocument).catch(() => {});
      await localVault.deletePendingDocument(target.dataset.deleteDocument).catch(() => {});
      removeRecord(state, "documents", target.dataset.deleteDocument);
      await persist();
      toast("Dokument technisch gelöscht.");
    }
  }
  if (target.dataset.deleteEntry) {
    const [collection, id] = target.dataset.deleteEntry.split(":");
    const confirmed = await confirmAction("Eintrag löschen?", "Der Eintrag wird aus deinem Datentresor entfernt.");
    if (confirmed && state[collection]) { removeRecord(state, collection, id); persist(); }
  }
  if (target.dataset.deleteVoice) {
    const note = state.voiceNotes.find(item => item.id === target.dataset.voiceId);
    if (!note) return;
    if (target.dataset.deleteVoice === "audio" && note.audioDocumentId) {
      await api.deleteDocument(note.audioDocumentId).catch(() => {});
      await localVault.deletePendingDocument(note.audioDocumentId).catch(() => {});
      removeRecord(state, "documents", note.audioDocumentId);
      note.audioDocumentId = "";
    }
    if (target.dataset.deleteVoice === "transcript") note.transcript = "";
    if (target.dataset.deleteVoice === "summary") note.summary = "";
    note.updatedAt = new Date().toISOString();
    persist();
  }
  if (target.dataset.toggleGoal) {
    const goal = state.goals.find(item => item.id === target.dataset.toggleGoal);
    if (goal) { goal.status = target.checked ? "done" : "active"; goal.updatedAt = new Date().toISOString(); persist(); }
  }
  if (target.dataset.deleteGoal) {
    const confirmed = await confirmAction("Persönliches Ziel löschen?", "Das Ziel wird aus dem verschlüsselten Profil entfernt.");
    if (confirmed) { removeRecord(state, "goals", target.dataset.deleteGoal); persist(); }
  }
  if (target.dataset.deleteWeight) {
    const confirmed = await confirmAction("Gewichtseintrag löschen?", "Nur dieser einzelne Verlaufseintrag wird entfernt.");
    if (confirmed && state.profile.weight) {
      state.profile.weight.entries = (state.profile.weight.entries || []).filter(item => item.id !== target.dataset.deleteWeight);
      const latest = [...state.profile.weight.entries].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      if (latest) state.profile.weight.current = latest.value;
      persist();
    }
  }
  if (target.dataset.editContact) openContactDialog(state.contacts.find(item => item.id === target.dataset.editContact));
  if (target.dataset.deleteContact) {
    const confirmed = await confirmAction("Kontakt löschen?", "Der Kontakt und seine Fragen werden entfernt.");
    if (confirmed) { removeRecord(state, "contacts", target.dataset.deleteContact); persist(); }
  }
  if (target.dataset.toggleQuestion) {
    const question = state.clinicQuestions.find(item => item.id === target.dataset.toggleQuestion);
    if (question) { question.status = target.checked ? "done" : "open"; question.updatedAt = new Date().toISOString(); persist(); }
  }
  if (target.dataset.deleteQuestion) { removeRecord(state, "clinicQuestions", target.dataset.deleteQuestion); persist(); }
});

function renderAll() {
  if (!state) return;
  renderCockpit();
  renderCalendar();
  renderLists();
  renderJournal();
  renderDocuments();
  renderCoach();
  renderProfile();
  renderContacts();
  renderClinic();
  renderPushSettings();
  renderSystemStatus();
}

async function initializeShell() {
  $("#offlineBanner").hidden = navigator.onLine;
  localStorage.removeItem("rehakompass-temporary-auto-vault-key");
  renderMetricInputs();
  if ("serviceWorker" in navigator) {
    const registerServiceWorker = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") registerServiceWorker();
    else addEventListener("load", registerServiceWorker, { once: true });
  }
  try {
    systemHealth = await api.health();
    $("#passkeyLogin").hidden = !systemHealth.passkeyConfigured;
    $("#codeFallback").hidden = !systemHealth.accessCodeLoginAllowed;
    $("#codeFallback").open = !systemHealth.passkeyConfigured && systemHealth.accessCodeLoginAllowed;
    if (!passkeySupported()) {
      $("#passkeyLogin").disabled = true;
      $("#passkeyStatus").textContent = "Dieser Browser unterstützt den sicheren Passkey-Zugang nicht.";
    } else if (!systemHealth.passkeyConfigured) {
      $("#passkeyStatus").textContent = "Noch kein Passkey eingerichtet. Öffne den Kompass einmalig mit deinem Zugangscode und richte ihn anschließend unter Mehr → Zugang ein.";
    }
    try {
      const current = await api.session();
      if (current.authMethod === "passkey" && current.vaultKey) {
        $("#passkeyStatus").textContent = "Bestätigte Sitzung erkannt. Der Kompass wird geöffnet …";
        await initializePasskeyVault(current);
        currentAuthMethod = "passkey";
        unlockApp();
      }
    } catch (error) {
      if (!["SESSION_REQUIRED", "OFFLINE"].includes(error.code)) $("#loginError").textContent = error.message;
    }
  } catch {
    systemHealth = { aiConfigured: false, pushConfigured: false, passkeyConfigured: false, accessCodeLoginAllowed: true };
    $("#passkeyLogin").disabled = true;
    $("#passkeyStatus").textContent = "Für die Passkey-Bestätigung wird kurz eine Verbindung zum geschützten Server benötigt. Der lokale Tresor kann weiterhin mit dem Zugangscode geöffnet werden.";
    $("#codeFallback").open = true;
  }
}

initializeShell().catch(() => {});

$("#documentPreviewDialog").addEventListener("close", () => {
  if (documentPreviewUrl) URL.revokeObjectURL(documentPreviewUrl);
  documentPreviewUrl = "";
  $("#documentPreviewTitle").textContent = "Dokument";
  $("#documentPreviewContent").replaceChildren();
});
