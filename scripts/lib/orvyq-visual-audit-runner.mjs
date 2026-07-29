import path from "node:path";
import { projectDir, readJson, writeJsonAtomic } from "./fs-utils.mjs";
import {
  auditPresentationLook,
  auditVisualDiversity,
  auditMetadataLeakage,
  auditOpeningQuality,
  auditTextDensity,
  auditMotionContinuity,
} from "./orvyq-visual-audits.mjs";

const AUDITS = {
  presentation_look: auditPresentationLook,
  visual_diversity: auditVisualDiversity,
  metadata_leakage: auditMetadataLeakage,
  opening_quality: auditOpeningQuality,
  text_density: auditTextDensity,
  motion_continuity: auditMotionContinuity,
};

export async function runVisualAudit(projectId, auditName) {
  const audit = AUDITS[auditName];
  if (!audit) throw new Error(`Unknown visual audit ${auditName}`);
  const dir = projectDir(projectId);
  const plan = await readJson(path.join(dir, "direction", "edit_plan.json"));
  const openingPlan = auditName === "opening_quality"
    ? await readJson(path.join(dir, "direction", "opening_plan.json"))
    : null;
  const policy = plan.quality_policy?.visual_quality_limits || {};
  const result = auditName === "opening_quality" ? audit(plan, openingPlan) : audit(plan, policy);
  const report = {
    schema_version: "1.0-cinematic-visual-audit",
    project_id: projectId,
    audit: auditName,
    ...result,
  };
  await writeJsonAtomic(path.join(dir, "qa", `${auditName}_audit.json`), report);
  if (!report.pass) throw new Error(`ORVYQ ${auditName} audit failed: ${report.failures.join("; ")}`);
  return report;
}
