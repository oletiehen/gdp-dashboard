import assert from "node:assert/strict";
import test from "node:test";
import { METIME_LIBRARY, youtubeNoCookieUrl } from "../../public/js/metime.js";

test("MeTime uses a small curated library and privacy-enhanced embeds", () => {
  assert.ok(METIME_LIBRARY.length >= 2);
  assert.equal(new Set(METIME_LIBRARY.map(item => item.id)).size, METIME_LIBRARY.length);
  for (const item of METIME_LIBRARY) {
    assert.match(item.url, /^https:\/\/www\.youtube\.com\/watch\?v=/);
    assert.match(item.videoId, /^[\w-]{11}$/);
    assert.match(youtubeNoCookieUrl(item.videoId), /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
  }
});
