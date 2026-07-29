import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVisibleText } from "./lib/orvyq-presentation-policy.mjs";
import { attachVisualModules, selectVisualModule } from "./lib/orvyq-visual-module-selector.mjs";
import { buildOpeningPlan } from "./lib/orvyq-opening-engine.mjs";
import {
  auditPresentationLook,
  auditVisualDiversity,
  auditMetadataLeakage,
  auditOpeningQuality,
  auditTextDensity,
  auditMotionContinuity,
} from "./lib/orvyq-visual-audits.mjs";
import { findSystemLeakage } from "./lib/orvyq-system-independence.mjs";

function evidenceShot(overrides = {}) {
  return {
    shot_id: "shot_001",
    section_id: "section_alpha",
    start_frame: 0,
    end_frame: 180,
    asset_type: "evidence",
    visual_role: "evidence",
    editorial_purpose: "Show the verified source and explain what it proves.",
    transition_in: "cut",
    transition_out: "cut",
    evidence: {
      kind: "official_document",
      title: "A verified document shows the decision threshold",
      source_label: "Independent source",
      source_ids: ["source-a"],
      image_assets: ["assets/evidence/document.png"],
      evidence_asset_ids: ["evidence-a"],
      font_px: 40,
    },
    ...overrides,
  };
}

function footageShot(id, start, end, overrides = {}) {
  return {
    shot_id: id,
    section_id: "section_alpha",
    start_frame: start,
    end_frame: end,
    asset_type: "footage",
    video_asset: `assets/footage/${id}.mp4`,
    trim_in_sec: 0,
    trim_out_sec: (end - start) / 30,
    visual_role: "human_context",
    editorial_purpose: "Ground the opening in a concrete person, object and decision.",
    hook_footage: true,
    generic_stock: false,
    transition_in: "cut",
    transition_out: "cut",
    ...overrides,
  };
}

test("internal semantic labels are removed from viewer-facing text", () => {
  assert.equal(normalizeVisibleText("PRIMARY EVIDENCE — The document sets a limit"), "The document sets a limit");
  assert.equal(normalizeVisibleText("SOURCE-DERIVED"), null);
});

test("official documents select document dive and preserve a real visual foundation", () => {
  const selected = selectVisualModule(evidenceShot(), { fps: 30, previous_modules: [] });
  assert.equal(selected.visual_module.selected_visual_module, "document_dive");
  assert.equal(selected.visual_module.primary_visual.asset, "assets/evidence/document.png");
  assert.equal(selected.visual_module.fallback_policy, "fail_loud");
});

test("concept-map evidence is not misclassified as a geographic map", () => {
  const shot = evidenceShot({
    evidence: {
      ...evidenceShot().evidence,
      kind: "concept_map",
      title: "How the sealed loop transfers heat",
      image_assets: [],
      steps: ["Collect", "Move", "Hold", "Return"],
    },
  });
  const selected = selectVisualModule(shot, { fps: 30, previous_modules: [] });
  assert.equal(selected.visual_module.selected_visual_module, "mechanism_explainer");
});

test("numbered source timelines preserve timeline semantics before generic data detection", () => {
  const shot = evidenceShot({
    evidence: {
      ...evidenceShot().evidence,
      kind: "source_timeline",
      title: "The decision closes before winter",
      image_assets: [],
      items: [
        { label: "Design review", value: "Week 1" },
        { label: "Access rules", value: "Week 3" },
        { label: "Public launch", value: "Week 8" },
      ],
    },
  });
  const selected = selectVisualModule(shot, { fps: 30, previous_modules: [] });
  assert.equal(selected.visual_module.selected_visual_module, "timeline_reconstruction");
});

test("selector avoids immediate layout repetition without round-robin", () => {
  const planned = attachVisualModules([
    evidenceShot({ shot_id: "shot_001", start_frame: 0, end_frame: 180 }),
    evidenceShot({ shot_id: "shot_002", start_frame: 180, end_frame: 360 }),
  ], { fps: 30 });
  assert.notEqual(planned[0].visual_module.selected_visual_module, planned[1].visual_module.selected_visual_module);
});

