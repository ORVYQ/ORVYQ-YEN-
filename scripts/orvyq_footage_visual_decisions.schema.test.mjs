import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadCanonicalAjv, readJson } from "./lib/schema-validate.mjs";

test("Project 002 byte-bound footage visual decisions satisfy their schema", () => {
  const ajv = loadCanonicalAjv();
  const validate = ajv.getSchema("footage_visual_decisions.schema.json");
  assert.ok(validate, "footage visual decision schema must be registered");
  const decisions = readJson(path.resolve(
    "projects/002-the-new-war-beneath-the-ocean/research/footage_visual_decisions.json",
  ));
  assert.equal(validate(decisions), true, JSON.stringify(validate.errors));
  assert.equal(decisions.decisions.length, 49);
  assert.equal(decisions.decisions.filter((item) => item.decision === "approve").length, 24);
  assert.equal(decisions.decisions.filter((item) => item.decision === "reject").length, 25);
});
