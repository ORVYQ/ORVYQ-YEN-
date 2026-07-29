const ARCHETYPES = Object.freeze([
  "contradiction",
  "human_consequence",
  "object_mystery",
  "scale_revelation",
  "decision_point",
  "archival_rupture",
]);

const STAKES = /risk|control|decid|consequence|war|crisis|collapse|threat|cost|power|rule|harm|loss|danger/i;
const CONTRADICTION = /but|yet|however|although|despite|instead|not|before|after|while/i;
const OBJECT = /machine|device|object|document|figure|ship|tool|structure|system|screen|map|satellite|robot/i;
const SCALE = /million|billion|trillion|percent|%|kilomet|km|global|entire|vast|largest|smallest|scale/i;
const DECISION = /who|decid|vote|approve|ban|allow|control|rule|policy|choice/i;
const ARCHIVE = /archive|histor|decade|century|year|past|today|then|now/i;

function openingShots(plan, maximumSeconds = 45) {
  const maximumFrame = Math.round(maximumSeconds * Number(plan.fps || 30));
  return (plan.shots || []).filter((shot) => Number(shot.start_frame) < maximumFrame);
}

function firstEvidenceShot(plan) {
  return (plan.shots || []).find((shot) => shot.asset_type === "evidence");
}

function questionOf(plan, motionHook = {}) {
  return String(motionHook.question || (plan.shots || []).find((shot) => shot.hook_question)?.hook_question?.question || "").trim();
}

function textCorpus(plan, motionHook) {
  const firstEvidence = firstEvidenceShot(plan);
  return [
    questionOf(plan, motionHook),
    motionHook.question_deck,
    firstEvidence?.evidence?.title,
    firstEvidence?.evidence?.subtitle,
    ...openingShots(plan, 30).map((shot) => shot.editorial_purpose),
  ].filter(Boolean).join(" ");
}

