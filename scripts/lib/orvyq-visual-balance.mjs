export const DEFAULT_VISUAL_MEDIUM_BALANCE = Object.freeze({
  contextual_body_footage_fraction_min: 0.35,
  contextual_body_footage_fraction_max: 0.60,
  source_derived_graphic_fraction_max: 0.30,
  full_screen_graphic_fraction_max: 0.08,
  card_like_visual_fraction_max: 0.35,
  official_primary_capture_fraction_min: 0.05,
  evidence_archive_fraction_min: 0.30,
  section_source_derived_graphic_fraction_max: 0.48,
  section_card_like_visual_fraction_max: 0.50,
});

function finiteFraction(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

export function resolveVisualBalanceThresholds(rules = {}) {
  const configured = {
    contextualMin: finiteFraction(rules.contextual_body_footage_fraction_min),
    contextualMax: finiteFraction(rules.contextual_body_footage_fraction_max),
    derivedMax: finiteFraction(rules.source_derived_graphic_fraction_max),
    graphicMax: finiteFraction(rules.full_screen_graphic_fraction_max),
    cardLikeMax: finiteFraction(rules.card_like_visual_fraction_max),
    officialMin: finiteFraction(rules.official_primary_capture_fraction_min),
    evidenceMin: finiteFraction(
      rules.evidence_archive_fraction_min ??
      rules.evidence_and_archive_fraction_min,
    ),
    sectionDerivedMax: finiteFraction(rules.section_source_derived_graphic_fraction_max),
    sectionCardLikeMax: finiteFraction(rules.section_card_like_visual_fraction_max),
  };
  return {
    contextual_body_footage_fraction_min: Math.max(
      DEFAULT_VISUAL_MEDIUM_BALANCE.contextual_body_footage_fraction_min,
      configured.contextualMin ?? 0,
    ),
    contextual_body_footage_fraction_max: Math.min(
      DEFAULT_VISUAL_MEDIUM_BALANCE.contextual_body_footage_fraction_max,
      configured.contextualMax ?? 1,
    ),
    source_derived_graphic_fraction_max: Math.min(
      DEFAULT_VISUAL_MEDIUM_BALANCE.source_derived_graphic_fraction_max,
      configured.derivedMax ?? 1,
    ),
    full_screen_graphic_fraction_max: Math.min(
      DEFAULT_VISUAL_MEDIUM_BALANCE.full_screen_graphic_fraction_max,
      configured.graphicMax ?? 1,
    ),
    card_like_visual_fraction_max: Math.min(
      DEFAULT_VISUAL_MEDIUM_BALANCE.card_like_visual_fraction_max,
      configured.cardLikeMax ?? 1,
    ),
    official_primary_capture_fraction_min: Math.max(
      DEFAULT_VISUAL_MEDIUM_BALANCE.official_primary_capture_fraction_min,
      configured.officialMin ?? 0,
    ),
    evidence_archive_fraction_min: Math.max(
      DEFAULT_VISUAL_MEDIUM_BALANCE.evidence_archive_fraction_min,
      configured.evidenceMin ?? 0,
    ),
    section_source_derived_graphic_fraction_max: Math.min(
      DEFAULT_VISUAL_MEDIUM_BALANCE.section_source_derived_graphic_fraction_max,
      configured.sectionDerivedMax ?? 1,
    ),
    section_card_like_visual_fraction_max: Math.min(
      DEFAULT_VISUAL_MEDIUM_BALANCE.section_card_like_visual_fraction_max,
      configured.sectionCardLikeMax ?? 1,
    ),
  };
}

function fractions({ durationFrames, contextualBodyFrames, derivedFrames, pureGraphicFrames, officialFrames }) {
  const duration = Number(durationFrames) > 0 ? Number(durationFrames) : 1;
  const contextual = Number(contextualBodyFrames || 0) / duration;
  const derived = Number(derivedFrames || 0) / duration;
  const graphics = Number(pureGraphicFrames || 0) / duration;
  const official = Number(officialFrames || 0) / duration;
  return {
    contextual_body_footage_fraction: contextual,
    source_derived_graphic_fraction: derived,
    full_screen_graphic_fraction: graphics,
    official_primary_capture_fraction: official,
    evidence_archive_fraction: official + derived,
    card_like_visual_fraction: derived + graphics,
  };
}

export function auditVisualMediumBalance(frames, rules = {}) {
  const values = fractions(frames);
  const thresholds = resolveVisualBalanceThresholds(rules);
  const failures = [];
  if (values.contextual_body_footage_fraction < thresholds.contextual_body_footage_fraction_min)
    failures.push(`contextual body footage ${(values.contextual_body_footage_fraction * 100).toFixed(1)}%; minimum ${(thresholds.contextual_body_footage_fraction_min * 100).toFixed(0)}%`);
  if (values.contextual_body_footage_fraction > thresholds.contextual_body_footage_fraction_max)
    failures.push(`contextual body footage ${(values.contextual_body_footage_fraction * 100).toFixed(1)}%; maximum ${(thresholds.contextual_body_footage_fraction_max * 100).toFixed(0)}%`);
  if (values.source_derived_graphic_fraction > thresholds.source_derived_graphic_fraction_max)
    failures.push(`source-derived graphic scenes ${(values.source_derived_graphic_fraction * 100).toFixed(1)}%; maximum ${(thresholds.source_derived_graphic_fraction_max * 100).toFixed(0)}%`);
  if (values.full_screen_graphic_fraction > thresholds.full_screen_graphic_fraction_max)
    failures.push(`full-screen graphics ${(values.full_screen_graphic_fraction * 100).toFixed(1)}%; maximum ${(thresholds.full_screen_graphic_fraction_max * 100).toFixed(0)}%`);
  if (values.card_like_visual_fraction > thresholds.card_like_visual_fraction_max)
    failures.push(`card-like visual time ${(values.card_like_visual_fraction * 100).toFixed(1)}%; maximum ${(thresholds.card_like_visual_fraction_max * 100).toFixed(0)}%`);
  if (values.official_primary_capture_fraction < thresholds.official_primary_capture_fraction_min)
    failures.push(`official primary captures ${(values.official_primary_capture_fraction * 100).toFixed(1)}%; minimum ${(thresholds.official_primary_capture_fraction_min * 100).toFixed(0)}%`);
  if (values.evidence_archive_fraction < thresholds.evidence_archive_fraction_min)
    failures.push(`evidence/source-derived scenes ${(values.evidence_archive_fraction * 100).toFixed(1)}%; minimum ${(thresholds.evidence_archive_fraction_min * 100).toFixed(0)}%`);
  return { ...values, thresholds, failures, pass: failures.length === 0 };
}

export function auditSectionVisualBalance(sectionFrames, rules = {}) {
  const thresholds = resolveVisualBalanceThresholds(rules);
  const sections = [];
  const failures = [];
  for (const [sectionId, frames] of Object.entries(sectionFrames)) {
    const values = fractions(frames);
    sections.push({ section_id: sectionId, ...values });
    if (values.source_derived_graphic_fraction > thresholds.section_source_derived_graphic_fraction_max)
      failures.push(`section ${sectionId} is ${(values.source_derived_graphic_fraction * 100).toFixed(1)}% source-derived graphics; maximum ${(thresholds.section_source_derived_graphic_fraction_max * 100).toFixed(0)}%`);
    if (values.card_like_visual_fraction > thresholds.section_card_like_visual_fraction_max)
      failures.push(`section ${sectionId} is ${(values.card_like_visual_fraction * 100).toFixed(1)}% card-like visuals; maximum ${(thresholds.section_card_like_visual_fraction_max * 100).toFixed(0)}%`);
  }
  return { sections, failures, pass: failures.length === 0 };
}
