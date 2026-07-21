import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { createBaseState, mergeStates, migrateLegacyState } from "../../public/js/data-model.js";

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

test("the ignored private profile contains the required personal care task", { skip: !fs.existsSync(".data/private-profile.json") }, () => {
  const profile = JSON.parse(fs.readFileSync(".data/private-profile.json", "utf8"));
  const careTask = profile.tasks.find(item => item.id === "private-pet-care");
  assert.ok(careTask);
  assert.equal(crypto.createHash("sha256").update([careTask.group, careTask.title, careTask.why].join("\n")).digest("hex"), "4b20999ef5ef6491ef9205fdf64538afaa3087dcc38f25637ccdbef1eec3b0f4");
  assert.equal(profile.tasks.some(item => /arbeitgeber/i.test(item.title)), false);
});
