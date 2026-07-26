#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const LEGACY_PROJECT_ID = ["001", "the-ai-race-no-one-can-afford-to-win"].join("-");
const EXAMPLE_PROJECT_ID = "000-example-project";
const FULL_PLAN_PATH = path.join(REPO_ROOT, "scripts", "orvyq_full_production_plan.mjs");
const EDIT_PLAN_PATH = path.join(REPO_ROOT, "scripts", "orvyq_edit_plan.mjs");
const PROJECT_ASSET_PLAN_PATH = path.join(
  REPO_ROOT,
  "projects",
  LEGACY_PROJECT_ID,
  "config",
  "editorial_asset_plan.json",
);

function declarationRange(text, name, { exported = true } = {}) {
  const prefix = exported ? "(?:export\\s+)?" : "";
  const expression = new RegExp(`${prefix}const\\s+${name}\\s*=\\s*`, "m");
  const match = expression.exec(text);
  if (!match) throw new Error(`Missing declaration ${name}`);
  const literalStart = match.index + match[0].length;
  const opener = text[literalStart];
  const closer = opener === "{" ? "}" : opener === "[" ? "]" : null;
  if (!closer) throw new Error(`${name} must be initialized with an object or array literal`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let literalEnd = -1;
  for (let index = literalStart; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === opener) depth += 1;
    else if (character === closer) {
      depth -= 1;
      if (depth === 0) {
        literalEnd = index + 1;
        break;
      }
    }
  }
  if (literalEnd < 0) throw new Error(`Unterminated declaration ${name}`);
  let end = literalEnd;
  while (/\s/.test(text[end] || "")) end += 1;
  if (text[end] === ";") end += 1;
  return {
    start: match.index,
    literalStart,
    literalEnd,
    end,
    literal: text.slice(literalStart, literalEnd),
  };
}

function evaluateLiteral(literal) {
  return vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 });
}

