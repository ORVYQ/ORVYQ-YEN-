#!/usr/bin/env node
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  projectDir,
  readJson,
  writeJsonAtomic,
  pathExists,
  parseArgs,
  printJson,
} from "./lib/fs-utils.mjs";
import { applyFootageVisualDecisions } from "./lib/orvyq-footage-visual-decisions.mjs";
import { materializeVisualRebalancePlan } from "./lib/orvyq-visual-rebalance.mjs";

function matches(entry, decision) {
  return Boolean(
    entry &&
    entry.scene_id === decision.scene_id &&
    String(entry.provider_asset_id) === String(decision.provider_asset_id) &&
    String(entry.asset_sha256).toLowerCase() === String(decision.asset_sha256).toLowerCase() &&
    String(entry.contact_sheet_sha256).toLowerCase() === String(decision.contact_sheet_sha256).toLowerCase()
  );
}

function decisionRoundOrder(name) {
  if (name === "footage_visual_decisions.json") return 0;
  const numbered = name.match(/^footage_visual_decisions_round([0-9]+)\.json$/);
  if (numbered) return Number(numbered[1]);
  return Number.MAX_SAFE_INTEGER;
}

function normalizeReviewOrigin(value) {
  const origin = String(value || "legacy_system_visual_qa").trim();
  if (!["system_visual_qa", "legacy_system_visual_qa", "human_exception_review"].includes(origin)) {
    throw new Error(`Unsupported footage visual review_origin ${origin}`);
  }
  return origin;
}

async function loadDecisionRounds(dir, projectId) {
  const researchDir = path.join(dir, "research");
  const names = (await fs.readdir(researchDir))
    .filter((name) => /^footage_visual_decisions(?:_[a-z0-9-]+)?\.json$/.test(name))
    .sort((a, b) => decisionRoundOrder(a) - decisionRoundOrder(b) || a.localeCompare(b));
  if (!names.length) throw new Error(`No footage_visual_decisions*.json files exist for ${projectId}`);
  const byScene = new Map();
  const bases = [];
  for (const name of names) {
    const round = await readJson(path.join(researchDir, name));
    if (round.project_id !== projectId) throw new Error(`${name} project_id does not match ${projectId}`);
    const reviewOrigin = normalizeReviewOrigin(round.review_origin);
    bases.push(`${name} [${reviewOrigin}]: ${round.review_basis}`);
    for (const decision of round.decisions || []) {
      byScene.set(decision.scene_id, { ...decision, review_origin: reviewOrigin });
    }
  }
  return {
    schema_version: "1.0",
    project_id: projectId,
    review_basis: bases.join(" | "),
    decisions: [...byScene.values()],
    round_files: names,
  };
}

async function applyOfficialSourceOverrides(dir, projectId) {
  const overridesFile = path.join(dir, "research", "footage_constraint_overrides.json");
  const planFile = path.join(dir, "research", "footage_acquisition_plan.json");
  if (!(await pathExists(overridesFile)) || !(await pathExists(planFile))) return 0;

  const [overrides, plan] = await Promise.all([readJson(overridesFile), readJson(planFile)]);
  if (overrides.project_id !== projectId || plan.project_id !== projectId) {
    throw new Error("official footage override project_id mismatch");
  }
  const sources = overrides.official_sources || {};
  const expectedScenes = new Set(Object.keys(sources));
  if (!expectedScenes.size) return 0;

  let applied = 0;
  plan.assets = (plan.assets || []).map((asset) => {
    const source = sources[asset.scene_id];
    if (!source) return asset;
    for (const required of ["provider_asset_id", "source_page_url", "media_url", "source_institution", "license_url"]) {
      if (!String(source[required] || "").trim()) {
        throw new Error(`${asset.scene_id}: official source is missing ${required}`);
      }
    }
    expectedScenes.delete(asset.scene_id);
    applied += 1;
    return {
      ...asset,
      queries: [],
      fallback_queries: [],
      direct_source: source,
    };
  });
  if (expectedScenes.size) {
    throw new Error(`Official footage override scenes are absent from the acquisition plan: ${[...expectedScenes].join(", ")}`);
  }
  await writeJsonAtomic(planFile, plan);
  return applied;
}

