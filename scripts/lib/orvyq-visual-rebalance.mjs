import {
  classifyVisualMedium,
  resolveVisualBalanceThresholds,
} from "./orvyq-visual-balance.mjs";

const DECISIONS = new Set([
  "keep",
  "redesign",
  "replace_primary_evidence",
  "replace_contextual_footage",
  "remove",
]);
const MEDIA = new Set(["contextual_footage", "primary_evidence", "graphic_card"]);

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
      if (baselineMedium !== "graphic_card") failures.push(`shot ${index} action targets ${baselineMedium}, not a graphic/card`);
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
