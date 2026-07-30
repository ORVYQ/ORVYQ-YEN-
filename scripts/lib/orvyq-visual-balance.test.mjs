import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VISUAL_MEDIUM_BALANCE,
  auditSectionVisualBalance,
  auditVisualMediumBalance,
} from "./orvyq-visual-balance.mjs";

test("visual-medium balance accepts a footage-led mix with restrained cards and real evidence", () => {
  const result = auditVisualMediumBalance({
    durationFrames: 1000,
    contextualBodyFrames: 500,
    derivedFrames: 250,
    pureGraphicFrames: 50,
    officialFrames: 100,
  });
  assert.equal(result.pass, true);
  assert.equal(result.card_like_visual_fraction, 0.30);
});

test("visual-medium balance rejects a source-derived slideshow even when generic cards are low", () => {
  const result = auditVisualMediumBalance({
    durationFrames: 1000,
    contextualBodyFrames: 300,
    derivedFrames: 400,
    pureGraphicFrames: 50,
    officialFrames: 100,
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes("contextual body footage 30.0%")));
  assert.ok(result.failures.some((failure) => failure.includes("source-derived graphic scenes 40.0%")));
  assert.ok(result.failures.some((failure) => failure.includes("card-like visual time 45.0%")));
});

test("project rules may tighten shared thresholds but cannot loosen them", () => {
  const result = auditVisualMediumBalance({
    durationFrames: 1000,
    contextualBodyFrames: 400,
    derivedFrames: 250,
    pureGraphicFrames: 40,
    officialFrames: 70,
  }, {
    contextual_body_footage_fraction_min: 0.40,
    contextual_body_footage_fraction_max: 0.90,
    source_derived_graphic_fraction_max: 0.90,
    full_screen_graphic_fraction_max: 0.90,
    card_like_visual_fraction_max: 0.25,
  });
  assert.equal(result.thresholds.contextual_body_footage_fraction_min, 0.40);
  assert.equal(result.thresholds.contextual_body_footage_fraction_max, DEFAULT_VISUAL_MEDIUM_BALANCE.contextual_body_footage_fraction_max);
  assert.equal(result.thresholds.source_derived_graphic_fraction_max, DEFAULT_VISUAL_MEDIUM_BALANCE.source_derived_graphic_fraction_max);
  assert.equal(result.thresholds.full_screen_graphic_fraction_max, DEFAULT_VISUAL_MEDIUM_BALANCE.full_screen_graphic_fraction_max);
  assert.equal(result.thresholds.card_like_visual_fraction_max, 0.25);
  assert.equal(result.pass, false);
});

test("section balance rejects a local card cluster hidden by healthy film-wide totals", () => {
  const result = auditSectionVisualBalance({
    SEC_01: { durationFrames: 500, contextualBodyFrames: 300, derivedFrames: 100, pureGraphicFrames: 25, officialFrames: 75 },
    SEC_02: { durationFrames: 500, contextualBodyFrames: 150, derivedFrames: 275, pureGraphicFrames: 25, officialFrames: 50 },
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes("SEC_02")));
});
