import test from "node:test";
import assert from "node:assert/strict";
import {
  auditVisualRebalancePlan,
  materializeVisualRebalancePlan,
} from "./orvyq-visual-rebalance.mjs";

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

test("materialization replaces cards with exact evidence and footage assets", () => {
  const shots = [
    shot(8, "graphic", "SEC_01", {
      graphic: { type: "claim_recap_card" },
      narration_anchor: "Official evidence appears here.",
    }),
    shot(7, "graphic", "SEC_01", {
      graphic: { type: "claim_recap_card" },
      narration_anchor: "Physical process appears here.",
    }),
  ];
  const requests = [
    { asset_request_id: "REQ_EVD_DIRECT", status: "ready" },
    { asset_request_id: "REQ_FTG_DIRECT", status: "ready" },
  ];
  const plan = {
    status: "materialized",
    actions: [
      {
        baseline_shot_index: 0,
        claim_id: "CLM_001",
        duration_seconds: 8,
        decision: "replace_primary_evidence",
        projected_medium: "primary_evidence",
        asset_request_id: "REQ_EVD_DIRECT",
        rationale: "Use the exact official source figure for the narrated claim.",
        replacement_assets: [{
          asset_path: "assets/evidence/official.png",
          evidence_asset_id: "EVID_OFFICIAL",
          source_region: "Figure 1",
        }],
      },
      {
        baseline_shot_index: 1,
        claim_id: "CLM_001",
        duration_seconds: 7,
        decision: "replace_contextual_footage",
        projected_medium: "contextual_footage",
        asset_request_id: "REQ_FTG_DIRECT",
        rationale: "Use a physically direct process shot for the narrated action.",
        replacement_assets: [{
          asset_path: "assets/footage/direct.mp4",
          trim_in_sec: 2,
          trim_out_sec: 9,
        }],
      },
    ],
  };

  const result = materializeVisualRebalancePlan({ shots, plan, assetRequests: requests });
  assert.equal(result[0].asset_type, "evidence");
  assert.deepEqual(result[0].evidence.evidence_asset_ids, ["EVID_OFFICIAL"]);
  assert.equal(result[1].asset_type, "footage");
  assert.equal(result[1].asset, "assets/footage/direct.mp4");
  assert.equal(result[1].trim_out_sec, 9);
});
