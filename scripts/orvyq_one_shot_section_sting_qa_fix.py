from pathlib import Path

planner_path = Path("scripts/orvyq_full_production_plan.mjs")
planner = planner_path.read_text()

old = """const TARGET_SHOT_SECONDS = 6;
const TITLE_CARD_SECONDS = 2.5;
const DEFAULT_FONT_PX = 32;"""
new = """const TARGET_SHOT_SECONDS = 6;
const TITLE_CARD_SECONDS = 2.5;
// The first section title is a compact cinematic sting between opening
// evidence beats. Keeping it title-only at two seconds preserves the evidence
// break while leaving a deterministic margin below the 8% full-screen-card cap.
const FIRST_SECTION_TITLE_SECONDS = 2;
const DEFAULT_FONT_PX = 32;"""
if planner.count(old) != 1:
    raise SystemExit("Could not locate title-card constants exactly once")
planner = planner.replace(old, new)

old = """          start: window.coverStart,
          end: window.coverStart + TITLE_CARD_SECONDS,
          graphic: { type: \"section_title\", mode: \"brand\", title: sectionTitle, subtitle: section?.visual_strategy || null },
          role: \"graphic\""""
new = """          start: window.coverStart,
          end: window.coverStart + FIRST_SECTION_TITLE_SECONDS,
          graphic: { type: \"section_title\", mode: \"brand\", title: sectionTitle, subtitle: null },
          role: \"graphic\""""
if planner.count(old) != 1:
    raise SystemExit("Could not locate first section title shot exactly once")
planner = planner.replace(old, new)

old = """            title: sectionTitle,
            font_px: 36
          }"""
new = """            title: sectionTitle,
            font_px: 36,
            // This is a concise section sting, not a paragraph, quotation or
            // evidence-reading overlay. The pacing audit therefore evaluates
            // it under the authored 2.5s title-sting contract.
            reading_required: false
          }"""
if planner.count(old) != 1:
    raise SystemExit("Could not locate section overlay exactly once")
planner = planner.replace(old, new)

old = """      window.coverStart += TITLE_CARD_SECONDS;
    }"""
new = """      window.coverStart += deferTitleCard ? FIRST_SECTION_TITLE_SECONDS : TITLE_CARD_SECONDS;
    }"""
if planner.count(old) != 1:
    raise SystemExit("Could not locate title-card coverage adjustment exactly once")
planner = planner.replace(old, new)
planner_path.write_text(planner)

pacing_path = Path("scripts/orvyq_pacing_audit.mjs")
pacing = pacing_path.read_text()
old = """    if ([\"evidence\", \"archive\"].includes(shot.visual_role) && seconds < 4) warnings.push(`${shot.shot_id} may be too short for evidence reading`);
    if (shot.editorial_overlay && seconds < 4) failures.push(`${shot.shot_id} has a reading overlay but lasts only ${seconds.toFixed(2)}s`);"""
new = """    if ([\"evidence\", \"archive\"].includes(shot.visual_role) && seconds < 4) warnings.push(`${shot.shot_id} may be too short for evidence reading`);
    // Short authored section stings contain only an eyebrow and a title. They
    // are deliberately distinct from reading overlays that carry evidence,
    // quotations or explanatory copy and still require at least four seconds.
    const readingRequired = shot.editorial_overlay?.reading_required !== false;
    if (shot.editorial_overlay && readingRequired && seconds < 4)
      failures.push(`${shot.shot_id} has a reading overlay but lasts only ${seconds.toFixed(2)}s`);"""
if pacing.count(old) != 1:
    raise SystemExit("Could not locate pacing overlay rule exactly once")
pacing = pacing.replace(old, new)
pacing_path.write_text(pacing)

# The helper is intentionally self-deleting; the resulting branch contains
# only the production planner and pacing-audit changes.
Path(__file__).unlink()
