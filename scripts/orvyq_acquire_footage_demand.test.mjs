import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  validateAssignment,
  validateCapacityTarget,
  materializeAssignments,
} from "./orvyq_acquire_footage_demand.mjs";

function assignedItem(overrides = {}) {
  return {
    scene_id: "scene_021",
    role: "context",
    editorial_assignment: {
      claim_id: "CLM_TEST",
      slice_index: 20,
      narration_anchor: "There is another possibility.",
      semantic_rationale: "The selected physical process directly carries the meaning of this narration anchor.",
      replace_graphic_break: true,
      expected_replacement_seconds: 8,
      motion: "hold",
      ...overrides,
    },
  };
}

test("validateAssignment requires an explicit narration anchor and stable target", () => {
  assert.deepEqual(validateAssignment(assignedItem()), { claimId: "CLM_TEST", sliceIndex: 20 });
  assert.throws(
    () => validateAssignment(assignedItem({ narration_anchor: "" })),
    /narration_anchor is required/
  );
});

test("validateCapacityTarget rejects a fixed asset count that cannot cover the measured graphics deficit", () => {
  const valid = {
    capacity_target: {
      baseline_pure_graphics_fraction: 0.274,
      maximum_pure_graphics_fraction: 0.2,
      candidate_duration_seconds: 100,
      minimum_graphic_seconds_to_replace: 7.4,
    },
    assets: [assignedItem()],
  };
  assert.equal(validateCapacityTarget(valid).planned, 8);
  assert.throws(
    () => validateCapacityTarget({ ...valid, assets: [assignedItem({ expected_replacement_seconds: 7 })] }),
    /below required/
  );
});

test("materializeAssignments resolves the downloaded hash path and is idempotent", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "orvyq-acquisition-"));
  try {
    await fs.mkdir(path.join(dir, "config"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "config", "editorial_asset_plan.json"),
      JSON.stringify({
        project_id: "002-the-new-war-beneath-the-ocean",
        footage_assignments: {},
        graphic_break_assignments: { CLM_TEST: { "20": { title: "Old filler card" } } },
        full_footage_pool: [],
      })
    );
    const plan = {
      project_id: "002-the-new-war-beneath-the-ocean",
      assets: [assignedItem()],
    };
    const records = [{
      scene_id: "scene_021",
      path: "assets/footage/scene_021_resolvedhash.mp4",
      provider_asset_id: "123",
      role: "context",
    }];

    const first = await materializeAssignments(dir, plan, records);
    assert.equal(first.replaced_graphics, 1);
    const materialized = JSON.parse(await fs.readFile(path.join(dir, "config", "editorial_asset_plan.json"), "utf8"));
    assert.equal(materialized.footage_assignments.CLM_TEST["20"].asset, records[0].path);
    assert.equal(materialized.graphic_break_assignments.CLM_TEST, undefined);

    const second = await materializeAssignments(dir, plan, records);
    assert.equal(second.replaced_graphics, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
