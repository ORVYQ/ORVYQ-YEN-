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
const MIN_PAUSE_QUESTIONS = 6;
const MIN_OPENING_DOCUMENTS = 3;

export function auditRetentionQuestions(plan) {
  const failures = [];
  const hookShots = (plan.shots || []).filter((shot) => shot.hook_footage === true);
  const hookQuestionShots = hookShots.filter((shot) => shot.hook_question);
  const hookDurationSeconds = hookShots.reduce(
    (sum, shot) => sum + (shot.end_frame - shot.start_frame) / plan.fps,
    0,
  );

  if (!hookShots.length || hookShots[0].start_frame !== 0)
    failures.push("Opening motion hook must begin at frame 0");
  if (hookQuestionShots.length !== 1)
    failures.push(`Opening hook must declare exactly one uninterrupted hook_question, found ${hookQuestionShots.length}`);
  const openingQuestion = hookQuestionShots[0]?.hook_question?.question || "";
  if (!openingQuestion.endsWith("?"))
    failures.push("Opening retention question must end with '?'");
  if (openingQuestion.length < 45)
    failures.push("Opening retention question is too weak/short to state the film's central dilemma");
  if (hookDurationSeconds < 10 || hookDurationSeconds > 14)
    failures.push(`Opening question must span the full 10-14s hook, got ${hookDurationSeconds.toFixed(2)}s`);

  const pauseShots = (plan.shots || []).filter((shot) => shot.emphasis_card);
  const pauseQuestions = pauseShots.map((shot) => shot.emphasis_card.title);
  if (pauseQuestions.length < MIN_PAUSE_QUESTIONS)
    failures.push(`Film needs at least ${MIN_PAUSE_QUESTIONS} editorial pause questions, found ${pauseQuestions.length}`);
  for (const shot of pauseShots) {
    if (shot.emphasis_card.eyebrow !== "THE QUESTION")
      failures.push(`${shot.shot_id} pause overlay is not labelled THE QUESTION`);
    if (!String(shot.emphasis_card.title || "").endsWith("?"))
      failures.push(`${shot.shot_id} pause overlay is not a question`);
    if (!shot.emphasis_card.anchor_text)
      failures.push(`${shot.shot_id} pause question lost its narration anchor`);
  }
  if (new Set(pauseQuestions).size !== pauseQuestions.length)
    failures.push("Editorial pause questions must be unique");

  const firstPostHook = (plan.shots || []).find(
    (shot) => shot.start_frame >= Math.max(...hookShots.map((entry) => entry.end_frame), 0),
  );
  if (!firstPostHook || firstPostHook.asset_type !== "evidence")
    failures.push("The first post-hook shot must be primary evidence");
  if (firstPostHook?.evidence?.kind !== "image_sequence")
    failures.push("The first post-hook evidence must be a real document image_sequence");
  const documentCount = firstPostHook?.evidence?.image_assets?.length || 0;
  if (documentCount < MIN_OPENING_DOCUMENTS)
    failures.push(`Opening evidence must visibly include at least ${MIN_OPENING_DOCUMENTS} real document pages, found ${documentCount}`);
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
    opening_document_count: documentCount,
  };
}

export async function runRetentionQuestionAudit(projectId = PROJECT_ID) {
  const dir = projectDir(projectId);
  const plan = await readJson(path.join(dir, "direction", "edit_plan.json"));
  const result = auditRetentionQuestions(plan);
  const report = {
    schema_version: "1.0",
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
