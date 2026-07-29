export const VISUAL_MODULES = Object.freeze([
  "cinematic_footage_overlay",
  "document_dive",
  "evidence_lens",
  "comparison_composition",
  "mechanism_explainer",
  "data_scene",
  "timeline_reconstruction",
  "map_scene",
  "editorial_emphasis_moment",
  "chapter_transition",
]);

export const INTERNAL_METADATA_LABELS = Object.freeze([
  "EDITORIAL CONTEXT",
  "PRIMARY EVIDENCE",
  "SECTION CONTEXT",
  "FILM CLAIM",
  "SOURCE-DERIVED",
  "VERIFIED CONTEXT",
  "EVIDENCE BOUNDARY",
  "EDITORIAL RESOLUTION",
  "PRIMARY SOURCE CONTEXT",
  "PUBLISHED EVIDENCE",
  "SUPPORTS",
  "DOES NOT ESTABLISH",
]);

const INTERNAL_PREFIX = new RegExp(
  `^(?:${INTERNAL_METADATA_LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:\\s*[—:|/-]\\s*|\\s+)+`,
  "i",
);

export function normalizeVisibleText(value) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const withoutPrefix = clean.replace(INTERNAL_PREFIX, "").trim();
  if (!withoutPrefix || INTERNAL_METADATA_LABELS.some((label) => withoutPrefix.toUpperCase() === label)) return null;
  return withoutPrefix;
}

export function visibleTextPolicy({ title, support, source, intent = "viewer_copy" } = {}) {
  const output = {
    primary: normalizeVisibleText(title),
    secondary: normalizeVisibleText(support),
    source: normalizeVisibleText(source),
  };
  if (intent !== "show_editorial_label") {
    for (const key of Object.keys(output)) {
      const text = output[key];
      if (text && INTERNAL_METADATA_LABELS.some((label) => text.toUpperCase().includes(label))) output[key] = null;
    }
  }
  return output;
}

export function hasNumericEvidence(evidence = {}) {
  const strings = [
    evidence.title,
    evidence.subtitle,
    evidence.callout,
    ...(evidence.items || []).flatMap((item) => [item.label, item.value, item.detail]),
  ].filter(Boolean);
  return strings.some((value) => /(?:^|\s)(?:\d+(?:[.,]\d+)?\s*%|\$?\d+(?:[.,]\d+)?(?:\s*(?:million|billion|trillion|km|kg|m|years?))?)(?:\s|$)/i.test(String(value)));
}

export function sourceDisplayFor(module, sourceRequired) {
  if (!sourceRequired) return "narration_only";
  if (module === "document_dive") return "document_margin";
  if (["evidence_lens", "comparison_composition", "data_scene", "timeline_reconstruction", "map_scene"].includes(module)) return "subtle_footer";
  return "corner_attribution";
}

export function meaningfulMotionFor(module, assetType) {
  if (assetType === "footage") return "source_motion";
  const map = {
    document_dive: "controlled_zoom_highlight",
    evidence_lens: "focus_reveal",
    comparison_composition: "asymmetric_reveal",
    mechanism_explainer: "node_progression",
    data_scene: "data_progression",
    timeline_reconstruction: "timeline_progression",
    map_scene: "route_reveal",
    editorial_emphasis_moment: "texture_drift",
    chapter_transition: "atmospheric_reveal",
  };
  return map[module] || "focus_reveal";
}

export function moduleIsPresentationLike(module) {
  return ["editorial_emphasis_moment", "chapter_transition"].includes(module);
}
