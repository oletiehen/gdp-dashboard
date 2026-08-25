import assert from "node:assert/strict";
import test from "node:test";
import { CLINIC_COORDS, distanceKm, filterLocalGuide, GUIDE_CATEGORY_LABELS, LOCAL_GUIDE, nearestLocalGuide } from "../../public/js/local-guide.js";

test("local guide entries have unique ids, safe sources and planning details", () => {
  assert.ok(LOCAL_GUIDE.items.length >= 8);
  assert.equal(new Set(LOCAL_GUIDE.items.map(item => item.id)).size, LOCAL_GUIDE.items.length);
  for (const item of LOCAL_GUIDE.items) {
    assert.ok(GUIDE_CATEGORY_LABELS[item.category], `unknown category for ${item.id}`);
    assert.ok(item.distance && item.travel && item.summary && item.note && item.location);
    assert.ok(Array.isArray(item.highlights) && item.highlights.length >= 3, `missing concise highlights for ${item.id}`);
    assert.match(item.sourceUrl, /^https:\/\//);
    assert.match(item.websiteUrl, /^https:\/\//);
    assert.match(item.googleMapsUrl, /^https:\/\/www\.google\.com\/maps\/dir\//);
    assert.match(item.mapEmbedUrl, /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/);
    assert.match(item.mapEmbedUrl, /marker=/);
    assert.ok(item.mapTitle.includes(item.title));
    assert.equal(item.coordinates.length, 2);
    if (item.photo) {
      assert.match(item.photo.src, /^\/media\/guide\/.+\.jpg$/);
      assert.match(item.photo.sourceUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      assert.ok(item.photo.alt && item.photo.credit);
    }
    if (item.routeUrl) assert.match(item.routeUrl, /^https:\/\/www\.openstreetmap\.org\/directions/);
  }
});

test("featured leisure destinations use locally delivered real-place photos", () => {
  const photographed = LOCAL_GUIDE.items.filter(item => item.photo);
  assert.ok(photographed.length >= 4);
  assert.ok(photographed.some(item => item.id === "wacholderhain"));
  assert.ok(photographed.some(item => item.id === "haseluenner-see"));
});

test("the private compass ranks destinations from the selected on-device origin", () => {
  const nearest = nearestLocalGuide(LOCAL_GUIDE.items, CLINIC_COORDS, 4);
  assert.equal(nearest.length, 4);
  assert.ok(nearest[0].currentDistanceKm <= nearest[1].currentDistanceKm);
  assert.ok(nearest.every(item => Number.isFinite(item.bearing)));
  assert.ok(distanceKm(CLINIC_COORDS, [52.6729488, 7.4883055]) > 0.1);
});

test("energy, time, setting and category filters can be combined", () => {
  const quiet = filterLocalGuide(LOCAL_GUIDE.items, { energy: "ruhig" });
  assert.ok(quiet.some(item => item.id === "wacholderhain"));
  assert.ok(quiet.every(item => item.energy.includes("ruhig")));

  const activeOutside = filterLocalGuide(LOCAL_GUIDE.items, { category: "aktiv", energy: "aktiv", time: "halbtag", setting: "draussen" });
  assert.ok(activeOutside.some(item => item.id === "haseluenner-see"));
  assert.ok(activeOutside.every(item => item.category === "aktiv" && item.setting.includes("draussen")));

  assert.equal(filterLocalGuide(LOCAL_GUIDE.items, { category: "alltag", energy: "aktiv" }).length, 0);
});
