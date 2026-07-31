import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeFootageUseContractOverrides,
  assertNoSilentManagedAssignmentRemoval,
} from "./orvyq_apply_footage_use_contracts.mjs";

const base = {
  schema_version: "1.0",
  project_id: "999-contract-fixture",
  managed_scene_ids: ["scene_010"],
  pruned_scene_ids: [],
  assignments: [
    {
      scene_id: "scene_010",
      claim_id: "CLM_A",
      slice_index: 1,
      trim_in_ratio: 0,
      motion: "hold",
      role: "context",
      semantic_link: "conceptual",
      semantic_rationale: "The original approved use is tied to this exact narration target.",
    },
  ],
};

test("a reusable override can move one managed scene while preserving its other explicit use", () => {
  const merged = mergeFootageUseContractOverrides(base, {
    schema_version: "1.0",
    project_id: "999-contract-fixture",
    managed_scene_ids: ["scene_020"],
    retired_targets: [
      {
        scene_id: "scene_020",
        claim_id: "CLM_B",
        slice_index: 4,
        reason: "Move the governance break earlier to interrupt the evidence run.",
      },
    ],
    assignments: [
      {
        scene_id: "scene_020",
        claim_id: "CLM_B",
        slice_index: 2,
        trim_in_ratio: 0,
        motion: "hold",
        role: "human_context",
        semantic_link: "conceptual",
        semantic_rationale: "A real hearing interrupts the dense legal evidence sequence.",
      },
      {
        scene_id: "scene_020",
        claim_id: "CLM_C",
        slice_index: 1,
        trim_in_ratio: 0.3,
        motion: "pull",
        role: "human_context",
        semantic_link: "conceptual",
        semantic_rationale: "A distinct reviewed trim represents later regulatory delay.",
      },
    ],
  });

  assert.deepEqual(merged.managed_scene_ids, ["scene_010", "scene_020"]);
  assert.equal(merged.assignments.length, 3);
  assert.equal(merged.retired_targets.length, 1);
});

test("silent removal of a managed editorial assignment fails closed", () => {
  assert.throws(
    () =>
      assertNoSilentManagedAssignmentRemoval({
        editorialAssignments: {
          CLM_B: {
            4: { asset: "assets/footage/scene_020_example.mp4" },
          },
        },
        managedSceneIds: ["scene_020"],
        prunedSceneIds: [],
        finalAssignments: [],
        retiredTargets: [],
      }),
    /silently remove/
  );
});

test("an explicit retirement with a reason permits an intentional move", () => {
  assert.doesNotThrow(() =>
    assertNoSilentManagedAssignmentRemoval({
      editorialAssignments: {
        CLM_B: {
          4: { asset: "assets/footage/scene_020_example.mp4" },
        },
      },
      managedSceneIds: ["scene_020"],
      prunedSceneIds: [],
      finalAssignments: [
        {
          scene_id: "scene_020",
          claim_id: "CLM_B",
          slice_index: 2,
        },
      ],
      retiredTargets: [
        {
          scene_id: "scene_020",
          claim_id: "CLM_B",
          slice_index: 4,
          reason: "Move the clip earlier to break a long uninterrupted evidence sequence.",
        },
      ],
    })
  );
});

test("duplicate override targets are rejected before project files are changed", () => {
  assert.throws(
    () =>
      mergeFootageUseContractOverrides(base, {
        schema_version: "1.0",
        project_id: "999-contract-fixture",
        managed_scene_ids: ["scene_020"],
        assignments: [
          {
            scene_id: "scene_020",
            claim_id: "CLM_A",
            slice_index: 1,
            trim_in_ratio: 0,
            semantic_rationale: "This conflicts with the base target and must fail closed.",
          },
        ],
      }),
    /duplicate target/
  );
});
