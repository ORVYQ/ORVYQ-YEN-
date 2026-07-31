import {
  classifyVisualMedium,
  resolveVisualBalanceThresholds,
  GRAPHIC_CARD_EVIDENCE_KINDS,
} from "./orvyq-visual-balance.mjs";

const DECISIONS = new Set([
  "keep",
  "redesign",
  "replace_primary_evidence",
  "replace_contextual_footage",
  "remove",
]);
const MEDIA = new Set(["contextual_footage", "primary_evidence", "graphic_card"]);

function clone(value) {
  return structuredClone(value);
}

function requireReadyRequest(requests, action) {
  const request = requests.get(action.asset_request_id);
  if (!request) throw new Error(`shot ${action.baseline_shot_index} references unknown asset request ${action.asset_request_id}`);
  if (request.status !== "ready") throw new Error(`shot ${action.baseline_shot_index} asset request ${action.asset_request_id} is ${request.status}`);
}

function applyPrimaryEvidenceReplacement(shot, action, requests) {
  requireReadyRequest(requests, action);
  const replacements = action.replacement_assets || [];
  if (!replacements.length || replacements.some((asset) => !asset.asset_path || !asset.evidence_asset_id)) {
    throw new Error(`shot ${action.baseline_shot_index} requires materialized primary-evidence replacement_assets`);
  }
  const updated = clone(shot);
  updated.asset_type = "evidence";
  updated.visual_role = "evidence";
  updated.editorial_purpose = action.rationale;
  updated.semantic_rationale = action.rationale;
  updated.semantic_link = "direct_evidence";
  updated.evidence = {
    ...(updated.evidence || {}),
    kind: replacements.length > 1 ? "image_sequence" : "official_figure",
    image_assets: replacements.map((asset) => asset.asset_path),
    evidence_asset_ids: replacements.map((asset) => asset.evidence_asset_id),
    source_regions: replacements.map((asset) => asset.source_region).filter(Boolean),
  };
  delete updated.asset;
  delete updated.graphic;
  delete updated.emphasis_card;
  delete updated.editorial_overlay;
  delete updated.overlay;
  delete updated.trim_in_sec;
  delete updated.trim_out_sec;
  delete updated.contextual_footage;
  delete updated.generic_stock;
  delete updated.reuse_reason;
  return updated;
}

function applyFootageReplacement(shot, action, requests) {
  requireReadyRequest(requests, action);
  const [replacement] = action.replacement_assets || [];
  if (!replacement?.asset_path || !Number.isFinite(replacement.trim_in_sec) || !Number.isFinite(replacement.trim_out_sec)) {
    throw new Error(`shot ${action.baseline_shot_index} requires a materialized footage replacement with trim bounds`);
  }
  if (replacement.trim_out_sec - replacement.trim_in_sec + 0.001 < Number(shot.duration)) {
    throw new Error(`shot ${action.baseline_shot_index} footage replacement is shorter than the shot`);
  }
  const updated = clone(shot);
  updated.asset_type = "footage";
  updated.asset = replacement.asset_path;
  updated.trim_in_sec = replacement.trim_in_sec;
  updated.trim_out_sec = replacement.trim_out_sec;
  updated.visual_role = "context";
  updated.editorial_purpose = action.rationale;
  updated.semantic_rationale = action.rationale;
  updated.semantic_link = "physical";
  updated.contextual_footage = true;
  updated.generic_stock = false;
  delete updated.graphic;
  delete updated.evidence;
  delete updated.emphasis_card;
  delete updated.editorial_overlay;
  delete updated.overlay;
  return updated;
}

function applyRedesign(shot, action) {
  const updated = clone(shot);
  updated.editorial_purpose = action.rationale;
  updated.semantic_rationale = action.rationale;
  if (updated.graphic) {
    updated.graphic.template_id = action.template_id;
    updated.graphic.design_system = "orvyq_cinematic_v1";
  } else if (
    updated.asset_type === "evidence" &&
    GRAPHIC_CARD_EVIDENCE_KINDS.has(updated.evidence?.kind)
  ) {
    updated.evidence.template_id = action.template_id;
    updated.evidence.design_system = "orvyq_cinematic_v1";
  } else {
    const overlay = updated.emphasis_card || updated.editorial_overlay || updated.overlay;
    if (!overlay) throw new Error(`shot ${action.baseline_shot_index} redesign has no graphic, source-derived card, or dominant overlay`);
    overlay.template_id = action.template_id;
    overlay.design_system = "orvyq_cinematic_v1";
  }
  return updated;
}