async function generalizeFullProductionPlan() {
  let source = fs.readFileSync(FULL_PLAN_PATH, "utf8");
  if (source.includes("loadEditorialAssetPlan(projectId)")) return false;

  const module = await import(`${pathToFileURL(FULL_PLAN_PATH).href}?migration=${Date.now()}`);
  const sliceRange = declarationRange(source, "SLICE_COUNT_OVERRIDES", { exported: false });
  const projectPlan = {
    schema_version: "1.0",
    project_id: LEGACY_PROJECT_ID,
    status: "ready",
    footage_assignments: module.FOOTAGE_ASSIGNMENTS,
    graphic_break_assignments: module.GRAPHIC_BREAK_ASSIGNMENTS,
    full_footage_pool: module.FULL_FOOTAGE_POOL,
    hook_preloaded_usage: module.HOOK_PRELOADED_USAGE,
    slice_count_overrides: evaluateLiteral(sliceRange.literal),
  };
  fs.mkdirSync(path.dirname(PROJECT_ASSET_PLAN_PATH), { recursive: true });
  fs.writeFileSync(PROJECT_ASSET_PLAN_PATH, `${JSON.stringify(projectPlan, null, 2)}\n`);

  const first = declarationRange(source, "FOOTAGE_ASSIGNMENTS");
  const last = declarationRange(source, "HOOK_PRELOADED_USAGE");
  const loaderBlock = `export let FOOTAGE_ASSIGNMENTS = {};
export let GRAPHIC_BREAK_ASSIGNMENTS = {};
export let FULL_FOOTAGE_POOL = [];
export let HOOK_PRELOADED_USAGE = {};
export let SLICE_COUNT_OVERRIDES = {};
export let END_CARD_CONTENT = {};
let ACTIVE_EDITORIAL_ASSET_PROJECT = null;

export async function loadEditorialAssetPlan(projectId) {
  if (ACTIVE_EDITORIAL_ASSET_PROJECT === projectId) {
    return {
      footage_assignments: FOOTAGE_ASSIGNMENTS,
      graphic_break_assignments: GRAPHIC_BREAK_ASSIGNMENTS,
      full_footage_pool: FULL_FOOTAGE_POOL,
      hook_preloaded_usage: HOOK_PRELOADED_USAGE,
      slice_count_overrides: SLICE_COUNT_OVERRIDES,
    };
  }
  const dir = projectDir(projectId);
  const [assetPlan, policy] = await Promise.all([
    readJson(path.join(dir, "config", "editorial_asset_plan.json")),
    loadProductionPolicy(projectId),
  ]);
  if (assetPlan.project_id !== projectId) {
    throw new Error(\`editorial_asset_plan project_id \${assetPlan.project_id} does not match \${projectId}\`);
  }
  if (assetPlan.status !== "ready") {
    throw new Error(\`editorial_asset_plan is not ready (status=\${assetPlan.status || "missing"})\`);
  }
  FOOTAGE_ASSIGNMENTS = assetPlan.footage_assignments || {};
  GRAPHIC_BREAK_ASSIGNMENTS = assetPlan.graphic_break_assignments || {};
  FULL_FOOTAGE_POOL = assetPlan.full_footage_pool || [];
  HOOK_PRELOADED_USAGE = assetPlan.hook_preloaded_usage || {};
  SLICE_COUNT_OVERRIDES = assetPlan.slice_count_overrides || {};
  END_CARD_CONTENT = policy.project.end_card || {};
  if (!END_CARD_CONTENT.title) throw new Error("production_profile.end_card.title is required");
  ACTIVE_EDITORIAL_ASSET_PROJECT = projectId;
  return assetPlan;
}
`;
  source = source.slice(0, first.start) + loaderBlock + source.slice(last.end);

  const oldSliceDeclaration = declarationRange(source, "SLICE_COUNT_OVERRIDES", { exported: false });
  source = source.slice(0, oldSliceDeclaration.start)
    + "// Per-project slice-count overrides are loaded from config/editorial_asset_plan.json.\n"
    + source.slice(oldSliceDeclaration.end);

  source = source.replace(
    'import { projectDir, readJson, readJsonSafe, writeJsonAtomic, parseArgs, printJson } from "./lib/fs-utils.mjs";',
    'import { projectDir, readJson, readJsonSafe, writeJsonAtomic, parseArgs, printJson } from "./lib/fs-utils.mjs";\nimport { loadProductionPolicy, resolveProjectId } from "./lib/orvyq-project-profile.mjs";',
  );
  source = source.replace(new RegExp(`const PROJECT_ID = ["']${LEGACY_PROJECT_ID}["'];\\n`), "");
  source = source.replace(
    "export async function buildFullProductionPlan(projectId = PROJECT_ID) {",
    "export async function buildFullProductionPlan(projectId) {\n  await loadEditorialAssetPlan(projectId);",
  );
  source = source.replace(
    "export async function writeFullProductionPlan(projectId = PROJECT_ID) {",
    "export async function writeFullProductionPlan(projectId) {",
  );
  source = source.replace(
    'graphic: { type: "end_card", mode: "brand", title: "It\'s still being decided… by people, right now.", subtitle: null },',
    'graphic: { type: "end_card", mode: "brand", title: END_CARD_CONTENT.title, subtitle: END_CARD_CONTENT.subtitle ?? null },',
  );
  source = source.replace(
    /if \(import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`\) \{[\s\S]*?\n\}/m,
    `if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const args = parseArgs(process.argv.slice(2));
  let projectId;
  try {
    projectId = resolveProjectId(args);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message, code: error.code }));
    process.exitCode = 1;
  }
  if (projectId) {
    writeFullProductionPlan(projectId)
      .then((result) => printJson({ ok: true, ...result }))
      .catch((error) => {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exitCode = 1;
      });
  }
}`,
  );
  fs.writeFileSync(FULL_PLAN_PATH, source);
  return true;
}

function generalizeEditPlan() {
  let source = fs.readFileSync(EDIT_PLAN_PATH, "utf8");
  if (source.includes("const policy = await loadProductionPolicy(projectId);")) return false;
  source = source.replace(
    'import { auditMotionHook } from "./lib/orvyq-motion-hook.mjs";',
    'import { auditMotionHook } from "./lib/orvyq-motion-hook.mjs";\nimport { loadProductionPolicy, resolveProjectId } from "./lib/orvyq-project-profile.mjs";',
  );
  source = source.replace(new RegExp(`const PROJECT_ID = ["']${LEGACY_PROJECT_ID}["'];\\n`), "");
  source = source.replace(/const PROOF_BOUNDARY_ANCHOR_TEXT = [\s\S]*?;\n/, "");
  source = source.replace(
    "export function resolveProofBoundaryFrame(shots, anchorText = PROOF_BOUNDARY_ANCHOR_TEXT) {",
    "export function resolveProofBoundaryFrame(shots, anchorText) {\n  if (!anchorText) throw new Error(\"resolveProofBoundaryFrame requires an explicit project-authored anchorText\");",
  );
  source = source.replace(
    "export async function buildCanonicalEditPlan(projectId = PROJECT_ID, { mode = \"candidate\", frameEnd = null } = {}) {",
    "export async function buildCanonicalEditPlan(projectId, { mode = \"candidate\", frameEnd = null } = {}) {\n  const policy = await loadProductionPolicy(projectId);",
  );
  source = source.replace(
    /art_direction: \{\n\s*principle: strategy,\n\s*topic: [\s\S]*?\n\s*\},\n\s*quality_policy:/m,
    "art_direction: { principle: strategy, ...policy.project.art_direction },\n    quality_policy:",
  );
  source = source.replace(
    /if \(import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`\) \{[\s\S]*?\n\}/m,
    `if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode || "proof";
  const frameEnd = args["frame-end"] ? Number.parseInt(args["frame-end"], 10) : null;
  let projectId;
  try {
    projectId = resolveProjectId(args);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message, code: error.code }));
    process.exitCode = 1;
  }
  if (projectId) {
    buildCanonicalEditPlan(projectId, { mode, frameEnd })
      .then((plan) =>
        printJson({
          ok: true,
          mode: plan.mode,
          shot_count: plan.shots.length,
          footage_count: plan.shots.filter((shot) => shot.asset_type === "footage").length,
          evidence_count: plan.shots.filter((shot) => shot.asset_type === "evidence").length,
          frame_range: plan.frame_range,
          duration_frames: plan.duration_frames,
          source_usage: plan.source_usage,
          primary_evidence_fraction: plan.quality_policy.actual_primary_evidence_fraction,
          output: "direction/edit_plan.json",
        })
      )
      .catch((error) => {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exitCode = 1;
      });
  }
}`,
  );
  fs.writeFileSync(EDIT_PLAN_PATH, source);
  return true;
}

function filesUnder(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...filesUnder(absolute));
    else output.push(absolute);
  }
  return output;
}

function generalizeSimpleRuntimeDefaults() {
  const scriptsDir = path.join(REPO_ROOT, "scripts");
  const skip = new Set([
    path.resolve(import.meta.filename),
    FULL_PLAN_PATH,
    EDIT_PLAN_PATH,
    path.join(scriptsDir, "validate_canonical.mjs"),
    path.join(scriptsDir, "orvyq_repository_independence.test.mjs"),
  ]);
  let changed = 0;
  for (const file of filesUnder(scriptsDir)) {
    if (!file.endsWith(".mjs") || skip.has(path.resolve(file))) continue;
    let source = fs.readFileSync(file, "utf8");
    if (!source.includes(LEGACY_PROJECT_ID)) continue;
    const before = source;
    if (file.endsWith(".test.mjs")) {
      source = source.replaceAll(LEGACY_PROJECT_ID, EXAMPLE_PROJECT_ID);
    } else {
      const escaped = LEGACY_PROJECT_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      source = source
        .replace(new RegExp(`const PROJECT_ID = ["']${escaped}["'];`, "g"), "const PROJECT_ID = process.env.ORVYQ_PROJECT_ID || null;")
        .replace(new RegExp(`const DEFAULT_PROJECT_ID = ["']${escaped}["'];`, "g"), "const DEFAULT_PROJECT_ID = process.env.ORVYQ_PROJECT_ID || null;")
        .replace(new RegExp(`["']${escaped}["']`, "g"), "(process.env.ORVYQ_PROJECT_ID || null)")
        .replaceAll(LEGACY_PROJECT_ID, "<project-id>");
    }
    if (source !== before) {
      fs.writeFileSync(file, source);
      changed += 1;
    }
  }
  return changed;
}

function assertNoLegacyRuntimeLeakage() {
  const failures = [];
  for (const root of ["scripts", ".github", "templates", "config", "package.json"]) {
    const absolute = path.join(REPO_ROOT, root);
    const files = fs.statSync(absolute).isDirectory() ? filesUnder(absolute) : [absolute];
    for (const file of files) {
      if (file.endsWith("orvyq_repository_independence.test.mjs") || file === import.meta.filename) continue;
      const source = fs.readFileSync(file, "utf8");
      if (source.includes(LEGACY_PROJECT_ID)) failures.push(path.relative(REPO_ROOT, file));
    }
  }
  if (failures.length) throw new Error(`Legacy project id remains in system runtime:\n${failures.join("\n")}`);
}

const result = {
  full_plan_generalized: await generalizeFullProductionPlan(),
  edit_plan_generalized: generalizeEditPlan(),
  simple_runtime_files_generalized: generalizeSimpleRuntimeDefaults(),
};
assertNoLegacyRuntimeLeakage();
console.log(JSON.stringify({ ok: true, ...result }, null, 2));
