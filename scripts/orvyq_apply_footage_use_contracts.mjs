#!/usr/bin/env node
import path from "node:path";
import {
  projectDir,
  readJson,
  writeJsonAtomic,
  parseArgs,
  printJson,
} from "./lib/fs-utils.mjs";

function sceneIdFromAsset(assetPath) {
  const match = String(assetPath || "").match(/(?:^|\/)scene_(\d{3})(?:_|\.mp4)/);
  return match ? `scene_${match[1]}` : null;
}

function targetKey(claimId, sliceIndex) {
  return `${claimId}:${Number(sliceIndex)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function applyFootageUseContracts(projectId) {
  const dir = projectDir(projectId);
  const files = {
    contracts: path.join(dir, "research", "footage_use_contracts.json"),
    editorial: path.join(dir, "config", "editorial_asset_plan.json"),
    runtime: path.join(dir, "assets", "footage_acquisition.runtime.json"),
    plan: path.join(dir, "research", "footage_acquisition_plan.json"),
    blueprint: path.join(dir, "direction", "editorial_blueprint.json"),
  };
  const [contracts, editorial, runtime, plan, blueprint] = await Promise.all([
    readJson(files.contracts),
    readJson(files.editorial),
    readJson(files.runtime),
    readJson(files.plan),
    readJson(files.blueprint),
  ]);
  for (const [label, value] of Object.entries({ contracts, editorial, runtime, plan, blueprint })) {
    if (value.project_id !== projectId) throw new Error(`${label} project_id does not match ${projectId}`);
  }

  const managedScenes = new Set(contracts.managed_scene_ids || []);
  const prunedScenes = new Set(contracts.pruned_scene_ids || []);
  const assignments = contracts.assignments || [];
  const targetKeys = new Set(assignments.map((item) => targetKey(item.claim_id, item.slice_index)));
  const duplicateTargets = assignments.length - targetKeys.size;
  if (duplicateTargets) throw new Error(`footage_use_contracts has ${duplicateTargets} duplicate claim/slice target(s)`);

  const currentByScene = new Map((runtime.records || []).map((record) => [record.scene_id, record]));
  const provenanceByScene = new Map();
  for (const record of runtime.records || []) {
    provenanceByScene.set(record.scene_id, await readJson(path.join(dir, `${record.path}.provenance.json`)));
  }

  const shots = blueprint.full_production?.shots || [];
  const shotsByTarget = new Map();
  for (const shot of shots) {
    if (!Number.isInteger(shot.source_slice_index)) continue;
    const key = targetKey(shot.claim_id, shot.source_slice_index);
    const list = shotsByTarget.get(key) || [];
    list.push(shot);
    shotsByTarget.set(key, list);
  }

  editorial.footage_assignments ||= {};
  let removedAssignments = 0;
  for (const [claimId, claimAssignments] of Object.entries(editorial.footage_assignments)) {
    for (const [sliceIndex, assignment] of Object.entries(claimAssignments || {})) {
      const sceneId = sceneIdFromAsset(assignment?.asset);
      if (managedScenes.has(sceneId) || targetKeys.has(targetKey(claimId, sliceIndex))) {
        delete claimAssignments[sliceIndex];
        removedAssignments += 1;
      }
    }
    if (!Object.keys(claimAssignments).length) delete editorial.footage_assignments[claimId];
  }

  const assignmentByTarget = new Map();
  const sceneUseCounts = new Map();
  for (const contract of assignments) {
    if (prunedScenes.has(contract.scene_id)) throw new Error(`${contract.scene_id} is both pruned and assigned`);
    const record = currentByScene.get(contract.scene_id);
    if (!record) throw new Error(`${contract.scene_id}: no current runtime record`);
    const key = targetKey(contract.claim_id, contract.slice_index);
    const targetShots = shotsByTarget.get(key) || [];
    if (!targetShots.length) throw new Error(`${key}: no blueprint shot exists for the contracted source slice`);
    const narrationAnchor = String(targetShots[0].narration_anchor || targetShots[0].editorial_purpose || "").trim();
    if (narrationAnchor.length < 8) throw new Error(`${key}: contracted target has no usable narration anchor`);
    const count = (sceneUseCounts.get(contract.scene_id) || 0) + 1;
    sceneUseCounts.set(contract.scene_id, count);
    editorial.footage_assignments[contract.claim_id] ||= {};
    editorial.footage_assignments[contract.claim_id][String(contract.slice_index)] = {
      asset: record.path,
      trimInRatio: Number(contract.trim_in_ratio || 0),
      motion: contract.motion || "hold",
      role: contract.role || record.role || "context",
      semantic_anchor: narrationAnchor,
      semantic_rationale: contract.semantic_rationale,
      semantic_link: contract.semantic_link || "physical",
      ...(count > 1
        ? { reuse_reason: `A deliberate claim-bound reuse of ${contract.scene_id} at a distinct narration target and trim window.` }
        : {}),
    };
    assignmentByTarget.set(key, { ...contract, record, narrationAnchor });
  }

  const activeRecords = (runtime.records || []).filter((record) => !prunedScenes.has(record.scene_id));
  editorial.full_footage_pool = [...new Set(activeRecords.map((record) => record.path))];
  editorial.generation_policy =
    "claim-bound footage use contracts; one scene may appear only at explicitly listed claim/slice targets; current runtime paths are resolved by scene id; no automatic backfill or scene-id-wide reassignment";

  const nextShots = clone(shots);
  const nextShotsByTarget = new Map();
  for (const shot of nextShots) {
    if (!Number.isInteger(shot.source_slice_index)) continue;
    const key = targetKey(shot.claim_id, shot.source_slice_index);
    const list = nextShotsByTarget.get(key) || [];
    list.push(shot);
    nextShotsByTarget.set(key, list);
  }

  let materializedShotCount = 0;
  const deferredTargets = [];
  for (const [key, assignment] of assignmentByTarget.entries()) {
    const targetShots = nextShotsByTarget.get(key) || [];
    const provenance = provenanceByScene.get(assignment.scene_id);
    const sourceDuration = Number(provenance?.actual_duration_seconds || provenance?.duration || 0);
    const totalShotDuration = targetShots.reduce((sum, shot) => sum + Number(shot.duration || 0), 0);
    if (!(sourceDuration > 0)) throw new Error(`${assignment.scene_id}: provenance has no valid duration`);
    if (totalShotDuration > sourceDuration + 0.001) {
      deferredTargets.push({
        target: key,
        scene_id: assignment.scene_id,
        required_seconds: totalShotDuration,
        available_seconds: sourceDuration,
      });
      continue;
    }
    const requestedStart = Number(assignment.trim_in_ratio || 0) * sourceDuration;
    let trimCursor = Math.max(0, Math.min(requestedStart, sourceDuration - totalShotDuration));
    for (const shot of targetShots) {
      const duration = Number(shot.duration || 0);
      const trimIn = Math.round(trimCursor * 1000) / 1000;
      const trimOut = Math.round((trimCursor + duration) * 1000) / 1000;
      shot.asset_type = "footage";
      shot.asset = assignment.record.path;
      shot.visual_role = assignment.role || assignment.record.role || "context";
      shot.motion = assignment.motion || "hold";
      shot.trim_in_sec = trimIn;
      shot.trim_out_sec = trimOut;
      shot.semantic_rationale = assignment.semantic_rationale;
      shot.semantic_link = assignment.semantic_link || "physical";
      shot.generic_stock = provenance.provider === "pexels";
      delete shot.evidence;
      delete shot.graphic;
      trimCursor = trimOut;
      materializedShotCount += 1;
    }
  }
  blueprint.full_production.shots = nextShots;

  editorial.last_footage_use_contract_application = {
    generated_at: new Date().toISOString(),
    managed_scene_count: managedScenes.size,
    pruned_scene_count: prunedScenes.size,
    assignment_count: assignments.length,
    removed_previous_assignments: removedAssignments,
    deferred_targets: deferredTargets,
  };

  const originalPlanCount = (plan.assets || []).length;
  plan.assets = (plan.assets || []).filter((item) => !prunedScenes.has(item.scene_id));
  plan.planned_asset_count = plan.assets.length;
  plan.use_contract = "research/footage_use_contracts.json";

  await Promise.all([
    writeJsonAtomic(files.editorial, editorial),
    writeJsonAtomic(files.plan, plan),
    writeJsonAtomic(files.blueprint, blueprint),
  ]);
  return {
    project_id: projectId,
    assignment_count: assignments.length,
    materialized_shot_count: materializedShotCount,
    deferred_target_count: deferredTargets.length,
    removed_previous_assignments: removedAssignments,
    pruned_plan_assets: originalPlanCount - plan.assets.length,
    active_plan_assets: plan.assets.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args["project-id"] || args.project;
  if (!projectId) throw new Error("--project-id is required");
  applyFootageUseContracts(projectId)
    .then((result) => printJson({ ok: true, ...result }))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
