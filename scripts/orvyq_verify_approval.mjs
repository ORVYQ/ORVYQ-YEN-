#!/usr/bin/env node
// verifyApprovalRecord() / verifyFrozenCandidateFreshness() -- the gate a
// render (review or final) must pass before it's allowed to proceed.
//
// Approval identity model (task follow-up section 5): an approval is valid
// for a candidate if and only if candidate_hash + render_bundle_hash +
// candidate_source_sha all match the frozen candidate's own values. It is
// NOT gated on the current git HEAD SHA equaling the candidate's
// source_commit_sha -- that equality is what broke this in practice: the
// review workflow commits the frozen candidate, then a human approves it in
// a SEPARATE later commit, so by the time the final workflow runs, HEAD has
// moved past the commit the candidate was built from even though the
// candidate itself never changed. candidate_source_sha is carried as data
// (the source commit the candidate was actually built from) and compared
// for CONSISTENCY between the approval and the candidate, never against
// "whatever commit happens to be checked out right now."
//
// This replaces the earlier, stricter check (docs/canonical-candidate-audit.md):
// this repo's own history had a later proof run silently replace
// frozen_candidate.json without a matching new approval -- verifyApprovalRecord
// still catches exactly that, just via candidate_hash instead of a whole-file
// hash (which broke the moment created_at moved into operational_metadata,
// since a whole-file hash would change on every rebuild regardless of any
// real content change).
import path from "node:path";
import { projectDir, readJson, readJsonSafe, pathExists, parseArgs, printJson } from "./lib/fs-utils.mjs";
import { computeCanonicalFrozenCandidate } from "./orvyq_frozen_candidate.mjs";

const PROJECT_ID = process.env.ORVYQ_PROJECT_ID || null;

// The project-agnostic audits whose "warnings" arrays report editorial
// content shortfalls (real-evidence coverage, generic-card usage/margin,
// emphasis-beat pacing) without ever hard-failing on them -- see each
// script's own header comment for why a hard numeric fail was deliberately
// rejected in favor of always-honest warning reporting. verifyEditorialSignoff()
// below is what actually requires a human to have read these before a
// render is allowed to proceed; the list of report filenames is the only
// thing that ties it to those scripts. (orvyq_alignment_score.mjs's own
// qa/alignment_readiness.json report has no `warnings` array -- its
// unaddressed gap is different in shape: `human_rendered_video_review`
// is written as `{ required: true, status: "pending" }` on every run, and
// nothing anywhere ever reads that status back or transitions it. A signed,
// hash-matched qa/editorial_signoff.json IS that human review completing --
// see verifyEditorialSignoff()'s own comment.)
const EDITORIAL_WARNING_REPORT_FILES = ["real_asset_coverage_audit.json", "generic_card_audit.json", "tension_card_audit.json"];

async function collectCurrentEditorialWarnings(dir) {
  const warnings = [];
  for (const file of EDITORIAL_WARNING_REPORT_FILES) {
    const report = await readJsonSafe(path.join(dir, "qa", file));
    if (report && Array.isArray(report.warnings)) warnings.push(...report.warnings);
  }
  return warnings;
}

