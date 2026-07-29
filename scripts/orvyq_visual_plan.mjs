#!/usr/bin/env node
import path from "node:path";
import { projectDir, readJson, writeJsonAtomic, parseArgs, printJson } from "./lib/fs-utils.mjs";
import { resolveProjectId } from "./lib/orvyq-project-profile.mjs";
import { loadCanonicalAjv } from "./lib/schema-validate.mjs";
import { attachVisualModules } from "./lib/orvyq-visual-module-selector.mjs";
import { buildOpeningPlan } from "./lib/orvyq-opening-engine.mjs";

export async function buildCinematicVisualPlan(projectId) {
  const dir = projectDir(projectId);
  const editPlanPath = path.join(dir, "direction", "edit_plan.json");
  const [plan, motionHook] = await Promise.all([
    readJson(editPlanPath),
    readJson(path.join(dir, "direction", "motion_hook.json")),
  ]);
  if (!Array.isArray(plan.shots) || !plan.shots.length) {
    throw new Error("Cinematic visual planning requires a populated canonical edit plan");
  }

  plan.shots = attachVisualModules(plan.shots, { fps: plan.fps });
  const openingPlan = buildOpeningPlan(plan, motionHook);
  const ajv = loadCanonicalAjv();
  const validateOpening = ajv.getSchema("opening_plan.schema.json");
  const validateModule = ajv.getSchema("visual_module.schema.json");
  if (!validateOpening?.(openingPlan)) throw new Error(`Opening plan schema validation failed: ${JSON.stringify(validateOpening?.errors || [])}`);
  for (const shot of plan.shots) {
    if (!validateModule?.(shot.visual_module)) throw new Error(`${shot.shot_id || "shot"} visual module schema validation failed: ${JSON.stringify(validateModule?.errors || [])}`);
  }
  plan.opening = {
    plan_schema_version: openingPlan.schema_version,
    selected_archetype: openingPlan.selected_archetype,
    selected_score: openingPlan.selected_score,
    central_question: openingPlan.central_question,
    title_reveal: openingPlan.title_reveal,
    first_evidence: openingPlan.first_evidence,
    visual_module_types: openingPlan.visual_module_types,
  };
  plan.quality_policy = {
    ...(plan.quality_policy || {}),
    cinematic_visual_module_engine: true,
    semantic_presentation_separation: true,
    metadata_labels_hidden_by_default: true,
    automatic_full_screen_card_fallback_forbidden: true,
    opening_quality_gate_required: true,
  };

  const moduleCounts = {};
  for (const shot of plan.shots) {
    const module = shot.visual_module?.selected_visual_module;
    if (!module) throw new Error(`${shot.shot_id || "shot"} has no selected_visual_module`);
    moduleCounts[module] = (moduleCounts[module] || 0) + 1;
  }
  const report = {
    schema_version: "1.0-cinematic-visual-plan",
    project_id: projectId,
    shot_count: plan.shots.length,
    module_counts: moduleCounts,
    opening: plan.opening,
    pass: true,
  };

  await writeJsonAtomic(editPlanPath, plan);
  await writeJsonAtomic(path.join(dir, "direction", "opening_plan.json"), openingPlan);
  await writeJsonAtomic(path.join(dir, "qa", "visual_module_plan.json"), report);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  let projectId;
  try {
    projectId = resolveProjectId(args);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message, code: error.code }));
    process.exitCode = 1;
  }
  if (projectId) {
    buildCinematicVisualPlan(projectId)
      .then((report) => printJson({ ok: true, ...report }))
      .catch((error) => {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exitCode = 1;
      });
  }
}
