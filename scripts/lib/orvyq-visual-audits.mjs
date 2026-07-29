import { INTERNAL_METADATA_LABELS, moduleIsPresentationLike } from "./orvyq-presentation-policy.mjs";

const DEFAULTS = Object.freeze({
  maximum_full_screen_text_fraction: 0.05,
  maximum_text_only_seconds: 4,
  maximum_presentation_chain: 1,
  minimum_modules_per_section: 2,
  minimum_module_repeat_gap: 2,
  minimum_mobile_font_px: 36,
  subtitle_clearance_px: 180,
});

export function shotSeconds(shot, fps = 30) {
  if (Number.isFinite(Number(shot.duration))) return Number(shot.duration);
  return Math.max(0, (Number(shot.end_frame) - Number(shot.start_frame)) / Number(fps || 30));
}

function moduleOf(shot) {
  return shot.visual_module?.selected_visual_module || null;
}

function visibleStringsOf(shot) {
  const strings = [];
  const push = (value) => {
    if (typeof value === "string" && value.trim()) strings.push(value.trim());
  };
  const v = shot.visual_module?.visible_text || {};
  for (const value of Object.values(v)) push(value);
  if (shot.asset_type === "graphic") {
    push(shot.graphic?.kicker);
    push(shot.graphic?.title);
    push(shot.graphic?.subtitle);
    for (const label of shot.graphic?.labels || []) push(label);
  }
  if (shot.asset_type === "evidence") {
    const e = shot.evidence || {};
    for (const key of ["eyebrow", "title", "subtitle", "callout", "limitation", "source_label", "left", "right", "left_detail", "right_detail"]) push(e[key]);
    for (const item of e.items || []) for (const key of ["label", "value", "detail"]) push(item[key]);
    for (const step of e.steps || []) push(step);
  }
  for (const container of [shot.editorial_overlay, shot.emphasis_card, shot.hook_question]) {
    if (!container) continue;
    for (const value of Object.values(container)) push(value);
  }
  push(shot.text_overlay);
  return strings;
}

function hasVisualFoundation(shot) {
  const primary = shot.visual_module?.primary_visual;
  if (shot.asset_type === "footage" && shot.video_asset) return true;
  if (primary?.asset || primary?.source_ids?.length) return true;
  return ["generated_motion_background", "source_derived"].includes(primary?.kind);
}

function isTextDominant(shot) {
  const module = moduleOf(shot);
  const visibleCount = Object.values(shot.visual_module?.visible_text || {}).filter(Boolean).length;
  return moduleIsPresentationLike(module) && visibleCount > 0;
}

export function auditPresentationLook(plan, policy = {}) {
  const limits = { ...DEFAULTS, ...policy };
  const fps = Number(plan.fps || 30);
  const failures = [];
  const warnings = [];
  const totalSeconds = (plan.shots || []).reduce((sum, shot) => sum + shotSeconds(shot, fps), 0);
  const textOnlySeconds = (plan.shots || []).filter((shot) => isTextDominant(shot) && !hasVisualFoundation(shot)).reduce((sum, shot) => sum + shotSeconds(shot, fps), 0);
  const fraction = totalSeconds ? textOnlySeconds / totalSeconds : 0;
  if (fraction > limits.maximum_full_screen_text_fraction) failures.push(`text-only presentation scenes are ${(fraction * 100).toFixed(1)}% of the film`);

  let chain = 0;
  let maximumChain = 0;
  for (const shot of plan.shots || []) {
    if (isTextDominant(shot)) chain += 1;
    else chain = 0;
    maximumChain = Math.max(maximumChain, chain);
    if (!hasVisualFoundation(shot)) failures.push(`${shot.shot_id || "shot"} has no visual foundation`);
    if (shotSeconds(shot, fps) > limits.maximum_text_only_seconds && isTextDominant(shot) && !hasVisualFoundation(shot)) {
      failures.push(`${shot.shot_id || "shot"} holds text without a visual foundation for ${shotSeconds(shot, fps).toFixed(2)}s`);
    }
  }
  if (maximumChain > limits.maximum_presentation_chain) failures.push(`presentation-like scene chain reaches ${maximumChain}`);
  return { pass: failures.length === 0, failures, warnings, text_only_fraction: fraction, maximum_presentation_chain: maximumChain };
}

export function auditVisualDiversity(plan, policy = {}) {
  const limits = { ...DEFAULTS, ...policy };
  const failures = [];
  const warnings = [];
  const lastUse = new Map();
  const sectionModules = new Map();
  for (const [index, shot] of (plan.shots || []).entries()) {
    const module = moduleOf(shot);
    if (!module) {
      failures.push(`${shot.shot_id || index} has no cinematic visual module`);
      continue;
    }
    const previousIndex = lastUse.get(module);
    if (Number.isInteger(previousIndex) && index - previousIndex < limits.minimum_module_repeat_gap) {
      failures.push(`${shot.shot_id || index} repeats ${module} after only ${index - previousIndex} shot(s)`);
    }
    lastUse.set(module, index);
    const section = shot.section_id || "(none)";
    if (!sectionModules.has(section)) sectionModules.set(section, new Set());
    sectionModules.get(section).add(module);
    if (index > 0 && module === moduleOf(plan.shots[index - 1])) failures.push(`${shot.shot_id || index} immediately repeats layout ${module}`);
  }
  for (const [section, modules] of sectionModules.entries()) {
    const shotCount = (plan.shots || []).filter((shot) => (shot.section_id || "(none)") === section).length;
    if (shotCount >= 3 && modules.size < limits.minimum_modules_per_section) failures.push(`${section} uses only ${modules.size} visual module type(s)`);
  }
  return { pass: failures.length === 0, failures, warnings, sections: Object.fromEntries([...sectionModules].map(([key, set]) => [key, [...set]])) };
}

