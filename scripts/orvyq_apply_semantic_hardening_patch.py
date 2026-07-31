#!/usr/bin/env python3
import json
import os
import subprocess
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def run(*args: str) -> None:
    subprocess.run(args, check=True)


source_path = Path("scripts/orvyq_acquire_footage_demand.mjs")
source = source_path.read_text()
old_matcher = '''export function matchesSemanticText(value, item) {
  const constraints = item.semantic_title_constraints;
  if (!constraints) return true;
  const haystack = normalizeText(value);
  const groups = Array.isArray(constraints.required_any_groups)
    ? constraints.required_any_groups
    : [];
  for (const group of groups) {
    const terms = Array.isArray(group) ? group : [];
    if (!terms.length || !terms.some((term) => haystack.includes(normalizeText(term)))) {
      return false;
    }
  }
  const forbidden = Array.isArray(constraints.forbidden_terms)
    ? constraints.forbidden_terms
    : [];
  return !forbidden.some((term) => haystack.includes(normalizeText(term)));
}
'''
new_matcher = '''function containsSemanticTerm(normalizedHaystack, value) {
  const term = normalizeText(value);
  if (!term) return false;
  return ` ${normalizedHaystack} `.includes(` ${term} `);
}

export function semanticMatchScore(value, item) {
  const constraints = item.semantic_title_constraints;
  if (!constraints) return 0;
  const haystack = normalizeText(value);
  const forbidden = Array.isArray(constraints.forbidden_terms)
    ? constraints.forbidden_terms
    : [];
  if (forbidden.some((term) => containsSemanticTerm(haystack, term))) {
    return Number.NEGATIVE_INFINITY;
  }
  const groups = Array.isArray(constraints.required_any_groups)
    ? constraints.required_any_groups
    : [];
  let score = 0;
  for (const group of groups) {
    const terms = Array.isArray(group) ? group : [];
    const matched = terms
      .map((term) => normalizeText(term))
      .filter((term) => term && containsSemanticTerm(haystack, term));
    if (!terms.length || !matched.length) return Number.NEGATIVE_INFINITY;
    score += Math.max(...matched.map((term) => term.split(" ").length * 100 + term.length));
  }
  return score;
}

export function matchesSemanticText(value, item) {
  return Number.isFinite(semanticMatchScore(value, item));
}
'''
source = replace_once(source, old_matcher, new_matcher, "semantic matcher")
source = replace_once(source, "async function search(query, key, perPage) {", "async function search(query, key, perPage, page = 1) {", "paged search signature")
source = replace_once(source, '  url.searchParams.set("per_page", String(perPage));\n', '  url.searchParams.set("per_page", String(perPage));\n  url.searchParams.set("page", String(page));\n', "paged search parameter")
source = replace_once(source, "function pick(videos, usedIds, item) {", "export function pick(videos, usedIds, item) {", "pick export")
source = replace_once(
    source,
    "  const candidates = [];\n  for (const video of videos) {\n    if (usedIds.has(String(video.id)) || video.duration < min || video.duration > max) continue;",
    "  const candidates = [];\n  const rejectedIds = new Set((item.rejected_provider_asset_ids || []).map(String));\n  for (const video of videos) {\n    if (usedIds.has(String(video.id)) || rejectedIds.has(String(video.id)) || video.duration < min || video.duration > max) continue;",
    "rejected provider filtering",
)
source = replace_once(
    source,
    "    candidates.push({ video, rendition: files[0] });",
    '    candidates.push({ video, rendition: files[0], semanticScore: semanticMatchScore(`${video?.url || ""} ${video?.user?.name || ""}`, item) });',
    "candidate semantic score",
)
source = replace_once(
    source,
    "  candidates.sort((a, b) => Math.abs(a.video.duration - (min + 4)) - Math.abs(b.video.duration - (min + 4)));",
    "  candidates.sort((a, b) =>\n    b.semanticScore - a.semanticScore ||\n    Math.abs(a.video.duration - (min + 4)) - Math.abs(b.video.duration - (min + 4))\n  );",
    "semantic-first ranking",
)
old_preflight = '''    let selected;
    let selectedQuery;
    for (const query of queries) {
      selected = pick(
        await searchFn(query, key, Number(policy.results_per_query || 30)),
        usedIds,
        item,
      );
      if (selected) {
        selectedQuery = query;
        break;
      }
    }
'''
new_preflight = '''    let selected;
    let selectedQuery;
    const pagesPerQuery = Math.max(1, Math.min(10, Number(policy.pages_per_query || 3)));
    const perPage = Number(policy.results_per_query || 30);
    for (const query of queries) {
      const videosById = new Map();
      for (let page = 1; page <= pagesPerQuery; page += 1) {
        const pageVideos = await searchFn(query, key, perPage, page);
        for (const video of pageVideos) videosById.set(String(video.id), video);
        if (pageVideos.length < perPage) break;
      }
      const candidate = pick([...videosById.values()], usedIds, item);
      if (!candidate) continue;
      const candidateDistance = Math.abs(candidate.video.duration - (Number(item.min_duration_seconds || 8) + 4));
      const selectedDistance = selected
        ? Math.abs(selected.video.duration - (Number(item.min_duration_seconds || 8) + 4))
        : Number.POSITIVE_INFINITY;
      if (
        !selected ||
        candidate.semanticScore > selected.semanticScore ||
        (candidate.semanticScore === selected.semanticScore && candidateDistance < selectedDistance)
      ) {
        selected = candidate;
        selectedQuery = query;
      }
    }
'''
source = replace_once(source, old_preflight, new_preflight, "multi-page global preflight ranking")
source_path.write_text(source)

