import fs from "node:fs";

function replaceOnce(filePath, before, after) {
  const source = fs.readFileSync(filePath, "utf8");
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${filePath}: patch anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${filePath}: patch anchor is not unique`);
  fs.writeFileSync(filePath, source.slice(0, first) + after + source.slice(first + before.length));
}

replaceOnce(
  "scripts/orvyq_edit_plan.mjs",
  `    const sourceDuration = Number(provenance.actual_duration_seconds || provenance.duration);\n    const trimIn = Number(spec.trim_in_sec || 0);\n    const trimOut = Number(spec.trim_out_sec || trimIn + duration);\n    if (!Number.isFinite(sourceDuration) || trimIn < 0 || trimOut <= trimIn || trimOut > sourceDuration + 0.02)`,
  `    const sourceDuration = Number(provenance.actual_duration_seconds || provenance.duration);\n    const trimIn = Number(spec.trim_in_sec || 0);\n    const playbackRate = Number(spec.playback_rate || 1);\n    if (!Number.isFinite(playbackRate) || playbackRate < 0.75 || playbackRate > 1)\n      throw new Error(\`full_production.shots[\${index}] playback_rate must stay within the system cinematic range 0.75-1.00\`);\n    const trimOut = Number(spec.trim_out_sec || trimIn + duration * playbackRate);\n    if (!Number.isFinite(sourceDuration) || trimIn < 0 || trimOut <= trimIn || trimOut > sourceDuration + 0.02)`,
);

replaceOnce(
  "scripts/orvyq_edit_plan.mjs",
  `    if (Math.abs(trimOut - trimIn - duration) > 0.02) throw new Error(\`full_production.shots[\${index}] trim does not match timeline duration\`);`,
  `    if (Math.abs(trimOut - trimIn - duration * playbackRate) > 0.02)\n      throw new Error(\`full_production.shots[\${index}] trim does not match timeline duration at playback_rate=\${playbackRate}\`);`,
);

replaceOnce(
  "scripts/orvyq_edit_plan.mjs",
  `      trim_in_sec: round(trimIn),\n      trim_out_sec: round(trimOut),\n      motion_variant: spec.motion || "hold",`,
  `      trim_in_sec: round(trimIn),\n      trim_out_sec: round(trimOut),\n      playback_rate: round(playbackRate),\n      motion_variant: spec.motion || "hold",`,
);

replaceOnce(
  "scripts/orvyq_apply_footage_use_contracts.mjs",
  `    source_duration_fit: {\n      shifted_contiguous_runs: trimFitResult.shifted_runs,\n    },`,
  `    source_duration_fit: {\n      shifted_contiguous_runs: trimFitResult.shifted_runs,\n      slowed_contiguous_runs: trimFitResult.slowed_runs,\n    },`,
);

replaceOnce(
  "scripts/orvyq_apply_footage_use_contracts.mjs",
  `    shifted_contiguous_run_count: trimFitResult.shifted_runs.length,\n    removed_optional_hook_use_count: budgetResult.removed_hook_uses.length,`,
  `    shifted_contiguous_run_count: trimFitResult.shifted_runs.length,\n    slowed_contiguous_run_count: trimFitResult.slowed_runs.length,\n    removed_optional_hook_use_count: budgetResult.removed_hook_uses.length,`,
);

console.log(JSON.stringify({ ok: true, patched: [
  "scripts/orvyq_edit_plan.mjs",
  "scripts/orvyq_apply_footage_use_contracts.mjs",
] }));
