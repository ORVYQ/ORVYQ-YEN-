#!/usr/bin/env node
import path from "node:path";
import { projectDir, readJson, writeJsonAtomic, parseArgs, printJson } from "./lib/fs-utils.mjs";

const PROJECT_ID = "001-the-ai-race-no-one-can-afford-to-win";
const MIN_MOBILE_FONT_PX = 36;
const MAX_USES_PER_SOURCE = 2;
const BRIEF_ACCENT_MAX_SECONDS = 3;

export const FOOTAGE_POLISH_REPLACEMENTS = {
  shot_010: {
    asset: "assets/footage/scene_008_42946788405d61ee3a28fa31.mp4",
    trimIn: 1.0,
    motion: "push",
    reason: "Break the opening governance-lag aerial hold with the film's established market-pressure exterior; first use in the canonical body."
  },
  shot_011: {
    asset: "assets/footage/scene_012_d356fd9efe14c61c8594ff1f.mp4",
    trimIn: 3.0,
    motion: "drift_left",
    reason: "Move from institutional scale into a human operational environment instead of holding the opening aerial for a third consecutive shot."
  },
  shot_040: {
    asset: "assets/footage/scene_004_52abd7f745cc24b4ecad0215.mp4",
    trimIn: 1.0,
    motion: "push",
    reason: "Replace the middle of the long train/connective passage with the controlled-evaluation room already authored for this evidence arc."
  },
  shot_041: {
    asset: "assets/footage/scene_013_d8d3231e6f0b69b7def0fd48.mp4",
    trimIn: 24.0,
    motion: "hold",
    reason: "Second use at a distinct late trim window; the defensive SOC image balances the misuse sequence during its authored pause."
  },
  shot_122: {
    asset: "assets/footage/scene_016_e324304f99b3502cad464d69.mp4",
    trimIn: 0.5,
    motion: "pull",
    reason: "Break the closing three-shot code/interface repetition with the film's labor-forecast visual, which the synthesis explicitly revisits."
  },
  shot_123: {
    asset: "assets/footage/scene_006_7e0d77fb76615c10d441204a.mp4",
    trimIn: 3.0,
    motion: "drift_right",
    reason: "Second use at a different trim window; the fire-drill metaphor returns briefly as the closing synthesis asks what preparation can actually do."
  },
  shot_131: {
    asset: "assets/footage/scene_027_57a43a4f4b65321112dfb0bf.mp4",
    trimIn: 21.0,
    motion: "pull",
    reason: "Second use at a non-overlapping late trim window; a human-positive safeguards image interrupts the final repeated interface hold before the last pause."
  }
};

const IMAGE_EVIDENCE_KINDS = new Set([
  "split_documents",
  "official_document",
  "official_figure",
  "official_screen",
  "image_sequence",
  "recap"
]);

function durationSeconds(shot, fps) {
  return (Number(shot.end_frame) - Number(shot.start_frame)) / Number(fps);
}

export function maximumContiguousSameFootageSeconds(shots, fps) {
  let maximum = 0;
  let currentAsset = null;
  let currentSeconds = 0;
  for (const shot of shots) {
    if (shot.asset_type !== "footage") {
      currentAsset = null;
      currentSeconds = 0;
      continue;
    }
    const seconds = durationSeconds(shot, fps);
    if (shot.video_asset === currentAsset) currentSeconds += seconds;
    else {
      currentAsset = shot.video_asset;
      currentSeconds = seconds;
    }
    maximum = Math.max(maximum, currentSeconds);
  }
  return Math.round(maximum * 1000) / 1000;
}

function sourceUsageFor(shots) {
  const usage = new Map();
  let previousFootage = null;
  for (const shot of shots) {
    if (shot.asset_type === "evidence") {
      for (const asset of shot.evidence?.image_assets || []) usage.set(asset, (usage.get(asset) || 0) + 1);
      previousFootage = null;
      continue;
    }
    if (shot.asset_type !== "footage") {
      previousFootage = null;
      continue;
    }
    const continuation = previousFootage?.asset === shot.video_asset && Math.abs(Number(previousFootage.trimOut) - Number(shot.trim_in_sec)) < 0.03;
    if (!continuation) usage.set(shot.video_asset, (usage.get(shot.video_asset) || 0) + 1);
    previousFootage = { asset: shot.video_asset, trimOut: shot.trim_out_sec };
  }
  return usage;
}

