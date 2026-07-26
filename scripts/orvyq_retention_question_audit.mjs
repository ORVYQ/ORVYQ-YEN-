#!/usr/bin/env node
import path from "node:path";
import {
  projectDir,
  readJson,
  writeJsonAtomic,
  parseArgs,
  printJson,
} from "./lib/fs-utils.mjs";

const PROJECT_ID = "001-the-ai-race-no-one-can-afford-to-win";
const REQUIRED_PAUSE_QUESTIONS = 7;
const REQUIRED_FULL_PAUSES = 3;
const REQUIRED_BRIEF_ACCENTS = 4;
const BRIEF_ACCENT_MAX_SECONDS = 3;
const REQUIRED_OPENING_DOCUMENTS = 2;
const HUMAN_FIRST_HOOK_ASSET = "assets/footage/scene_024_6e6f4af26cad60cc78930d6d.mp4";

function shotDurationSeconds(shot, fps) {
  return (Number(shot.end_frame) - Number(shot.start_frame)) / Number(fps);
}

export function auditRetentionQuestions(plan) {
  const failures = [];
  const hookShots = (plan.shots || []).filter((shot) => shot.hook_footage === true);
  const hookQuestionShots = hookShots.filter((shot) => shot.hook_question);
  const hookDurationSeconds = hookShots.reduce(
    (sum, shot) => sum + shotDurationSeconds(shot, plan.fps),
    0,
  );

  if (!hookShots.length || hookShots[0].start_frame !== 0)
    failures.push("Opening motion hook must begin at frame 0");
  if (hookShots.length !== 4)
    failures.push(`Opening motion hook must contain exactly four purposeful cuts, found ${hookShots.length}`);
  if (hookShots[0]?.video_asset !== HUMAN_FIRST_HOOK_ASSET)
    failures.push("Opening hook must begin on the approved human monitoring shot before expanding to systems and institutions");
  if (hookQuestionShots.length !== 1)
    failures.push(`Opening hook must declare exactly one uninterrupted hook_question, found ${hookQuestionShots.length}`);
  const openingQuestion = hookQuestionShots[0]?.hook_question?.question || "";
  if (!openingQuestion.endsWith("?"))
    failures.push("Opening retention question must end with '?'");
  if (openingQuestion.length < 35 || openingQuestion.length > 90)
    failures.push("Opening retention question must be concise and complete (35-90 characters)");
  if (hookDurationSeconds < 10 || hookDurationSeconds > 14)
    failures.push(`Opening question must span the full 10-14s hook, got ${hookDurationSeconds.toFixed(2)}s`);

  const pauseShots = (plan.shots || []).filter((shot) => shot.emphasis_card);
  const pauseQuestions = pauseShots.map((shot) => shot.emphasis_card.title);
  if (pauseQuestions.length !== REQUIRED_PAUSE_QUESTIONS)
    failures.push(`Film requires exactly ${REQUIRED_PAUSE_QUESTIONS} authored question beats, found ${pauseQuestions.length}`);
  for (const shot of pauseShots) {
    if (!String(shot.emphasis_card.title || "").endsWith("?"))
      failures.push(`${shot.shot_id} pause overlay is not a question`);
    if (!shot.emphasis_card.anchor_text)
      failures.push(`${shot.shot_id} pause question lost its narration anchor`);
  }
  if (new Set(pauseQuestions).size !== pauseQuestions.length)
    failures.push("Editorial pause questions must be unique");

  const briefAccentShots = pauseShots.filter(
    (shot) => shotDurationSeconds(shot, plan.fps) <= BRIEF_ACCENT_MAX_SECONDS,
  );
  const fullPauseShots = pauseShots.filter(
    (shot) => shotDurationSeconds(shot, plan.fps) > BRIEF_ACCENT_MAX_SECONDS,
  );
  if (fullPauseShots.length !== REQUIRED_FULL_PAUSES)
    failures.push(`Aperture pacing requires exactly ${REQUIRED_FULL_PAUSES} full pauses, found ${fullPauseShots.length}`);
  if (briefAccentShots.length !== REQUIRED_BRIEF_ACCENTS)
    failures.push(`Aperture pacing requires exactly ${REQUIRED_BRIEF_ACCENTS} brief accents, found ${briefAccentShots.length}`);
  for (const shot of briefAccentShots) {
    const seconds = shotDurationSeconds(shot, plan.fps);
    if (seconds < 1.5)
      failures.push(`${shot.shot_id} brief accent is too short to read (${seconds.toFixed(2)}s)`);
  }

  const hookEndFrame = Math.max(...hookShots.map((entry) => entry.end_frame), 0);
  const firstPostHook = (plan.shots || []).find(
    (shot) => shot.start_frame >= hookEndFrame,
  );
  if (!firstPostHook || firstPostHook.asset_type !== "evidence")
    failures.push("The first post-hook shot must be primary evidence");
  if (firstPostHook?.evidence?.kind !== "split_documents")
    failures.push("The first post-hook evidence must be a two-source split_documents composition, not a page carousel");
  const documentCount = firstPostHook?.evidence?.image_assets?.length || 0;
  if (documentCount !== REQUIRED_OPENING_DOCUMENTS)
    failures.push(`Opening evidence must contain exactly ${REQUIRED_OPENING_DOCUMENTS} strong framework covers, found ${documentCount}`);
  for (const asset of firstPostHook?.evidence?.image_assets || []) {
    if (!asset.startsWith("assets/evidence/") || !asset.endsWith(".png"))
      failures.push(`Opening document asset is not a materialized evidence capture: ${asset}`);
  }

  return {
    pass: failures.length === 0,
    failures,
    hook_duration_seconds: Math.round(hookDurationSeconds * 1000) / 1000,
    opening_question: openingQuestion,
    pause_question_count: pauseQuestions.length,
    full_pause_count: fullPauseShots.length,
    brief_accent_count: briefAccentShots.length,
    opening_document_count: documentCount,
    human_first_hook: hookShots[0]?.video_asset === HUMAN_FIRST_HOOK_ASSET,
  };
}

export async function runRetentionQuestionAudit(projectId = PROJECT_ID) {
  const dir = projectDir(projectId);
  const plan = await readJson(path.join(dir, "direction", "edit_plan.json"));
  const result = auditRetentionQuestions(plan);
  const report = {
    schema_version: "2.0-aperture",
    project_id: projectId,
    ...result,
  };
  await writeJsonAtomic(
    path.join(dir, "qa", "retention_question_audit.json"),
    report,
  );
  if (!result.pass)
    throw new Error(`Retention-question audit failed:\n- ${result.failures.join("\n- ")}`);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  runRetentionQuestionAudit(args["project-id"] || PROJECT_ID)
    .then((report) => printJson({ ok: true, ...report }))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