function materializeOpeningHook(shots, motionHook) {
  const replaceCount = Number(motionHook.replace_opening_shot_count || motionHook.shots?.length || 0);
  if (!replaceCount || !Array.isArray(motionHook.shots) || motionHook.shots.length !== replaceCount) {
    throw new Error("motion_hook replace_opening_shot_count does not match its shots");
  }
  const replaced = shots.slice(0, replaceCount);
  const oldDuration = replaced.reduce((sum, shot) => sum + Number(shot.duration || 0), 0);
  const newDuration = motionHook.shots.reduce((sum, shot) => sum + Number(shot.duration || 0), 0);
  if (Math.abs(oldDuration - newDuration) > 0.001) {
    throw new Error(`motion hook duration drift: blueprint=${oldDuration}, hook=${newDuration}`);
  }
  const firstSectionId = shots[0]?.section_id;
  const hookShots = motionHook.shots.map((shot) => ({
    duration: shot.duration,
    claim_id: shot.claim_id,
    section_id: firstSectionId,
    scene_id: "scene_001",
    visual_role: shot.visual_role,
    editorial_purpose: shot.editorial_purpose,
    narration_anchor: shot.narration_anchor || "Opening visual premise before the first narrated sentence.",
    semantic_rationale: shot.semantic_rationale || shot.editorial_purpose,
    semantic_link: shot.semantic_link || (shot.visual_role === "metaphor" ? "conceptual" : "physical"),
    source_slice_index: null,
    asset_type: "footage",
    asset: shot.video_asset,
    trim_in_sec: shot.trim_in_sec,
    trim_out_sec: shot.trim_out_sec,
    motion: shot.motion_variant,
    hook_footage: true,
    generic_stock: Boolean(shot.generic_stock),
  }));
  return [...hookShots, ...shots.slice(replaceCount)];
}

export async function applyProjectFootageVisualDecisions(projectId) {
  const dir = projectDir(projectId);
  const files = {
    queue: path.join(dir, "qa", "footage_review_queue.json"),
    reviews: path.join(dir, "research", "visual_asset_reviews.json"),
    runtime: path.join(dir, "assets", "footage_acquisition.runtime.json"),
    requests: path.join(dir, "research", "visual_asset_requests.json"),
    rebalance: path.join(dir, "direction", "visual_rebalance_plan.json"),
    blueprint: path.join(dir, "direction", "editorial_blueprint.json"),
    motionHook: path.join(dir, "direction", "motion_hook.json"),
  };
  for (const [label, file] of Object.entries(files)) {
    if (!(await pathExists(file))) throw new Error(`${label} file is missing: ${file}`);
  }

  const [queue, decisions, reviews, runtime, requests, rebalance, blueprint, motionHook] = await Promise.all([
    readJson(files.queue),
    loadDecisionRounds(dir, projectId),
    readJson(files.reviews),
    readJson(files.runtime),
    readJson(files.requests),
    readJson(files.rebalance),
    readJson(files.blueprint),
    readJson(files.motionHook),
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
    const reviewOrigin = normalizeReviewOrigin(decision.review_origin);
    provenance.approved_for_final_edit = decision.decision === "approve";
    provenance.visual_qa_status = decision.decision === "approve"
      ? "APPROVED_CLAIM_SPECIFIC_CONTACT_SHEET_REVIEW"
      : "REJECTED_CLAIM_SPECIFIC_CONTACT_SHEET_REVIEW";
    provenance.visual_qa_origin = reviewOrigin;
    provenance.reviewed_asset_sha256 = decision.asset_sha256;
    provenance.reviewed_contact_sheet_sha256 = decision.contact_sheet_sha256;
    provenance.visual_qa_reason = decision.reason;
    delete provenance.human_review_status;
    delete provenance.human_review_reason;
    if (decision.decision === "approve") delete provenance.fail_closed_reason;
    else provenance.fail_closed_reason = decision.reason;
    await writeJsonAtomic(provenanceFile, provenance);
  }

  const officialFallbacksApplied = await applyOfficialSourceOverrides(dir, projectId);
  const wasMaterialized = rebalance.status === "materialized";
  rebalance.status = result.ready_for_materialization ? "materialized" : "blocked_pending_assets";
  const pendingRequestIds = (result.requests.requests || [])
    .filter((request) => request.status !== "ready")
    .map((request) => request.asset_request_id);

  if (result.ready_for_materialization) {
    let shots = blueprint.full_production?.shots || [];
    if (!wasMaterialized) {
      shots = materializeVisualRebalancePlan({
        shots,
        plan: rebalance,
        assetRequests: result.requests.requests || [],
      });
    }
    blueprint.full_production.shots = materializeOpeningHook(shots, motionHook);
    blueprint.full_production.status = "ready";
    blueprint.full_production.blocking_claim_ids = [];
    blueprint.full_production.blocking_visual_asset_request_ids = [];
    blueprint.full_production.generated_at = new Date().toISOString();
  } else {
    blueprint.full_production.status = "blocked_pending_visual_assets";
    blueprint.full_production.blocking_claim_ids = [];
    blueprint.full_production.blocking_visual_asset_request_ids = pendingRequestIds;
  }

  await Promise.all([
    writeJsonAtomic(files.reviews, result.reviews),
    writeJsonAtomic(files.requests, result.requests),
    writeJsonAtomic(files.rebalance, rebalance),
    writeJsonAtomic(files.blueprint, blueprint),
  ]);

  return {
    project_id: projectId,
    decision_rounds: decisions.round_files,
    ready_for_materialization: result.ready_for_materialization,
    official_fallbacks_applied: officialFallbacksApplied,
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
