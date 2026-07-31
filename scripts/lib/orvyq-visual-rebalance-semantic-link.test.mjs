import test from "node:test";
import assert from "node:assert/strict";
import { materializeVisualRebalancePlan } from "./orvyq-visual-rebalance.mjs";

const baseline = {
  duration: 5,
  claim_id: "CLM_FIXTURE",
  section_id: "SEC_FIXTURE",
  visual_role: "graphic",
  asset_type: "graphic",
  editorial_purpose: "Present a source-derived summary before replacement.",
  narration_anchor: "A fixture narration anchor.",
  semantic_rationale: "A fixture rationale long enough for validation.",
  semantic_link: "conceptual",
  graphic: { type: "comparison", title: "Fixture" },
};

test("primary-evidence replacement emits the canonical direct_evidence semantic link", () => {
  const [shot] = materializeVisualRebalancePlan({
    shots: [baseline],
    plan: {
      status: "materialized",
      actions: [
        {
          baseline_shot_index: 0,
          claim_id: "CLM_FIXTURE",
          decision: "replace_primary_evidence",
          asset_request_id: "REQ_FIXTURE",
          rationale: "Replace the summary with the verified primary-source capture.",
          replacement_assets: [
            {
              asset_path: "assets/evidence/fixture.png",
              evidence_asset_id: "EVID_FIXTURE",
              source_region: "page 1",
            },
          ],
        },
      ],
    },
    assetRequests: [{ asset_request_id: "REQ_FIXTURE", status: "ready" }],
  });

  assert.equal(shot.asset_type, "evidence");
  assert.equal(shot.semantic_link, "direct_evidence");
});
