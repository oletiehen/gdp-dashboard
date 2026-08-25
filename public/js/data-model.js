import { materializeTimelineTasks } from "./timeline.js?v=20260825-rc1";

export const SCHEMA_VERSION = 2;

export const PRIORITY_LABELS = Object.freeze({
  5: "Sofort klären",
  4: "Als Nächstes",
  3: "Diese Woche",
  2: "Wenn möglich",
  1: "Kann warten"
});

export function priorityLabel(value) {
  return PRIORITY_LABELS[Number(value)] || PRIORITY_LABELS[1];
}

const now = () => new Date().toISOString();
const record = value => ({ ...value, id: value.id || crypto.randomUUID(), updatedAt: value.updatedAt || now() });

const GENERIC_TASKS = [
  { id: "starter-admission", group: "Vorbereitung", title: "Aufnahmetermin erhalten und Status eintragen", why: "Erst ein bestätigtes Datum aktiviert verbindliche Fristen.", priority: 5, status: "open", source: "starter", url: "#/entzug", linkLabel: "Termine bearbeiten" },
  { id: "starter-invitation", group: "Vorbereitung", title: "Einladung und aktuelle Klinikregeln in Ruhe lesen", why: "Aktuelle Unterlagen haben Vorrang vor älteren Informationen.", priority: 4, status: "open", source: "starter", url: "https://www.bundesgesundheitsministerium.de/themen/praevention/patientenrechte/patientenrechte", linkLabel: "Patientenrechte als Hintergrund öffnen" },
  { id: "starter-travel", group: "Vorbereitung", title: "Anreise und gewünschte Ankunftszeit klären", why: "Damit der Aufnahmetag überschaubar bleibt.", priority: 3, status: "open", source: "starter", url: "#/kalender", linkLabel: "Anreise im Kalender planen" },
  { id: "starter-documents", group: "Dokumente", title: "Unterlagen für die Aufnahme zusammenstellen", why: "Fehlende Unterlagen können früh erkannt werden.", priority: 3, status: "open", source: "starter", url: "https://www.dhs.de/suchthilfe/akutbehandlung", linkLabel: "DHS zur Akutbehandlung öffnen" },
  { id: "starter-questions", group: "Gesprächsvorbereitung", title: "Fragen für das Aufnahmegespräch notieren", why: "Wichtige Punkte gehen im Gespräch nicht verloren.", priority: 2, status: "open", source: "starter", url: "#/mehr", linkLabel: "Gesprächsfragen öffnen" }
];

const EMPTY_CARE_GUIDE = Object.freeze({
  summary: "",
  clinicFacts: [],
  phases: [],
  packing: [],
  homeLeave: [],
  bodySupport: [],
  rights: [],
  sources: [],
  crisis: null
});

function admissionValue(value = {}) {
  return {
    date: String(value.date || "").slice(0, 10),
    status: ["open", "expected", "confirmed"].includes(value.status) ? value.status : "open",
    source: String(value.source || ""),
    updatedAt: value.updatedAt || now()
  };
}

function journeyValue(value = {}, fallbackAdmission = null) {
  const rehabAdmission = admissionValue(value.rehabAdmission || fallbackAdmission || {});
  return {
    withdrawalAdmission: admissionValue(value.withdrawalAdmission || {}),
    rehabAdmission,
    activePhase: value.activePhase === "rehab" ? "rehab" : "withdrawal",
    minimumWithdrawalDays: Math.max(1, Number(value.minimumWithdrawalDays || 28)),
    directTransfer: value.directTransfer !== false,
    birthday: String(value.birthday || "").slice(0, 10),
    ward: String(value.ward || ""),
    wardBasis: String(value.wardBasis || ""),
    treatmentFocus: Array.isArray(value.treatmentFocus) ? value.treatmentFocus.map(String) : []
  };
}

function careGuideValue(value = {}) {
  return {
    ...EMPTY_CARE_GUIDE,
    ...value,
    clinicFacts: Array.isArray(value.clinicFacts) ? value.clinicFacts : [],
    phases: Array.isArray(value.phases) ? value.phases : [],
    packing: Array.isArray(value.packing) ? value.packing : [],
    homeLeave: Array.isArray(value.homeLeave) ? value.homeLeave : [],
    bodySupport: Array.isArray(value.bodySupport) ? value.bodySupport : [],
    rights: Array.isArray(value.rights) ? value.rights : [],
    sources: Array.isArray(value.sources) ? value.sources : [],
    crisis: value.crisis && typeof value.crisis === "object" ? value.crisis : null
  };
}

