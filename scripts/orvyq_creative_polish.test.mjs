import test from "node:test";
import assert from "node:assert/strict";
import { maximumContiguousSameFootageSeconds, FOOTAGE_POLISH_REPLACEMENTS } from "./orvyq_creative_polish.mjs";

test("maximumContiguousSameFootageSeconds detects and separates repeated footage runs", () => {
  const repeated = [
    { asset_type: "footage", video_asset: "a.mp4", start_frame: 0, end_frame: 210 },
    { asset_type: "footage", video_asset: "a.mp4", start_frame: 210, end_frame: 420 },
    { asset_type: "footage", video_asset: "a.mp4", start_frame: 420, end_frame: 630 }
  ];
  assert.equal(maximumContiguousSameFootageSeconds(repeated, 30), 21);
  repeated[1].video_asset = "b.mp4";
  assert.equal(maximumContiguousSameFootageSeconds(repeated, 30), 7);
});

test("review-derived replacement map covers every identified long repeated passage", () => {
  for (const shotId of ["shot_010", "shot_011", "shot_040", "shot_041", "shot_122", "shot_123", "shot_131"])
    assert.ok(FOOTAGE_POLISH_REPLACEMENTS[shotId], `missing replacement for ${shotId}`);
  assert.equal(new Set(Object.values(FOOTAGE_POLISH_REPLACEMENTS).map((entry) => entry.asset)).size, 7);
});
