import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createBaseState, mergeStates, migrateLegacyState, normalizeState, priorityLabel, resetPlanningState, SCHEMA_VERSION } from "../../public/js/data-model.js";

const syntheticSeed = {
  profile: { displayName: "Testperson" },
  tasks: [
    { id: "pet-care", group: "Organisation", title: "Tierbetreuung klären", status: "open" },
    { id: "employment", group: "Organisation", title: "Arbeitgeber informieren", status: "open" }
  ]
};

test("the personal pilot never creates an employer task", () => {
  const state = createBaseState(syntheticSeed);
  assert.equal(state.tasks.some(item => /arbeitgeber/i.test(item.title)), false);
  assert.equal(state.tasks.some(item => item.id === "pet-care"), true);
});

test("legacy data is migrated only after a seed is supplied and admission remains expected", () => {
  const state = migrateLegacyState({
    admissionDate: "2030-06-10",
    checked: { "Organisation:0": true },
    manualTasks: [{ id: "manual-1", title: "Eigener Testpunkt", due: "2030-05-01T10:00" }],
    events: [],
    journal: []
  }, syntheticSeed);
  assert.equal(state.migration.from, "0.8.0");
  assert.equal(state.profile.admission.status, "expected");
  assert.equal(state.tasks.find(item => item.id === "pet-care").status, "done");
  assert.equal(state.tasks.some(item => item.title === "Eigener Testpunkt"), true);
});

test("simultaneous edits are merged by record timestamp", () => {
  const local = createBaseState({ profile: { displayName: "Test" }, tasks: [{ id: "one", group: "A", title: "Local", status: "open", updatedAt: "2030-01-02T00:00:00Z" }] });
  const remote = createBaseState({ profile: { displayName: "Test" }, tasks: [{ id: "one", group: "A", title: "Remote", status: "open", updatedAt: "2030-01-01T00:00:00Z" }, { id: "two", group: "A", title: "Remote two", status: "open" }] });
  const merged = mergeStates(local, remote);
  assert.equal(merged.tasks.find(item => item.id === "one").title, "Local");
  assert.equal(merged.tasks.some(item => item.id === "two"), true);
  assert.equal(merged.sync.pending, true);
});

test("schema 1 data is preserved and receives the new journey structure", () => {
  const migrated = normalizeState({
    schemaVersion: 1,
    profile: { displayName: "Altbestand", admission: { date: "2030-06-10", status: "confirmed", source: "Test" }, preferences: { simpleMode: true } },
    tasks: [{ id: "old-task", group: "Alt", title: "Bestehende Aufgabe", status: "open", priority: 2 }],
    events: [{ id: "old-event", title: "Bestehender Termin", date: "2030-05-01", status: "confirmed" }],
    routines: [],
    documents: [{ id: "old-document", name: "Bestehendes Dokument" }]
  });
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.profile.journey.rehabAdmission.date, "2030-06-10");
  assert.equal(migrated.profile.preferences.simpleMode, true);
  assert.equal(migrated.tasks.some(item => item.id === "old-task"), true);
  assert.equal(migrated.events.some(item => item.id === "old-event"), true);
  assert.equal(migrated.documents.some(item => item.id === "old-document"), true);
});

test("schema 1 receives missing journey dates from the protected seed without overwriting an existing confirmed date", () => {
  const seed = {
    ...syntheticSeed,
    profile: {
      displayName: "Testperson",
      journey: {
        withdrawalAdmission: { date: "2030-05-11", status: "expected", source: "Seed" },
        rehabAdmission: { date: "2030-06-10", status: "confirmed", source: "Seed" },
        minimumWithdrawalDays: 28,
        directTransfer: true
      }
    }
  };
  const withOpenDate = normalizeState({ schemaVersion: 1, profile: { admission: { date: "", status: "open" } }, tasks: [], events: [], routines: [] }, seed);
  assert.equal(withOpenDate.profile.journey.withdrawalAdmission.date, "2030-05-11");
  assert.equal(withOpenDate.profile.journey.rehabAdmission.date, "2030-06-10");
  const withExistingDate = normalizeState({ schemaVersion: 1, profile: { admission: { date: "2031-01-15", status: "confirmed", source: "Bestand" } }, tasks: [], events: [], routines: [] }, seed);
  assert.equal(withExistingDate.profile.journey.withdrawalAdmission.date, "2030-05-11");
  assert.equal(withExistingDate.profile.journey.rehabAdmission.date, "2031-01-15");
});

test("safe planning reset preserves documents and preferences while tombstoning removed records", () => {
  const current = createBaseState(syntheticSeed);
  current.profile.preferences.simpleMode = true;
  current.events.push({ id: "event-to-remove", title: "Alttermin", date: "2030-01-01", updatedAt: "2030-01-01T00:00:00Z" });
  current.journal.push({ id: "journal-to-remove", text: "Alteintrag", updatedAt: "2030-01-01T00:00:00Z" });
  current.documents.push({ id: "document-to-keep", name: "Beleg", updatedAt: "2030-01-01T00:00:00Z" });
  const reset = resetPlanningState(current, syntheticSeed);
  assert.equal(reset.profile.preferences.simpleMode, true);
  assert.equal(reset.documents.some(item => item.id === "document-to-keep"), true);
  assert.equal(reset.events.some(item => item.id === "event-to-remove"), false);
  assert.equal(reset.journal.some(item => item.id === "journal-to-remove"), false);
  assert.equal(reset.tombstones.some(item => item.collection === "events" && item.id === "event-to-remove"), true);
  assert.ok(reset.reset.lastAt);
});

test("priorities use understandable language instead of bare numbers", () => {
  assert.equal(priorityLabel(5), "Sofort klären");
  assert.equal(priorityLabel(2), "Wenn möglich");
  assert.equal(priorityLabel(1), "Kann warten");
});

test("the ignored private profile contains a protected care journey and linked tasks", { skip: !fs.existsSync(".data/private-profile.json") }, () => {
  const profile = JSON.parse(fs.readFileSync(".data/private-profile.json", "utf8"));
  const journey = profile.profile.journey;
  assert.match(journey.withdrawalAdmission.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(journey.withdrawalAdmission.status, "expected");
  assert.match(journey.rehabAdmission.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(journey.rehabAdmission.status, "confirmed");
  assert.ok(journey.ward);
  assert.ok(journey.minimumWithdrawalDays >= 28);
  assert.ok(new Date(journey.rehabAdmission.date) > new Date(journey.withdrawalAdmission.date));
  assert.equal(profile.tasks.every(item => /^https:\/\//.test(item.url)), true);
  assert.equal(profile.tasks.some(item => /arbeitgeber/i.test(item.title)), false);
  const state = createBaseState(profile);
  assert.equal(state.tasks.every(item => /^(?:https:\/\/|#\/)/.test(item.url || "") && item.linkLabel), true);
});
