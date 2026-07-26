import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./lib/fs-utils.mjs";

const forbidden = ["brsctncnbrk-ops", "YouTube_pepline"];
const scannedRoots = [".github", "scripts", "projects", "templates", "package.json"];
const ignoredDirectories = new Set(["node_modules", ".git", "qa", "migration"]);

async function filesUnder(absolutePath) {
  if ((await stat(absolutePath)).isFile()) return [absolutePath];
  const files = [];
  for (const entry of await readdir(absolutePath, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const child = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else files.push(child);
  }
  return files;
}

test("runtime and production configuration contain no legacy repository dependency", async () => {
  const violations = [];
  for (const root of scannedRoots) {
    for (const file of await filesUnder(path.join(REPO_ROOT, root))) {
      if (file.endsWith("orvyq_repository_independence.test.mjs")) continue;
      const contents = await readFile(file, "utf8").catch(() => "");
      for (const token of forbidden) {
        if (contents.includes(token))
          violations.push(`${path.relative(REPO_ROOT, file)} contains ${token}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