test("opening engine produces multiple candidates and selects a feasible archetype", () => {
  const raw = {
    fps: 30,
    shots: [
      footageShot("shot_001", 0, 150),
      footageShot("shot_002", 150, 300, { visual_role: "context", editorial_purpose: "Reveal why the expected outcome conflicts with the verified record." }),
      evidenceShot({ shot_id: "shot_003", start_frame: 300, end_frame: 540 }),
      { ...evidenceShot({ shot_id: "shot_004", start_frame: 540, end_frame: 720 }), section_id: "section_beta", evidence: { ...evidenceShot().evidence, kind: "comparison", left: "Expected outcome", right: "Verified limit" } },
    ],
  };
  raw.shots = attachVisualModules(raw.shots, { fps: 30 });
  const opening = buildOpeningPlan(raw, {
    question: "Who controls the decision when the verified record contradicts the public promise?",
    question_deck: "A concrete choice changes the scale of the consequence.",
  });
  assert.equal(opening.candidates.length, 6);
  assert.equal(opening.pass, true);
  assert.ok(opening.first_evidence.actual_seconds <= 45);
});

test("presentation-look audit rejects a text-only card chain", () => {
  const plan = {
    fps: 30,
    shots: [0, 1].map((index) => ({
      shot_id: `shot_00${index + 1}`,
      start_frame: index * 120,
      end_frame: (index + 1) * 120,
      visual_module: {
        selected_visual_module: "editorial_emphasis_moment",
        visible_text: { primary: "A long text-only beat" },
        primary_visual: null,
      },
    })),
  };
  assert.equal(auditPresentationLook(plan).pass, false);
});

test("healthy cinematic fixture passes visual audits", () => {
  const raw = {
    fps: 30,
    shots: [
      footageShot("shot_001", 0, 150),
      footageShot("shot_002", 150, 300, { visual_role: "context" }),
      evidenceShot({ shot_id: "shot_003", start_frame: 300, end_frame: 480 }),
      {
        ...evidenceShot({ shot_id: "shot_004", section_id: "section_beta", start_frame: 480, end_frame: 660 }),
        evidence: { ...evidenceShot().evidence, kind: "comparison", left: "Known", right: "Still uncertain" },
      },
    ],
  };
  const plan = { ...raw, shots: attachVisualModules(raw.shots, { fps: 30 }) };
  const opening = buildOpeningPlan(plan, { question: "What changes when a verified decision reaches a real person?" });
  assert.equal(auditPresentationLook(plan).pass, true);
  assert.equal(auditVisualDiversity(plan).pass, true);
  assert.equal(auditMetadataLeakage(plan).pass, true);
  assert.equal(auditOpeningQuality(plan, opening).pass, true);
  assert.equal(auditTextDensity(plan).pass, true);
  assert.equal(auditMotionContinuity(plan).pass, true);
});

test("metadata leakage audit rejects internal labels", () => {
  const shot = evidenceShot();
  shot.visual_module = {
    selected_visual_module: "document_dive",
    presentation_intent: "viewer_copy",
    visible_text: { primary: "PRIMARY EVIDENCE" },
    primary_visual: { kind: "image", asset: "document.png" },
    safe_areas: { mobile_minimum_font_px: 36, subtitle_clearance_px: 190 },
    motion_behavior: "controlled_zoom_highlight",
  };
  assert.equal(auditMetadataLeakage({ fps: 30, shots: [shot] }).pass, false);
});

test("text density audit rejects ellipsis and unsafe subtitle spacing", () => {
  const shot = evidenceShot();
  shot.visual_module = {
    selected_visual_module: "document_dive",
    visible_text: { primary: "An incomplete title…" },
    primary_visual: { kind: "image", asset: "document.png" },
    safe_areas: { mobile_minimum_font_px: 30, subtitle_clearance_px: 120 },
    motion_behavior: "controlled_zoom_highlight",
  };
  assert.equal(auditTextDensity({ fps: 30, shots: [shot] }).pass, false);
});

test("motion continuity audit rejects long static non-footage scenes", () => {
  const shot = evidenceShot();
  shot.visual_module = {
    selected_visual_module: "document_dive",
    visible_text: { primary: "Verified source" },
    primary_visual: { kind: "image", asset: "document.png" },
    safe_areas: { mobile_minimum_font_px: 36, subtitle_clearance_px: 190 },
    motion_behavior: "static",
  };
  assert.equal(auditMotionContinuity({ fps: 30, shots: [shot] }).pass, false);
});

test("system-independence audit detects project, claim, asset and run leakage without hardcoded fixtures", () => {
  const tokens = [
    { value: "777-example-project", kind: "project_id" },
    { value: "CLM_777_EXAMPLE", kind: "claim_id" },
    { value: "scene_777_abcdef123456.mp4", kind: "asset_name" },
    { value: "98765432101", kind: "historical_run_id" },
  ];
  const violations = findSystemLeakage({
    tokens,
    systemFiles: [{ path: "scripts/runtime.mjs", content: "const project = '777-example-project'; const claim = 'CLM_777_EXAMPLE';" }],
  });
  assert.equal(violations.length, 2);
});
