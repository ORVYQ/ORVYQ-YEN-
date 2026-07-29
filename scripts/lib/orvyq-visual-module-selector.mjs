import {
  VISUAL_MODULES,
  hasNumericEvidence,
  meaningfulMotionFor,
  sourceDisplayFor,
  visibleTextPolicy,
} from "./orvyq-presentation-policy.mjs";

const OFFICIAL_DOCUMENT_KINDS = new Set(["split_documents", "official_document", "official_screen"]);
const OFFICIAL_IMAGE_KINDS = new Set(["official_figure", "image_sequence", "recap"]);
const COMPARISON_KINDS = new Set(["comparison", "boundary"]);
const MECHANISM_KINDS = new Set(["concept_map", "evidence_chain"]);

function durationSeconds(shot, fps = 30) {
  if (Number.isFinite(Number(shot.duration))) return Number(shot.duration);
  return Math.max(0, (Number(shot.end_frame) - Number(shot.start_frame)) / Number(fps || 30));
}

function sourceRequired(shot) {
  return shot.asset_type === "evidence" || Boolean(shot.evidence?.source_ids?.length) || Boolean(shot.editorial_overlay?.source);
}

function primaryVisualFor(shot) {
  if (shot.asset_type === "footage") {
    return { kind: "footage", asset: shot.video_asset, trim_in_sec: shot.trim_in_sec, trim_out_sec: shot.trim_out_sec };
  }
  const images = shot.evidence?.image_assets || [];
  if (images.length) return { kind: "image", asset: images[0], additional_assets: images.slice(1) };
  if (shot.asset_type === "evidence") {
    return {
      kind: "source_derived",
      source_ids: shot.evidence?.source_ids || [],
      seed: shot.evidence?.kind || shot.visual_role || "evidence",
    };
  }
  return {
    kind: "generated_motion_background",
    seed: shot.graphic?.type || shot.section_id || shot.visual_role || "transition",
  };
}

function semanticIntentFor(shot) {
  const evidence = shot.evidence || {};
  const kind = evidence.kind || null;
  const editorialRole = shot.visual_role || (shot.asset_type === "evidence" ? "evidence" : shot.asset_type === "footage" ? "context" : "graphic");
  let narrativeFunction = "editorial_context";
  let evidenceRelationship = "supporting_evidence";
  let claimType = "contextual";

  if (shot.hook_footage) narrativeFunction = "narrative_question";
  else if (shot.graphic?.type === "section_title") narrativeFunction = "chapter_transition";
  else if (shot.graphic?.type === "end_card") narrativeFunction = "conclusion";
  else if (COMPARISON_KINDS.has(kind)) narrativeFunction = "comparison";
  else if (MECHANISM_KINDS.has(kind)) narrativeFunction = "mechanism";
  else if (kind === "source_timeline" || kind === "image_sequence") narrativeFunction = "timeline";
  else if (shot.emphasis_card) narrativeFunction = "editorial_emphasis";
  else if (shot.asset_type === "evidence") narrativeFunction = "primary_evidence";
  else if (shot.asset_type === "footage" && editorialRole === "human_context") narrativeFunction = "human_consequence";

  if (COMPARISON_KINDS.has(kind)) evidenceRelationship = kind === "boundary" ? "limitation" : "comparison";
  else if (shot.asset_type === "evidence") evidenceRelationship = "primary_evidence";
  else if (shot.asset_type === "footage") evidenceRelationship = "context_only";

  if (kind === "boundary") claimType = "uncertainty";
  else if (hasNumericEvidence(evidence)) claimType = "data_point";
  else if (MECHANISM_KINDS.has(kind)) claimType = "mechanism";
  else if (kind === "source_timeline") claimType = "timeline";
  else if (shot.asset_type === "evidence") claimType = "claim";

  return {
    editorial_role: editorialRole,
    claim_type: claimType,
    evidence_relationship: evidenceRelationship,
    certainty_level: evidence.limitation ? "bounded" : shot.asset_type === "evidence" ? "source_backed" : "contextual",
    source_type: evidence.kind || shot.provenance_mode || shot.asset_type,
    narrative_function: narrativeFunction,
    information_density: evidence.steps?.length > 3 || evidence.items?.length > 3 ? "high" : evidence.title || shot.graphic?.title ? "medium" : "low",
    emotional_tone: shot.hook_footage ? "intrigue" : shot.emphasis_card ? "tension" : "restrained",
    visual_priority: shot.asset_type === "evidence" ? "source" : shot.asset_type === "footage" ? "motion" : "transition",
    source_visibility_requirement: sourceRequired(shot) ? "visible" : "optional",
  };
}

function visualRequirementsFor(shot, semantic) {
  const evidence = shot.evidence || {};
  const images = evidence.image_assets || [];
  return {
    requires_real_source: shot.asset_type === "evidence",
    requires_document_visibility: OFFICIAL_DOCUMENT_KINDS.has(evidence.kind),
    requires_data_visualization: hasNumericEvidence(evidence),
    requires_map: /map|route|region|country|geograph/i.test(`${evidence.kind || ""} ${evidence.title || ""}`),
    requires_comparison: semantic.narrative_function === "comparison",
    requires_mechanism: semantic.narrative_function === "mechanism",
    requires_human_context: semantic.narrative_function === "human_consequence",
    requires_motion: true,
    requires_archival_context: shot.visual_role === "archive" || /archive|histor/i.test(`${evidence.title || ""} ${shot.editorial_purpose || ""}`),
    requires_scale_visualization: /scale|million|billion|percent|%|km|ton/i.test(`${evidence.title || ""} ${evidence.subtitle || ""}`),
    available_primary_visual_count: shot.asset_type === "footage" ? Number(Boolean(shot.video_asset)) : images.length,
  };
}

