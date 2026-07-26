import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateLocalManifest } from "./orvyq_materialize_footage.mjs";

test("accepts the committed local footage manifest", async () => {
  const manifest = JSON.parse(await readFile(
    new URL("../projects/000-example-project/assets/local_assets.json", import.meta.url)
  ));
  assert.deepEqual(validateLocalManifest(manifest), []);
  assert.equal(manifest.assets.length, 25);
});

test("rejects unsafe, duplicate, and non-footage paths", () => {
  const failures = validateLocalManifest({
    schema_version: 1,
    assets: [
      { path: "../escape.mp4" },
      { path: "assets/footage/clip.mp4" },
      { path: "assets/footage/clip.mp4" },
      { path: "assets/audio/clip.mp4" }
    ]
  });
  assert.ok(failures.some((failure) => failure.includes("escapes its root")));
  assert.ok(failures.some((failure) => failure.includes("duplicate asset path")));
  assert.ok(failures.some((failure) => failure.includes("must be an MP4 under assets/footage")));
});

test("rejects empty manifests and invalid schema versions", () => {
  assert.deepEqual(validateLocalManifest({ schema_version: 2, assets: [] }), [
    "schema_version must be 1",
    "assets must be a non-empty array"
  ]);
});
