from pathlib import Path
import json
import re

plan_path = Path("projects/002-the-new-war-beneath-the-ocean/config/editorial_asset_plan.json")
plan = json.loads(plan_path.read_text())
removed_caps = []
for claim_id, assignments in plan.get("graphic_break_assignments", {}).items():
    for slice_index, assignment in assignments.items():
        if "maxSeconds" in assignment:
            removed_caps.append((claim_id, slice_index, assignment.pop("maxSeconds")))
if not removed_caps:
    raise SystemExit("Expected at least one legacy maxSeconds cap to remove")
plan_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n")
print(f"Removed {len(removed_caps)} brittle maxSeconds caps: {removed_caps}")

source_path = Path("scripts/orvyq_full_production_plan.mjs")
source = source_path.read_text()

old = """  const rawShots = [];
  let currentSection = null;
  let isFirstWindowOverall = true;"""
new = """  const rawShots = [];
  let currentSection = null;
  let isFirstWindowOverall = true;
  // Section 1 keeps its dedicated full-screen title because it is also a
  // deliberate break between two opening evidence shots. Later section
  // titles are carried as overlays on their own source-backed evidence
  // transition shots. This preserves the exact timeline and section rhythm
  // without spending generic full-screen-card or contextual-footage budget.
  let pendingSectionOverlay = null;"""
if source.count(old) != 1:
    raise SystemExit("Could not locate raw-shot state declaration exactly once")
source = source.replace(old, new)

pattern = re.compile(
    r"    const deferTitleCard = isNewSection && isFirstWindowOverall;\n"
    r"    let titleCardShot = null;\n"
    r"    if \(isNewSection\) \{\n"
    r".*?"
    r"      window\.coverStart \+= TITLE_CARD_SECONDS;\n"
    r"    \}\n"
    r"    const slices = sliceClaimWindow",
    re.S,
)
replacement = """    const deferTitleCard = isNewSection && isFirstWindowOverall;
    let titleCardShot = null;
    if (isNewSection) {
      if (pendingSectionOverlay)
        throw new Error(`${currentSection}: section-title overlay was not consumed before ${window.claim.section_id}`);
      currentSection = window.claim.section_id;
      const section = sections.find((s) => s.section_id === currentSection);
      const sectionTitle = titleCase(currentSection);
      if (deferTitleCard) {
        titleCardShot = {
          kind: "graphic",
          section_id: currentSection,
          claim_id: sectionFirstClaim.get(currentSection),
          start: window.coverStart,
          end: window.coverStart + TITLE_CARD_SECONDS,
          graphic: { type: "section_title", mode: "brand", title: sectionTitle, subtitle: section?.visual_strategy || null },
          role: "graphic"
        };
      } else {
        rawShots.push({
          kind: "evidence",
          evidenceKind: "boundary",
          section_id: currentSection,
          claim_id: sectionFirstClaim.get(currentSection),
          start: window.coverStart,
          end: window.coverStart + TITLE_CARD_SECONDS,
          role: "evidence",
          overlay: {
            type: "boundary",
            eyebrow: `SECTION ${String(sections.findIndex((candidate) => candidate.section_id === currentSection) + 1).padStart(2, "0")}`,
            title: sectionTitle,
            font_px: 36
          }
        });
      }
      window.coverStart += TITLE_CARD_SECONDS;
    }
    const slices = sliceClaimWindow"""
source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f"Expected to replace one section-title block, replaced {count}")

old = """      ...(shot.dissolveIn ? { transition_in: "dissolve" } : {})
    };"""
new = """      ...(shot.dissolveIn ? { transition_in: "dissolve" } : {}),
      ...(shot.overlay ? { overlay: shot.overlay } : {})
    };"""
if source.count(old) != 1:
    raise SystemExit("Could not locate assembled-shot base block exactly once")
source = source.replace(old, new)
source_path.write_text(source)

scene_path = Path("templates/remotion/src/Scene.tsx")
scene = scene_path.read_text()
old = '{assetType === "footage" ? ('
new = '{assetType === "footage" || editorialOverlay ? ('
if scene.count(old) != 1:
    raise SystemExit(f"Expected one footage scrim condition, found {scene.count(old)}")
scene = scene.replace(old, new)
old = '{assetType === "footage" && editorialOverlay ? ('
new = '{assetType !== "graphic" && editorialOverlay ? ('
if scene.count(old) != 1:
    raise SystemExit(f"Expected one footage overlay condition, found {scene.count(old)}")
scene = scene.replace(old, new)
scene_path.write_text(scene)
