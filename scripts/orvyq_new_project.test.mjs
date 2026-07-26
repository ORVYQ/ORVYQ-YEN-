import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScaffoldManifest,
  deriveEditorialRhythm,
} from "./orvyq_new_project.mjs";

test("new project scaffold contains only generic, isolated intake data", () => {
  const manifest = buildScaffoldManifest({
    projectId: "002-deep-ocean",
    title: "The World Beneath the Light",
    durationMinutes: 15,
  });
  const serialized = JSON.stringify(manifest).toLowerCase();
  assert.ok(serialized.includes("002-deep-ocean"));
  assert.ok(serialized.includes("the world beneath the light"));
  for (const forbidden of ["scene_024_", "anthropic", "deepmind", "ai race", "source_review_run_id\":302"]) {
    assert.ok(!serialized.includes(forbidden), `scaffold leaked ${forbidden}`);
  }

  const production = manifest["config/production_profile.json"];
  assert.equal(production.status, "needs_editorial_input");
  assert.equal(production.hook.first_shot_asset, null);
  assert.equal(production.art_direction.topic, null);
  assert.equal(production.end_card.title, null);

  const assets = manifest["config/editorial_asset_plan.json"];
  assert.equal(assets.project_id, "002-deep-ocean");
  assert.equal(assets.status, "needs_editorial_input");
  assert.deepEqual(assets.footage_assignments, {});
  assert.deepEqual(assets.full_footage_pool, []);

  const music = manifest["config/music_acquisition.json"];
  assert.equal(music.status, "needs_music_selection");
  assert.deepEqual(music.tracks, []);
  assert.equal(music.artist, null);
});

test("editorial rhythm scales with target duration inside system boundaries", () => {
  const short = deriveEditorialRhythm(8);
  const long = deriveEditorialRhythm(24);
  assert.ok(short.full_pause_target + short.brief_accent_target >= 4);
  assert.ok(long.full_pause_target + long.brief_accent_target <= 12);
  assert.ok(long.full_pause_target >= short.full_pause_target);
  assert.ok(long.brief_accent_target >= short.brief_accent_target);
});