function extendAdjacentFootage(shots, index, action) {
  const previous = shots[index - 1];
  if (!previous || previous.asset_type !== "footage" || !previous.asset) {
    throw new Error(`shot ${action.baseline_shot_index} cannot extend a non-footage predecessor`);
  }
  const updated = clone(shots[index]);
  updated.asset_type = "footage";
  updated.asset = previous.asset;
  updated.trim_in_sec = Number(previous.trim_out_sec);
  updated.trim_out_sec = Number(previous.trim_out_sec) + Number(updated.duration);
  updated.visual_role = "context";
  updated.editorial_purpose = action.rationale;
  updated.semantic_rationale = action.rationale;
  updated.semantic_link = previous.semantic_link || "conceptual";
  updated.contextual_footage = true;
  updated.generic_stock = false;
  delete updated.graphic;
  delete updated.evidence;
  delete updated.emphasis_card;
  delete updated.editorial_overlay;
  delete updated.overlay;
  return updated;
}

export function materializeVisualRebalancePlan({ shots, plan, assetRequests = [] }) {
  if (!plan || plan.status !== "materialized") return clone(shots || []);
  const requests = new Map(assetRequests.map((request) => [request.asset_request_id, request]));
  const actions = new Map((plan.actions || []).map((action) => [action.baseline_shot_index, action]));
  const output = clone(shots || []);

  for (let index = 0; index < output.length; index += 1) {
    const action = actions.get(index);
    if (!action) continue;
    if (action.claim_id !== output[index].claim_id) {
      throw new Error(`shot ${index} claim drift blocks rebalance materialization`);
    }
    if (action.decision === "redesign" || action.decision === "keep") {
      output[index] = applyRedesign(output[index], action);
    } else if (action.decision === "replace_primary_evidence") {
      output[index] = applyPrimaryEvidenceReplacement(output[index], action, requests);
    } else if (action.decision === "replace_contextual_footage") {
      output[index] = applyFootageReplacement(output[index], action, requests);
    } else if (action.decision === "remove" && action.replacement_strategy === "extend_adjacent_footage") {
      output[index] = extendAdjacentFootage(output, index, action);
    } else {
      throw new Error(`shot ${index} has unsupported materialization decision ${action.decision}`);
    }
  }
  return output;
}

function shotFrames(shot) {
  if (Number.isFinite(shot.start_frame) && Number.isFinite(shot.end_frame)) {
    return shot.end_frame - shot.start_frame;
  }
  return Math.round(Number(shot.duration) * 30);
}

