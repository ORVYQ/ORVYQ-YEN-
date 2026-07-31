import test from "node:test";
import assert from "node:assert/strict";
import { fitContiguousFootageRunsToSources } from "./orvyq-footage-trim-fit.mjs";

function footage(asset, trimIn, duration) {
  return {
    asset_type: "footage",
    asset,
    duration,
    trim_in_sec: trimIn,
    trim_out_sec: trimIn + duration,
  };
}

test("valid contiguous footage runs remain byte-for-byte unchanged", () => {
  const shots = [footage("a.mp4", 2, 4), footage("a.mp4", 6, 3)];
  const result = fitContiguousFootageRunsToSources({
    shots,
    sourceDurationByAsset: new Map([["a.mp4", 12]]),
  });
  assert.deepEqual(result.shots, shots);
  assert.deepEqual(result.shifted_runs, []);
});

test("a downstream extension that overruns the source shifts the whole contiguous run earlier", () => {
  const shots = [
    footage("a.mp4", 8, 6),
    footage("a.mp4", 14, 4),
  ];
  const result = fitContiguousFootageRunsToSources({
    shots,
    sourceDurationByAsset: new Map([["a.mp4", 14]]),
  });
  assert.equal(result.shifted_runs.length, 1);
  assert.equal(result.shots[0].trim_in_sec, 4);
  assert.equal(result.shots[0].trim_out_sec, 10);
  assert.equal(result.shots[1].trim_in_sec, 10);
  assert.equal(result.shots[1].trim_out_sec, 14);
});

test("the fitter fails closed when the combined contiguous run is longer than the real source", () => {
  const shots = [footage("a.mp4", 0, 8), footage("a.mp4", 8, 7)];
  assert.throws(
    () => fitContiguousFootageRunsToSources({
      shots,
      sourceDurationByAsset: { "a.mp4": 14 },
    }),
    /15\.000s required, 14\.000s available/,
  );
});

test("separate non-contiguous uses are fitted independently", () => {
  const shots = [
    footage("a.mp4", 0, 4),
    { asset_type: "evidence", duration: 2 },
    footage("a.mp4", 12, 4),
  ];
  const result = fitContiguousFootageRunsToSources({
    shots,
    sourceDurationByAsset: { "a.mp4": 14 },
  });
  assert.equal(result.shots[0].trim_in_sec, 0);
  assert.equal(result.shots[2].trim_in_sec, 10);
  assert.equal(result.shots[2].trim_out_sec, 14);
  assert.equal(result.shifted_runs.length, 1);
});
