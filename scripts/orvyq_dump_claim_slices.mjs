#!/usr/bin/env node
// Temporary diagnostic: dumps the REAL per-claim, per-slice narration
// windows (start/end/duration) that scripts/orvyq_full_production_plan.mjs
// computes internally, before any FOOTAGE_ASSIGNMENTS/GRAPHIC_BREAK_ASSIGNMENTS
// are applied -- slice boundaries come from real narration_alignment.json
// word timestamps only, never from footage choices. This lets a human editor
// see exactly where each claim's evidence-run breaks are needed (which
// slice index, how many real seconds) instead of guessing. Not part of the
// production pipeline; safe to delete once authoring is complete.
import path from "node:path";
import { projectDir, readJson, parseArgs, printJson } from "./lib/fs-utils.mjs";
import { loadResolvedEvidenceMap } from "./lib/orvyq-evidence.mjs";
import { tokenizeWords } from "./lib/orvyq-pause-resolver.mjs";
import { locateClaimWindow, sliceClaimWindow, applyEvidenceHoldToNextWindow } from "./orvyq_full_production_plan.mjs";
import { resolveProjectId } from "./lib/orvyq-project-profile.mjs";

const TITLE_CARD_SECONDS = 2.5;

async function main(projectId) {
  const dir = projectDir(projectId);
  const [blueprint, resolvedPausePlan, alignment, evidenceMap, sequencePlan] = await Promise.all([
    readJson(path.join(dir, "direction", "editorial_blueprint.json")),
    readJson(path.join(dir, "direction", "resolved_pause_plan.json")),
    readJson(path.join(dir, "voice", "narration_alignment.json")),
    loadResolvedEvidenceMap(dir),
    readJson(path.join(dir, "direction", "sequence_plan.json"))
  ]);
  const evidenceKindOverrides = sequencePlan.evidence_kind_overrides || {};
  const maxShotSeconds = blueprint.global_rules.max_shot_seconds;

  const sectionOrder = new Map(blueprint.full_production.sections.map((section, index) => [section.section_id, index]));
  const usableClaims = evidenceMap.claims
    .filter((claim) => claim.status !== "removed")
    .map((claim, originalIndex) => ({ claim, originalIndex }))
    .sort((a, b) => {
      const sectionDelta = (sectionOrder.get(a.claim.section_id) ?? 0) - (sectionOrder.get(b.claim.section_id) ?? 0);
      return sectionDelta !== 0 ? sectionDelta : a.originalIndex - b.originalIndex;
    })
    .map(({ claim }) => claim);

  const tokens = tokenizeWords(alignment.words);
  const narrationEnd = alignment.words.at(-1).end;

  const { pauses } = resolvedPausePlan;
  const pauseAnchorTimes = pauses.map((pause) => pause.source_time_seconds);

  let cursorTokenIndex = 0;
  const windows = [];
  for (const claim of usableClaims) {
    const { matchStart, matchEnd, nextSearchTokenIndex } = locateClaimWindow(tokens, claim, cursorTokenIndex);
    windows.push({ claim, matchStart, matchEnd });
    cursorTokenIndex = nextSearchTokenIndex;
  }
  for (let i = 0; i < windows.length; i += 1) {
    windows[i].coverStart = i === 0 ? 0 : windows[i - 1].matchEnd;
    windows[i].coverEnd = i === windows.length - 1 ? narrationEnd : windows[i].matchEnd;
  }

  const sections = blueprint.full_production.sections;
  const sectionFirstClaim = new Map();
  for (const window of windows) if (!sectionFirstClaim.has(window.claim.section_id)) sectionFirstClaim.set(window.claim.section_id, window.claim.claim_id);

  const report = [];
  let currentSection = null;
  for (const [windowIndex, window] of windows.entries()) {
    const isNewSection = window.claim.section_id !== currentSection;
    if (isNewSection) {
      currentSection = window.claim.section_id;
      window.coverStart += TITLE_CARD_SECONDS;
    }
    const slices = sliceClaimWindow(window.claim, window.coverStart, window.coverEnd, maxShotSeconds, tokens, pauseAnchorTimes, evidenceKindOverrides);
    applyEvidenceHoldToNextWindow(windows, windowIndex, window.coverEnd, slices);

    // Which slice each real pause anchor time falls inside, if any.
    const pausesInWindow = pauseAnchorTimes
      .map((t, pIdx) => ({ t, pIdx }))
      .filter(({ t }) => t >= window.coverStart - 0.05 && t < window.coverEnd + 0.05);

    report.push({
      claim_id: window.claim.claim_id,
      coverStart: Number(window.coverStart.toFixed(3)),
      coverEnd: Number(window.coverEnd.toFixed(3)),
      slice_count: slices.length,
      slices: slices.map((s, idx) => ({
        idx,
        start: Number(s.start.toFixed(3)),
        end: Number(s.end.toFixed(3)),
        dur: Number((s.end - s.start).toFixed(3))
      })),
      pause_anchor_times_in_window: pausesInWindow.map(({ t }) => Number(t.toFixed(3)))
    });
  }
  printJson({ ok: true, narration_end: narrationEnd, claims: report });
}

const args = parseArgs(process.argv.slice(2));
const projectId = resolveProjectId(args);
main(projectId).catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }));
  process.exitCode = 1;
});
