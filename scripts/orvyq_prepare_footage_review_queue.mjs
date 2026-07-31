#!/usr/bin/env node
import crypto from "node:crypto";
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

// The queue is always rebuilt against current runtime bytes; stale acquisition paths are never authoritative.
// Reconciliation also provides the deterministic trigger boundary for re-running materialization after shared QA fixes.
function normalizeUse(use) {
  return {
    claim_id: use.claim_id,
    narration_anchor: String(use.narration_anchor || "").trim(),
    semantic_rationale: String(use.semantic_rationale || "").trim(),
    ...(Number.isFinite(use.trim_in_sec) ? { trim_in_sec: use.trim_in_sec } : {}),
    ...(Number.isFinite(use.trim_out_sec) ? { trim_out_sec: use.trim_out_sec } : {}),
  };
}

function keyForUse(use) {
  return [use.claim_id, use.narration_anchor, use.trim_in_sec ?? "", use.trim_out_sec ?? ""].join("|");
}

function sceneIdFromAsset(assetPath) {
  const match = String(assetPath || "").match(/(?:^|\/)scene_(\d{3})(?:_|\.)/);
  return match ? `scene_${match[1]}` : null;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function reconcileManifestEntries(dir, manifest, runtime) {
  const recordByScene = new Map((runtime.records || []).map((record) => [record.scene_id, record]));
  return Promise.all((manifest.entries || []).map(async (entry) => {
    const record = recordByScene.get(entry.scene_id);
    if (!record || record.path === entry.asset_path) return entry;
    const assetFile = path.join(dir, record.path);
    const provenanceFile = `${assetFile}.provenance.json`;
    const contactSheetPath = `qa/footage-contact-sheets/${entry.scene_id}.jpg`;
    const contactSheetFile = path.join(dir, contactSheetPath);
    for (const [label, file] of Object.entries({ assetFile, provenanceFile, contactSheetFile })) {
      if (!(await pathExists(file))) {
        throw new Error(`${entry.scene_id}: ${label} is missing while reconciling the footage review manifest`);
      }
    }
    const [provenance, assetBytes, sheetBytes] = await Promise.all([
      readJson(provenanceFile),
      fs.readFile(assetFile),
      fs.readFile(contactSheetFile),
    ]);
    const assetHash = sha256(assetBytes);
    const declaredHash = String(provenance.actual_sha256 || provenance.sha256 || "").toLowerCase();
    if (declaredHash && declaredHash !== assetHash) {
      throw new Error(`${entry.scene_id}: reconciled footage bytes do not match provenance`);
    }
    return {
      ...entry,
      asset_path: record.path,
      provider: provenance.provider,
      provider_asset_id: String(provenance.provider_asset_id),
      source_page_url: provenance.source_page_url,
      creator: provenance.creator,
      asset_sha256: assetHash,
      contact_sheet_path: contactSheetPath,
      contact_sheet_sha256: sha256(sheetBytes),
      duration_seconds: Number(provenance.actual_duration_seconds || provenance.duration || entry.duration_seconds),
      editorial_role: provenance.editorial_role || record.role || entry.editorial_role,
      narration_anchor: provenance.narration_anchor || entry.narration_anchor || null,
      claim_id: provenance.target_claim_id || entry.claim_id || null,
      semantic_rationale: provenance.editorial_note || entry.semantic_rationale,
      status: "pending_visual_review",
    };
  }));
}

export async function prepareFootageReviewQueue(projectId) {
  const dir = projectDir(projectId);
  const manifestFile = path.join(dir, "qa", "footage_contact_sheets.json");
  const [manifest, runtime, editorial, rebalance, blueprint, motionHook] = await Promise.all([
    readJson(manifestFile),
    readJson(path.join(dir, "assets", "footage_acquisition.runtime.json")),
    readJson(path.join(dir, "config", "editorial_asset_plan.json")),
    readJson(path.join(dir, "direction", "visual_rebalance_plan.json")),
    readJson(path.join(dir, "direction", "editorial_blueprint.json")),
    readJson(path.join(dir, "direction", "motion_hook.json")),
  ]);

  manifest.entries = await reconcileManifestEntries(dir, manifest, runtime);
  const usesByPath = new Map();
  const currentPathByScene = new Map((manifest.entries || []).map((entry) => [entry.scene_id, entry.asset_path]));
  const addUse = (assetPath, rawUse) => {
    if (!assetPath) return;
    const use = normalizeUse(rawUse);
    if (!/^CLM_[A-Z0-9_]+$/.test(String(use.claim_id || ""))) return;
    if (use.narration_anchor.length < 8 || use.semantic_rationale.length < 24) return;
    const existing = usesByPath.get(assetPath) || new Map();
    existing.set(keyForUse(use), use);
    usesByPath.set(assetPath, existing);
  };

  for (const [claimId, assignments] of Object.entries(editorial.footage_assignments || {})) {
    for (const assignment of Object.values(assignments || {})) {
      addUse(assignment.asset, {
        claim_id: claimId,
        narration_anchor: assignment.semantic_anchor,
        semantic_rationale: assignment.semantic_rationale || assignment.reuse_reason,
      });
    }
  }

  for (const hookShot of motionHook.shots || []) {
    const sceneId = sceneIdFromAsset(hookShot.video_asset);
    const currentAssetPath = currentPathByScene.get(sceneId) || hookShot.video_asset;
    addUse(currentAssetPath, {
      claim_id: hookShot.claim_id,
      narration_anchor: hookShot.narration_anchor || "Opening visual premise before the first narrated sentence.",
      semantic_rationale: hookShot.semantic_rationale || hookShot.editorial_purpose,
      trim_in_sec: hookShot.trim_in_sec,
      trim_out_sec: hookShot.trim_out_sec,
    });
  }

  const shots = blueprint.full_production?.shots || [];
  for (const shot of shots) {
    if (shot.asset_type !== "footage") continue;
    const sceneId = sceneIdFromAsset(shot.asset);
    const currentAssetPath = currentPathByScene.get(sceneId);
    if (!currentAssetPath) continue;
    addUse(currentAssetPath, {
      claim_id: shot.claim_id,
      narration_anchor: shot.narration_anchor || shot.editorial_purpose,
      semantic_rationale: shot.semantic_rationale || shot.editorial_purpose,
      trim_in_sec: shot.trim_in_sec,
      trim_out_sec: shot.trim_out_sec,
    });
  }

  for (const action of rebalance.actions || []) {
    if (action.decision !== "replace_contextual_footage") continue;
    const shot = shots[action.baseline_shot_index] || {};
    for (const replacement of action.replacement_assets || []) {
      const sceneId = sceneIdFromAsset(replacement.asset_path);
      const currentAssetPath = currentPathByScene.get(sceneId) || replacement.asset_path;
      addUse(currentAssetPath, {
        claim_id: action.claim_id,
        narration_anchor: shot.narration_anchor || shot.editorial_purpose || action.rationale,
        semantic_rationale: action.rationale,
        trim_in_sec: replacement.trim_in_sec,
        trim_out_sec: replacement.trim_out_sec,
      });
    }
  }

  const entries = (manifest.entries || []).map((entry) => {
    const approvedUses = [...(usesByPath.get(entry.asset_path)?.values() || [])];
    return {
      ...entry,
      approved_uses_if_visually_valid: approvedUses,
      review_blockers: approvedUses.length ? [] : ["No exact claim-specific use could be resolved for this asset."],
    };
  });

  const report = {
    schema_version: "1.0",
    project_id: projectId,
    generated_at: new Date().toISOString(),
    pending_review_count: entries.length,
    entries_with_exact_uses: entries.filter((entry) => entry.approved_uses_if_visually_valid.length > 0).length,
    entries,
  };
  await Promise.all([
    writeJsonAtomic(manifestFile, { ...manifest, generated_at: report.generated_at }),
    writeJsonAtomic(path.join(dir, "qa", "footage_review_queue.json"), report),
  ]);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args["project-id"] || args.project;
  if (!projectId) throw new Error("--project-id is required");
  printJson(await prepareFootageReviewQueue(projectId));
}
