// Every pipeline script that can be run directly must select its project
// from its OWN arguments, not from whatever ORVYQ_PROJECT_ID happens to be
// exported in the shell.
//
// This has already been found and fixed one script at a time twice
// (orvyq_fetch_primary_evidence.mjs, recorded in ORVYQ_SYSTEM.md's change
// log; then nine more audit scripts, including the whole evidence/semantic/
// license/pacing set that decides whether a candidate is review-ready).
// A script that ignores --project-id does not fail loudly -- it audits
// whichever project the environment names and reports a pass under the id
// the operator asked for, which is a project-isolation violation
// (ORVYQ_SYSTEM.md section 10) disguised as a green check.
//
// The behavioural half of this file proves the flag actually wins over a
// conflicting environment variable; the static half stops a tenth script
// from quietly reintroducing the pattern.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./lib/fs-utils.mjs";

const CLI_MARKER = "if (import.meta.url === `file://${process.argv[1]}`)";

// Scripts whose CLI legitimately has no single project: repository-wide
// maintenance, cross-project comparison, or project creation.
const NOT_PROJECT_SCOPED = new Set([
  "orvyq_music_intake.mjs", // shared music registry, no active project
  "orvyq_new_project.mjs", // creates the project, takes it positionally
  "orvyq_parity_check.mjs", // compares renderer code paths, not a project
  "orvyq_review_final_parity.mjs", // compares two manifest paths
  "orvyq_render_manifest.mjs", // reads --project-id directly, checked below
  "orvyq_pipeline_cli.mjs", // resolves once and forwards to each script
  "orvyq_seed_editorial_asset_plan.mjs", // authoring helper, positional args
  "validate_canonical.mjs", // walks every ready project
]);

async function projectScopedCliScripts() {
  const dir = path.join(REPO_ROOT, "scripts");
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".mjs")) continue;
    if (entry.name.includes(".test.")) continue;
    if (NOT_PROJECT_SCOPED.has(entry.name)) continue;
    const source = await readFile(path.join(dir, entry.name), "utf8");
    if (!source.includes(CLI_MARKER)) continue;
    if (!source.includes("projectDir(") && !source.includes("ORVYQ_PROJECT_ID")) continue;
    found.push({ name: entry.name, entrypoint: source.slice(source.indexOf(CLI_MARKER)) });
  }
  return found;
}

test("every project-scoped script reads the project id from its own arguments", async () => {
  const scripts = await projectScopedCliScripts();
  assert.ok(scripts.length >= 10, `expected to find the project-scoped scripts, found ${scripts.length}`);
  const offenders = scripts
    .filter(({ entrypoint }) => !entrypoint.includes("resolveProjectId(") && !entrypoint.includes('args["project-id"]'))
    .map(({ name }) => name);
  assert.deepEqual(
    offenders,
    [],
    `these scripts ignore --project-id and silently fall back to ORVYQ_PROJECT_ID: ${offenders.join(", ")}`
  );
});

// The static check above cannot tell whether the resolved id is actually
// used, so pin the precedence behaviour on a representative script: the
// semantic visual audit, one of the gates that decides review-readiness.
test("--project-id wins over a conflicting ORVYQ_PROJECT_ID", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "orvyq_semantic_visual_audit.mjs"), "--project-id=999-nonexistent-target"],
    { env: { ...process.env, ORVYQ_PROJECT_ID: "001-some-other-project" }, encoding: "utf8" }
  );
  assert.notEqual(result.status, 0, "auditing a nonexistent project must fail");
  const output = `${result.stdout}${result.stderr}`;
  assert.ok(
    output.includes("999-nonexistent-target"),
    `the flagged project must be the one acted on, got: ${output}`
  );
  assert.ok(
    !output.includes("001-some-other-project"),
    `the environment's project must not be touched when --project-id is given, got: ${output}`
  );
});

test("a missing project id is a clear error, not a silent default", () => {
  const env = { ...process.env };
  delete env.ORVYQ_PROJECT_ID;
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "orvyq_semantic_visual_audit.mjs")],
    { env, encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /project id is required|PROJECT_ID_REQUIRED/);
});