export function createBaseState(seed = null) {
  const profile = seed?.profile || {};
  const seededJourney = journeyValue(seed?.journey || profile.journey || {}, profile.admission);
  const seededTasks = Array.isArray(seed?.tasks) && seed.tasks.length ? seed.tasks : GENERIC_TASKS;
  const state = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now(),
    profile: {
      displayName: String(profile.displayName || "Olaf"),
      admission: { ...seededJourney.rehabAdmission },
      journey: seededJourney,
      preferences: { simpleMode: false, quietStart: "21:30", quietEnd: "07:00", reminderMinutes: 15 },
      weight: profile.weight ? { ...profile.weight, entries: Array.isArray(profile.weight.entries) ? profile.weight.entries : [] } : null,
      privateSeedConfigured: Boolean(seed)
    },
    tasks: seededTasks.filter(task => !/arbeitgeber/i.test(task.title || "")).map(task => record({ priority: 1, status: "open", details: "", note: "", url: "", linkLabel: "Quelle öffnen", skippedUntil: "", ...task }, "task")),
    taskBaselines: seededTasks.filter(task => !/arbeitgeber/i.test(task.title || "")).map(task => ({ id: task.id, group: task.group, title: task.title, why: task.why || "", details: task.details || "", url: task.url || "", linkLabel: task.linkLabel || "Quelle öffnen", priority: task.priority || 1, source: task.source || "private-seed" })),
    events: Array.isArray(seed?.events) ? seed.events.map(item => record({ kind: "appointment", status: "confirmed", ...item }, "event")) : [],
    routines: Array.isArray(seed?.routines) && seed.routines.length ? seed.routines.map(item => record({ repeat: "daily", kind: "routine", status: "active", ...item }, "routine")) : [
      record({ id: "routine-wake", title: "Aufstehen und ruhig ankommen", start: "07:00", end: "", repeat: "daily", kind: "routine", status: "active" }, "routine"),
      record({ id: "routine-breakfast", title: "Frühstück", start: "08:00", end: "", repeat: "daily", kind: "routine", status: "active" }, "routine")
    ],
    checkins: [],
    journal: [],
    sessionNotes: [],
    voiceNotes: [],
    contacts: Array.isArray(seed?.contacts) ? seed.contacts.map(item => record(item, "contact")) : [],
    goals: Array.isArray(seed?.goals) ? seed.goals.map(item => record(item, "goal")) : [],
    documents: [],
    clinicQuestions: Array.isArray(seed?.clinicQuestions) ? seed.clinicQuestions.map(item => record(item, "question")) : [],
    careGuide: careGuideValue(seed?.careGuide || {}),
    packingChecks: {},
    coaching: { counters: {}, hidden: [], feedback: [] },
    tombstones: [],
    migration: { from: null, completedAt: null, backupOffered: false },
    reset: { lastAt: null, backupCreatedAt: null },
    sync: { revision: 0, pending: false, lastSuccessAt: null }
  };
  return materializeTimelineTasks(state);
}

function legacyTaskLookup(tasks) {
  const groups = new Map();
  for (const task of tasks.filter(item => item.source !== "timeline")) {
    if (!groups.has(task.group)) groups.set(task.group, []);
    groups.get(task.group).push(task);
  }
  return groups;
}

