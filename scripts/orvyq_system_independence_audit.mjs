#!/usr/bin/env node
import path from "node:path";
import { promises as fs } from "node:fs";
import { REPO_ROOT, pathExists, printJson } from "./lib/fs-utils.mjs";
import { findSystemLeakage } from "./lib/orvyq-system-independence.mjs";

const ACTIVE_WORKFLOWS = new Set([
  ".github/workflows/ci.yml",
  ".github/workflows/orvyq-candidate-validation.yml",
  ".github/workflows/orvyq-review.yml",
  ".github/workflows/orvyq-final-encode.yml",
]);
const ROOTS = ["scripts", "templates/remotion/src", "config"];
const IGNORE_DIRS = new Set(["node_modules", ".git", "qa", "migration", "diagnostics", "fixtures"]);
const IGNORE_FILES = new Set(["scripts/orvyq_system_independence_audit.mjs", "scripts/orvyq_repository_independence.test.mjs"]);

async function filesUnder(relativeRoot) {
  const root = path.join(REPO_ROOT, relativeRoot);
  if (!(await pathExists(root))) return [];
  const stat = await fs.stat(root);
  if (stat.isFile()) return [relativeRoot];
  const output = [];
  async function walk(abs, rel) {
    for (const entry of await fs.readdir(abs, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue;
      const childAbs = path.join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(childAbs, childRel);
      else output.push(`${relativeRoot}/${childRel}`.replace(/\/+/g, "/"));
    }
  }
  await walk(root, "");
  return output;
}

function collectStrings(value, output) {
  if (typeof value === "string") output.add(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, output);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectStrings(item, output);
}

function tokenClass(token) {
  if (/^\d{3}-[a-z0-9-]+$/i.test(token)) return "project_id";
  if (/^CLM_\d+_[A-Z0-9_]+$/.test(token)) return "claim_id";
  if (/^SRC_[A-Z0-9_]+$/.test(token)) return "source_id";
  if (/^scene_\d+_[a-f0-9]{10,}\.(?:mp4|mov|webm|png|jpe?g|webp)$/i.test(token)) return "asset_name";
  if (/^\d{10,}$/.test(token)) return "historical_run_id";
  return "source_name";
}

async function projectTokens() {
  const projectsRoot = path.join(REPO_ROOT, "projects");
  if (!(await pathExists(projectsRoot))) return [];
  const values = new Set();
  for (const entry of await fs.readdir(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    values.add(entry.name);
    const projectRoot = path.join(projectsRoot, entry.name);
    for (const rel of [
      "research/evidence_map.json",
      "research/evidence_resolutions.json",
      "research/evidence_asset_manifest.json",
      "direction/motion_hook.json",
      "config/editorial_asset_plan.json",
      "qa/proof_approval.json",
    ]) {
      const abs = path.join(projectRoot, rel);
      if (!(await pathExists(abs))) continue;
      const raw = await fs.readFile(abs, "utf8").catch(() => "");
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
      if (parsed) collectStrings(parsed, values);
      for (const match of raw.matchAll(/\b(?:CLM_\d+_[A-Z0-9_]+|SRC_[A-Z0-9_]+|scene_\d+_[a-f0-9]{10,}\.(?:mp4|mov|webm|png|jpe?g|webp)|\d{10,})\b/g)) values.add(match[0]);
    }
  }
  return [...values]
    .filter((value) => typeof value === "string")
    .filter((value) => /^(?:\d{3}-[a-z0-9-]+|CLM_|SRC_|scene_\d+_|\d{10,})/i.test(value) || (/^[A-Za-z][A-Za-z0-9 .&-]{5,}$/.test(value) && value.split(/\s+/).length <= 6))
    .map((value) => ({ value, kind: tokenClass(value) }));
}

async function systemFiles() {
  const paths = new Set();
  for (const root of ROOTS) for (const file of await filesUnder(root)) paths.add(file);
  for (const file of ACTIVE_WORKFLOWS) if (await pathExists(path.join(REPO_ROOT, file))) paths.add(file);
  const output = [];
  for (const file of paths) {
    if (!/\.(?:mjs|js|ts|tsx|json|ya?ml)$/.test(file)) continue;
    output.push({ path: file, content: await fs.readFile(path.join(REPO_ROOT, file), "utf8").catch(() => "") });
  }
  return output;
}

export async function runSystemIndependenceAudit() {
  const [tokens, files] = await Promise.all([projectTokens(), systemFiles()]);
  const violations = findSystemLeakage({ systemFiles: files, tokens, ignoredFiles: IGNORE_FILES });
  const report = {
    schema_version: "1.0-system-independence",
    scanned_file_count: files.length,
    project_token_count: tokens.length,
    violations,
    pass: violations.length === 0,
  };
  const reportPath = path.join(REPO_ROOT, "system-independence-report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.pass) throw new Error(`ORVYQ system independence audit failed: ${violations.map((item) => `${item.path} contains ${item.kind} ${item.token}`).join("; ")}`);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSystemIndependenceAudit()
    .then((report) => printJson({ ok: true, ...report }))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