export function auditMetadataLeakage(plan) {
  const failures = [];
  const warnings = [];
  const enumPattern = /\b(?:primary_evidence|supporting_evidence|editorial_context|section_context|film_claim|source_derived|evidence_relationship|certainty_level|editorial_role)\b/i;
  for (const shot of plan.shots || []) {
    const intent = shot.visual_module?.presentation_intent || "viewer_copy";
    if (intent === "show_editorial_label") continue;
    for (const text of visibleStringsOf(shot)) {
      const upper = text.toUpperCase();
      const known = INTERNAL_METADATA_LABELS.find((label) => upper.includes(label));
      if (known) failures.push(`${shot.shot_id || "shot"} exposes internal label ${known}: "${text}"`);
      if (enumPattern.test(text)) failures.push(`${shot.shot_id || "shot"} exposes an internal enum: "${text}"`);
      if (/\b(?:debug|qa only|internal note|production note)\b/i.test(text)) failures.push(`${shot.shot_id || "shot"} exposes debug/QA text: "${text}"`);
    }
  }
  return { pass: failures.length === 0, failures, warnings };
}

export function auditOpeningQuality(plan, openingPlan) {
  const failures = [];
  const warnings = [];
  const fps = Number(plan.fps || 30);
  const opening = (plan.shots || []).filter((shot) => Number(shot.start_frame) < 45 * fps);
  const first = opening[0];
  if (!first) failures.push("opening has no first shot");
  if (first?.asset_type === "graphic") failures.push("opening begins with a full-screen graphic");
  if (!hasVisualFoundation(first || {})) failures.push("opening first shot lacks a topic-specific visual foundation");
  if (!openingPlan?.central_question?.trim()?.endsWith("?")) failures.push("opening has no central question");
  if (openingPlan?.title_reveal?.show_on_first_frame === true) failures.push("title appears before curiosity is established");
  const firstEvidenceSeconds = Number(openingPlan?.first_evidence?.actual_seconds);
  if (!Number.isFinite(firstEvidenceSeconds) || firstEvidenceSeconds > 45) failures.push("first verified evidence arrives after 45 seconds");
  const modules = new Set(opening.map(moduleOf).filter(Boolean));
  if (modules.size < 2) failures.push("opening uses fewer than two visual module types");
  if (openingPlan?.pass !== true) failures.push("opening plan is not marked pass");
  return { pass: failures.length === 0, failures, warnings, module_types: [...modules], first_evidence_seconds: firstEvidenceSeconds };
}

export function auditTextDensity(plan, policy = {}) {
  const limits = { ...DEFAULTS, ...policy };
  const failures = [];
  const warnings = [];
  for (const shot of plan.shots || []) {
    const visible = shot.visual_module?.visible_text || {};
    const values = Object.values(visible).filter((value) => typeof value === "string" && value.trim());
    if (values.length > 3) failures.push(`${shot.shot_id || "shot"} exposes ${values.length} simultaneous text fields`);
    if (values.some((value) => /…|\.\.\./.test(value))) failures.push(`${shot.shot_id || "shot"} uses truncation ellipsis in viewer text`);
    const safe = shot.visual_module?.safe_areas || {};
    if (Number(safe.mobile_minimum_font_px || 0) < limits.minimum_mobile_font_px) failures.push(`${shot.shot_id || "shot"} mobile font policy is below ${limits.minimum_mobile_font_px}px`);
    if (Number(safe.subtitle_clearance_px || 0) < limits.subtitle_clearance_px) failures.push(`${shot.shot_id || "shot"} does not reserve enough subtitle clearance`);
    if (values.filter((value) => value.length > 150).length) failures.push(`${shot.shot_id || "shot"} contains an overlong viewer-facing line`);
  }
  return { pass: failures.length === 0, failures, warnings };
}

export function auditMotionContinuity(plan) {
  const failures = [];
  const warnings = [];
  const fps = Number(plan.fps || 30);
  const invalid = new Set(["hold", "static", "none", ""]);
  for (const shot of plan.shots || []) {
    const duration = shotSeconds(shot, fps);
    const motion = String(shot.visual_module?.motion_behavior || "").toLowerCase();
    if (shot.asset_type !== "footage" && duration >= 3 && invalid.has(motion)) failures.push(`${shot.shot_id || "shot"} is a static ${duration.toFixed(2)}s non-footage scene`);
  }
  return { pass: failures.length === 0, failures, warnings };
}

export function auditAllVisualQuality({ plan, openingPlan, policy = {} }) {
  const reports = {
    presentation_look: auditPresentationLook(plan, policy),
    visual_diversity: auditVisualDiversity(plan, policy),
    metadata_leakage: auditMetadataLeakage(plan),
    opening_quality: auditOpeningQuality(plan, openingPlan),
    text_density: auditTextDensity(plan, policy),
    motion_continuity: auditMotionContinuity(plan),
  };
  const failures = Object.entries(reports).flatMap(([name, report]) => report.failures.map((failure) => `${name}: ${failure}`));
  return { pass: failures.length === 0, failures, reports };
}

export { visibleStringsOf };
