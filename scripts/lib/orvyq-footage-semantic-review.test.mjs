import test from "node:test";
import assert from "node:assert/strict";
import { auditFootageSemanticReviews } from "./orvyq-footage-semantic-review.mjs";

test("rejected footage cannot return through another scene or backfill path", () => {
  const result = auditFootageSemanticReviews({
    footageAssets: ["assets/footage/scene_999_new-name.mp4"],
    provenanceByPath: new Map([[
      "assets/footage/scene_999_new-name.mp4",
      { provider_asset_id: "123", sha256: "a".repeat(64) },
    ]]),
    reviews: {
      rejected_assets: [{ provider_asset_id: "123", reason: "fishing boat is not a research vessel" }],
    },
  });
  assert.equal(result.pass, false);
  assert.equal(result.rejected.length, 1);
});

test("approval is byte-bound and narration-specific", () => {
  const asset = "assets/footage/context.mp4";
  const result = auditFootageSemanticReviews({
    footageAssets: [asset],
    provenanceByPath: new Map([[asset, { provider_asset_id: "456", sha256: "b".repeat(64) }]]),
    reviews: {
      approved_assets: [{
        provider_asset_id: "456",
        asset_sha256: "b".repeat(64),
        contact_sheet_sha256: "c".repeat(64),
        claim_id: "CLM_001",
        narration_anchor: "The exact sentence spoken during this shot.",
        semantic_rationale: "The vessel identity and deck operation directly support the narrated expedition action.",
      }],
    },
  });
  assert.equal(result.pass, true, result.failures.join("; "));
});
