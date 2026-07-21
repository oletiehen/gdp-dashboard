const DAY_MS = 86_400_000;

export function addDateDays(isoDate, offset) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + Number(offset) * DAY_MS);
  return date.toISOString().slice(0, 10);
}

export function compareDate(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

export const TIMELINE_RULES = Object.freeze([
  { id: "prepare-28", offset: -28, phase: "Vorbereitung", title: "Persönliche Organisation, Unterlagen und Versorgung prüfen", why: "Damit offene organisatorische Punkte rechtzeitig sichtbar werden.", priority: 2 },
  { id: "travel-21", offset: -21, phase: "Vorbereitung", title: "Anreise und gewünschte Ankunftszeit verbindlich klären", why: "Die Anreise hängt von der bestätigten Klinikinformation ab.", priority: 3 },
  { id: "stability-14", offset: -14, phase: "Stabilisierung", title: "Die letzten 14 Tage bewusst ruhig und verlässlich planen", why: "Ein überschaubarer Alltag reduziert unnötigen Organisationsdruck.", priority: 3 },
  { id: "packing-7", offset: -7, phase: "Vorbereitung", title: "Pack- und Einkaufsliste abschließen", why: "Fehlendes kann noch ohne Zeitdruck ergänzt werden.", priority: 3 },
  { id: "documents-2", offset: -2, phase: "Vorbereitung", title: "Dokumentenmappe und Technik final kontrollieren", why: "Nur bestätigte Unterlagen und freigegebene Technik sollen mit.", priority: 4 },
  { id: "admission", offset: 0, phase: "Aufnahme", title: "Aufnahme und Anreise", why: "Zeit und Ort werden ausschließlich aus der bestätigten Einladung übernommen.", priority: 5 },
  { id: "orientation-1", offset: 1, phase: "Aufnahme", title: "Ansprechpartner, Regeln und erste offene Fragen notieren", why: "Die ersten Tage dienen Orientierung und individueller Planung.", priority: 2 },
  { id: "first-phase-14", offset: 14, phase: "Aufenthalt", title: "Die ersten 14 Tage ruhig auswerten", why: "Kontakt, Tagesstruktur und offene Fragen können jetzt gemeinsam überprüft werden.", priority: 2 },
  { id: "discharge-prepare", offset: 140, phase: "Entlassung", title: "Entlassung und Nachsorge gemeinsam vorbereiten", why: "Folgetermine, Unterstützung und Unterlagen brauchen Vorlauf.", priority: 3 },
  { id: "transition", offset: 154, phase: "Entlassung", title: "Voraussichtlicher Übergang nach 22 Wochen", why: "Dieser rechnerische Termin bleibt vorläufig, bis die Klinik ihn bestätigt.", priority: 3, alwaysProvisional: true },
  { id: "home-week", offset: 161, phase: "Nachsorge", title: "Erste Woche zuhause auswerten", why: "Kontakte, Schutzplan und Folgetermine werden bewusst überprüft.", priority: 3 },
  { id: "follow-up", offset: 184, phase: "Nachsorge", title: "Nachsorgeplan und nächste Schritte prüfen", why: "Unterstützung soll nach der Entlassung verbindlich weiterlaufen.", priority: 2 }
]);

export function buildTimeline(admission) {
  if (!admission?.date || !["expected", "confirmed"].includes(admission.status)) return [];
  return TIMELINE_RULES.map(rule => ({
    ...rule,
    date: addDateDays(admission.date, rule.offset),
    status: rule.alwaysProvisional || admission.status === "expected" ? "expected" : "confirmed"
  }));
}

export function materializeTimelineTasks(state) {
  const withoutGenerated = state.tasks.filter(task => task.source !== "timeline");
  const admission = state.profile?.admission;
  if (admission?.status !== "confirmed" || !admission.date) return { ...state, tasks: withoutGenerated };
  const previous = new Map(state.tasks.filter(task => task.source === "timeline").map(task => [task.sourceId, task]));
  const generated = buildTimeline(admission).filter(item => !item.alwaysProvisional).map(item => ({
    id: previous.get(item.id)?.id || `timeline-${item.id}`,
    sourceId: item.id,
    source: "timeline",
    group: item.phase,
    title: item.title,
    why: item.why,
    dueDate: item.date,
    priority: item.priority,
    status: previous.get(item.id)?.status || "open",
    skippedUntil: previous.get(item.id)?.skippedUntil || "",
    note: previous.get(item.id)?.note || "",
    updatedAt: previous.get(item.id)?.updatedAt || new Date().toISOString()
  }));
  return { ...state, tasks: [...withoutGenerated, ...generated] };
}

export function nextSuggestedTask(tasks, nowDate = new Date().toISOString().slice(0, 10)) {
  const open = tasks.filter(task => task.status === "open" && (!task.skippedUntil || task.skippedUntil <= nowDate));
  return [...open].sort((a, b) => {
    const aOverdue = a.dueDate && a.dueDate < nowDate ? 1 : 0;
    const bOverdue = b.dueDate && b.dueDate < nowDate ? 1 : 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return compareDate(a.dueDate, b.dueDate);
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return Number(b.priority || 0) - Number(a.priority || 0);
  })[0] || null;
}

export function isRoutineOnDate(routine, isoDate) {
  const weekday = new Date(`${isoDate}T12:00:00`).getDay();
  if (routine.status === "cancelled") return false;
  if (routine.repeat === "daily") return true;
  if (routine.repeat === "weekdays") return weekday >= 1 && weekday <= 5;
  if (routine.repeat === "weekly") return weekday === Number(routine.weekday);
  return routine.date === isoDate;
}
