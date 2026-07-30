#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { projectDir, readJson, writeJsonAtomic, parseArgs, printJson } from "./lib/fs-utils.mjs";

const execFileAsync = promisify(execFile);
const PEXELS_API = "https://api.pexels.com/videos/search";
const PEXELS_LICENSE = "https://www.pexels.com/license/";
const MAX_WIDTH = 1920;

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shortHash = (value) => hash(Buffer.from(String(value))).slice(0, 24);
const sceneId = (value) => {
  const id = String(value || "").trim();
  if (!/^scene_[0-9]{3}$/.test(id)) throw new Error(`Invalid scene_id ${id}`);
  return id;
};
const exists = async (file) => fs.access(file).then(() => true, () => false);
const readOptionalJson = async (file, fallback) => exists(file).then((ok) => ok ? readJson(file) : fallback);
const allowedHost = (hostname) => hostname === "pexels.com" || hostname.endsWith(".pexels.com");

function normalizeText(value) {
  let decoded = String(value || "");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the undecoded value when a provider URL contains malformed escapes.
  }
  return decoded
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchesSemanticText(value, item) {
  const constraints = item.semantic_title_constraints;
  if (!constraints) return true;
  const haystack = normalizeText(value);
  const groups = Array.isArray(constraints.required_any_groups)
    ? constraints.required_any_groups
    : [];
  for (const group of groups) {
    const terms = Array.isArray(group) ? group : [];
    if (!terms.length || !terms.some((term) => haystack.includes(normalizeText(term)))) {
      return false;
    }
  }
  const forbidden = Array.isArray(constraints.forbidden_terms)
    ? constraints.forbidden_terms
    : [];
  return !forbidden.some((term) => haystack.includes(normalizeText(term)));
}

export function matchesSemanticMetadata(video, item) {
  return matchesSemanticText(`${video?.url || ""} ${video?.user?.name || ""}`, item);
}

export function validateAssignment(item) {
  const a = item.editorial_assignment;
  if (!a) return null;
  const claimId = String(a.claim_id || "").trim();
  const sliceIndex = Number(a.slice_index);
  if (!/^CLM_[A-Z0-9_]+$/.test(claimId)) throw new Error(`${item.scene_id}: invalid editorial claim_id`);
  if (!Number.isInteger(sliceIndex) || sliceIndex < 0) throw new Error(`${item.scene_id}: invalid editorial slice_index`);
  if (!String(a.narration_anchor || "").trim()) throw new Error(`${item.scene_id}: narration_anchor is required`);
  if (String(a.semantic_rationale || item.editorial_note || "").trim().length < 24) {
    throw new Error(`${item.scene_id}: claim-specific semantic_rationale is required`);
  }
  return { claimId, sliceIndex };
}

export function collectRejectedProviderAssetIds(semantic, reviews = {}) {
  return new Set([
    ...Object.values(semantic.scenes || {}).flatMap((scene) => scene.rejected_provider_asset_ids || []),
    ...(reviews.rejected_assets || []).map((asset) => asset.provider_asset_id),
  ].map(String));
}

export function validateCapacityTarget(plan) {
  const target = plan.capacity_target;
  if (!target) return null;
  const baseline = Number(target.baseline_pure_graphics_fraction);
  const ceiling = Number(target.maximum_pure_graphics_fraction);
  const duration = Number(target.candidate_duration_seconds);
  const required = Number(target.minimum_graphic_seconds_to_replace);
  const items = plan.assets.filter((item) => item.editorial_assignment?.replace_graphic_break === true);
  const planned = items.reduce((sum, item) => sum + Number(item.editorial_assignment.expected_replacement_seconds || 0), 0);
  if (!(baseline > ceiling && ceiling >= 0 && baseline <= 1)) throw new Error("Invalid capacity_target graphics fractions");
  if (!(duration > 0 && required > 0)) throw new Error("Invalid capacity_target duration/replacement seconds");
  const calculated = (baseline - ceiling) * duration;
  if (required + 0.5 < calculated) throw new Error(`Required replacement ${required}s is below calculated minimum ${calculated.toFixed(2)}s`);
  if (planned + 0.01 < required) throw new Error(`Planned replacements ${planned.toFixed(2)}s are below required ${required.toFixed(2)}s`);
  return { baseline, ceiling, duration, required, planned, assignment_count: items.length };
}

