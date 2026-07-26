import test from "node:test";
import assert from "node:assert/strict";
import { auditRetentionQuestions } from "./orvyq_retention_question_audit.mjs";

const HUMAN_FIRST_HOOK_ASSET = "assets/footage/scene_024_6e6f4af26cad60cc78930d6d.mp4";

function validPlan() {
  const hookQuestion = {
    eyebrow: "THE QUESTION",
    question: "What happens when AI moves faster than our ability to control it?",
    deck: "Every lab sees the danger.",
  };
  const shots = [
    {
      shot_id: "shot_001",
      start_frame: 0,
      end_frame: 105,
      hook_footage: true,
      asset_type: "footage",
      video_asset: HUMAN_FIRST_HOOK_ASSET,
      hook_question: hookQuestion,
    },
    { shot_id: "shot_002", start_frame: 105, end_frame: 180, hook_footage: true, asset_type: "footage", video_asset: "assets/footage/city.mp4" },
    { shot_id: "shot_003", start_frame: 180, end_frame: 255, hook_footage: true, asset_type: "footage", video_asset: "assets/footage/network.mp4" },
    { shot_id: "shot_004", start_frame: 255, end_frame: 330, hook_footage: true, asset_type: "footage", video_asset: "assets/footage/institution.mp4" },
    {
      shot_id: "shot_005",
      start_frame: 330,
      end_frame: 510,
      asset_type: "evidence",
      evidence: {
        kind: "split_documents",
        image_assets: [
          "assets/evidence/anthropic.png",
          "assets/evidence/deepmind.png",
        ],
      },
    },
  ];
  const durations = [120, 60, 60, 60, 150, 60, 180];
  let cursor = 510;
  for (let index = 0; index < durations.length; index += 1) {
    const duration = durations[index];
    shots.push({
      shot_id: `shot_${String(index + 6).padStart(3, "0")}`,
      start_frame: cursor,
      end_frame: cursor + duration,
      asset_type: "footage",
      emphasis_card: {
        eyebrow: "THE QUESTION",
        title: `What does question number ${index + 1} reveal?`,
        anchor_text: `Anchor ${index + 1}.`,
      },
    });
    cursor += duration;
  }
  return { fps: 30, shots };
}

test("retention audit passes a human-first hook, two-source opening and 3+4 question rhythm", () => {
  const result = auditRetentionQuestions(validPlan());
  assert.equal(result.pass, true, result.failures.join("; "));
  assert.equal(result.pause_question_count, 7);
  assert.equal(result.full_pause_count, 3);
  assert.equal(result.brief_accent_count, 4);
  assert.equal(result.opening_document_count, 2);
  assert.equal(result.human_first_hook, true);
});

test("retention audit rejects a non-human opening, document carousel and flat pause rhythm", () => {
  const plan = validPlan();
  delete plan.shots[0].hook_question;
  plan.shots[0].video_asset = "assets/footage/network.mp4";
  plan.shots[5].emphasis_card.title = "A statement, not a question";
  plan.shots[4].evidence.kind = "image_sequence";
  plan.shots[4].evidence.image_assets.push("assets/evidence/third.png");
  plan.shots[6].end_frame = plan.shots[6].start_frame + 120;
  const result = auditRetentionQuestions(plan);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes("hook_question")));
  assert.ok(result.failures.some((failure) => failure.includes("human monitoring")));
  assert.ok(result.failures.some((failure) => failure.includes("not a question")));
  assert.ok(result.failures.some((failure) => failure.includes("page carousel")));
  assert.ok(result.failures.some((failure) => failure.includes("full pauses")));
});
