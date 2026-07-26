import test from "node:test";
import assert from "node:assert/strict";
import { gainForEnergy, musicGainExpression } from "./orvyq_dynamic_remix.mjs";

test("gainForEnergy creates a meaningful but bounded section-energy spread", () => {
  assert.ok(gainForEnergy(0.76) - gainForEnergy(0.28) >= 0.4);
  assert.ok(gainForEnergy(0) >= 0.5);
  assert.ok(gainForEnergy(2) <= 1);
});

test("musicGainExpression follows authored cue boundaries and ramps", () => {
  const expression = musicGainExpression([
    { start: 0, end: 10, energy_start: 0.2, energy_end: 0.7 },
    { start: 10, end: 20, energy_start: 0.7, energy_end: 0.3 }
  ], 20);
  assert.match(expression, /between\(t,0,10\)/);
  assert.match(expression, /between\(t,10,20\)/);
  assert.match(expression, /\*\(t-0\)\/10/);
});