function rankedModules(shot, semantic, requirements) {
  const evidence = shot.evidence || {};
  if (shot.asset_type === "footage") {
    if (shot.emphasis_card) return ["editorial_emphasis_moment", "cinematic_footage_overlay"];
    return ["cinematic_footage_overlay", semantic.narrative_function === "human_consequence" ? "evidence_lens" : "chapter_transition"];
  }
  if (shot.asset_type === "graphic") {
    if (shot.graphic?.type === "section_title" || shot.graphic?.type === "end_card") return ["chapter_transition", "editorial_emphasis_moment"];
    return ["editorial_emphasis_moment", "chapter_transition"];
  }
  if (requirements.requires_map) return ["map_scene", "evidence_lens", "timeline_reconstruction"];
  if (requirements.requires_data_visualization) return ["data_scene", "comparison_composition", "evidence_lens"];
  if (OFFICIAL_DOCUMENT_KINDS.has(evidence.kind)) return ["document_dive", "evidence_lens"];
  if (OFFICIAL_IMAGE_KINDS.has(evidence.kind)) return ["evidence_lens", "document_dive", "timeline_reconstruction"];
  if (COMPARISON_KINDS.has(evidence.kind)) return ["comparison_composition", "evidence_lens"];
  if (evidence.kind === "source_timeline") return ["timeline_reconstruction", "evidence_lens"];
  if (MECHANISM_KINDS.has(evidence.kind)) return ["mechanism_explainer", "evidence_lens"];
  if (evidence.kind === "source_article") return ["evidence_lens", "document_dive"];
  return ["evidence_lens", "mechanism_explainer"];
}

function chooseModule(ranked, context) {
  const previous = context.previous_modules || [];
  const immediate = previous.at(-1) || null;
  const recent = new Set(previous.slice(-3));
  return ranked.find((module) => module !== immediate && !recent.has(module))
    || ranked.find((module) => module !== immediate)
    || ranked[0];
}

function secondaryVisualFor(shot, selected) {
  const images = shot.evidence?.image_assets || [];
  if (images.length > 1) return { kind: "image", asset: images[1] };
  if (selected === "comparison_composition") {
    return { kind: "source_derived", seed: "comparison_boundary", source_ids: shot.evidence?.source_ids || [] };
  }
  return null;
}

function visibleTextFor(shot, selected) {
  const evidence = shot.evidence || {};
  const graphic = shot.graphic || {};
  const emphasis = shot.emphasis_card || {};
  const overlay = shot.editorial_overlay || {};
  const title = emphasis.title || shot.hook_question?.question || overlay.title || evidence.title || graphic.title || shot.text_overlay || null;
  const support = shot.hook_question?.deck || overlay.callout || evidence.subtitle || evidence.callout || graphic.subtitle || null;
  const source = evidence.source_label || overlay.source || null;
  const text = visibleTextPolicy({ title, support, source });
  if (selected === "comparison_composition") {
    text.primary = null;
    text.secondary = null;
    text.left = visibleTextPolicy({ title: evidence.left, support: evidence.left_detail }).primary;
    text.right = visibleTextPolicy({ title: evidence.right, support: evidence.right_detail }).primary;
  }
  return text;
}

export function selectVisualModule(shot, context = {}) {
  const semantic = semanticIntentFor(shot);
  const requirements = visualRequirementsFor(shot, semantic);
  const ranked = rankedModules(shot, semantic, requirements).filter((module) => VISUAL_MODULES.includes(module));
  const selected = chooseModule(ranked, context);
  const primary = primaryVisualFor(shot);
  const sourceVisibilityRequired = semantic.source_visibility_requirement === "visible";
  const duration = durationSeconds(shot, context.fps || 30);

  if (!selected) throw new Error(`No cinematic visual module is available for ${shot.shot_id || shot.claim_id || "shot"}`);
  if (shot.asset_type === "evidence" && primary.kind === "source_derived" && !(primary.source_ids || []).length) {
    throw new Error(`${shot.shot_id || shot.claim_id || "evidence shot"} cannot build a source-derived visual without source_ids`);
  }

  const visualModule = {
    selected_visual_module: selected,
    selection_rationale: `${semantic.narrative_function} rendered as ${selected}; selected from ${ranked.join(", ")} using source availability and recent-layout history.`,
    primary_visual: primary,
    secondary_visual: secondaryVisualFor(shot, selected),
    visible_text: visibleTextFor(shot, selected),
    text_density: semantic.information_density === "high" ? "medium" : semantic.information_density,
    source_display_method: sourceDisplayFor(selected, sourceVisibilityRequired),
    motion_behavior: meaningfulMotionFor(selected, shot.asset_type),
    scene_duration_range: {
      minimum_seconds: Math.max(1, Math.min(duration, selected === "editorial_emphasis_moment" ? 1 : 2)),
      maximum_seconds: Math.max(duration, selected === "editorial_emphasis_moment" ? 3 : 12),
    },
    transition_behavior: shot.transition_in || "cut",
    fallback_policy: "fail_loud",
    presentation_intent: "viewer_copy",
    safe_areas: { subtitle_clearance_px: 190, horizontal_margin_px: 72, mobile_minimum_font_px: 36 },
  };
  return { semantic_intent: semantic, visual_requirements: requirements, visual_module: visualModule };
}

export function attachVisualModules(shots, { fps = 30 } = {}) {
  const previousModules = [];
  return shots.map((shot) => {
    const selected = selectVisualModule(shot, { fps, previous_modules: previousModules });
    previousModules.push(selected.visual_module.selected_visual_module);
    return { ...shot, ...selected };
  });
}
