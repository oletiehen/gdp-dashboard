import assert from "node:assert/strict";
import test from "node:test";
import { CLINIC_COORDS, distanceKm, filterLocalGuide, GUIDE_CATEGORY_LABELS, LOCAL_GUIDE, nearestLocalGuide } from "../../public/js/local-guide.js";

test("local guide entries have unique ids, safe sources and planning details", () => {
  assert.ok(LOCAL_GUIDE.items.length >= 12);
  assert.equal(new Set(LOCAL_GUIDE.items.map(item => item.id)).size, LOCAL_GUIDE.items.length);
  for (const item of LOCAL_GUIDE.items) {
    assert.ok(GUIDE_CATEGORY_LABELS[item.category], `unknown category for ${item.id}`);
    assert.ok(item.distance && item.travel && item.summary && item.note && item.location);
    assert.match(item.sourceUrl, /^https:\/\//);
    assert.match(item.websiteUrl, /^https:\/\//);
    assert.match(item.googleMapsUrl, /^https:\/\/www\.google\.com\/maps\/dir\//);
    assert.match(item.imageUrl, /^https:\/\/staticmap\.openstreetmap\.de\//);
    assert.equal(item.coordinates.length, 2);
    if (item.routeUrl) assert.match(item.routeUrl, /^https:\/\/www\.openstreetmap\.org\/directions/);
  }
});

test("the private compass ranks destinations from the selected on-device origin", () => {
  const nearest = nearestLocalGuide(LOCAL_GUIDE.items, CLINIC_COORDS, 4);
  assert.equal(nearest.length, 4);
  assert.ok(nearest[0].currentDistanceKm <= nearest[1].currentDistanceKm);
  assert.ok(nearest.every(item => Number.isFinite(item.bearing)));
  assert.ok(distanceKm(CLINIC_COORDS, [52.5083548, 8.0595371]) > 1);
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
