#!/usr/bin/env node
// buildRenderManifest() -- the single writer of the review/final render
// manifests that scripts/orvyq_review_final_parity.mjs compares.
//
// Why this file exists: the manifest shape used to be hand-inlined as a
// `node -e "..."` heredoc in BOTH .github/workflows/orvyq-review.yml and
// .github/workflows/orvyq-final-encode.yml, while the verifier kept its own
// `SCHEMA_VERSION` constant and its unit tests built their own fixtures. The
// three copies drifted exactly the way ORVYQ_SYSTEM.md's change log warns a
// duplicated validation list always does: both workflows emitted
// `schema_version: '3.0'` while the verifier required "2.0" and its tests
// asserted "2.0", so every real Final Encode would have failed at "Verify
// review and final parity" -- a gate that had never actually run, because no
// final encode had reached it yet.
//
// Now the schema version, the identity field list and the manifest shape all
// come from one module, and both workflows call this script instead of
// re-describing the format. A future field change has one place to change and
// the parity verifier's own tests exercise this builder's real output.
import path from "node:path";
import { projectDir, readJson, writeJsonAtomic, parseArgs, printJson } from "./lib/fs-utils.mjs";
import { SCHEMA_VERSION, REQUIRED_IDENTITY_FIELDS } from "./orvyq_review_final_parity.mjs";

export const RENDER_PROFILES = Object.freeze(["review", "final"]);

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

// The identity section is derived ONLY from the frozen candidate -- never
// from workflow inputs -- so a review manifest and a final manifest built
// from the same candidate are identical by construction. `encode` and
// `artifact` carry everything that legitimately differs between the two
// renders and are never compared by the parity check.
export function buildRenderManifest({ projectId, candidate, encode = {}, artifact = {} }) {
  if (!projectId) throw new Error("buildRenderManifest requires a projectId");
  if (!candidate || typeof candidate !== "object") throw new Error("buildRenderManifest requires the frozen candidate object");
  const identity = candidate.canonical_candidate_identity;
  if (!identity) throw new Error("frozen_candidate.json has no canonical_candidate_identity -- it cannot be rendered under the current candidate-identity model");

  const profile = stringOrNull(encode.profile);
  if (!RENDER_PROFILES.includes(profile)) {
    throw new Error(`Unknown render profile "${encode.profile}". Expected one of: ${RENDER_PROFILES.join(", ")}`);
  }

  const manifest = {
    schema_version: SCHEMA_VERSION,
    project_id: projectId,
    identity: {
      candidate_hash: candidate.candidate_hash,
      render_bundle_hash: candidate.render_bundle_hash,
      edit_plan_hash: identity.edit_plan_hash,
      caption_hash: identity.caption_hash,
      final_mix_audio_hash: identity.final_mix_audio_hash || null,
      audio_mix_metadata_hash: identity.audio_mix_metadata_hash,
      asset_manifest_hash: identity.asset_manifest_hash || null,
      render_ready_source_hash: identity.render_ready_source_hash || null,
      renderer_source_hash: identity.renderer_source_tree_hash || null,
      total_frames: identity.total_frames,
      fps: identity.fps,
      frame_range: identity.selected_render_range,
    },
    encode: {
      profile,
      width: numberOrNull(encode.width),
      height: numberOrNull(encode.height),
      codec: stringOrNull(encode.codec),
      bitrate: stringOrNull(encode.bitrate),
      crf: numberOrNull(encode.crf),
      encoder_preset: stringOrNull(encode.encoder_preset),
    },
    artifact: {
      run_id: stringOrNull(artifact.run_id),
      validated_by_run_id: stringOrNull(artifact.validated_by_run_id),
      video_path: stringOrNull(artifact.video_path),
      video_sha256: stringOrNull(artifact.video_sha256),
    },
  };

  // Fail here, where the operator still has the run's context, rather than
  // letting an incomplete identity reach the parity check one workflow later.
  const missing = REQUIRED_IDENTITY_FIELDS.filter((field) => {
    const value = manifest.identity[field];
    return value === undefined || value === null || value === "";
  });
  if (missing.length) {
    throw new Error(`Cannot write a ${profile} render manifest: frozen candidate identity is missing ${missing.join(", ")}`);
  }

  return manifest;
}

export async function writeRenderManifest({ projectId, candidatePath, outputPath, encode, artifact }) {
  const dir = projectDir(projectId);
  const candidate = await readJson(candidatePath || path.join(dir, "qa", "frozen_candidate.json"));
  const manifest = buildRenderManifest({ projectId, candidate, encode, artifact });
  await writeJsonAtomic(outputPath, manifest);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args["project-id"];
  const outputPath = args.output;
  if (!projectId || !outputPath || !args.profile) {
    console.error(
      "Usage: node scripts/orvyq_render_manifest.mjs --project-id <id> --profile <review|final> --output <path> " +
        "[--candidate <path>] [--run-id <id>] [--validated-by-run-id <id>] [--video-path <path>] [--video-sha256 <hex>] " +
        "[--width <n>] [--height <n>] [--codec <name>] [--bitrate <rate>] [--crf <n>] [--encoder-preset <name>]"
    );
    process.exitCode = 1;
  } else {
    writeRenderManifest({
      projectId,
      candidatePath: args.candidate,
      outputPath,
      encode: {
        profile: args.profile,
        width: args.width,
        height: args.height,
        codec: args.codec,
        bitrate: args.bitrate,
        crf: args.crf,
        encoder_preset: args["encoder-preset"],
      },
      artifact: {
        run_id: args["run-id"],
        validated_by_run_id: args["validated-by-run-id"],
        video_path: args["video-path"],
        video_sha256: args["video-sha256"],
      },
    })
      .then((manifest) => printJson({ ok: true, ...manifest }))
      .catch((error) => {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exitCode = 1;
      });
  }
}
