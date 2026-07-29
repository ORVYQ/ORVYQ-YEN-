from pathlib import Path

path = Path("scripts/orvyq_edit_plan_tests.mjs")
source = path.read_text()
old = '''  if (plan.mode === "full") {
    const approvalPath = path.join(dir, "qa", "proof_approval.json");
    const narrationPath = path.join(dir, "voice", "narration_status.json");
    assert.ok(await pathExists(approvalPath), "full render requires qa/proof_approval.json");
    assert.ok(await pathExists(narrationPath));
    const [approval, narration] = await Promise.all([readJson(approvalPath), readJson(narrationPath)]);
    assert.equal(approval.approved, true, "the frozen candidate that produced the proof has not been approved");
    assert.ok(approval.frozen_candidate_hash, "proof approval must reference a frozen candidate hash");
    assert.equal(narration.full_narration_requires_regeneration, false);
    assert.equal(narration.full_narration_approved, true);
  }
'''
new = '''  // Candidate Validation intentionally builds the complete full-length edit
  // before a human review exists. Requiring qa/proof_approval.json here made
  // the lifecycle circular: no 720p review before Candidate Validation PASS,
  // but no Candidate Validation PASS before approval of that review. Final
  // Encode owns the real approval gate (.github/workflows/orvyq-final-encode.yml
  // verifies quality_control_approved, review_run_id and proof_approval.json
  // before downloading or rendering the approved immutable bundle).
'''
if source.count(old) != 1:
    raise SystemExit(f"Expected one circular approval block, found {source.count(old)}")
path.write_text(source.replace(old, new))
Path(__file__).unlink()