override_path = Path("projects/002-the-new-war-beneath-the-ocean/research/footage_constraint_overrides.json")
override = json.loads(override_path.read_text())
scenes = override["scenes"]

def add_forbidden(scene, terms):
    current = scenes[scene].setdefault("forbidden_terms", [])
    for term in terms:
        if term not in current:
            current.append(term)

add_forbidden("scene_005", ["textile", "garment", "sewing", "fabric", "clothing"])
add_forbidden("scene_024", ["fishing", "fisherman", "trawler", "angler"])
add_forbidden("scene_029", ["school", "student", "classroom", "graduation", "children", "child"])
scenes["scene_018"] = {
    "queries": ["metal recycling industrial sorting", "scrap metal recycling facility", "industrial metal waste processing"],
    "fallback_queries": ["metal recovery conveyor", "scrap steel recycling plant", "industrial material sorting metal"],
    "required_any_groups": [["metal", "steel", "scrap", "aluminum", "copper"], ["recycling", "sorting", "recovery", "processing", "facility", "plant"]],
    "forbidden_terms": ["paper", "cardboard", "plastic", "bottle", "glass", "household"],
}
scenes["scene_025"] = {
    "queries": ["underwater ROV robot seafloor", "deep sea submersible robot", "ocean floor remotely operated vehicle"],
    "fallback_queries": ["underwater exploration robot", "marine ROV deep ocean", "submersible vehicle seabed"],
    "required_any_groups": [["underwater", "deep sea", "ocean", "seafloor", "seabed", "marine"], ["rov", "robot", "robotic", "submersible", "vehicle"]],
    "forbidden_terms": ["massage", "therapy", "medical", "toy", "humanoid", "android", "warehouse", "delivery"],
}
override_path.write_text(json.dumps(override, indent=2, ensure_ascii=False) + "\n")

plan_path = Path("projects/002-the-new-war-beneath-the-ocean/research/footage_acquisition_plan.json")
plan = json.loads(plan_path.read_text())
plan.setdefault("acquisition_policy", {})["pages_per_query"] = 3
plan_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n")

regression = '''import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesSemanticText, semanticMatchScore, pick } from "./orvyq_acquire_footage_demand.mjs";

const hd = (id) => ({ id, file_type: "video/mp4", width: 1920, height: 1080, link: `https://videos.pexels.com/video-files/${id}/${id}-hd.mp4` });

test("semantic terms use token and phrase boundaries instead of raw substrings", () => {
  const item = { semantic_title_constraints: { required_any_groups: [["car"]], forbidden_terms: [] } };
  assert.equal(matchesSemanticText("cargo ship at sea", item), false);
  assert.equal(matchesSemanticText("car driving at sea port", item), true);
});

test("forbidden terms also use token and phrase boundaries", () => {
  const item = { semantic_title_constraints: { required_any_groups: [["marine"]], forbidden_terms: ["lab"] } };
  assert.equal(matchesSemanticText("marine collaboration vessel", item), true);
  assert.equal(matchesSemanticText("marine lab vessel", item), false);
});

test("selection prioritizes the most specific semantic match before duration", () => {
  const item = { min_duration_seconds: 8, max_duration_seconds: 30, semantic_title_constraints: { required_any_groups: [["research", "scientific research"], ["vessel"]], forbidden_terms: [] } };
  const generic = { id: 101, duration: 12, url: "https://www.pexels.com/video/research-vessel-101/", user: { name: "Creator" }, video_files: [hd(201)] };
  const specific = { id: 102, duration: 22, url: "https://www.pexels.com/video/scientific-research-vessel-102/", user: { name: "Creator" }, video_files: [hd(202)] };
  assert.ok(semanticMatchScore(specific.url, item) > semanticMatchScore(generic.url, item));
  assert.equal(pick([generic, specific], new Set(), item).video.id, 102);
});

test("selection excludes provider assets rejected by prior review", () => {
  const item = { min_duration_seconds: 8, max_duration_seconds: 30, rejected_provider_asset_ids: ["101"], semantic_title_constraints: { required_any_groups: [["research"], ["vessel"]], forbidden_terms: [] } };
  const rejected = { id: 101, duration: 12, url: "https://www.pexels.com/video/research-vessel-101/", user: { name: "Creator" }, video_files: [hd(201)] };
  assert.equal(pick([rejected], new Set(), item), null);
});
'''
Path("scripts/orvyq_acquire_footage_semantic_regression.test.mjs").write_text(regression)

package_path = Path("package.json")
package = json.loads(package_path.read_text())
package.get("scripts", {}).pop("postinstall", None)
package_path.write_text(json.dumps(package, indent=2) + "\n")
Path(__file__).unlink(missing_ok=True)

run("node", "--test", "scripts/orvyq_acquire_footage_demand.test.mjs", "scripts/orvyq_acquire_footage_semantic.test.mjs", "scripts/orvyq_acquire_footage_semantic_regression.test.mjs")
run("git", "config", "user.name", "orvyq-maintenance-bot")
run("git", "config", "user.email", "orvyq-maintenance-bot@users.noreply.github.com")
run("git", "add", "-A")
run("git", "commit", "-m", "Harden footage semantic matching and acquisition")
branch = os.environ.get("TARGET_BRANCH", "agent/systemic-visual-evidence-balance")
run("git", "push", "origin", f"HEAD:{branch}")
