import assert from "node:assert/strict";
import test from "node:test";
import { filterLocalGuide, GUIDE_CATEGORY_LABELS, LOCAL_GUIDE } from "../../public/js/local-guide.js";

test("local guide entries have unique ids, safe sources and planning details", () => {
  assert.ok(LOCAL_GUIDE.items.length >= 12);
  assert.equal(new Set(LOCAL_GUIDE.items.map(item => item.id)).size, LOCAL_GUIDE.items.length);
  for (const item of LOCAL_GUIDE.items) {
    assert.ok(GUIDE_CATEGORY_LABELS[item.category], `unknown category for ${item.id}`);
    assert.ok(item.distance && item.travel && item.summary && item.note && item.location);
    assert.match(item.sourceUrl, /^https:\/\//);
    if (item.routeUrl) assert.match(item.routeUrl, /^https:\/\/www\.openstreetmap\.org\/directions/);
  }
});

test("energy, time, setting and category filters can be combined", () => {
  const quiet = filterLocalGuide(LOCAL_GUIDE.items, { energy: "ruhig" });
  assert.ok(quiet.some(item => item.id === "klinik-waldpark"));
  assert.ok(quiet.every(item => item.energy.includes("ruhig")));

  const activeOutside = filterLocalGuide(LOCAL_GUIDE.items, { category: "aktiv", energy: "aktiv", time: "halbtag", setting: "draussen" });
  assert.ok(activeOutside.some(item => item.id === "naturbad-voerden"));
  assert.ok(activeOutside.every(item => item.category === "aktiv" && item.setting.includes("draussen")));

  assert.equal(filterLocalGuide(LOCAL_GUIDE.items, { category: "alltag", energy: "aktiv" }).length, 0);
});