async function loadPlan(dir, projectId) {
  const plan = await readJson(path.join(dir, "research", "footage_acquisition_plan.json"));
  const semantic = await readOptionalJson(
    path.join(dir, "research", "footage_semantic_constraints.json"),
    { project_id: projectId, scenes: {} },
  );
  const reviews = await readOptionalJson(
    path.join(dir, "research", "visual_asset_reviews.json"),
    { project_id: projectId, rejected_assets: [] },
  );
  if (semantic.project_id !== projectId) {
    throw new Error("footage_semantic_constraints project_id mismatch");
  }
  if (reviews.project_id !== projectId) {
    throw new Error("visual_asset_reviews project_id mismatch");
  }
  const globallyRejected = collectRejectedProviderAssetIds(semantic, reviews);
  plan.assets = plan.assets.map((item) => {
    const constraint = semantic.scenes?.[item.scene_id];
    return {
      ...item,
      ...(constraint
        ? {
            queries: constraint.queries || item.queries,
            fallback_queries: constraint.fallback_queries || item.fallback_queries,
            force_reacquire: true,
            semantic_title_constraints: {
              required_any_groups: constraint.required_any_groups || [],
              forbidden_terms: constraint.forbidden_terms || [],
            },
          }
        : {}),
      rejected_provider_asset_ids: [...globallyRejected],
    };
  });
  return plan;
}

