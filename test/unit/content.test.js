import assert from "node:assert/strict";
import test from "node:test";
import { COACHING, coachingMessage } from "../../public/js/content.js";

test("every coaching option contains at least 30 offline messages", () => {
  for (const [category, messages] of Object.entries(COACHING)) {
    assert.ok(messages.length >= 30, `${category} contains ${messages.length}`);
  }
});

test("next-step coaching inserts the real open task", () => {
  assert.match(coachingMessage("next", 0, "synthetische Testaufgabe"), /synthetische Testaufgabe/);
});