async function applyFootageReplacements(dir, plan) {
  const applied = [];
  for (const [shotId, replacement] of Object.entries(FOOTAGE_POLISH_REPLACEMENTS)) {
    const shot = plan.shots.find((entry) => entry.shot_id === shotId);
    if (!shot) throw new Error(`Creative polish replacement target is missing: ${shotId}`);
    if (shot.asset_type !== "footage") throw new Error(`Creative polish target ${shotId} is not footage`);
    const seconds = durationSeconds(shot, plan.fps);
    const provenance = await readJson(path.join(dir, `${replacement.asset}.provenance.json`));
    if (!provenance.approved_for_final_edit || !provenance.license_url) throw new Error(`${replacement.asset} is not licensed and approved`);
    const sourceDuration = Number(provenance.actual_duration_seconds || provenance.duration);
    const trimOut = replacement.trimIn + seconds;
    if (!Number.isFinite(sourceDuration) || trimOut > sourceDuration + 0.02)
      throw new Error(`${shotId} replacement overruns ${replacement.asset}: ${trimOut}s > ${sourceDuration}s`);
    const previousAsset = shot.video_asset;
    shot.video_asset = replacement.asset;
    shot.motif = replacement.asset;
    shot.trim_in_sec = Math.round(replacement.trimIn * 1000) / 1000;
    shot.trim_out_sec = Math.round(trimOut * 1000) / 1000;
    shot.motion_variant = replacement.motion;
    shot.reuse_reason = replacement.reason;
    applied.push({ shot_id: shotId, previous_asset: previousAsset, replacement_asset: replacement.asset });
  }
  return applied;
}

function applyEvidenceAndGraphicPolish(plan) {
  let evidenceIndex = 0;
  const presentationCounts = {};
  for (const shot of plan.shots) {
    if (shot.asset_type === "evidence" && shot.evidence) {
      const presentation = IMAGE_EVIDENCE_KINDS.has(shot.evidence.kind)
        ? "cinematic_source"
        : evidenceIndex % 2 === 0
          ? "cinematic_field"
          : "cinematic_split";
      shot.evidence.presentation = presentation;
      shot.evidence.font_px = Math.max(MIN_MOBILE_FONT_PX, Number(shot.evidence.font_px) || 0);
      shot.evidence.density = "reduced";
      presentationCounts[presentation] = (presentationCounts[presentation] || 0) + 1;
      evidenceIndex += 1;
    } else if (shot.asset_type === "graphic" && shot.graphic) {
      shot.graphic.presentation = "cinematic";
      shot.graphic.mobile_font_px = MIN_MOBILE_FONT_PX;
    }
  }
  return presentationCounts;
}

