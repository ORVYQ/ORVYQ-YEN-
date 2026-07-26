import test from "node:test";
import assert from "node:assert/strict";
import { auditRetentionQuestions } from "./orvyq_retention_question_audit.mjs";

function validPlan() {
  const hookQuestion = {
    eyebrow: "THE QUESTION",
    question: "What happens when the race to build the most powerful machine moves faster than our ability to control it?",
    deck: "Every lab sees the danger.",
  };
  const shots = [
    { shot_id: "shot_001", start_frame: 0, end_frame: 90, hook_footage: true, asset_type: "footage", hook_question: hookQuestion },
    { shot_id: "shot_002", start_frame: 90, end_frame: 180, hook_footage: true, asset_type: "footage" },
    { shot_id: "shot_003", start_frame: 180, end_frame: 250, hook_footage: true, asset_type: "footage" },
    { shot_id: "shot_004", start_frame: 250, end_frame: 330, hook_footage: true, asset_type: "footage" },
    {
      shot_id: "shot_005",
      start_frame: 330,
      end_frame: 510,
      asset_type: "evidence",
      evidence: {
        kind: "image_sequence",
        image_assets: [
          "assets/evidence/a.png",
          "assets/evidence/b.png",
          "assets/evidence/c.png",
        ],
      },
    },
  ];
  for (let index = 0; index < 7; index += 1) {
    shots.push({
      shot_id: `shot_${String(index + 6).padStart(3, "0")}`,
      start_frame: 510 + index * 120,
      end_frame: 630 + index * 120,
      asset_type: "footage",
      emphasis_card: {
        eyebrow: "THE QUESTION",
        title: `What does question number ${index + 1} reveal?`,
        anchor_text: `Anchor ${index + 1}.`,
      },
    });
  }
  return { fps: 30, shots };
}

test("retention audit passes one continuous hook question, unique pause questions and real documents", () => {
  const result = auditRetentionQuestions(validPlan());
  assert.equal(result.pass, true, result.failures.join("; "));
  assert.equal(result.pause_question_count, 7);
  assert.equal(result.opening_document_count, 3);
});

test("retention audit rejects an empty hook and non-question pauses", () => {
  const plan = validPlan();
  delete plan.shots[0].hook_question;
  plan.shots[5].emphasis_card.title = "A statement, not a question";
  plan.shots[4].evidence.image_assets = [];
  const result = auditRetentionQuestions(plan);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes("hook_question")));
  assert.ok(result.failures.some((failure) => failure.includes("not a question")));
  assert.ok(result.failures.some((failure) => failure.includes("real document pages")));
});