export function auditVisualRebalancePlan({ shots, plan, assetRequests = [] }, rules = {}) {
  const failures = [];
  const blockers = [];
  const thresholds = resolveVisualBalanceThresholds(rules);
  const requests = new Map(assetRequests.map((request) => [request.asset_request_id, request]));
  const actions = new Map();

  for (const action of plan.actions || []) {
    if (!Number.isInteger(action.baseline_shot_index) || action.baseline_shot_index < 0) {
      failures.push(`invalid baseline_shot_index ${action.baseline_shot_index}`);
      continue;
    }
    if (actions.has(action.baseline_shot_index)) {
      failures.push(`duplicate action for baseline shot ${action.baseline_shot_index}`);
      continue;
    }
    if (!DECISIONS.has(action.decision)) failures.push(`shot ${action.baseline_shot_index} has invalid decision ${action.decision}`);
    if (!MEDIA.has(action.projected_medium)) failures.push(`shot ${action.baseline_shot_index} has invalid projected_medium ${action.projected_medium}`);
    actions.set(action.baseline_shot_index, action);
  }

  const frames = {
    contextual_footage: 0,
    primary_evidence: 0,
    graphic_card: 0,
    full_screen_text_card: 0,
  };
  const sections = new Map();
  const templates = new Map();
  let currentCardRun = 0;
  let maximumCardRun = 0;

  shots.forEach((shot, index) => {
    const baselineMedium = classifyVisualMedium(shot);
    const action = actions.get(index);
    if (baselineMedium === "graphic_card" && !action) {
      failures.push(`graphic/card baseline shot ${index} has no explicit editorial decision`);
    }
    if (action) {
      if (action.claim_id !== shot.claim_id) failures.push(`shot ${index} claim drift: plan=${action.claim_id}, blueprint=${shot.claim_id}`);
      if (Math.abs(Number(action.duration_seconds) - shotFrames(shot) / 30) > 0.001) {
        failures.push(`shot ${index} duration drift`);
      }
      if (plan.status === "materialized") {
        if (baselineMedium !== action.projected_medium) {
          failures.push(`shot ${index} materialized as ${baselineMedium}, expected ${action.projected_medium}`);
        }
      } else if (baselineMedium !== "graphic_card") {
        failures.push(`shot ${index} action targets ${baselineMedium}, not a graphic/card`);
      }
      if (["replace_primary_evidence", "replace_contextual_footage"].includes(action.decision) && !action.asset_request_id) {
        failures.push(`shot ${index} ${action.decision} requires asset_request_id`);
      }
      if (action.decision === "remove" && action.replacement_strategy !== "extend_adjacent_footage") {
        failures.push(`shot ${index} removal must preserve timeline through extend_adjacent_footage`);
      }
      if (action.asset_request_id) {
        const request = requests.get(action.asset_request_id);
        if (!request) {
          failures.push(`shot ${index} references unknown asset request ${action.asset_request_id}`);
        } else if (request.status !== "ready") {
          blockers.push(`${action.asset_request_id}: ${request.status}`);
        }
      }
      if (
        plan.status === "materialized" &&
        ["replace_primary_evidence", "replace_contextual_footage"].includes(action.decision) &&
        !(action.replacement_assets || []).length
      ) {
        failures.push(`shot ${index} materialized replacement has no replacement_assets`);
      }
    }

    const projectedMedium = action?.projected_medium || baselineMedium;
    const frameCount = shotFrames(shot);
    if (!MEDIA.has(projectedMedium)) {
      failures.push(`shot ${index} has no exclusive projected medium`);
      return;
    }
    frames[projectedMedium] += frameCount;
    if (action?.projected_full_screen_text_card === true) {
      if (projectedMedium !== "graphic_card") failures.push(`shot ${index} marks a non-card as full-screen text`);
      frames.full_screen_text_card += frameCount;
    }
    if (projectedMedium === "graphic_card") {
      if (!action?.template_id) failures.push(`projected card shot ${index} requires template_id`);
      else templates.set(action.template_id, (templates.get(action.template_id) || 0) + 1);
    }

    const section = shot.section_id || "unsectioned";
    const sectionFrames = sections.get(section) || { total: 0, cards: 0 };
    sectionFrames.total += frameCount;
    if (projectedMedium === "graphic_card") sectionFrames.cards += frameCount;
    sections.set(section, sectionFrames);

    if (projectedMedium === "graphic_card") {
      currentCardRun += 1;
      maximumCardRun = Math.max(maximumCardRun, currentCardRun);
    } else {
      currentCardRun = 0;
    }
  });

  for (const index of actions.keys()) {
    if (!shots[index]) failures.push(`action targets missing baseline shot ${index}`);
  }

  const durationFrames = shots.reduce((sum, shot) => sum + shotFrames(shot), 0);
  const fraction = (value) => value / Math.max(1, durationFrames);
  const fractions = {
    contextual_footage: fraction(frames.contextual_footage),
    primary_evidence: fraction(frames.primary_evidence),
    graphic_card: fraction(frames.graphic_card),
    full_screen_text_card: fraction(frames.full_screen_text_card),
  };
  const pct = (value) => `${(value * 100).toFixed(2)}%`;

  if (fractions.contextual_footage < thresholds.contextual_footage_fraction_min) {
    failures.push(`projected contextual footage ${pct(fractions.contextual_footage)} is below ${pct(thresholds.contextual_footage_fraction_min)}`);
  }
  if (fractions.contextual_footage > thresholds.contextual_footage_fraction_max) {
    failures.push(`projected contextual footage ${pct(fractions.contextual_footage)} exceeds ${pct(thresholds.contextual_footage_fraction_max)}`);
  }
  if (fractions.primary_evidence < thresholds.primary_evidence_fraction_min) {
    failures.push(`projected primary evidence ${pct(fractions.primary_evidence)} is below ${pct(thresholds.primary_evidence_fraction_min)}`);
  }
  if (fractions.graphic_card > thresholds.graphic_card_fraction_max) {
    failures.push(`projected graphics/cards ${pct(fractions.graphic_card)} exceeds ${pct(thresholds.graphic_card_fraction_max)}`);
  }
  if (fractions.full_screen_text_card > thresholds.full_screen_text_card_fraction_max) {
    failures.push(`projected full-screen text ${pct(fractions.full_screen_text_card)} exceeds ${pct(thresholds.full_screen_text_card_fraction_max)}`);
  }
  if (maximumCardRun > thresholds.maximum_consecutive_graphic_card_shots) {
    failures.push(`projected card run reaches ${maximumCardRun} shots`);
  }
  for (const [section, sectionFrames] of sections) {
    const cardFraction = sectionFrames.cards / Math.max(1, sectionFrames.total);
    if (cardFraction > thresholds.section_graphic_card_fraction_max) {
      failures.push(`projected ${section} card fraction ${pct(cardFraction)} exceeds ${pct(thresholds.section_graphic_card_fraction_max)}`);
    }
  }
  for (const [template, count] of templates) {
    if (count > thresholds.maximum_graphic_template_uses) {
      failures.push(`projected template ${template} is used ${count} times; maximum ${thresholds.maximum_graphic_template_uses}`);
    }
  }

  return {
    pass: failures.length === 0 && blockers.length === 0,
    editorial_plan_pass: failures.length === 0,
    materialization_ready: blockers.length === 0,
    failures,
    blockers: [...new Set(blockers)].sort(),
    thresholds,
    duration_frames: durationFrames,
    projected_frames: frames,
    projected_seconds: Object.fromEntries(Object.entries(frames).map(([key, value]) => [key, value / 30])),
    projected_fractions: fractions,
    maximum_consecutive_graphic_card_shots: maximumCardRun,
    graphic_template_uses: Object.fromEntries(templates),
    section_graphic_card_fractions: Object.fromEntries(
      [...sections].map(([section, value]) => [section, value.cards / Math.max(1, value.total)]),
    ),
  };
}