function wordSet(value) {
  return new Set(String(value || "").toLowerCase().match(/[a-z0-9']{4,}/g) || []);
}

function overlapRatio(a, b) {
  const left = wordSet(a);
  const right = wordSet(b);
  if (!left.size || !right.size) return 0;
  const overlap = [...left].filter((word) => right.has(word)).length;
  return overlap / Math.min(left.size, right.size);
}

function scoreCandidate(archetype, plan, motionHook) {
  const fps = Number(plan.fps || 30);
  const question = questionOf(plan, motionHook);
  const corpus = textCorpus(plan, motionHook);
  const opening = openingShots(plan, 45);
  const hook = opening.filter((shot) => shot.hook_footage === true);
  const first = opening[0] || null;
  const firstEvidence = firstEvidenceShot(plan);
  const evidenceAt = firstEvidence ? Number(firstEvidence.start_frame) / fps : Infinity;
  const realVisualCount = opening.filter((shot) => Boolean(shot.video_asset) || Boolean(shot.evidence?.image_assets?.length) || shot.asset_type === "evidence").length;
  const genericRatio = hook.length ? hook.filter((shot) => shot.generic_stock === true).length / hook.length : 1;
  const moduleCount = new Set(opening.map((shot) => shot.visual_module?.selected_visual_module).filter(Boolean)).size;

  const scores = {
    topic_specificity: Math.min(100, wordSet(corpus).size * 4),
    first_sentence_concreteness: question.length >= 25 && /\b(?:who|what|when|where|why|how|\d|the|this|these)\b/i.test(question) ? 85 : 45,
    visual_showability: Math.min(100, realVisualCount * 20),
    curiosity: question.endsWith("?") ? 90 : 35,
    stakes: STAKES.test(corpus) ? 88 : 45,
    non_genericity: Math.round((1 - genericRatio) * 100),
    supportability_within_30s: evidenceAt <= 30 ? 100 : evidenceAt <= 45 ? 70 : 0,
    real_asset_availability: Math.min(100, realVisualCount * 25),
    central_question_strength: question.length >= 25 && question.length <= 140 && question.endsWith("?") ? 95 : 40,
    narration_visual_alignment: Math.round(100 * overlapRatio(question, opening.map((shot) => shot.editorial_purpose).join(" "))),
  };

  const bonus = {
    contradiction: CONTRADICTION.test(corpus) ? 18 : 0,
    human_consequence: first?.visual_role === "human_context" ? 22 : 0,
    object_mystery: OBJECT.test(corpus) || Boolean(firstEvidence?.evidence?.image_assets?.length) ? 18 : 0,
    scale_revelation: SCALE.test(corpus) ? 20 : 0,
    decision_point: DECISION.test(question) || DECISION.test(corpus) ? 20 : 0,
    archival_rupture: ARCHIVE.test(corpus) || opening.some((shot) => shot.visual_role === "archive") ? 20 : 0,
  }[archetype] || 0;

  const weighted = Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.keys(scores).length + bonus;
  const disqualifiers = [];
  if (!first || (!first.video_asset && first.asset_type !== "evidence")) disqualifiers.push("first_visual_missing");
  if (!question.endsWith("?")) disqualifiers.push("central_question_missing");
  if (evidenceAt > 45) disqualifiers.push("first_evidence_late");
  if (realVisualCount < 2) disqualifiers.push("insufficient_real_visuals");
  if (opening.slice(0, 2).some((shot) => shot.asset_type === "graphic")) disqualifiers.push("opening_full_screen_graphic");
  if (moduleCount > 0 && moduleCount < 2) disqualifiers.push("insufficient_visual_module_variety");

  return {
    archetype,
    scores,
    archetype_bonus: bonus,
    total_score: Math.round(weighted * 1000) / 1000,
    applicable: disqualifiers.length === 0,
    disqualifiers,
    supporting_assets: opening.slice(0, 8).map((shot) => shot.video_asset || shot.evidence?.image_assets?.[0] || shot.visual_module?.primary_visual?.asset).filter(Boolean),
  };
}

export function buildOpeningPlan(plan, motionHook = {}) {
  const fps = Number(plan.fps || 30);
  const candidates = ARCHETYPES.map((archetype) => scoreCandidate(archetype, plan, motionHook));
  const applicable = candidates.filter((candidate) => candidate.applicable).sort((a, b) => b.total_score - a.total_score || a.archetype.localeCompare(b.archetype));
  if (!applicable.length) {
    const reasons = [...new Set(candidates.flatMap((candidate) => candidate.disqualifiers))];
    throw new Error(`Opening engine found no feasible hook candidate: ${reasons.join(", ")}`);
  }
  const selected = applicable[0];
  const shots = openingShots(plan, 45);
  const firstEvidence = firstEvidenceShot(plan);
  const openingModuleTypes = [...new Set(shots.map((shot) => shot.visual_module?.selected_visual_module).filter(Boolean))];
  const phases = [
    { phase: "cold_open", start_seconds: 0, end_seconds: 4 },
    { phase: "contradiction_or_risk", start_seconds: 4, end_seconds: 10 },
    { phase: "central_question", start_seconds: 10, end_seconds: 18 },
    { phase: "scale_and_promise", start_seconds: 18, end_seconds: 30 },
    { phase: "first_verified_evidence", start_seconds: 30, end_seconds: 45 },
  ];
  return {
    schema_version: "1.0-cinematic-opening",
    generated_from: "canonical_edit_plan",
    candidates,
    selected_archetype: selected.archetype,
    selected_score: selected.total_score,
    selection_rationale: `Selected ${selected.archetype} as the highest-scoring feasible opening with real visual support and evidence available within the opening window.`,
    central_question: questionOf(plan, motionHook),
    title_reveal: { show_on_first_frame: false, after_curiosity_is_established: true, target_window_seconds: [10, 24] },
    first_evidence: {
      required_by_seconds: 45,
      actual_seconds: firstEvidence ? Number(firstEvidence.start_frame) / fps : null,
      shot_id: firstEvidence?.shot_id || null,
    },
    phases,
    opening_shot_ids: shots.map((shot) => shot.shot_id),
    visual_module_types: openingModuleTypes,
    minimum_visual_module_types: 2,
    narration_visual_alignment_required: true,
    generic_stock_is_evidence: false,
    pass: true,
  };
}

export { ARCHETYPES };
