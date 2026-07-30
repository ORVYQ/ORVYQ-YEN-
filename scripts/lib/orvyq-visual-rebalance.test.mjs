import test from "node:test";
import assert from "node:assert/strict";
import { auditVisualRebalancePlan } from "./orvyq-visual-rebalance.mjs";

function shot(duration, asset_type, section_id, extra = {}) {
  return {
    duration,
    asset_type,
    section_id,
    claim_id: extra.claim_id || "CLM_001",
    ...extra,
  };
}

test("rebalance decisions are exclusive, complete, and tighten-only compliant", () => {
  const shots = [
    shot(65, "footage", "SEC_01"),
    shot(22, "evidence", "SEC_01", {
      evidence: { kind: "official_document", image_assets: ["a.png"], evidence_asset_ids: ["A"] },
    }),
    shot(13, "graphic", "SEC_01", { graphic: { type: "claim_recap_card" } }),
  ];
  const plan = {
    actions: [{
      baseline_shot_index: 2,
      claim_id: "CLM_001",
      duration_seconds: 13,
      decision: "redesign",
      projected_medium: "graphic_card",
      projected_full_screen_text_card: false,
      template_id: "orvyq_single_comparison",
    }],
  };
  const result = auditVisualRebalancePlan({ shots, plan });
  assert.equal(result.pass, true, result.failures.join("; "));
  assert.equal(result.projected_fractions.graphic_card, 0.13);
});

test("missing replacement asset fails closed", () => {
  const shots = [
    shot(65, "footage", "SEC_01"),
    shot(22, "evidence", "SEC_01", {
      evidence: { kind: "official_document", image_assets: ["a.png"], evidence_asset_ids: ["A"] },
    }),
    shot(13, "graphic", "SEC_01", { graphic: { type: "claim_recap_card" } }),
  ];
  const plan = {
    actions: [{
      baseline_shot_index: 2,
      claim_id: "CLM_001",
      duration_seconds: 13,
      decision: "replace_contextual_footage",
      projected_medium: "contextual_footage",
      asset_request_id: "REQ_001",
    }],
  };
  const result = auditVisualRebalancePlan({
    shots,
    plan,
    assetRequests: [{ asset_request_id: "REQ_001", status: "pending_acquisition" }],
  });
  assert.equal(result.editorial_plan_pass, false);
  assert.match(result.failures.join("; "), /contextual footage/);
  assert.equal(result.materialization_ready, false);
});
