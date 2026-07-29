import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceContent, claimLimitation } from "./orvyq-evidence-authoring.mjs";

const SECTION = { section_id: "SEC_01_TEST", title: "Test Section", dramatic_function: "Establish the test premise." };
const SOURCE_A = { source_id: "SRC_A", publisher: "Example Institute", title: "Example Report One", publication_date: "2024-01-15", limitation: "Example limitation text." };
const SOURCE_B = { source_id: "SRC_B", publisher: "Other Authority", title: "Example Report Two", publication_date: "2025-06-01" };

function claim(overrides = {}) {
  return {
    claim_id: "CLM_001_TEST_CLAIM",
    section_id: "SEC_01_TEST",
    importance: 5,
    narration_excerpt: "This is the real narrated claim text.",
    status: "verified",
    source_ids: ["SRC_A", "SRC_B"],
    evidence_requirements: ["Show the real requirement.", "Do not overstate the finding."],
    ...overrides,
  };
}

test("source_timeline varies across repeated occurrences", () => {
  const c = claim();
  const occ0 = buildEvidenceContent({ claim: c, kind: "source_timeline", role: "evidence", displaySources: [SOURCE_A, SOURCE_B], ownSources: [SOURCE_A, SOURCE_B], section: SECTION, occurrence: 0 });
  const occ1 = buildEvidenceContent({ claim: c, kind: "source_timeline", role: "evidence", displaySources: [SOURCE_A, SOURCE_B], ownSources: [SOURCE_A, SOURCE_B], section: SECTION, occurrence: 1 });
  assert.ok(occ0.items.length >= 2 && occ0.items.length <= 4);
  for (const item of occ0.items) { assert.ok(item.label); assert.ok(item.value); }
  assert.notEqual(occ0.title, occ1.title);
  assert.notDeepEqual(occ0.items, occ1.items);
});

test("source_article never contains unrelated or raw instruction content", () => {
  const c = claim();
  const result = buildEvidenceContent({ claim: c, kind: "source_article", role: "evidence", displaySources: [SOURCE_A], ownSources: [SOURCE_A], section: SECTION, occurrence: 0 });
  assert.ok(result.items.length >= 2);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("16 leading models"));
  for (const requirement of c.evidence_requirements) assert.ok(!serialized.includes(requirement));
});

test("concept_map and evidence_chain produce meaningful steps", () => {
  const c = claim();
  for (const kind of ["concept_map", "evidence_chain"]) {
    const result = buildEvidenceContent({ claim: c, kind, role: "evidence", displaySources: [SOURCE_A], ownSources: [SOURCE_A], section: SECTION, occurrence: 0 });
    assert.ok(result.steps.length >= 3 && result.steps.length <= 5);
    for (const step of result.steps) assert.ok(step.trim().length > 0);
  }
});

test("comparison and boundary always populate both sides", () => {
  const c = claim();
  for (const kind of ["comparison", "boundary"]) {
    const result = buildEvidenceContent({ claim: c, kind, role: "evidence", displaySources: [SOURCE_A], ownSources: [SOURCE_A], section: SECTION, occurrence: 0 });
    assert.ok(result.left?.trim());
    assert.ok(result.right?.trim());
  }
});

test("comparison does not invent a source-specific conclusion", () => {
  const c = claim({ evidence_requirements: ["Frame this as the film's own synthesis, not a measured finding."] });
  const result = buildEvidenceContent({ claim: c, kind: "comparison", role: "evidence", displaySources: [SOURCE_B], ownSources: [SOURCE_B], section: SECTION, occurrence: 0 });
  assert.ok(result.left);
  assert.ok(result.right);
});

test("eyebrow and title satisfy legacy content bounds", () => {
  const c = claim();
  const result = buildEvidenceContent({ claim: c, kind: "concept_map", role: "evidence", displaySources: [SOURCE_A], ownSources: [SOURCE_A], section: SECTION, occurrence: 0 });
  assert.equal(result.eyebrow, result.eyebrow.toUpperCase());
  assert.ok(result.eyebrow.length <= 60);
  assert.ok(result.title.length <= 90);
  assert.notEqual(result.title, c.claim_id);
  assert.notEqual(result.title.toLowerCase(), "evidence");
});

test("title truncation retains the distinguishing source title", () => {
  const source = { source_id: "SRC_LONG", publisher: "A Very Long Institutional Publisher Name That Eats Most Of A Budget", title: "The Distinguishing Report Title", publication_date: "2025-01-01" };
  const result = buildEvidenceContent({ claim: claim({ source_ids: ["SRC_LONG"] }), kind: "source_timeline", role: "evidence", displaySources: [source], ownSources: [source], section: SECTION, occurrence: 0 });
  assert.ok(result.title.includes("Distinguishing"));
});

test("role rotation keeps evidence and context openings distinct", () => {
  const c = claim();
  const evidenceRole = buildEvidenceContent({ claim: c, kind: "comparison", role: "evidence", displaySources: [SOURCE_A], ownSources: [SOURCE_A], section: SECTION, occurrence: 0 });
  const contextRole = buildEvidenceContent({ claim: c, kind: "source_article", role: "context", displaySources: [SOURCE_A], ownSources: [SOURCE_A], section: SECTION, occurrence: 0 });
  assert.notEqual(evidenceRole.title, contextRole.title);
});

test("claimLimitation uses only structured source limitation data", () => {
  assert.equal(claimLimitation(claim(), [SOURCE_A, SOURCE_B]), "Example limitation text.");
  const sourceWithDifferentId = { ...SOURCE_A, source_id: "SRC_UNSEEN" };
  assert.equal(claimLimitation(claim({ source_ids: ["SRC_UNSEEN"] }), [sourceWithDifferentId]), "Example limitation text.");
});

test("claimLimitation falls back only to generic attributed commentary policy", () => {
  assert.equal(claimLimitation(claim({ status: "attributed_commentary" }), [SOURCE_B]), "Attributed commentary, not a measured or universal industry finding.");
  assert.equal(claimLimitation(claim({ status: "verified" }), [SOURCE_B]), null);
});

test("raw evidence_requirements never reach any returned display field", () => {
  const requirements = ["Do not imply a universal finding.", "State the test limitation.", "Show official article title/date.", "no decorative stock ticker"];
  const c = claim({ claim_id: "CLM_001_GENERIC", evidence_requirements: requirements });
  for (const kind of ["source_timeline", "source_article", "concept_map", "evidence_chain", "comparison", "boundary"]) {
    for (const role of ["evidence", "context", "metaphor", "archive"]) {
      for (let occurrence = 0; occurrence < 4; occurrence += 1) {
        const serialized = JSON.stringify(buildEvidenceContent({ claim: c, kind, role, displaySources: [SOURCE_A, SOURCE_B], ownSources: [SOURCE_A, SOURCE_B], section: SECTION, occurrence }));
        for (const requirement of requirements) assert.ok(!serialized.includes(requirement));
      }
    }
  }
});

test("recap claims remain source-neutral", () => {
  const recap = claim({ claim_id: "CLM_020_RECAP", source_ids: [], status: "attributed_commentary", evidence_requirements: ["Treat as the film's synthesis."] });
  const result = buildEvidenceContent({ claim: recap, kind: "source_timeline", role: "evidence", displaySources: [SOURCE_A, SOURCE_B], ownSources: [], section: SECTION, occurrence: 0 });
  assert.equal(result.limitation, "Attributed commentary, not a measured or universal industry finding.");
  assert.ok(result.items.length >= 2);
});
