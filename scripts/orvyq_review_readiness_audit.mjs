#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  parseArgs,
  printJson,
  projectDir,
  readJson,
  writeJsonAtomic,
} from "./lib/fs-utils.mjs";

const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const SCENE_PATTERN = /^scene_[0-9]{3}$/;
const LFS_HEADER = "version https://git-lfs.github.com/spec/v1";

function fail(message) {
  const error = new Error(message);
  error.code = "REVIEW_NOT_READY";
  throw error;
}

function assertFraction(value, threshold, direction, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) fail(`Missing or invalid projected ratio: ${label}`);
  const passed = direction === "max" ? numeric <= threshold : numeric >= threshold;
  if (!passed) fail(`Visual ratio failed: ${label}=${numeric}, ${direction}=${threshold}`);
  return numeric;
}

async function sha256Binding(filePath) {
  const bytes = await fs.readFile(filePath);
  if (bytes.length < 4096) {
    const text = bytes.toString("utf8");
    if (text.startsWith(LFS_HEADER)) {
      const match = text.match(/^oid sha256:([a-f0-9]{64})$/im);
      if (!match) fail(`${filePath}: malformed Git LFS pointer`);
      return { hash: match[1].toLowerCase(), mode: "git_lfs_oid" };
    }
  }
  return {
    hash: crypto.createHash("sha256").update(bytes).digest("hex"),
    mode: "materialized_bytes",
  };
}

function resolveProjectPath(rootDir, relativePath, label) {
  const relative = String(relativePath || "").trim();
  if (!relative || path.isAbsolute(relative)) fail(`${label} is missing or unsafe`);
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    fail(`${label} escapes the project directory`);
  }
  return resolved;
}

