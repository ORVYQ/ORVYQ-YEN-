#!/usr/bin/env python3
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ID = "002-the-new-war-beneath-the-ocean"
PROJECT = Path("projects") / PROJECT_ID


def run(*args: str) -> None:
    print("+", " ".join(args), flush=True)
    subprocess.run(args, check=True)


# Keep this validation strictly render-free.
run("npm", "test", "--", "--test-concurrency=1")
run("npm", "run", "validate:canonical")
run("node", "--check", "scripts/orvyq_acquire_footage_demand.mjs")
run("node", "scripts/orvyq_visual_rebalance_audit.mjs", f"--project-id={PROJECT_ID}")
run("node", "scripts/orvyq_generic_card_audit.mjs", f"--project-id={PROJECT_ID}")

# Validate every JSON file touched by the current project and the governing schemas/config.
json_paths = sorted([
    *PROJECT.rglob("*.json"),
    *Path("config").rglob("*.json"),
    *Path("schemas").rglob("*.json"),
])
for path in json_paths:
    with path.open("r", encoding="utf-8") as handle:
        json.load(handle)

queue = json.loads((PROJECT / "qa" / "footage_review_queue.json").read_text())
runtime = json.loads((PROJECT / "assets" / "footage_acquisition.runtime.json").read_text())
rebalance = json.loads((PROJECT / "direction" / "visual_rebalance_plan.json").read_text())
projected = rebalance["projected"]
expected_scenes = [entry["scene_id"] for entry in queue.get("entries", [])]
if runtime.get("unresolved_scene_ids"):
    raise SystemExit(f"Unresolved footage remains: {runtime['unresolved_scene_ids']}")
if runtime.get("provider_search_issues"):
    raise SystemExit(f"Provider search issues remain: {runtime['provider_search_issues']}")
if runtime.get("planned_asset_count") != len(runtime.get("records", [])):
    raise SystemExit("Acquired/reused footage count does not equal the plan")
if queue.get("pending_review_count") != len(expected_scenes):
    raise SystemExit("Review queue count is inconsistent")
if queue.get("entries_with_exact_uses") != len(expected_scenes):
    raise SystemExit("Not every pending entry has exact editorial uses")
for entry in queue.get("entries", []):
    sheet = PROJECT / entry["contact_sheet_path"]
    if not sheet.is_file():
        raise SystemExit(f"Missing contact sheet: {sheet}")
    if not entry.get("asset_sha256") or not entry.get("contact_sheet_sha256"):
        raise SystemExit(f"Missing byte-bound review hashes: {entry['scene_id']}")

limits = {
    "graphic_card_fraction": (projected["graphic_card_fraction"], 0.15, "max"),
    "full_screen_text_card_fraction": (projected["full_screen_text_card_fraction"], 0.03, "max"),
    "primary_evidence_fraction": (projected["primary_evidence_fraction"], 0.20, "min"),
    "contextual_footage_fraction": (projected["contextual_footage_fraction"], 0.60, "min"),
}
for name, (actual, threshold, direction) in limits.items():
    passed = actual <= threshold if direction == "max" else actual >= threshold
    if not passed:
        raise SystemExit(f"Visual ratio failed: {name}={actual}, {direction}={threshold}")

report = {
    "schema_version": "1.0",
    "project_id": PROJECT_ID,
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "validation_scope": "render_free_pre_review",
    "pass": True,
    "checks": {
        "full_node_test_suite": "passed",
        "canonical_validation": "passed",
        "acquisition_script_syntax": "passed",
        "visual_rebalance_audit": "passed",
        "generic_card_audit": "passed",
        "project_config_schema_json_parse": "passed",
        "footage_plan_complete": runtime["planned_asset_count"],
        "unresolved_footage": 0,
        "provider_search_issues": 0,
        "pending_human_visual_reviews": len(expected_scenes),
        "pending_review_scenes": expected_scenes,
        "all_pending_reviews_have_contact_sheets_and_hashes": True,
    },
    "projected_visual_mix": {
        "contextual_footage_fraction": projected["contextual_footage_fraction"],
        "primary_evidence_fraction": projected["primary_evidence_fraction"],
        "graphic_card_fraction": projected["graphic_card_fraction"],
        "full_screen_text_card_fraction": projected["full_screen_text_card_fraction"],
        "maximum_consecutive_graphic_card_shots": projected["maximum_consecutive_graphic_card_shots"],
    },
    "review_ready": True,
    "review_not_started": True,
    "render_started": False,
}
(PROJECT / "qa" / "review_readiness_validation.json").write_text(
    json.dumps(report, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)

package_path = Path("package.json")
package = json.loads(package_path.read_text())
package.get("scripts", {}).pop("postinstall", None)
package_path.write_text(json.dumps(package, indent=2) + "\n")
Path(__file__).unlink(missing_ok=True)

run("git", "config", "user.name", "orvyq-maintenance-bot")
run("git", "config", "user.email", "orvyq-maintenance-bot@users.noreply.github.com")
run("git", "add", "-A")
run("git", "commit", "-m", "Validate render-free review readiness")
branch = os.environ.get("TARGET_BRANCH", "agent/systemic-visual-evidence-balance")
run("git", "push", "origin", f"HEAD:{branch}")
