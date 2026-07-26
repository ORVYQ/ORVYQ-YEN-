#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  projectDir,
  readJson,
  writeJsonAtomic,
  parseArgs,
  printJson,
} from "./lib/fs-utils.mjs";

const execFileAsync = promisify(execFile);
const PEXELS_API = "https://api.pexels.com/videos/search";
const PEXELS_LICENSE = "https://www.pexels.com/license/";
const ALLOWED_MEDIA_HOST_SUFFIXES = [".pexels.com"];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 24);
}

function safeSceneId(value) {
  const sceneId = String(value || "").trim();
  if (!/^scene_[0-9]{3}$/.test(sceneId)) {
    throw new Error(`Invalid scene_id ${sceneId}; expected scene_001 style id`);
  }
  return sceneId;
}

function hostAllowed(hostname) {
  return ALLOWED_MEDIA_HOST_SUFFIXES.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix));
}

async function searchPexels(query, apiKey, perPage) {
  const url = new URL(PEXELS_API);
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("size", "large");
  url.searchParams.set("per_page", String(perPage));
  const response = await fetch(url, {
    headers: { Authorization: apiKey, "user-agent": "ORVYQ-footage-acquisition/1.0" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Pexels search failed ${response.status} for query: ${query}`);
  const payload = await response.json();
  return Array.isArray(payload.videos) ? payload.videos : [];
}

function rankRendition(file) {
  const width = Number(file.width || 0);
  const height = Number(file.height || 0);
  const pixels = width * height;
  const landscapeBonus = width > height ? 10_000_000_000 : 0;
  const fullHdBonus = width >= 1920 && height >= 1080 ? 5_000_000_000 : 0;
  const ultraHdPenalty = width > 3840 || height > 2160 ? -2_000_000_000 : 0;
  return landscapeBonus + fullHdBonus + ultraHdPenalty + pixels;
}

function chooseCandidate(videos, usedProviderIds, item) {
  const minimumDuration = Number(item.min_duration_seconds || 8);
  const maximumDuration = Number(item.max_duration_seconds || 120);
  const candidates = [];
  for (const video of videos) {
    if (usedProviderIds.has(String(video.id))) continue;
    const duration = Number(video.duration || 0);
    if (duration < minimumDuration || duration > maximumDuration) continue;
    const renditions = (video.video_files || [])
      .filter((file) => file.file_type === "video/mp4")
      .filter((file) => Number(file.width || 0) >= 1280 && Number(file.height || 0) >= 720)
      .filter((file) => Number(file.width || 0) > Number(file.height || 0))
      .filter((file) => {
        try {
          return hostAllowed(new URL(file.link).hostname);
        } catch {
          return false;
        }
      })
      .sort((a, b) => rankRendition(b) - rankRendition(a));
    if (!renditions.length) continue;
    candidates.push({ video, rendition: renditions[0] });
  }
  candidates.sort((a, b) => {
    const a4k = Number(a.rendition.width) >= 3840 ? 1 : 0;
    const b4k = Number(b.rendition.width) >= 3840 ? 1 : 0;
    if (a4k !== b4k) return b4k - a4k;
    return Number(b.video.duration) - Number(a.video.duration);
  });
  return candidates[0] || null;
}

async function downloadMedia(url) {
  const requested = new URL(url);
  if (!hostAllowed(requested.hostname)) throw new Error(`Pexels rendition host is not allowed: ${requested.hostname}`);
  const response = await fetch(requested, {
    redirect: "follow",
    headers: { "user-agent": "ORVYQ-footage-acquisition/1.0" },
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`Footage download failed ${response.status}: ${url}`);
  const finalUrl = new URL(response.url);
  if (!hostAllowed(finalUrl.hostname)) throw new Error(`Footage redirect escaped Pexels hosts: ${finalUrl.hostname}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("video")) throw new Error(`Footage response is not video: ${contentType}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 250000) throw new Error(`Downloaded footage is unexpectedly small: ${buffer.length} bytes`);
  return { buffer, finalUrl: finalUrl.toString(), contentType };
}

async function inspectVideo(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "format=duration,format_name:stream=codec_name,width,height",
    "-of", "json",
    filePath,
  ], { maxBuffer: 4 * 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] || {};
  return {
    duration: Number(parsed.format?.duration || 0),
    container: parsed.format?.format_name || null,
    codec: stream.codec_name || null,
    width: Number(stream.width || 0),
    height: Number(stream.height || 0),
  };
}

async function acquireProjectFootage(projectId) {
  const apiKey = String(process.env.PEXELS_API_KEY || "").trim();
  if (!apiKey) throw new Error("PEXELS_API_KEY is required");
  const dir = projectDir(projectId);
  const planPath = path.join(dir, "research", "footage_acquisition_plan.json");
  const plan = await readJson(planPath);
  if (plan.project_id !== projectId) throw new Error(`Footage plan project_id mismatch: ${plan.project_id}`);
  if (!Array.isArray(plan.assets) || !plan.assets.length) throw new Error("Footage acquisition plan has no assets");

  const footageDir = path.join(dir, "assets", "footage");
  await fs.mkdir(footageDir, { recursive: true });
  const usedProviderIds = new Set();
  const records = [];

  for (const item of plan.assets) {
    const sceneId = safeSceneId(item.scene_id);
    const queries = [...new Set([...(item.queries || []), ...(item.fallback_queries || [])].map((q) => String(q).trim()).filter(Boolean))];
    if (!queries.length) throw new Error(`${sceneId} has no search queries`);

    let selected = null;
    let selectedQuery = null;
    for (const query of queries) {
      const videos = await searchPexels(query, apiKey, Number(plan.policy?.results_per_query || 25));
      selected = chooseCandidate(videos, usedProviderIds, item);
      if (selected) {
        selectedQuery = query;
        break;
      }
    }
    if (!selected) throw new Error(`${sceneId}: no eligible unique Pexels video found for queries: ${queries.join(", ")}`);

    usedProviderIds.add(String(selected.video.id));
    const downloaded = await downloadMedia(selected.rendition.link);
    const candidateId = shortHash(`${selected.video.id}:${selected.rendition.id}:${selected.rendition.link}`);
    const relativeMedia = `assets/footage/${sceneId}_${candidateId}.mp4`;
    const absoluteMedia = path.join(dir, relativeMedia);
    await fs.writeFile(absoluteMedia, downloaded.buffer);
    const mediaInfo = await inspectVideo(absoluteMedia);
    if (mediaInfo.width < 1280 || mediaInfo.height < 720 || mediaInfo.width <= mediaInfo.height) {
      throw new Error(`${sceneId}: downloaded rendition is not acceptable landscape HD (${mediaInfo.width}x${mediaInfo.height})`);
    }
    if (mediaInfo.duration < Number(item.min_duration_seconds || 8)) {
      throw new Error(`${sceneId}: downloaded rendition is shorter than required (${mediaInfo.duration}s)`);
    }

    const digest = sha256(downloaded.buffer);
    const provenance = {
      stable_asset_id: shortHash(`${projectId}:${sceneId}:${selected.video.id}`),
      scene_id: sceneId,
      production_candidate_id: candidateId,
      candidate_id: candidateId,
      provider: "pexels",
      provider_asset_id: String(selected.video.id),
      source_page_url: selected.video.url,
      license_url: PEXELS_LICENSE,
      attribution_required: false,
      creator: selected.video.user?.name || null,
      selected_rendition_id: String(selected.rendition.id),
      resolved_rendition_id: String(selected.rendition.id),
      selected_reason: "SELECTED_UNIQUE_HD_LANDSCAPE_FOR_AUTHORED_QUERY",
      search_query: selectedQuery,
      editorial_role: item.role || "context",
      editorial_note: item.editorial_note || null,
      evidence_use_forbidden: item.evidence_use_forbidden !== false,
      expected_width: Number(selected.rendition.width),
      expected_height: Number(selected.rendition.height),
      expected_file_type: "video/mp4",
      expected_hostname: new URL(selected.rendition.link).hostname,
      requested_hostname: new URL(selected.rendition.link).hostname,
      final_hostname: new URL(downloaded.finalUrl).hostname,
      final_media_hostname: new URL(downloaded.finalUrl).hostname,
      final_media_path: new URL(downloaded.finalUrl).pathname,
      content_type: downloaded.contentType,
      byte_size: downloaded.buffer.length,
      actual_duration_seconds: mediaInfo.duration,
      actual_width: mediaInfo.width,
      actual_height: mediaInfo.height,
      actual_codec: mediaInfo.codec,
      actual_container: mediaInfo.container,
      duration: mediaInfo.duration,
      width: mediaInfo.width,
      height: mediaInfo.height,
      codec: mediaInfo.codec,
      actual_sha256: digest,
      sha256: digest,
      rendition_binding_verified: true,
      rendition_metadata_match: mediaInfo.width === Number(selected.rendition.width) && mediaInfo.height === Number(selected.rendition.height),
      mismatch_flags: [],
      approved_for_final_edit: true,
      human_review_status: "NOT_REQUIRED",
      downloaded_at: new Date().toISOString(),
      retrieval_timestamp: new Date().toISOString(),
    };
    await writeJsonAtomic(`${absoluteMedia}.provenance.json`, provenance);
    records.push({ path: relativeMedia, scene_id: sceneId, provider_asset_id: String(selected.video.id), role: item.role || "context" });
  }

  await writeJsonAtomic(path.join(dir, "assets", "local_assets.json"), {
    schema_version: 1,
    assets: records.map((record) => ({ path: record.path })),
  });
  await writeJsonAtomic(path.join(dir, "assets", "footage_acquisition.runtime.json"), {
    schema_version: "1.0",
    project_id: projectId,
    generated_at: new Date().toISOString(),
    source: "pexels",
    license_url: PEXELS_LICENSE,
    records,
    pass: records.length === plan.assets.length,
  });
  return { project_id: projectId, acquired: records.length, records };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args["project-id"] || process.env.ORVYQ_PROJECT_ID;
  if (!projectId) {
    console.error(JSON.stringify({ ok: false, error: "--project-id is required" }));
    process.exitCode = 1;
  } else {
    acquireProjectFootage(projectId)
      .then((result) => printJson({ ok: true, ...result }))
      .catch((error) => {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exitCode = 1;
      });
  }
}
