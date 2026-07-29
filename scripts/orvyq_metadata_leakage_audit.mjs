#!/usr/bin/env node
import { parseArgs, printJson } from "./lib/fs-utils.mjs";
import { resolveProjectId } from "./lib/orvyq-project-profile.mjs";
import { runVisualAudit } from "./lib/orvyq-visual-audit-runner.mjs";
const args = parseArgs(process.argv.slice(2));
let projectId;
try { projectId = resolveProjectId(args); } catch (error) { console.error(JSON.stringify({ ok: false, error: error.message, code: error.code })); process.exitCode = 1; }
if (projectId) runVisualAudit(projectId, "metadata_leakage").then((report) => printJson({ ok: true, ...report })).catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; });