// Stage 1 (cheap, runs before any build step): confirms the approval on file
// still names the candidate actually committed at HEAD, for the right mode.
// Does NOT require direction/edit_plan.json, captions, the audio mix, or the
// asset registry to exist yet -- those are gitignored, pipeline-generated
// build outputs that don't exist until later steps run.
export async function verifyApprovalRecord(projectId = PROJECT_ID, { expectedMode = "full", approvedReviewRunId = null, actualReviewVideoSha256 = null } = {}) {
  const dir = projectDir(projectId);
  const approvalPath = path.join(dir, "qa", "proof_approval.json");
  const candidatePath = path.join(dir, "qa", "frozen_candidate.json");
  const failures = [];

  if (!(await pathExists(approvalPath)))
    return { pass: false, failures: ["No qa/proof_approval.json is committed -- render is blocked until a human approves a specific frozen candidate (schemas/proof_approval.schema.json)."] };
  if (!(await pathExists(candidatePath)))
    return { pass: false, failures: ["No qa/frozen_candidate.json is committed."] };

  const approval = await readJson(approvalPath);
  const storedCandidate = await readJson(candidatePath);
  const identity = storedCandidate.canonical_candidate_identity;

  if (approval.approved !== true) failures.push("qa/proof_approval.json.approved is not true.");

  if (!identity) {
    failures.push("qa/frozen_candidate.json has no canonical_candidate_identity -- it predates candidate-identity hardening and cannot be verified under the current model.");
    return { pass: false, failures, approval, storedCandidate };
  }

  if (!approval.candidate_hash) {
    failures.push("qa/proof_approval.json has no candidate_hash -- it predates candidate-identity hardening (see candidate_hash/render_bundle_hash/candidate_source_sha) and cannot approve a live candidate.");
  } else if (approval.candidate_hash !== storedCandidate.candidate_hash) {
    failures.push(
      `qa/proof_approval.json.candidate_hash (${approval.candidate_hash}) does not match the currently committed qa/frozen_candidate.json's own candidate_hash ` +
        `(${storedCandidate.candidate_hash}) -- the frozen candidate has changed (or been replaced) since this approval was recorded; the approval no longer covers what is on disk.`
    );
  }

  if (approval.render_bundle_hash && approval.render_bundle_hash !== storedCandidate.render_bundle_hash) {
    failures.push(`qa/proof_approval.json.render_bundle_hash (${approval.render_bundle_hash}) does not match the frozen candidate's render_bundle_hash (${storedCandidate.render_bundle_hash}).`);
  }

  // Consistency check ONLY -- this is deliberately NOT compared against the
  // current git HEAD. A commit that only adds/updates the approval record
  // (or any other metadata-only commit) moves HEAD without changing the
  // candidate the approval is about, and must never invalidate it.
  if (approval.candidate_source_sha && identity.source_commit_sha && approval.candidate_source_sha !== identity.source_commit_sha) {
    failures.push(
      `qa/proof_approval.json.candidate_source_sha (${approval.candidate_source_sha}) does not match qa/frozen_candidate.json's own source_commit_sha (${identity.source_commit_sha}) -- ` +
        "this approval was recorded against a different candidate build."
    );
  }

  if (identity.mode !== expectedMode)
    failures.push(`qa/frozen_candidate.json's mode is "${identity.mode}", not the required "${expectedMode}" -- no ${expectedMode}-mode candidate has been approved yet.`);

  // Task section 18: approval must belong to the FULL-LENGTH review
  // candidate, not a partial/short cut.
  if (Number.isFinite(approval.review_total_frames) && Number.isFinite(identity.total_frames) && approval.review_total_frames !== identity.total_frames) {
    failures.push(
      `qa/proof_approval.json.review_total_frames (${approval.review_total_frames}) does not equal the frozen candidate's own total_frames (${identity.total_frames}) -- ` +
        "only a review covering the full candidate can be approved; a partial-duration review cannot stand in for it."
    );
  }

  // The final workflow's own approved_review_run_id input (task section 5,
  // last rule) must name the exact review run the approval references.
  if (approvedReviewRunId && approval.review_run_id && approval.review_run_id !== String(approvedReviewRunId)) {
    failures.push(`qa/proof_approval.json.review_run_id (${approval.review_run_id}) does not match the run id given to this workflow (${approvedReviewRunId}).`);
  }

  // The actual downloaded review MP4's sha256 (computed by the caller from
  // the real file) must match what was approved -- catches a review
  // artifact that was silently replaced/re-uploaded after approval.
  if (actualReviewVideoSha256 && approval.review_video_sha256 && approval.review_video_sha256 !== actualReviewVideoSha256) {
    failures.push(`qa/proof_approval.json.review_video_sha256 (${approval.review_video_sha256}) does not match the actual review artifact's sha256 (${actualReviewVideoSha256}).`);
  }

  return { pass: failures.length === 0, failures, approval, storedCandidate };
}

// Editorial counterpart to verifyApprovalRecord(), checked alongside it at
// the same early stage. proof_approval.json approves that a human reviewed
// THIS candidate technically; editorial_signoff.json approves that a human
// has actually read the current editorial QA warnings for that same
// candidate and accepts them (see schemas/editorial_signoff.schema.json).
// This is also, concretely, what fulfills qa/alignment_readiness.json's own
// long-standing `human_rendered_video_review: { required: true, status:
// "pending" }` field -- that field has never had anything read it back or
// move it out of "pending"; an approved, hash-matched editorial_signoff.json
// for the same candidate is the human review it was always describing.
// Same identity model as the technical approval on purpose: candidate_hash
// ties the sign-off to one exact frozen candidate, so a re-edit/re-render
// invalidates it automatically with no extra logic, and it is intentionally
// NOT checked during Candidate Validation (same reasoning
// scripts/orvyq_edit_plan_tests.mjs already documents for proof_approval.json:
// no candidate exists yet for a human to review at that point, so requiring
// it there would just recreate the same circularity) -- it is a render gate,
// not a validation gate.
export async function verifyEditorialSignoff(projectId = PROJECT_ID) {
  const dir = projectDir(projectId);
  const signoffPath = path.join(dir, "qa", "editorial_signoff.json");
  const candidatePath = path.join(dir, "qa", "frozen_candidate.json");

  if (!(await pathExists(candidatePath))) return { pass: false, failures: ["No qa/frozen_candidate.json is committed."] };
  const storedCandidate = await readJson(candidatePath);

  if (!(await pathExists(signoffPath))) {
    return {
      pass: false,
      failures: ["No qa/editorial_signoff.json is committed -- render is blocked until a human reads the current editorial QA warnings for this exact candidate and signs off (schemas/editorial_signoff.schema.json)."]
    };
  }

  const signoff = await readJson(signoffPath);
  const failures = [];

  if (signoff.approved !== true) failures.push("qa/editorial_signoff.json.approved is not true.");

  if (!signoff.candidate_hash) {
    failures.push("qa/editorial_signoff.json has no candidate_hash and cannot approve a live candidate.");
  } else if (signoff.candidate_hash !== storedCandidate.candidate_hash) {
    failures.push(
      `qa/editorial_signoff.json.candidate_hash (${signoff.candidate_hash}) does not match the currently committed qa/frozen_candidate.json's own candidate_hash ` +
        `(${storedCandidate.candidate_hash}) -- the candidate has changed (or been replaced) since this editorial sign-off was recorded; it no longer covers what is on disk.`
    );
  }

  const identity = storedCandidate.canonical_candidate_identity;
  if (signoff.candidate_source_sha && identity?.source_commit_sha && signoff.candidate_source_sha !== identity.source_commit_sha) {
    failures.push(
      `qa/editorial_signoff.json.candidate_source_sha (${signoff.candidate_source_sha}) does not match qa/frozen_candidate.json's own source_commit_sha (${identity.source_commit_sha}) -- ` +
        "this sign-off was recorded against a different candidate build."
    );
  }

  const currentWarnings = await collectCurrentEditorialWarnings(dir);
  const acknowledged = new Set(signoff.acknowledged_warnings || []);
  const unacknowledged = currentWarnings.filter((warning) => !acknowledged.has(warning));
  if (unacknowledged.length) {
    failures.push(
      `qa/editorial_signoff.json does not acknowledge ${unacknowledged.length} current editorial warning(s), so it cannot have been reviewed against what is on disk now: ${unacknowledged.join("; ")}`
    );
  }

  return { pass: failures.length === 0, failures, signoff, storedCandidate, currentWarnings };
}

