import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCanonicalPausePlan } from "./orvyq_resolve_pauses.mjs";

const PROJECT_ID = "000-example-project";

// Integration test against the real, committed project data (direction/
// editorial_pause_map.json + voice/narration_alignment.json are both
// checked in -- no ffmpeg/network required), not a synthetic fixture: this
// is the one place a regression in the real pause map's closing structure
// would be caught before it reaches CI.
test("resolveCanonicalPausePlan resolves the real project's pause anchors with a single, well-separated closing pause", async () => {
  const plan = await resolveCanonicalPausePlan(PROJECT_ID);
  assert.ok(plan.pauses.length >= 1);
  assert.ok(plan.narration_end_seconds > 0);

  // Regression guard for the rejected review's confirmed "closing pauses
  // too long and close together" defect: direction/editorial_pause_map.json
  // used to declare two closing anchors ("That work hasn't been done yet."
  // and the final line) whose resolved source_time_seconds sat within ~4.5s
  // of each other and of narration end -- both landing inside any
  // reasonable "final 30 seconds" window. The fix removed the earlier of
  // the two, leaving exactly one pause anchor in the film's true closing
  // passage.
  const closingWindowSeconds = 30;
  const pausesInClosingWindow = plan.pauses.filter((pause) => plan.narration_end_seconds - pause.source_time_seconds <= closingWindowSeconds);
  assert.equal(pausesInClosingWindow.length, 1, `expected exactly one pause anchor in the final ${closingWindowSeconds}s, got ${pausesInClosingWindow.length}: ${JSON.stringify(pausesInClosingWindow)}`);
  const closingTotalSeconds = pausesInClosingWindow.reduce((sum, pause) => sum + pause.duration_seconds, 0);
  assert.ok(closingTotalSeconds <= 6, `combined closing-window pause time should stay <= 6s, got ${closingTotalSeconds}s`);

  for (const pause of plan.pauses) {
    assert.ok(pause.pause_id);
    assert.ok(pause.anchor_text);
    assert.ok(pause.sound_cue);
    assert.ok(Number.isFinite(pause.source_time_seconds));
    assert.ok(pause.duration_seconds > 0);
  }
});
