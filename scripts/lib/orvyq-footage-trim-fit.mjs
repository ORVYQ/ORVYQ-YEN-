const TRIM_TOLERANCE_SECONDS = 0.02;

function clone(value) {
  return structuredClone(value);
}

function footageAsset(shot) {
  return shot?.asset_type === "footage" ? shot.asset || shot.video_asset || null : null;
}

function trimIn(shot) {
  return Number(shot?.trim_in_sec ?? shot?.trimInSec);
}

function trimOut(shot) {
  return Number(shot?.trim_out_sec ?? shot?.trimOutSec);
}

function shotDuration(shot) {
  const duration = Number(shot?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Footage shot has invalid duration ${shot?.duration}`);
  }
  return duration;
}

function continues(previous, current) {
  const previousAsset = footageAsset(previous);
  const currentAsset = footageAsset(current);
  if (!previousAsset || previousAsset !== currentAsset) return false;
  const previousOut = trimOut(previous);
  const currentIn = trimIn(current);
  return Number.isFinite(previousOut) && Number.isFinite(currentIn) && Math.abs(previousOut - currentIn) < TRIM_TOLERANCE_SECONDS;
}

function normalizeDurationMap(sourceDurationByAsset) {
  if (sourceDurationByAsset instanceof Map) return sourceDurationByAsset;
  return new Map(Object.entries(sourceDurationByAsset || {}));
}

export function fitContiguousFootageRunsToSources({ shots = [], sourceDurationByAsset = new Map() }) {
  const output = clone(shots);
  const durations = normalizeDurationMap(sourceDurationByAsset);
  const shiftedRuns = [];

  let index = 0;
  while (index < output.length) {
    const asset = footageAsset(output[index]);
    if (!asset) {
      index += 1;
      continue;
    }

    const startIndex = index;
    let endIndex = index;
    while (endIndex + 1 < output.length && continues(output[endIndex], output[endIndex + 1])) {
      endIndex += 1;
    }

    const sourceDuration = Number(durations.get(asset));
    const firstTrimIn = trimIn(output[startIndex]);
    const lastTrimOut = trimOut(output[endIndex]);
    if (!Number.isFinite(firstTrimIn) || !Number.isFinite(lastTrimOut)) {
      throw new Error(`${asset} has a contiguous footage run with invalid trim bounds`);
    }

    if (Number.isFinite(sourceDuration) && sourceDuration > 0 && lastTrimOut > sourceDuration + 0.001) {
      const totalDuration = output
        .slice(startIndex, endIndex + 1)
        .reduce((sum, shot) => sum + shotDuration(shot), 0);
      if (totalDuration > sourceDuration + 0.001) {
        throw new Error(
          `${asset} cannot fit contiguous footage run ${startIndex}-${endIndex}: ` +
            `${totalDuration.toFixed(3)}s required, ${sourceDuration.toFixed(3)}s available`,
        );
      }

      const shiftedStart = Math.max(0, sourceDuration - totalDuration);
      let cursor = shiftedStart;
      for (let runIndex = startIndex; runIndex <= endIndex; runIndex += 1) {
        const duration = shotDuration(output[runIndex]);
        output[runIndex].trim_in_sec = Number(cursor.toFixed(6));
        cursor += duration;
        output[runIndex].trim_out_sec = Number(cursor.toFixed(6));
      }
      shiftedRuns.push({
        asset,
        start_index: startIndex,
        end_index: endIndex,
        original_trim_in_sec: firstTrimIn,
        original_trim_out_sec: lastTrimOut,
        fitted_trim_in_sec: Number(shiftedStart.toFixed(6)),
        fitted_trim_out_sec: Number(cursor.toFixed(6)),
        source_duration_seconds: sourceDuration,
        reason: "The contiguous approved-footage run was shifted earlier inside the same source because a downstream extension exhausted the source tail.",
      });
    }

    index = endIndex + 1;
  }

  return { shots: output, shifted_runs: shiftedRuns };
}