export function migrateLegacyState(legacy, seed = null) {
  const state = createBaseState(seed);
  const groups = legacyTaskLookup(state.tasks);
  for (const [key, done] of Object.entries(legacy?.checked || {})) {
    if (!done || key.startsWith("manual:")) continue;
    const separator = key.lastIndexOf(":");
    const group = key.slice(0, separator);
    const index = Number(key.slice(separator + 1));
    const task = groups.get(group)?.[index];
    if (task) task.status = "done";
  }
  for (const [group, titles] of Object.entries(legacy?.custom || {})) {
    for (const title of Array.isArray(titles) ? titles : []) {
      state.tasks.push(record({ group, title: String(title), why: "Eigener Punkt aus Version 0.8.0", priority: 1, status: "open", source: "legacy-custom" }, "task"));
    }
  }
  for (const item of Array.isArray(legacy?.manualTasks) ? legacy.manualTasks : []) {
    state.tasks.push(record({ id: item.id, group: "Eigene Aufgaben", title: String(item.title || "Eigene Aufgabe"), dueDate: String(item.due || "").slice(0, 10), dueTime: String(item.due || "").slice(11, 16), why: "Eigene Aufgabe aus Version 0.8.0", priority: 2, status: legacy?.checked?.[`manual:${item.id}`] ? "done" : "open", source: "legacy-manual" }, "task"));
  }
  state.events = (Array.isArray(legacy?.events) ? legacy.events : []).map(item => record({
    title: String(item.title || "Termin"),
    date: String(item.date || "").slice(0, 10),
    start: String(item.start || "").slice(0, 5),
    end: String(item.end || "").slice(0, 5),
    location: String(item.location || ""),
    kind: "appointment",
    status: "confirmed",
    source: "legacy"
  }, "event"));
  state.routines = (Array.isArray(legacy?.dailySchedule) ? legacy.dailySchedule : state.routines).map(item => record({
    id: item.id,
    title: String(item.title || "Routine"),
    start: String(item.time || item.start || "").slice(0, 5),
    end: String(item.end || "").slice(0, 5),
    repeat: item.repeat || "daily",
    weekday: item.weekday,
    kind: "routine",
    status: "active"
  }, "routine"));
  state.journal = (Array.isArray(legacy?.journal) ? legacy.journal : []).map(item => record({
    type: String(item.type || "Tagesbericht"),
    createdAt: item.date || now(),
    text: String(item.text || ""),
    metrics: { mood: item.mood ?? null, sleep: item.sleep ?? null, craving: item.craving ?? null },
    source: "legacy"
  }, "journal"));
  const careTeam = legacy?.profile?.careTeam || {};
  for (const [role, name] of Object.entries({ Arzt: careTeam.doctor, Bezugstherapie: careTeam.therapist, Station: careTeam.ward })) {
    if (name) state.contacts.push(record({ role, name: String(name), source: "user", phone: "", email: "", availability: "", notes: "", questions: [] }, "contact"));
  }
  if (legacy?.admissionDate) {
    state.profile.admission = { date: String(legacy.admissionDate).slice(0, 10), status: "expected", source: "Aus Version 0.8.0 übernommen – bitte erneut bestätigen", updatedAt: now() };
    state.profile.journey.rehabAdmission = { ...state.profile.admission };
  }
  if (state.profile.weight && legacy?.profile?.currentWeight) {
    state.profile.weight.current = Number(legacy.profile.currentWeight);
    state.profile.weight.entries = Array.isArray(legacy.profile.weightEntries) ? legacy.profile.weightEntries : [];
  }
  state.migration = { from: "0.8.0", completedAt: now(), backupOffered: true };
  state.updatedAt = now();
  return materializeTimelineTasks(state);
}

function normalizeCurrentState(value, seed = null) {
  const base = createBaseState(seed);
  const valueProfile = value.profile || {};
  const journey = journeyValue(valueProfile.journey || {}, valueProfile.admission || base.profile.admission);
  const admission = admissionValue(journey.rehabAdmission || valueProfile.admission || base.profile.admission);
  journey.rehabAdmission = { ...admission };
  return materializeTimelineTasks({
    ...base,
    ...value,
    schemaVersion: SCHEMA_VERSION,
    profile: { ...base.profile, ...valueProfile, admission, journey, preferences: { ...base.profile.preferences, ...(valueProfile.preferences || {}) }, privateSeedConfigured: Boolean(seed) || Boolean(valueProfile.privateSeedConfigured) },
    tasks: Array.isArray(value.tasks) ? value.tasks.filter(task => !/arbeitgeber/i.test(task.title || "")).map(task => ({ details: "", note: "", url: "", linkLabel: "Quelle öffnen", skippedUntil: "", ...task })) : base.tasks,
    events: Array.isArray(value.events) ? value.events : [],
    routines: Array.isArray(value.routines) ? value.routines : base.routines,
    checkins: Array.isArray(value.checkins) ? value.checkins : [],
    journal: Array.isArray(value.journal) ? value.journal : [],
    sessionNotes: Array.isArray(value.sessionNotes) ? value.sessionNotes : [],
    voiceNotes: Array.isArray(value.voiceNotes) ? value.voiceNotes : [],
    contacts: Array.isArray(value.contacts) ? value.contacts : [],
    goals: Array.isArray(value.goals) ? value.goals : [],
    documents: Array.isArray(value.documents) ? value.documents : [],
    clinicQuestions: Array.isArray(value.clinicQuestions) ? value.clinicQuestions : [],
    careGuide: careGuideValue(value.careGuide || seed?.careGuide || {}),
    packingChecks: value.packingChecks && typeof value.packingChecks === "object" ? value.packingChecks : {},
    tombstones: Array.isArray(value.tombstones) ? value.tombstones : [],
    reset: { ...base.reset, ...(value.reset || {}) }
  });
}

