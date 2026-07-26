#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const file = path.resolve("scripts/orvyq_full_production_plan.test.mjs");
let source = fs.readFileSync(file, "utf8");

source = source.replace(
  `  shrinkGraphicBreakSliceToMax\n} from "./orvyq_full_production_plan.mjs";\nimport { tokenizeWords } from "./lib/orvyq-pause-resolver.mjs";`,
  `  shrinkGraphicBreakSliceToMax,\n  loadEditorialAssetPlan,\n  GRAPHIC_BREAK_ASSIGNMENTS,\n  SLICE_COUNT_OVERRIDES\n} from "./orvyq_full_production_plan.mjs";\nimport { tokenizeWords } from "./lib/orvyq-pause-resolver.mjs";\nimport { firstReadyProjectId } from "./lib/test-ready-project.mjs";`,
);

const startMarker = `test("sliceClaimWindow: a real GRAPHIC_BREAK_ASSIGNMENTS maxSeconds cap shrinks that slice and grows its free neighbor, preserving total window duration", () => {`;
const start = source.indexOf(startMarker);
if (start < 0) throw new Error("Could not find legacy graphic-break integration test");

const replacement = `test("sliceClaimWindow applies a selected project's declared graphic-break cap without losing timeline duration", async () => {
  await loadEditorialAssetPlan(firstReadyProjectId());
  const configured = Object.entries(GRAPHIC_BREAK_ASSIGNMENTS)
    .flatMap(([claimId, assignments]) => Object.entries(assignments)
      .filter(([, assignment]) => Number.isFinite(assignment.maxSeconds))
      .map(([sliceIndex, assignment]) => ({
        claimId,
        sliceIndex: Number(sliceIndex),
        maxSeconds: Number(assignment.maxSeconds),
      })))
    .find(({ claimId, sliceIndex }) => Number(SLICE_COUNT_OVERRIDES[claimId]) > sliceIndex + 1);
  assert.ok(configured, "a ready project must expose at least one testable graphic-break duration cap");

  const sliceCount = Number(SLICE_COUNT_OVERRIDES[configured.claimId]);
  const coverStart = 0;
  const coverEnd = sliceCount * 5;
  const maxShotSeconds = 15;
  const claim = {
    claim_id: configured.claimId,
    visual_treatment: { primary: "evidence_chain" },
  };
  const slices = sliceClaimWindow(claim, coverStart, coverEnd, maxShotSeconds, [], [], {});

  assert.equal(slices.length, sliceCount);
  assert.ok(
    Math.abs(slices[configured.sliceIndex].end - slices[configured.sliceIndex].start - configured.maxSeconds) < 1e-9,
  );
  assert.equal(slices[0].start, coverStart);
  for (let index = 1; index < slices.length; index += 1) {
    assert.ok(Math.abs(slices[index].start - slices[index - 1].end) < 1e-9);
  }
  assert.ok(Math.abs(slices.at(-1).end - coverEnd) < 1e-9);
  assert.ok(slices.every((slice) => slice.end - slice.start <= maxShotSeconds + 1e-9));
});`;

const tail = source.slice(start);
const match = tail.match(/^test\("sliceClaimWindow: a real GRAPHIC_BREAK_ASSIGNMENTS[\s\S]*?\n\}\);\s*$/);
if (!match) throw new Error("Could not isolate legacy graphic-break integration test at end of file");
source = source.slice(0, start) + replacement + "\n";

fs.writeFileSync(file, source);
console.log(JSON.stringify({ ok: true, file: path.relative(process.cwd(), file) }, null, 2));
