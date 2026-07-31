#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateLocalFootage } from "./orvyq_materialize_footage.mjs";
import {
  parseArgs,
  printJson,
  projectDir,
  readJson,
  writeJsonAtomic,
  pathExists,
} from "./lib/fs-utils.mjs";

export { validateLocalFootage };

function normalizeHash(value) {
  return String(value || "").trim().toLowerCase();
}

export async function reconcileActiveLocalFootage(projectId) {
  const dir = projectDir(projectId);
  const runtimeFile = path.join(dir, "assets", "footage_acquisition.runtime.json");
  const reviewsFile = path.join(dir, "research", "visual_asset_reviews.json");
  const localAssetsFile = path.join(dir, "assets", "local_assets.json");
  const [runtime, reviews] = await Promise.all([
    readJson(runtimeFile),
    readJson(reviewsFile),
  ]);
  if (runtime.project_id !== projectId || reviews.project_id !== projectId) {
    throw new Error(`Active footage reconciliation project_id mismatch for ${projectId}`);
  }

  const approvedByProvider = new Map(
    (reviews.approved_assets || []).map((approval) => [String(approval.provider_asset_id), approval]),
  );
  const records = runtime.records || [];
  const unapproved = [];
  let repairedProvenance = 0;

  for (const record of records) {
    const providerId = String(record.provider_asset_id);
    const approval = approvedByProvider.get(providerId);
    const provenanceFile = path.join(dir, `${record.path}.provenance.json`);
    if (!(await pathExists(provenanceFile))) {
      throw new Error(`${record.scene_id}: active footage provenance is missing for ${record.path}`);
    }
    const provenance = await readJson(provenanceFile);
    if (String(provenance.provider_asset_id) !== providerId) {
      throw new Error(`${record.scene_id}: runtime and provenance provider identities differ`);
    }
    if (!approval) {
      unapproved.push(record.scene_id);
      continue;
    }
    const currentHash = normalizeHash(provenance.actual_sha256 || provenance.sha256);
    if (!currentHash || currentHash !== normalizeHash(approval.asset_sha256)) {
      throw new Error(`${record.scene_id}: canonical visual approval does not match active footage bytes`);
    }

    const needsRepair = provenance.approved_for_final_edit !== true ||
      normalizeHash(provenance.reviewed_asset_sha256) !== currentHash ||
      normalizeHash(provenance.reviewed_contact_sheet_sha256) !== normalizeHash(approval.contact_sheet_sha256);
    if (needsRepair) {
      provenance.approved_for_final_edit = true;
      provenance.visual_qa_status = "APPROVED_CLAIM_SPECIFIC_CONTACT_SHEET_REVIEW";
      provenance.visual_qa_origin = provenance.visual_qa_origin || "canonical_visual_review_registry";
      provenance.reviewed_asset_sha256 = approval.asset_sha256;
      provenance.reviewed_contact_sheet_sha256 = approval.contact_sheet_sha256;
      provenance.visual_qa_reason = provenance.visual_qa_reason ||
        "Approval restored from the canonical byte-bound visual review registry for the active runtime asset.";
      delete provenance.human_review_status;
      delete provenance.human_review_reason;
      delete provenance.fail_closed_reason;
      await writeJsonAtomic(provenanceFile, provenance);
      repairedProvenance += 1;
    }
  }

  if (unapproved.length) {
    throw new Error(`Active footage lacks canonical visual approval: ${unapproved.sort().join(", ")}`);
  }

  const localAssets = {
    schema_version: 1,
    assets: records.map((record) => ({ path: record.path })),
  };
  await writeJsonAtomic(localAssetsFile, localAssets);
  return {
    project_id: projectId,
    active_assets: records.length,
    repaired_provenance: repairedProvenance,
    local_assets_rebuilt: true,
  };
}

export async function reconcileAndValidateLocalFootage(projectId) {
  const reconciliation = await reconcileActiveLocalFootage(projectId);
  const validation = await validateLocalFootage(projectId);
  return { ...validation, reconciliation };
}

const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args["project-id"] || process.env.ORVYQ_PROJECT_ID;
  reconcileAndValidateLocalFootage(projectId)
    .then((result) => printJson({ ok: true, ...result }))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
