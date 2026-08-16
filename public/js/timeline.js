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

export function daysBetween(left, right) {
  const leftMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(left || ""));
  const rightMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(right || ""));
  if (!leftMatch || !rightMatch) return null;
  const leftTime = Date.UTC(Number(leftMatch[1]), Number(leftMatch[2]) - 1, Number(leftMatch[3]));
  const rightTime = Date.UTC(Number(rightMatch[1]), Number(rightMatch[2]) - 1, Number(rightMatch[3]));
  return Math.round((rightTime - leftTime) / DAY_MS);
}

export function buildCareJourney(journey = {}) {
  const withdrawal = journey.withdrawalAdmission || {};
  const rehab = journey.rehabAdmission || {};
  const milestones = [];
  if (withdrawal.date && ["expected", "confirmed"].includes(withdrawal.status)) {
    const status = withdrawal.status;
    milestones.push(
      { id: "withdrawal-admission", date: withdrawal.date, title: "Aufnahme zum qualifizierten Entzug", phase: "Entzug", status },
      { id: "withdrawal-week-2", date: addDateDays(withdrawal.date, 7), title: "Woche 2 · stabilisieren und beobachten", phase: "Entzug", status },
      { id: "withdrawal-week-3", date: addDateDays(withdrawal.date, 14), title: "Woche 3 · Alltag und Rückfallschutz erproben", phase: "Entzug", status },
      { id: "withdrawal-week-4", date: addDateDays(withdrawal.date, 21), title: "Woche 4 · Übergang verbindlich vorbereiten", phase: "Entzug", status },
      { id: "withdrawal-minimum", date: addDateDays(withdrawal.date, Math.max(1, Number(journey.minimumWithdrawalDays || 28))), title: `Mindestens ${Math.max(1, Number(journey.minimumWithdrawalDays || 28))} volle Tage erreicht`, phase: "Übergang", status }
    );
  }
  if (journey.birthday) milestones.push({ id: "birthday", date: journey.birthday, title: "Geburtstag · ruhig und geschützt planen", phase: "Persönlich", status: "confirmed" });
  if (rehab.date && ["expected", "confirmed"].includes(rehab.status)) milestones.push({ id: "rehab-admission", date: rehab.date, title: journey.directTransfer ? "Direkter Übergang in die Reha" : "Aufnahme in die Reha", phase: "Reha", status: rehab.status });
  return milestones.sort((a, b) => compareDate(a.date, b.date) || a.id.localeCompare(b.id));
}

