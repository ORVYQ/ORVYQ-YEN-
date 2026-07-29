export type VisualPrimary = {
  kind: "footage" | "image" | "source_derived" | "generated_motion_background";
  asset?: string;
  additional_assets?: string[];
  source_ids?: string[];
  seed?: string;
  trim_in_sec?: number;
  trim_out_sec?: number;
};

export type VisualSecondary = {
  kind: "image" | "source_derived" | "generated_motion_background";
  asset?: string;
  source_ids?: string[];
  seed?: string;
};

export type CinematicVisualModuleSpec = {
  selected_visual_module:
    | "cinematic_footage_overlay"
    | "document_dive"
    | "evidence_lens"
    | "comparison_composition"
    | "mechanism_explainer"
    | "data_scene"
    | "timeline_reconstruction"
    | "map_scene"
    | "editorial_emphasis_moment"
    | "chapter_transition";
  selection_rationale: string;
  primary_visual: VisualPrimary;
  secondary_visual?: VisualSecondary | null;
  visible_text: {
    primary?: string | null;
    secondary?: string | null;
    source?: string | null;
    left?: string | null;
    right?: string | null;
  };
  text_density: "low" | "medium" | "high";
  source_display_method: "document_margin" | "subtle_footer" | "corner_attribution" | "narration_only";
  motion_behavior: string;
  scene_duration_range: { minimum_seconds: number; maximum_seconds: number };
  transition_behavior: "cut" | "fade" | "dissolve";
  fallback_policy: "fail_loud";
  presentation_intent: "viewer_copy" | "show_editorial_label";
  safe_areas: {
    subtitle_clearance_px: number;
    horizontal_margin_px: number;
    mobile_minimum_font_px: number;
  };
};
