from pathlib import Path

path = Path("scripts/orvyq_edit_plan_tests.mjs")
source = path.read_text()
old = '  assert.match(captions.captions[0].text, /^Every major AI lab\\b/i);'
new = '''  // Caption content is project-authored. The cross-project invariant is that
  // the first timed caption contains real narration text; pinning this smoke
  // test to Project 001's opening sentence makes every fresh project fail
  // despite correct timing, transcript alignment and caption generation.
  assert.ok(captions.captions[0].text.trim().length > 0, "first caption must contain canonical narration text");'''
if source.count(old) != 1:
    raise SystemExit(f"Expected one Project 001 caption assertion, found {source.count(old)}")
path.write_text(source.replace(old, new))
Path(__file__).unlink()