export function migrateV1State(value, seed = null) {
  const seedJourney = seed?.journey || seed?.profile?.journey || {};
  const existingAdmission = value.profile?.admission;
  const rehabAdmission = existingAdmission?.date ? existingAdmission : seedJourney.rehabAdmission;
  const migrated = {
    ...value,
    schemaVersion: SCHEMA_VERSION,
    profile: {
      ...(value.profile || {}),
      journey: journeyValue({ ...seedJourney, ...(value.profile?.journey || {}), rehabAdmission }, rehabAdmission)
    },
    careGuide: value.careGuide || seed?.careGuide || {},
    migration: { ...(value.migration || {}), from: "1", completedAt: now(), backupOffered: false }
  };
  return normalizeCurrentState(migrated, seed);
}

export function normalizeState(value, seed = null) {
  if (!value || typeof value !== "object") return createBaseState(seed);
  if (Number(value.schemaVersion) === 1) return migrateV1State(value, seed);
  if (Number(value.schemaVersion) !== SCHEMA_VERSION) return migrateLegacyState(value, seed);
  return normalizeCurrentState(value, seed);
}

function mergeRecords(local = [], remote = []) {
  const result = new Map();
  for (const item of [...remote, ...local]) {
    const current = result.get(item.id);
    if (!current || String(item.updatedAt || "") >= String(current.updatedAt || "")) result.set(item.id, item);
  }
  return [...result.values()];
}

export function mergeStates(local, remote) {
  const localNewer = String(local.updatedAt || "") >= String(remote.updatedAt || "");
  const merged = { ...(localNewer ? remote : local), ...(localNewer ? local : remote) };
  for (const key of ["tasks", "events", "routines", "checkins", "journal", "sessionNotes", "voiceNotes", "contacts", "goals", "documents", "clinicQuestions", "tombstones"]) merged[key] = mergeRecords(local[key], remote[key]);
  const tombstones = new Set(merged.tombstones.map(item => `${item.collection}:${item.id}`));
  for (const key of ["tasks", "events", "routines", "checkins", "journal", "sessionNotes", "voiceNotes", "contacts", "goals", "documents", "clinicQuestions"]) merged[key] = merged[key].filter(item => !tombstones.has(`${key}:${item.id}`));
  merged.updatedAt = now();
  merged.sync = { ...(local.sync || {}), ...(remote.sync || {}), pending: true };
  return materializeTimelineTasks(merged);
}

export function touchState(state) {
  state.updatedAt = now();
  state.sync = { ...(state.sync || {}), pending: true };
  return state;
}

export function removeRecord(state, collection, id) {
  state[collection] = state[collection].filter(item => item.id !== id);
  state.tombstones.push({ id, collection, updatedAt: now() });
  return touchState(state);
}

const RESET_COLLECTIONS = Object.freeze(["tasks", "events", "routines", "checkins", "journal", "sessionNotes", "voiceNotes", "contacts", "goals", "clinicQuestions"]);

export function resetPlanningState(current, seed = null) {
  const fresh = createBaseState(seed);
  fresh.profile.preferences = { ...fresh.profile.preferences, ...(current.profile?.preferences || {}) };
  fresh.profile.weight = current.profile?.weight || fresh.profile.weight;
  fresh.documents = Array.isArray(current.documents) ? current.documents : [];
  const tombstones = new Map((Array.isArray(current.tombstones) ? current.tombstones : []).map(item => [`${item.collection}:${item.id}`, item]));
  for (const collection of RESET_COLLECTIONS) {
    const retainedIds = new Set((fresh[collection] || []).map(item => item.id));
    for (const item of Array.isArray(current[collection]) ? current[collection] : []) {
      if (!item?.id || retainedIds.has(item.id)) continue;
      const marker = { id: item.id, collection, updatedAt: now() };
      tombstones.set(`${collection}:${item.id}`, marker);
    }
  }
  fresh.tombstones = [...tombstones.values()];
  fresh.reset = { lastAt: now(), backupCreatedAt: now() };
  fresh.sync = { revision: Number(current.sync?.revision || 0), pending: true, lastSuccessAt: current.sync?.lastSuccessAt || null };
  return touchState(fresh);
}

export function makeRecord(value) {
  return record(value, "record");
}
