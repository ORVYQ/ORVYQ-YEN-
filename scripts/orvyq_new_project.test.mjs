import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScaffoldManifest,
  deriveEditorialRhythm,
} from "./orvyq_new_project.mjs";

test("new project scaffold contains only generic intake data", () => {
  const manifest = buildScaffoldManifest({
    projectId: "002-deep-ocean",
    title: "The World Beneath the Light",
    durationMinutes: 15,
  });
  const serialized = JSON.stringify(manifest);
  assert.ok(serialized.includes("002-deep-ocean"));
  assert.ok(serialized.includes("The World Beneath the Light"));
  assert.ok(!serialized.includes("scene_024_"));
  assert.ok(!serialized.includes("anthropic"));
  assert.ok(!serialized.includes("deepmind"));
  assert.equal(manifest["config/production_profile.json"].status, "needs_editorial_input");
  assert.equal(manifest["config/production_profile.json"].hook.first_shot_asset, null);
});

test("editorial rhythm scales with target duration inside system boundaries", () => {
  const short = deriveEditorialRhythm(8);
  const long = deriveEditorialRhythm(24);
  assert.ok(short.full_pause_target + short.brief_accent_target >= 4);
  assert.ok(long.full_pause_target + long.brief_accent_target <= 12);
  assert.ok(long.full_pause_target >= short.full_pause_target);
  assert.ok(long.brief_accent_target >= short.brief_accent_target);
});