export const TIMELINE_RULES = Object.freeze([
  { id: "prepare-28", offset: -28, phase: "Vorbereitung", title: "Persönliche Organisation, Unterlagen und Versorgung prüfen", why: "Damit offene organisatorische Punkte rechtzeitig sichtbar werden.", priority: 2, url: "#/entzug", linkLabel: "Gesamten Weg öffnen" },
  { id: "travel-21", offset: -21, phase: "Vorbereitung", title: "Anreise und gewünschte Ankunftszeit verbindlich klären", why: "Die Anreise hängt von der bestätigten Klinikinformation ab.", priority: 3, url: "#/kalender", linkLabel: "Anreise eintragen" },
  { id: "stability-14", offset: -14, phase: "Stabilisierung", title: "Die letzten 14 Tage bewusst ruhig und verlässlich planen", why: "Ein überschaubarer Alltag reduziert unnötigen Organisationsdruck.", priority: 3, url: "#/kalender", linkLabel: "Tagesstruktur öffnen" },
  { id: "packing-7", offset: -7, phase: "Vorbereitung", title: "Pack- und Einkaufsliste abschließen", why: "Fehlendes kann noch ohne Zeitdruck ergänzt werden.", priority: 3, url: "#/listen", linkLabel: "Packlisten öffnen" },
  { id: "documents-2", offset: -2, phase: "Vorbereitung", title: "Dokumentenmappe und Technik final kontrollieren", why: "Nur bestätigte Unterlagen und freigegebene Technik sollen mit.", priority: 4, url: "#/dokumente", linkLabel: "Dokumente öffnen" },
  { id: "admission", offset: 0, phase: "Aufnahme", title: "Aufnahme und Anreise", why: "Zeit und Ort werden ausschließlich aus der bestätigten Einladung übernommen.", priority: 5, url: "#/kalender", linkLabel: "Aufnahmetag öffnen" },
  { id: "orientation-1", offset: 1, phase: "Aufnahme", title: "Ansprechpartner, Regeln und erste offene Fragen notieren", why: "Die ersten Tage dienen Orientierung und individueller Planung.", priority: 2, url: "#/mehr", linkLabel: "Kontakte und Fragen öffnen" },
  { id: "first-phase-14", offset: 14, phase: "Aufenthalt", title: "Die ersten 14 Tage ruhig auswerten", why: "Kontakt, Tagesstruktur und offene Fragen können jetzt gemeinsam überprüft werden.", priority: 2, url: "#/tagebuch", linkLabel: "Rückblick festhalten" },
  { id: "discharge-prepare", offset: 140, phase: "Entlassung", title: "Entlassung und Nachsorge gemeinsam vorbereiten", why: "Folgetermine, Unterstützung und Unterlagen brauchen Vorlauf.", priority: 3, url: "#/entzug", linkLabel: "Übergang öffnen" },
  { id: "transition", offset: 154, phase: "Entlassung", title: "Voraussichtlicher Übergang nach 22 Wochen", why: "Dieser rechnerische Termin bleibt vorläufig, bis die Klinik ihn bestätigt.", priority: 3, alwaysProvisional: true, url: "#/kalender", linkLabel: "Kalender öffnen" },
  { id: "home-week", offset: 161, phase: "Nachsorge", title: "Erste Woche zuhause auswerten", why: "Kontakte, Schutzplan und Folgetermine werden bewusst überprüft.", priority: 3, url: "#/tagebuch", linkLabel: "Rückblick öffnen" },
  { id: "follow-up", offset: 184, phase: "Nachsorge", title: "Nachsorgeplan und nächste Schritte prüfen", why: "Unterstützung soll nach der Entlassung verbindlich weiterlaufen.", priority: 2, url: "#/listen", linkLabel: "Nächste Schritte öffnen" }
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
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const withoutGenerated = tasks.filter(task => !["timeline", "journey"].includes(task.source));
  const admission = state.profile?.admission;
  const previous = new Map(tasks.filter(task => task.source === "timeline").map(task => [task.sourceId, task]));
  const generated = admission?.status === "confirmed" && admission.date ? buildTimeline(admission).filter(item => !item.alwaysProvisional).map(item => ({
    id: previous.get(item.id)?.id || `timeline-${item.id}`,
    sourceId: item.id,
    source: "timeline",
    group: item.phase,
    title: item.title,
    why: item.why,
    details: previous.get(item.id)?.details || "",
    url: item.url || "#/listen",
    linkLabel: item.linkLabel || "Passenden Bereich öffnen",
    dueDate: item.date,
    priority: item.priority,
    status: previous.get(item.id)?.status || "open",
    skippedUntil: previous.get(item.id)?.skippedUntil || "",
    note: previous.get(item.id)?.note || "",
    updatedAt: previous.get(item.id)?.updatedAt || new Date().toISOString()
  })) : [];

  const journey = state.profile?.journey || {};
  const priorJourney = new Map(tasks.filter(task => task.source === "journey").map(task => [task.sourceId, task]));
  const withdrawal = journey.withdrawalAdmission || {};
  const rehab = journey.rehabAdmission || {};
  const hasCuratedJourneyTasks = withoutGenerated.some(task => /Entzug|Übergang/i.test(task.group || ""));
  const journeyRules = hasCuratedJourneyTasks ? [] : [
    withdrawal.date && ["expected", "confirmed"].includes(withdrawal.status) ? {
      id: "withdrawal-rules",
      group: "Entzug · vor der Aufnahme",
      title: "Aktuelle Regeln und Aufnahmeablauf der Entzugsklinik lesen",
      why: "Öffentliche Hinweise können sich ändern; die zuständige Station bestätigt die verbindlichen Regeln.",
      details: "Fragen zu eigener Decke oder eigenem Kissen, Wärmegeräten, Sporthilfen, Wertsachen und möglichen Ausgängen direkt mit der zuständigen Station abgleichen.",
      dueDate: addDateDays(withdrawal.date, -14),
      priority: 4,
      url: "https://www.bundesgesundheitsministerium.de/themen/praevention/patientenrechte/patientenrechte",
      linkLabel: "Patientenrechte als Hintergrund öffnen"
    } : null,
    withdrawal.date && ["expected", "confirmed"].includes(withdrawal.status) ? {
      id: "withdrawal-packing",
      group: "Entzug · vor der Aufnahme",
      title: "Packliste mit der offiziellen Klinikliste abgleichen",
      why: "Damit nur sinnvolle und auf der zuständigen Station erlaubte Dinge eingepackt werden.",
      details: "Medikamentenliste, vorhandene Befunde, bequeme Kleidung, feste Schuhe, Sportkleidung und persönliche Hilfsmittel kontrollieren.",
      dueDate: addDateDays(withdrawal.date, -7),
      priority: 3,
      url: "https://www.dhs.de/suchthilfe/akutbehandlung",
      linkLabel: "DHS zur Akutbehandlung öffnen"
    } : null,
    rehab.date && ["expected", "confirmed"].includes(rehab.status) ? {
      id: "direct-transfer",
      group: "Übergang Entzug → Reha",
      title: "Direkten Übergang und vollständige Unterlagen gemeinsam bestätigen",
      why: "Zwischen Entzug und Reha soll keine Versorgungslücke entstehen.",
      details: "Aufnahmefähigkeit, Kostenübernahme, Entlassungsbericht, Medikamentenplan, Transport, Gepäck und die genaue Übergabe mit beiden Kliniken klären.",
      dueDate: addDateDays(rehab.date, -7),
      priority: 5,
      url: "https://www.dhs.de/suchthilfe/versorgungssystem/",
      linkLabel: "DHS-Versorgungssystem öffnen"
    } : null
  ].filter(Boolean);
  const journeyGenerated = journeyRules.map(item => ({
    ...item,
    id: priorJourney.get(item.id)?.id || `journey-${item.id}`,
    sourceId: item.id,
    source: "journey",
    status: priorJourney.get(item.id)?.status || "open",
    skippedUntil: priorJourney.get(item.id)?.skippedUntil || "",
    note: priorJourney.get(item.id)?.note || "",
    updatedAt: priorJourney.get(item.id)?.updatedAt || new Date().toISOString()
  }));
  return { ...state, tasks: [...withoutGenerated, ...generated, ...journeyGenerated] };
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