async function applyRetentionQuestions(dir, plan) {
  const [motionHook, resolvedPausePlan] = await Promise.all([
    readJson(path.join(dir, "direction", "motion_hook.json")),
    readJson(path.join(dir, "direction", "resolved_pause_plan.json"))
  ]);

  const hookShots = plan.shots.filter((shot) => shot.hook_footage === true);
  if (!hookShots.length) throw new Error("Creative polish could not find the opening motion-hook shots");
  if (!motionHook.question || !String(motionHook.question).trim().endsWith("?"))
    throw new Error("direction/motion_hook.json requires a retention question ending with '?'");
  hookShots[0].hook_question = {
    eyebrow: motionHook.question_eyebrow || "THE QUESTION",
    question: String(motionHook.question).trim(),
    deck: motionHook.question_deck || null
  };

  const questionsByAnchor = new Map(
    (resolvedPausePlan.pauses || [])
      .filter((pause) => pause.question)
      .map((pause) => [pause.anchor_text, pause.question])
  );
  let pauseQuestionCount = 0;
  let fullPauseCount = 0;
  let briefAccentCount = 0;
  for (const shot of plan.shots) {
    if (!shot.emphasis_card) continue;
    const anchorText = shot.emphasis_card.anchor_text || shot.emphasis_card.title;
    const question = questionsByAnchor.get(anchorText);
    if (!question) throw new Error(`No authored retention question resolved for pause anchor: ${anchorText}`);
    const isBriefAccent = durationSeconds(shot, plan.fps) <= BRIEF_ACCENT_MAX_SECONDS;
    shot.emphasis_card = {
      ...shot.emphasis_card,
      eyebrow: isBriefAccent ? "CONSIDER" : "THE QUESTION",
      title: question,
      anchor_text: anchorText,
      accent: shot.emphasis_card.accent || "#E06A63"
    };
    if (isBriefAccent) briefAccentCount += 1;
    else fullPauseCount += 1;
    pauseQuestionCount += 1;
  }
  if (pauseQuestionCount !== questionsByAnchor.size)
    throw new Error(`Retention-question count mismatch: applied ${pauseQuestionCount}, resolved ${questionsByAnchor.size}`);
  if (fullPauseCount !== 3 || briefAccentCount !== 4)
    throw new Error(`Aperture pause profile mismatch: expected 3 full pauses + 4 brief accents, got ${fullPauseCount} + ${briefAccentCount}`);

  return {
    opening_question: hookShots[0].hook_question.question,
    opening_hook_frames: hookShots.reduce((sum, shot) => sum + shot.end_frame - shot.start_frame, 0),
    pause_question_count: pauseQuestionCount,
    full_pause_count: fullPauseCount,
    brief_accent_count: briefAccentCount
  };
}

export async function polishCreativePlan(projectId = PROJECT_ID) {
  const dir = projectDir(projectId);
  const editPlanPath = path.join(dir, "direction", "edit_plan.json");
  const plan = await readJson(editPlanPath);
  if (!Array.isArray(plan.shots) || !plan.shots.length) throw new Error("Creative polish requires a built direction/edit_plan.json");
  const beforeMaximum = maximumContiguousSameFootageSeconds(plan.shots, plan.fps);
  const replacements = await applyFootageReplacements(dir, plan);
  const presentationCounts = applyEvidenceAndGraphicPolish(plan);
  const retention = await applyRetentionQuestions(dir, plan);
  const usage = sourceUsageFor(plan.shots);
  const overused = [...usage.entries()].filter(([, count]) => count > MAX_USES_PER_SOURCE);
  if (overused.length) throw new Error(`Creative polish exceeds source-use limits: ${overused.map(([asset, count]) => `${asset}=${count}`).join(", ")}`);
  plan.source_usage = Object.fromEntries([...usage.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  const afterMaximum = maximumContiguousSameFootageSeconds(plan.shots, plan.fps);
  plan.quality_policy = {
    ...plan.quality_policy,
    minimum_overlay_font_px: MIN_MOBILE_FONT_PX,
    creative_polish_profile: "aperture-cinematic-v3-human-first",
    maximum_contiguous_same_footage_seconds: afterMaximum,
    evidence_presentation_modes: presentationCounts,
    opening_retention_question_required: true,
    opening_human_context_required: true,
    opening_document_carousel_forbidden: true,
    opening_split_documents_required: true,
    editorial_pause_questions_required: true,
    editorial_pause_profile: "3-full-4-brief"
  };
  if (afterMaximum >= beforeMaximum) throw new Error(`Creative polish did not reduce the maximum repeated-footage run (${beforeMaximum}s -> ${afterMaximum}s)`);
  const report = {
    schema_version: "2.0-aperture",
    project_id: projectId,
    source_review_run_id: 30200283806,
    replacement_count: replacements.length,
    replacements,
    maximum_contiguous_same_footage_seconds_before: beforeMaximum,
    maximum_contiguous_same_footage_seconds_after: afterMaximum,
    minimum_mobile_font_px: MIN_MOBILE_FONT_PX,
    evidence_presentation_modes: presentationCounts,
    retention,
    final_source_usage: plan.source_usage
  };
  await writeJsonAtomic(editPlanPath, plan);
  await writeJsonAtomic(path.join(dir, "qa", "creative_polish_report.json"), report);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  polishCreativePlan(args["project-id"] || PROJECT_ID)
    .then((report) => printJson({ ok: true, ...report }))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
