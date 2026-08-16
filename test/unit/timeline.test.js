import assert from "node:assert/strict";
import test from "node:test";
import { addDateDays, buildCareJourney, buildTimeline, daysBetween, materializeTimelineTasks, nextSuggestedTask } from "../../public/js/timeline.js";

test("date-only arithmetic remains stable across daylight-saving boundaries", () => {
  assert.equal(addDateDays("2030-03-31", -1), "2030-03-30");
  assert.equal(addDateDays("2030-10-27", 1), "2030-10-28");
});

test("a synthetic withdrawal-to-rehab interval is calculated as 30 full days", () => {
  assert.equal(daysBetween("2030-05-11", "2030-06-10"), 30);
  const milestones = buildCareJourney({
    withdrawalAdmission: { date: "2030-05-11", status: "expected" },
    rehabAdmission: { date: "2030-06-10", status: "confirmed" },
    minimumWithdrawalDays: 28,
    directTransfer: true,
    birthday: "2030-06-09"
  });
  assert.equal(milestones.find(item => item.id === "withdrawal-minimum").date, "2030-06-08");
  assert.equal(milestones.find(item => item.id === "birthday").date, "2030-06-09");
  assert.equal(milestones.find(item => item.id === "rehab-admission").date, "2030-06-10");
});

test("a confirmed admission date creates and moves the relative timeline", () => {
  const first = buildTimeline({ date: "2030-06-10", status: "confirmed" });
  const moved = buildTimeline({ date: "2030-06-17", status: "confirmed" });
  assert.equal(first.find(item => item.id === "stability-14").date, "2030-05-27");
  assert.equal(moved.find(item => item.id === "stability-14").date, "2030-06-03");
  assert.equal(moved.find(item => item.id === "transition").status, "expected");
});

test("an expected admission date stays provisional and does not materialize tasks", () => {
  const timeline = buildTimeline({ date: "2030-06-10", status: "expected" });
  assert.ok(timeline.every(item => item.status === "expected"));
  const state = materializeTimelineTasks({ profile: { admission: { date: "2030-06-10", status: "expected" } }, tasks: [{ id: "one", status: "open", title: "Test" }] });
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks.some(item => item.source === "timeline"), false);
});

test("a confirmed admission date materializes and reschedules generated tasks", () => {
  const initial = materializeTimelineTasks({
    profile: { admission: { date: "2030-06-10", status: "confirmed" } },
    tasks: [{ id: "one", status: "open", title: "Test" }]
  });
  const firstTask = initial.tasks.find(item => item.sourceId === "stability-14");
  assert.equal(firstTask.dueDate, "2030-05-27");
  const moved = materializeTimelineTasks({
    ...initial,
    profile: { admission: { date: "2030-06-17", status: "confirmed" } }
  });
  assert.equal(moved.tasks.find(item => item.sourceId === "stability-14").dueDate, "2030-06-03");
  assert.equal(moved.tasks.filter(item => item.source === "timeline").length, 11);
  assert.equal(moved.tasks.filter(item => item.source === "timeline").every(item => item.url && item.linkLabel), true);
});

test("journey tasks always include a direct source link", () => {
  const state = materializeTimelineTasks({
    profile: {
      admission: { date: "2030-06-10", status: "confirmed" },
      journey: {
        withdrawalAdmission: { date: "2030-05-11", status: "expected" },
        rehabAdmission: { date: "2030-06-10", status: "confirmed" },
        minimumWithdrawalDays: 28,
        directTransfer: true
      }
    },
    tasks: []
  });
  const journeyTasks = state.tasks.filter(item => item.source === "journey");
  assert.equal(journeyTasks.length, 3);
  assert.equal(journeyTasks.every(item => /^https:\/\//.test(item.url) && item.linkLabel), true);
});

test("the cockpit prioritizes overdue and higher-priority work", () => {
  const task = nextSuggestedTask([
    { id: "later", title: "Later", status: "open", priority: 5, dueDate: "2030-07-01" },
    { id: "overdue", title: "Overdue", status: "open", priority: 1, dueDate: "2030-05-01" }
  ], "2030-06-01");
  assert.equal(task.id, "overdue");
});