async function search(query, key, perPage) {
  const url = new URL(PEXELS_API);
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("size", "large");
  url.searchParams.set("per_page", String(perPage));
  const response = await fetch(url, {
    headers: { Authorization: key, "user-agent": "ORVYQ-demand-footage/1.1" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Pexels search ${response.status}: ${query}`);
  return (await response.json()).videos || [];
}

function pick(videos, usedIds, item) {
  const min = Number(item.min_duration_seconds || 8);
  const max = Number(item.max_duration_seconds || 120);
  const candidates = [];
  for (const video of videos) {
    if (usedIds.has(String(video.id)) || video.duration < min || video.duration > max) continue;
    if (!matchesSemanticMetadata(video, item)) continue;
    const files = (video.video_files || []).filter((file) =>
      file.file_type === "video/mp4" &&
      file.width >= 1280 &&
      file.height >= 720 &&
      file.width > file.height &&
      allowedHost(new URL(file.link).hostname)
    );
    if (!files.length) continue;
    files.sort((a, b) => Math.abs(a.width * a.height - 1920 * 1080) - Math.abs(b.width * b.height - 1920 * 1080));
    candidates.push({ video, rendition: files[0] });
  }
  candidates.sort((a, b) => Math.abs(a.video.duration - (min + 4)) - Math.abs(b.video.duration - (min + 4)));
  return candidates[0] || null;
}

async function probe(file) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "format=duration,format_name:stream=codec_name,width,height",
    "-of", "json",
    file,
  ]);
  const data = JSON.parse(stdout);
  const stream = data.streams?.[0] || {};
  return {
    duration: Number(data.format?.duration || 0),
    container: data.format?.format_name,
    codec: stream.codec_name,
    width: Number(stream.width || 0),
    height: Number(stream.height || 0),
  };
}

async function acquireOne(projectId, dir, item, key, usedIds, policy) {
  const id = sceneId(item.scene_id);
  const queries = [...new Set([...(item.queries || []), ...(item.fallback_queries || [])]
    .map(String)
    .map((query) => query.trim())
    .filter(Boolean))];
  let selected;
  let selectedQuery;
  for (const query of queries) {
    selected = pick(await search(query, key, Number(policy.results_per_query || 30)), usedIds, item);
    if (selected) {
      selectedQuery = query;
      break;
    }
  }
  if (!selected) throw new Error(`${id}: no unique semantically eligible Pexels clip found`);
  usedIds.add(String(selected.video.id));
  const candidate = shortHash(`${selected.video.id}:${selected.rendition.id}:${selected.rendition.link}`);
  const relative = `assets/footage/${id}_${candidate}.mp4`;
  const output = path.join(dir, relative);
  const source = `${output}.source.mp4`;
  const requested = Math.min(
    Number(policy.maximum_output_clip_seconds || 16),
    Number(item.min_duration_seconds || 8) + 4,
    Number(selected.video.duration),
  );
  const mediaResponse = await fetch(selected.rendition.link, {
    redirect: "follow",
    signal: AbortSignal.timeout(180000),
  });
  if (!mediaResponse.ok || !String(mediaResponse.headers.get("content-type") || "").includes("video")) {
    throw new Error(`${id}: invalid media response`);
  }
  if (!allowedHost(new URL(mediaResponse.url).hostname)) throw new Error(`${id}: media redirect left Pexels`);
  const sourceBuffer = Buffer.from(await mediaResponse.arrayBuffer());
  await fs.writeFile(source, sourceBuffer);
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-i", source,
      "-t", String(requested),
      "-vf", `scale='min(${MAX_WIDTH},iw)':-2`,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-an",
      output,
    ], { maxBuffer: 20 * 1024 * 1024 });
  } finally {
    await fs.rm(source, { force: true });
  }
  const info = await probe(output);
  if (
    info.width < 1280 ||
    info.height < 720 ||
    info.width <= info.height ||
    info.duration + 0.05 < Number(item.min_duration_seconds || 8)
  ) {
    throw new Error(`${id}: compacted media failed HD/duration validation`);
  }
  const buffer = await fs.readFile(output);
  const digest = hash(buffer);
  const semanticVerified = Boolean(item.semantic_title_constraints);
  const provenance = {
    stable_asset_id: shortHash(`${projectId}:${id}:${selected.video.id}`),
    scene_id: id,
    provider: "pexels",
    provider_asset_id: String(selected.video.id),
    source_page_url: selected.video.url,
    license_url: PEXELS_LICENSE,
    creator: selected.video.user?.name || null,
    attribution_required: false,
    search_query: selectedQuery,
    editorial_role: item.role || "context",
    editorial_note: item.editorial_note || null,
    narration_anchor: item.editorial_assignment?.narration_anchor || null,
    target_claim_id: item.editorial_assignment?.claim_id || null,
    target_slice_index: item.editorial_assignment?.slice_index ?? null,
    evidence_use_forbidden: true,
    semantic_metadata_verified: semanticVerified,
    semantic_metadata_constraints: item.semantic_title_constraints || null,
    duration: info.duration,
    actual_duration_seconds: info.duration,
    width: info.width,
    height: info.height,
    codec: info.codec,
    actual_width: info.width,
    actual_height: info.height,
    actual_codec: info.codec,
    actual_container: info.container,
    byte_size: buffer.length,
    sha256: digest,
    actual_sha256: digest,
    transformed_for_edit: true,
    selected_rendition_id: String(selected.rendition.id),
    selected_reason: semanticVerified
      ? "NARRATION_ANCHORED_UNIQUE_HD_AND_SOURCE_TITLE_CONSTRAINED"
      : "NARRATION_ANCHORED_UNIQUE_HD_CONTEXT",
    approved_for_final_edit: false,
    human_review_status: "PENDING_FRAME_REVIEW",
    downloaded_at: new Date().toISOString(),
  };
  await writeJsonAtomic(`${output}.provenance.json`, provenance);
  return {
    path: relative,
    scene_id: id,
    provider_asset_id: String(selected.video.id),
    role: item.role || "context",
  };
}

async function reusable(dir, record, id, item) {
  if (!record?.path || record.scene_id !== id) return null;
  const media = path.join(dir, record.path);
  const provenanceFile = `${media}.provenance.json`;
  if (!(await exists(media)) || !(await exists(provenanceFile))) return null;
  const provenance = await readJson(provenanceFile);
  if (provenance.approved_for_final_edit !== true || provenance.scene_id !== id) return null;
  const rejected = new Set((item.rejected_provider_asset_ids || []).map(String));
  if (rejected.has(String(provenance.provider_asset_id))) return null;
  if (!matchesSemanticText(`${provenance.source_page_url || ""} ${provenance.creator || ""}`, item)) return null;
  return {
    path: record.path,
    scene_id: id,
    provider_asset_id: String(provenance.provider_asset_id),
    role: record.role || provenance.editorial_role || "context",
  };
}

export async function materializeAssignments(dir, plan, records) {
  const items = plan.assets.filter((item) => item.editorial_assignment);
  if (!items.length) return { assignments: 0, replaced_graphics: 0 };
  const file = path.join(dir, "config", "editorial_asset_plan.json");
  const editorial = await readJson(file);
  editorial.footage_assignments ||= {};
  editorial.graphic_break_assignments ||= {};
  editorial.full_footage_pool ||= [];
  const recordByScene = new Map(records.map((record) => [record.scene_id, record]));
  const targets = new Set();
  const retiredPaths = new Set();
  let replaced = 0;
  for (const item of items) {
    const { claimId, sliceIndex } = validateAssignment(item);
    const index = String(sliceIndex);
    const target = `${claimId}:${index}`;
    if (targets.has(target)) throw new Error(`Duplicate editorial target ${target}`);
    targets.add(target);
    const record = recordByScene.get(item.scene_id);
    if (!record) throw new Error(`${item.scene_id}: no resolved runtime record`);
    const oldGraphic = editorial.graphic_break_assignments?.[claimId]?.[index];
    const oldFootage = editorial.footage_assignments?.[claimId]?.[index];
    const sameSemanticTarget =
      oldFootage &&
      String(oldFootage.semantic_anchor || "") === String(item.editorial_assignment.narration_anchor || "");
    if (
      item.editorial_assignment.replace_graphic_break &&
      !oldGraphic &&
      oldFootage?.asset !== record.path &&
      !sameSemanticTarget &&
      item.force_reacquire !== true
    ) {
      throw new Error(`${target}: expected graphic target is missing`);
    }
    if (oldFootage?.asset && oldFootage.asset !== record.path) retiredPaths.add(oldFootage.asset);
    editorial.footage_assignments[claimId] ||= {};
    editorial.footage_assignments[claimId][index] = {
      asset: record.path,
      trimInRatio: Number(item.editorial_assignment.trim_in_ratio || 0),
      motion: item.editorial_assignment.motion || "hold",
      role: item.editorial_assignment.role || item.role || "context",
      semantic_anchor: item.editorial_assignment.narration_anchor,
      semantic_rationale: item.editorial_assignment.semantic_rationale || item.editorial_note || null,
      semantic_link: item.editorial_assignment.semantic_link || "physical",
    };
    if (oldGraphic) {
      delete editorial.graphic_break_assignments[claimId][index];
      if (!Object.keys(editorial.graphic_break_assignments[claimId]).length) {
        delete editorial.graphic_break_assignments[claimId];
      }
      replaced += 1;
    }
    if (!editorial.full_footage_pool.includes(record.path)) editorial.full_footage_pool.push(record.path);
  }
  const activePaths = new Set();
  for (const assignments of Object.values(editorial.footage_assignments)) {
    for (const assignment of Object.values(assignments || {})) {
      if (assignment?.asset) activePaths.add(assignment.asset);
    }
  }
  editorial.full_footage_pool = editorial.full_footage_pool.filter(
    (assetPath) => !retiredPaths.has(assetPath) || activePaths.has(assetPath),
  );
  editorial.generation_policy =
    "demand-led narration-anchored footage acquisition; exact downloaded paths replace only explicit graphic targets; source-title semantic constraints reject clear metadata mismatches before download; no fixed clip-count completion and no silent fallback";
  editorial.last_supplemental_footage_materialization = {
    generated_at: new Date().toISOString(),
    assignments: items.length,
    replaced_graphics: replaced,
    retired_paths: [...retiredPaths],
  };
  await writeJsonAtomic(file, editorial);
  return { assignments: items.length, replaced_graphics: replaced, retired_paths: retiredPaths.size };
}

export async function acquireDemandFootage(projectId) {
  const key = String(process.env.PEXELS_API_KEY || "").trim();
  if (!key) throw new Error("PEXELS_API_KEY is required");
  const dir = projectDir(projectId);
  const plan = await loadPlan(dir, projectId);
  if (plan.project_id !== projectId || !Array.isArray(plan.assets) || !plan.assets.length) {
    throw new Error("Invalid footage acquisition plan");
  }
  const ids = plan.assets.map((item) => sceneId(item.scene_id));
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate scene_id in footage plan");
  plan.assets.forEach(validateAssignment);
  const capacity = validateCapacityTarget(plan);
  const runtimeFile = path.join(dir, "assets", "footage_acquisition.runtime.json");
  const previous = await readOptionalJson(runtimeFile, { records: [] });
  const previousByScene = new Map((previous.records || []).map((record) => [record.scene_id, record]));
  const usedIds = new Set((previous.records || [])
    .map((record) => String(record.provider_asset_id || ""))
    .filter(Boolean));
  for (const item of plan.assets) {
    for (const rejected of item.rejected_provider_asset_ids || []) usedIds.add(String(rejected));
  }
  await fs.mkdir(path.join(dir, "assets", "footage"), { recursive: true });
  const records = [];
  let acquired = 0;
  let reused = 0;
  for (const item of plan.assets) {
    const id = sceneId(item.scene_id);
    const previousRecord = previousByScene.get(id);
    const old = await reusable(dir, previousRecord, id, item);
    if (old) {
      records.push(old);
      usedIds.add(old.provider_asset_id);
      reused += 1;
      continue;
    }
    if (previousRecord?.path) {
      const oldMedia = path.join(dir, previousRecord.path);
      await fs.rm(oldMedia, { force: true });
      await fs.rm(`${oldMedia}.provenance.json`, { force: true });
    }
    records.push(await acquireOne(projectId, dir, item, key, usedIds, plan.policy || {}));
    acquired += 1;
  }
  await writeJsonAtomic(path.join(dir, "assets", "local_assets.json"), {
    schema_version: 1,
    assets: records.map(({ path: assetPath }) => ({ path: assetPath })),
  });
  await writeJsonAtomic(runtimeFile, {
    schema_version: "1.3-incremental-demand-led-semantic-metadata",
    project_id: projectId,
    generated_at: new Date().toISOString(),
    source: "pexels",
    license_url: PEXELS_LICENSE,
    planned_asset_count: plan.assets.length,
    acquired_this_run: acquired,
    reused_existing: reused,
    semantic_constraints_applied: plan.assets.filter((item) => item.semantic_title_constraints).length,
    records,
    pass: records.length === plan.assets.length,
  });
  const materialized = await materializeAssignments(dir, plan, records);
  return {
    project_id: projectId,
    acquired,
    reused,
    total: records.length,
    capacity,
    ...materialized,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args["project-id"] || process.env.ORVYQ_PROJECT_ID;
  acquireDemandFootage(projectId)
    .then((result) => printJson({ ok: true, ...result }))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
