import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VISUAL_MEDIUM_BALANCE,
  auditVisualMediumBalance,
} from "./orvyq_semantic_visual_audit.mjs";

test("visual-medium balance accepts a footage-led mix with restrained cards", () => {
  const result = auditVisualMediumBalance({
    durationFrames: 1000,
    contextualBodyFrames: 400,
    derivedFrames: 250,
    pureGraphicFrames: 50,
  });

  assert.equal(result.pass, true);
  assert.equal(result.card_like_visual_fraction, 0.3);
  assert.deepEqual(result.failures, []);
});

test("visual-medium balance rejects a source-derived slideshow even when generic cards are low", () => {
  const result = auditVisualMediumBalance({
    durationFrames: 1000,
    contextualBodyFrames: 250,
    derivedFrames: 400,
    pureGraphicFrames: 50,
  });

  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes("contextual body footage 25.0%")));
  assert.ok(result.failures.some((failure) => failure.includes("source-derived graphic scenes 40.0%")));
  assert.ok(result.failures.some((failure) => failure.includes("card-like visual time 45.0%")));
});

test("project rules may tighten shared thresholds but cannot loosen them", () => {
  const result = auditVisualMediumBalance({
    durationFrames: 1000,
    contextualBodyFrames: 380,
    derivedFrames: 240,
    pureGraphicFrames: 40,
    rules: {
      contextual_body_footage_fraction_min: 0.40,
      contextual_body_footage_fraction_max: 0.90,
      source_derived_graphic_fraction_max: 0.90,
      card_like_visual_fraction_max: 0.25,
    },
  });

  assert.equal(result.thresholds.contextual_body_footage_fraction_min, 0.40);
  assert.equal(
    result.thresholds.contextual_body_footage_fraction_max,
    DEFAULT_VISUAL_MEDIUM_BALANCE.contextual_body_footage_fraction_max,
  );
  assert.equal(
    result.thresholds.source_derived_graphic_fraction_max,
    DEFAULT_VISUAL_MEDIUM_BALANCE.source_derived_graphic_fraction_max,
  );
  assert.equal(result.thresholds.card_like_visual_fraction_max, 0.25);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes("minimum 40%")));
  assert.ok(result.failures.some((failure) => failure.includes("maximum 25%")));
});
