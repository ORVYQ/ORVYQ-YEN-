#!/usr/bin/env node
import path from "node:path";
import {
  projectDir,
  readJson,
  writeJsonAtomic,
  pathExists,
  parseArgs,
  printJson,
} from "./lib/fs-utils.mjs";
import { applyFootageVisualDecisions } from "./lib/orvyq-footage-visual-decisions.mjs";

function matches(entry, decision) {
  return Boolean(
    entry &&
    entry.scene_id === decision.scene_id &&
    String(entry.provider_asset_id) === String(decision.provider_asset_id) &&
    String(entry.asset_sha256).toLowerCase() === String(decision.asset_sha256).toLowerCase() &&
    String(entry.contact_sheet_sha256).toLowerCase() === String(decision.contact_sheet_sha256).toLowerCase()
  );
}

export async function applyProjectFootageVisualDecisions(projectId) {
  const dir = projectDir(projectId);
  const files = {
    queue: path.join(dir, "qa", "footage_review_queue.json"),
    decisions: path.join(dir, "research", "footage_visual_decisions.json"),
    reviews: path.join(dir, "research", "visual_asset_reviews.json"),
    runtime: path.join(dir, "assets", "footage_acquisition.runtime.json"),
    requests: path.join(dir, "research", "visual_asset_requests.json"),
    rebalance: path.join(dir, "direction", "visual_rebalance_plan.json"),
  };
  for (const [label, file] of Object.entries(files)) {
    if (!(await pathExists(file))) throw new Error(`${label} file is missing: ${file}`);
  }

  const [queue, decisions, reviews, runtime, requests, rebalance] = await Promise.all([
    readJson(files.queue),
    readJson(files.decisions),
    readJson(files.reviews),
    readJson(files.runtime),
    readJson(files.requests),
    readJson(files.rebalance),
  ]);

  const result = applyFootageVisualDecisions({ queue, decisions, reviews, runtime, requests });
  const queueByScene = new Map((queue.entries || []).map((entry) => [entry.scene_id, entry]));

  for (const decision of decisions.decisions || []) {
    const entry = queueByScene.get(decision.scene_id);
    if (!matches(entry, decision)) continue;
    const provenanceFile = path.join(dir, `${entry.asset_path}.provenance.json`);
    if (!(await pathExists(provenanceFile))) {
      throw new Error(`${decision.scene_id}: provenance is missing for ${entry.asset_path}`);
    }
    const provenance = await readJson(provenanceFile);
    if (String(provenance.provider_asset_id) !== String(decision.provider_asset_id)) {
      throw new Error(`${decision.scene_id}: provenance provider does not match the reviewed asset`);
    }
    provenance.approved_for_final_edit = decision.decision === "approve";
    provenance.human_review_status = decision.decision === "approve"
      ? "APPROVED_CLAIM_SPECIFIC_CONTACT_SHEET_REVIEW"
      : "REJECTED_CLAIM_SPECIFIC_CONTACT_SHEET_REVIEW";
    provenance.reviewed_asset_sha256 = decision.asset_sha256;
    provenance.reviewed_contact_sheet_sha256 = decision.contact_sheet_sha256;
    provenance.human_review_reason = decision.reason;
    if (decision.decision === "approve") delete provenance.fail_closed_reason;
    else provenance.fail_closed_reason = decision.reason;
    await writeJsonAtomic(provenanceFile, provenance);
  }

  rebalance.status = result.ready_for_materialization ? "materialized" : "blocked_pending_assets";
  await Promise.all([
    writeJsonAtomic(files.reviews, result.reviews),
    writeJsonAtomic(files.requests, result.requests),
    writeJsonAtomic(files.rebalance, rebalance),
  ]);

  return {
    project_id: projectId,
    ready_for_materialization: result.ready_for_materialization,
    applied_approvals: result.applied_approvals,
    applied_rejections: result.applied_rejections,
    stale_decisions: result.stale_decisions,
    summary: result.reviews.summary,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args["project-id"] || args.project;
  if (!projectId) throw new Error("--project-id is required");
  applyProjectFootageVisualDecisions(projectId)
    .then((result) => printJson({ ok: true, ...result }))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
