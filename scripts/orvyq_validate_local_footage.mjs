#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateLocalFootage } from "./orvyq_materialize_footage.mjs";
import { parseArgs, printJson } from "./lib/fs-utils.mjs";

export { validateLocalFootage };

const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args["project-id"] || process.env.ORVYQ_PROJECT_ID;
  validateLocalFootage(projectId)
    .then((result) => printJson({ ok: true, ...result }))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
