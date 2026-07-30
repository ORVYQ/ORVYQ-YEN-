#!/usr/bin/env node
import path from "node:path";
import { projectDir, readJson, writeJsonAtomic, parseArgs, printJson } from "./lib/fs-utils.mjs";

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

export async function prepareFootageReviewQueue(projectId) {
  const dir = projectDir(projectId);
  const [manifest, editorial, rebalance, blueprint] = await Promise.all([
    readJson(path.join(dir, "qa", "footage_contact_sheets.json")),
    readJson(path.join(dir, "config", "editorial_asset_plan.json")),
    readJson(path.join(dir, "direction", "visual_rebalance_plan.json")),
    readJson(path.join(dir, "direction", "editorial_blueprint.json")),
  ]);

  const usesByPath = new Map();
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

  const shots = blueprint.full_production?.shots || [];
  for (const action of rebalance.actions || []) {
    if (action.decision !== "replace_contextual_footage") continue;
    const shot = shots[action.baseline_shot_index] || {};
    for (const replacement of action.replacement_assets || []) {
      addUse(replacement.asset_path, {
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
  await writeJsonAtomic(path.join(dir, "qa", "footage_review_queue.json"), report);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args["project-id"] || args.project;
  if (!projectId) throw new Error("--project-id is required");
  printJson(await prepareFootageReviewQueue(projectId));
}