// Stage 2 (runs after the render bundle has been placed/assembled, right
// before rendering): recomputes a frozen candidate from those real files and
// confirms candidate_hash/render_bundle_hash still match the committed,
// approved candidate exactly -- proving what is about to render is the same
// bytes a human actually reviewed, not something silently regenerated
// differently in between. Reports which specific identity field first
// diverged, for diagnostics, even though the pass/fail decision is made on
// the hash alone.
export async function verifyFrozenCandidateFreshness(projectId = PROJECT_ID, { renderReadyDir } = {}) {
  const dir = projectDir(projectId);
  const candidatePath = path.join(dir, "qa", "frozen_candidate.json");
  const storedCandidate = await readJson(candidatePath);
  const fresh = await computeCanonicalFrozenCandidate(projectId, { renderReadyDir });
  const failures = [];

  if (fresh.candidate_hash !== storedCandidate.candidate_hash) {
    failures.push(`qa/frozen_candidate.json.candidate_hash (${storedCandidate.candidate_hash}) no longer matches what the current real project files produce (${fresh.candidate_hash}).`);
    const storedIdentity = storedCandidate.canonical_candidate_identity || {};
    const freshIdentity = fresh.canonical_candidate_identity || {};
    const allFields = new Set([...Object.keys(storedIdentity), ...Object.keys(freshIdentity)]);
    for (const field of allFields) {
      if (JSON.stringify(storedIdentity[field]) !== JSON.stringify(freshIdentity[field])) {
        failures.push(`  - canonical_candidate_identity.${field}: stored=${JSON.stringify(storedIdentity[field])} fresh=${JSON.stringify(freshIdentity[field])}`);
      }
    }
  }
  if (fresh.render_bundle_hash !== storedCandidate.render_bundle_hash) {
    failures.push(`qa/frozen_candidate.json.render_bundle_hash (${storedCandidate.render_bundle_hash}) no longer matches the current real render bundle (${fresh.render_bundle_hash}).`);
  }

  return { pass: failures.length === 0, failures, fresh, storedCandidate };
}

// Early stage checks both approvals together -- technical (proof_approval.json)
// and editorial (editorial_signoff.json) -- through this one CLI call, so the
// two existing invocations in .github/workflows/orvyq-final-encode.yml
// (--stage=early, --stage=late) needed no new workflow step to become
// editorial-aware.
async function verifyEarlyStage(projectId, options) {
  const [approval, editorial] = await Promise.all([verifyApprovalRecord(projectId, options), verifyEditorialSignoff(projectId)]);
  return { pass: approval.pass && editorial.pass, failures: [...approval.failures, ...editorial.failures], approval, editorial };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const stage = args.stage || "early";
  const run =
    stage === "late"
      ? verifyFrozenCandidateFreshness(args["project-id"] || PROJECT_ID, { renderReadyDir: args["render-ready-dir"] || undefined })
      : verifyEarlyStage(args["project-id"] || PROJECT_ID, { expectedMode: args.mode || "full", approvedReviewRunId: args["approved-review-run-id"] || null });
  run
    .then((result) => {
      printJson(result);
      if (!result.pass) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
