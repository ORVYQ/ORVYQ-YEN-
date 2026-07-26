import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { promoteEvidenceAssets } from "./orvyq_promote_evidence_assets.mjs";
import { projectDir, readJson } from "./lib/fs-utils.mjs";

const PROJECT_ID = "000-example-project";

// Integration test against the real, committed manifest -- no
// assets/evidence/primary_evidence.runtime.json exists in a fresh checkout
// (it is CI-generated, gitignored build output), so every
// spec_ready_asset_pending entry must be reported pending, never promoted
// on declaration alone. This is the exact "never fabricate readiness"
// guarantee the promotion script exists to enforce.
test("promoteEvidenceAssets never promotes an asset with no verified runtime record", async () => {
  const dir = projectDir(PROJECT_ID);
  const manifestPath = path.join(dir, "research", "evidence_asset_manifest.json");
  const before = await readJson(manifestPath);
  const pendingBefore = before.assets.filter((asset) => asset.status === "spec_ready_asset_pending").map((asset) => asset.evidence_asset_id);
  assert.ok(pendingBefore.length > 0, "fixture assumption: the real manifest has at least one spec_ready_asset_pending entry");

  const result = await promoteEvidenceAssets(PROJECT_ID);
  assert.deepEqual(result.promoted, [], "no asset should be promoted without a real assets/evidence/primary_evidence.runtime.json record");
  assert.equal(result.stillPending.length, pendingBefore.length);

  const after = await readJson(manifestPath);
  assert.deepEqual(after, before, "the manifest file must not be rewritten when nothing was promoted");
});

test("promoteEvidenceAssets result includes the two new Phase-1 image-kind entries as pending", async () => {
  const result = await promoteEvidenceAssets(PROJECT_ID);
  const ids = result.stillPending.map((entry) => entry.evidence_asset_id);
  for (const expected of ["EVID_RSP_COVER_CAPTURE", "EVID_RSP_SUMMARY_CAPTURE", "EVID_FSF_COVER_CAPTURE", "EVID_AGENTIC_FIG1"]) {
    assert.ok(ids.includes(expected), `expected ${expected} to be reported pending in this checkout (no runtime manifest fetched)`);
  }
});