export async function buildReviewReadinessReport(
  projectId,
  {
    rootDir = projectDir(projectId),
    generatedAt = new Date().toISOString(),
  } = {},
) {
  const queue = await readJson(path.join(rootDir, "qa", "footage_review_queue.json"));
  const runtime = await readJson(path.join(rootDir, "assets", "footage_acquisition.runtime.json"));
  const rebalance = await readJson(path.join(rootDir, "direction", "visual_rebalance_plan.json"));

  for (const [label, document] of [["review queue", queue], ["footage runtime", runtime], ["visual rebalance plan", rebalance]]) {
    if (document.project_id !== projectId) fail(`${label} project_id mismatch`);
  }

  const unresolved = Array.isArray(runtime.unresolved_scene_ids) ? runtime.unresolved_scene_ids : [];
  const providerIssues = Array.isArray(runtime.provider_search_issues) ? runtime.provider_search_issues : [];
  const records = Array.isArray(runtime.records) ? runtime.records : [];
  if (unresolved.length) fail(`Unresolved footage remains: ${unresolved.join(", ")}`);
  if (providerIssues.length) fail(`Provider search issues remain: ${providerIssues.length}`);
  if (Number(runtime.planned_asset_count) !== records.length) {
    fail(`Footage plan is incomplete: planned=${runtime.planned_asset_count}, records=${records.length}`);
  }
  if (runtime.pass !== true) fail("Footage acquisition runtime has not passed");

  const entries = Array.isArray(queue.entries) ? queue.entries : [];
  if (Number(queue.pending_review_count) !== entries.length) fail("Review queue count is inconsistent");
  if (Number(queue.entries_with_exact_uses) !== entries.length) fail("Not every pending entry has exact editorial uses");

  const recordByScene = new Map(records.map((record) => [String(record.scene_id), record]));
  const seenScenes = new Set();
  const bindingModes = { materialized_bytes: 0, git_lfs_oid: 0 };
  for (const entry of entries) {
    const sceneId = String(entry.scene_id || "");
    if (!SCENE_PATTERN.test(sceneId)) fail(`Invalid review scene_id: ${sceneId}`);
    if (seenScenes.has(sceneId)) fail(`Duplicate review scene: ${sceneId}`);
    seenScenes.add(sceneId);
    if (entry.status !== "pending_visual_review") fail(`${sceneId}: unexpected review status ${entry.status}`);
    if (!Array.isArray(entry.approved_uses_if_visually_valid) || !entry.approved_uses_if_visually_valid.length) {
      fail(`${sceneId}: exact editorial uses are missing`);
    }
    if (Array.isArray(entry.review_blockers) && entry.review_blockers.length) {
      fail(`${sceneId}: review blockers remain`);
    }
    if (!HASH_PATTERN.test(String(entry.asset_sha256 || ""))) fail(`${sceneId}: invalid asset hash`);
    if (!HASH_PATTERN.test(String(entry.contact_sheet_sha256 || ""))) fail(`${sceneId}: invalid contact-sheet hash`);

    const record = recordByScene.get(sceneId);
    if (!record || record.path !== entry.asset_path) fail(`${sceneId}: queue asset does not match runtime record`);
    const assetPath = resolveProjectPath(rootDir, entry.asset_path, `${sceneId} asset_path`);
    const sheetPath = resolveProjectPath(rootDir, entry.contact_sheet_path, `${sceneId} contact_sheet_path`);
    const [assetBinding, sheetBinding] = await Promise.all([
      sha256Binding(assetPath),
      sha256Binding(sheetPath),
    ]);
    bindingModes[assetBinding.mode] += 1;
    bindingModes[sheetBinding.mode] += 1;
    if (assetBinding.hash !== String(entry.asset_sha256).toLowerCase()) {
      fail(`${sceneId}: asset bytes/LFS object changed after queue generation`);
    }
    if (sheetBinding.hash !== String(entry.contact_sheet_sha256).toLowerCase()) {
      fail(`${sceneId}: contact-sheet bytes/LFS object changed after queue generation`);
    }
  }

  const projected = rebalance.projected || {};
  const thresholds = rebalance.thresholds || {};
  const mix = {
    contextual_footage_fraction: assertFraction(
      projected.contextual_footage_fraction,
      Number(thresholds.contextual_footage_fraction_min ?? 0.60),
      "min",
      "contextual_footage_fraction",
    ),
    primary_evidence_fraction: assertFraction(
      projected.primary_evidence_fraction,
      Number(thresholds.primary_evidence_fraction_min ?? 0.20),
      "min",
      "primary_evidence_fraction",
    ),
    graphic_card_fraction: assertFraction(
      projected.graphic_card_fraction,
      Number(thresholds.graphic_card_fraction_max ?? 0.15),
      "max",
      "graphic_card_fraction",
    ),
    full_screen_text_card_fraction: assertFraction(
      projected.full_screen_text_card_fraction,
      Number(thresholds.full_screen_text_card_fraction_max ?? 0.03),
      "max",
      "full_screen_text_card_fraction",
    ),
    maximum_consecutive_graphic_card_shots: Number(projected.maximum_consecutive_graphic_card_shots),
  };
  const maxConsecutive = Number(thresholds.maximum_consecutive_graphic_card_shots ?? 1);
  if (!Number.isInteger(mix.maximum_consecutive_graphic_card_shots) || mix.maximum_consecutive_graphic_card_shots > maxConsecutive) {
    fail(`Consecutive graphic/card limit failed: ${mix.maximum_consecutive_graphic_card_shots} > ${maxConsecutive}`);
  }

  const pendingScenes = entries.map((entry) => entry.scene_id);
  return {
    schema_version: "1.0",
    project_id: projectId,
    generated_at: generatedAt,
    validation_scope: "render_free_pre_review",
    pass: true,
    checks: {
      footage_plan_complete: records.length,
      unresolved_footage: 0,
      provider_search_issues: 0,
      pending_human_visual_reviews: entries.length,
      pending_review_scenes: pendingScenes,
      all_pending_reviews_have_exact_uses: true,
      all_pending_reviews_are_byte_bound: true,
      byte_binding_modes: bindingModes,
      visual_rebalance_plan: "passed",
      generic_card_audit: "deferred_until_post_review_edit_plan_materialization"
    },
    projected_visual_mix: mix,
    review_ready: true,
    review_not_started: true,
    render_started: false
  };
}

export async function writeReviewReadinessReport(projectId, options = {}) {
  const rootDir = options.rootDir || projectDir(projectId);
  const report = await buildReviewReadinessReport(projectId, { ...options, rootDir });
  const outputPath = options.outputPath || path.join(rootDir, "qa", "review_readiness_validation.json");
  await writeJsonAtomic(outputPath, report);
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = String(args["project-id"] || "").trim();
  if (!projectId) throw new Error("--project-id is required");
  const report = args["check-only"]
    ? await buildReviewReadinessReport(projectId)
    : await writeReviewReadinessReport(projectId);
  printJson(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message, code: error.code || null }));
    process.exitCode = 1;
  });
}
