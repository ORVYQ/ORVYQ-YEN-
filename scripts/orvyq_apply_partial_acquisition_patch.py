#!/usr/bin/env python3
import json
import os
import re
import subprocess
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one regex match, found {count}")
    return updated


def run(*args: str) -> None:
    subprocess.run(args, check=True)


source_path = Path("scripts/orvyq_acquire_footage_demand.mjs")
source = source_path.read_text()

old_terms = '''function containsSemanticTerm(normalizedHaystack, value) {
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
'''
new_terms = '''function semanticTokenStem(token) {
  if (token.length < 4) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("es") && /(s|x|z|ch|sh)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function semanticTokensEqual(left, right) {
  return left === right || semanticTokenStem(left) === semanticTokenStem(right);
}

function containsSemanticTerm(normalizedHaystack, value) {
  const term = normalizeText(value);
  if (!term) return false;
  const haystackTokens = normalizedHaystack.split(" ").filter(Boolean);
  const termTokens = term.split(" ").filter(Boolean);
  if (!termTokens.length || termTokens.length > haystackTokens.length) return false;
  for (let start = 0; start <= haystackTokens.length - termTokens.length; start += 1) {
    if (termTokens.every((token, index) => semanticTokensEqual(haystackTokens[start + index], token))) {
      return true;
    }
  }
  return false;
}

function bestGroupMatchScore(normalizedText, group) {
  const matched = (Array.isArray(group) ? group : [])
    .map((term) => normalizeText(term))
    .filter((term) => term && containsSemanticTerm(normalizedText, term));
  if (!matched.length) return null;
  return Math.max(...matched.map((term) => term.split(" ").length * 100 + term.length));
}

export function evaluateSemanticCandidate(value, item, searchQuery = "") {
  const constraints = item.semantic_title_constraints;
  if (!constraints) {
    return { score: 0, metadataMatchedGroups: 0, queryMatchedGroups: 0, fullyMetadataMatched: true };
  }
  const metadata = normalizeText(value);
  const query = normalizeText(searchQuery);
  const forbidden = Array.isArray(constraints.forbidden_terms)
    ? constraints.forbidden_terms
    : [];
  if (forbidden.some((term) => containsSemanticTerm(metadata, term))) return null;
  const groups = Array.isArray(constraints.required_any_groups)
    ? constraints.required_any_groups
    : [];
  const minimumMetadataGroups = Math.max(
    1,
    Math.min(groups.length || 1, Number(constraints.min_metadata_required_groups || 1)),
  );
  let metadataMatchedGroups = 0;
  let queryMatchedGroups = 0;
  let score = 0;
  for (const group of groups) {
    const metadataScore = bestGroupMatchScore(metadata, group);
    if (metadataScore !== null) {
      metadataMatchedGroups += 1;
      score += 10000 + metadataScore;
      continue;
    }
    const queryScore = bestGroupMatchScore(query, group);
    if (queryScore === null) return null;
    queryMatchedGroups += 1;
    score += 1000 + queryScore;
  }
  if (metadataMatchedGroups < minimumMetadataGroups) return null;
  return {
    score,
    metadataMatchedGroups,
    queryMatchedGroups,
    fullyMetadataMatched: queryMatchedGroups === 0,
  };
}

export function semanticMatchScore(value, item) {
  return evaluateSemanticCandidate(value, item)?.score ?? Number.NEGATIVE_INFINITY;
}
'''
source = replace_once(source, old_terms, new_terms, "semantic token and candidate evaluation")
source = replace_once(
    source,
    '''            semantic_title_constraints: {
              required_any_groups: constraint.required_any_groups || [],
              forbidden_terms: constraint.forbidden_terms || [],
            },''',
    '''            semantic_title_constraints: {
              required_any_groups: constraint.required_any_groups || [],
              forbidden_terms: constraint.forbidden_terms || [],
              min_metadata_required_groups: constraint.min_metadata_required_groups || 1,
            },''',
    "minimum metadata groups propagation",
)

old_pick = '''export function pick(videos, usedIds, item) {
  const min = Number(item.min_duration_seconds || 8);
  const max = Number(item.max_duration_seconds || 120);
  const candidates = [];
  const rejectedIds = new Set((item.rejected_provider_asset_ids || []).map(String));
  for (const video of videos) {
    if (usedIds.has(String(video.id)) || rejectedIds.has(String(video.id)) || video.duration < min || video.duration > max) continue;
    if (!matchesSemanticMetadata(video, item)) continue;
    const files = (video.video_files || []).filter((file) =>
      file.file_type === "video/mp4" &&
      file.width >= 1280 &&
      file.height >= 720 &&
      file.width > file.height &&
      allowedHost(new URL(file.link).hostname)
    );
    if (!files.length) continue;
    files.sort((a, b) => Math.abs(a.width * a.height - 1920 * 1080) - Math.abs(b.width * b.height - 1920 * 1080));
    candidates.push({ video, rendition: files[0], semanticScore: semanticMatchScore(`${video?.url || ""} ${video?.user?.name || ""}`, item) });
  }
  candidates.sort((a, b) =>
    b.semanticScore - a.semanticScore ||
    Math.abs(a.video.duration - (min + 4)) - Math.abs(b.video.duration - (min + 4))
  );
  return candidates[0] || null;
}
'''
new_pick = '''export function pick(videos, usedIds, item, searchQuery = "") {
  const min = Number(item.min_duration_seconds || 8);
  const max = Number(item.max_duration_seconds || 120);
  const candidates = [];
  const rejectedIds = new Set((item.rejected_provider_asset_ids || []).map(String));
  for (const video of videos) {
    if (usedIds.has(String(video.id)) || rejectedIds.has(String(video.id)) || video.duration < min || video.duration > max) continue;
    const semantic = evaluateSemanticCandidate(
      `${video?.url || ""} ${video?.user?.name || ""}`,
      item,
      searchQuery,
    );
    if (!semantic) continue;
    const files = (video.video_files || []).filter((file) =>
      file.file_type === "video/mp4" &&
      file.width >= 1280 &&
      file.height >= 720 &&
      file.width > file.height &&
      allowedHost(new URL(file.link).hostname)
    );
    if (!files.length) continue;
    files.sort((a, b) => Math.abs(a.width * a.height - 1920 * 1080) - Math.abs(b.width * b.height - 1920 * 1080));
    candidates.push({
      video,
      rendition: files[0],
      semanticScore: semantic.score,
      semanticMetadataMatchedGroups: semantic.metadataMatchedGroups,
      semanticQueryMatchedGroups: semantic.queryMatchedGroups,
      semanticMetadataFullyMatched: semantic.fullyMetadataMatched,
    });
  }
  candidates.sort((a, b) =>
    b.semanticScore - a.semanticScore ||
    Math.abs(a.video.duration - (min + 4)) - Math.abs(b.video.duration - (min + 4))
  );
  return candidates[0] || null;
}
'''
source = replace_once(source, old_pick, new_pick, "query-assisted semantic pick")
source = replace_once(
    source,
    '      const candidate = pick([...videosById.values()], usedIds, item);',
    '      const candidate = pick([...videosById.values()], usedIds, item, query);',
    "preflight query context",
)
source = replace_once(
    source,
    '''  if (failures.length) {
    throw new Error(
      `No unique semantically eligible Pexels clip found for ${failures.join(", ")}`,
    );
  }
  return selectedByScene;''',
    '''  return { selectedByScene, failures };''',
    "partial preflight result",
)
source = replace_once(
    source,
    '  const semanticVerified = Boolean(item.semantic_title_constraints);',
    '  const semanticVerified = selected.semanticMetadataFullyMatched === true;',
    "semantic verification truthfulness",
)
source = replace_once(
    source,
    '    semantic_metadata_constraints: item.semantic_title_constraints || null,',
    '''    semantic_metadata_constraints: item.semantic_title_constraints || null,
    semantic_metadata_matched_groups: selected.semanticMetadataMatchedGroups ?? null,
    semantic_query_matched_groups: selected.semanticQueryMatchedGroups ?? null,
    semantic_query_assisted: selected.semanticQueryMatchedGroups > 0,''',
    "query-assisted provenance",
)
source = replace_once(
    source,
    '''    selected_reason: semanticVerified
      ? "NARRATION_ANCHORED_UNIQUE_HD_AND_SOURCE_TITLE_CONSTRAINED"
      : "NARRATION_ANCHORED_UNIQUE_HD_CONTEXT",''',
    '''    selected_reason: semanticVerified
      ? "NARRATION_ANCHORED_UNIQUE_HD_AND_SOURCE_TITLE_CONSTRAINED"
      : "NARRATION_ANCHORED_UNIQUE_HD_QUERY_ASSISTED_PENDING_FRAME_REVIEW",''',
    "query-assisted selected reason",
)

source = replace_once(
    source,
    'export async function materializeAssignments(dir, plan, records) {',
    'export async function materializeAssignments(dir, plan, records, { unresolvedSceneIds = [] } = {}) {',
    "materialization unresolved signature",
)
source = replace_once(
    source,
    '''  const recordByScene = new Map(records.map((record) => [record.scene_id, record]));
  const targets = new Set();
  const retiredPaths = new Set();
  let replaced = 0;''',
    '''  const recordByScene = new Map(records.map((record) => [record.scene_id, record]));
  const unresolved = new Set(unresolvedSceneIds.map(String));
  const targets = new Set();
  const retiredPaths = new Set();
  let replaced = 0;
  for (const [claimId, assignments] of Object.entries(editorial.footage_assignments)) {
    for (const [index, assignment] of Object.entries(assignments || {})) {
      const match = String(assignment?.asset || "").match(/^assets\\/footage\\/(scene_[0-9]{3})_[^/]+\\.mp4$/);
      if (!match || !unresolved.has(match[1])) continue;
      retiredPaths.add(assignment.asset);
      delete editorial.footage_assignments[claimId][index];
    }
    if (!Object.keys(editorial.footage_assignments[claimId] || {}).length) {
      delete editorial.footage_assignments[claimId];
    }
  }''',
    "retire unresolved assignments",
)
source = replace_once(
    source,
    '''  for (const item of items) {
    const { claimId, sliceIndex } = validateAssignment(item);''',
    '''  for (const item of items) {
    if (unresolved.has(item.scene_id)) continue;
    const { claimId, sliceIndex } = validateAssignment(item);''',
    "skip unresolved assignment materialization",
)
source = replace_once(
    source,
    '''    assignments: items.length,
    replaced_graphics: replaced,
    retired_paths: [...retiredPaths],''',
    '''    assignments: items.length - unresolved.size,
    unresolved_scenes: [...unresolved],
    replaced_graphics: replaced,
    retired_paths: [...retiredPaths],''',
    "materialization summary unresolved",
)
source = replace_once(
    source,
    '  return { assignments: items.length, replaced_graphics: replaced, retired_paths: retiredPaths.size };',
    '  return { assignments: items.length - unresolved.size, unresolved_scenes: unresolved.size, replaced_graphics: replaced, retired_paths: retiredPaths.size };',
    "materialization return unresolved",
)

old_preflight_use = '''  const preselected = await preflightPexelsSelections(
    pendingPexels,
    key,
    new Set(usedIds),
    plan.policy || {},
  );
  const records = [];'''
new_preflight_use = '''  const policy = plan.acquisition_policy || plan.policy || {};
  const { selectedByScene: preselected, failures } = await preflightPexelsSelections(
    pendingPexels,
    key,
    new Set(usedIds),
    policy,
  );
  const unresolved = new Set(failures);
  const records = [];'''
source = replace_once(source, old_preflight_use, new_preflight_use, "acquisition policy and partial preflight")
source = replace_once(
    source,
    '''    if (previousRecord?.path) {
      const oldMedia = path.join(dir, previousRecord.path);
      await fs.rm(oldMedia, { force: true });
      await fs.rm(`${oldMedia}.provenance.json`, { force: true });
    }
    records.push(await acquireOne(''',
    '''    if (previousRecord?.path) {
      const oldMedia = path.join(dir, previousRecord.path);
      await fs.rm(oldMedia, { force: true });
      await fs.rm(`${oldMedia}.provenance.json`, { force: true });
    }
    if (unresolved.has(id)) continue;
    records.push(await acquireOne(''',
    "skip unresolved download after retiring old bytes",
)
source = replace_once(
    source,
    '''      usedIds,
      plan.policy || {},
      preselected.get(id),''',
    '''      usedIds,
      policy,
      preselected.get(id),''',
    "resolved acquisition policy",
)
source = replace_once(
    source,
    '''    semantic_constraints_applied: plan.assets.filter((item) => item.semantic_title_constraints).length,
    records,
    pass: records.length === plan.assets.length,
  });
  const materialized = await materializeAssignments(dir, plan, records);''',
    '''    semantic_constraints_applied: plan.assets.filter((item) => item.semantic_title_constraints).length,
    unresolved_scene_ids: [...unresolved],
    records,
    pass: unresolved.size === 0 && records.length === plan.assets.length,
  });
  const materialized = await materializeAssignments(
    dir,
    plan,
    records,
    { unresolvedSceneIds: [...unresolved] },
  );''',
    "partial runtime and materialization",
)
source = replace_once(
    source,
    '''    total: records.length,
    capacity,
    ...materialized,''',
    '''    total: records.length,
    partial: unresolved.size > 0,
    unresolved: [...unresolved],
    capacity,
    ...materialized,''',
    "partial acquisition result",
)
source_path.write_text(source)

# Update the existing preflight regression to assert durable partial success.
test_path = Path("scripts/orvyq_acquire_footage_demand.test.mjs")
test_text = test_path.read_text()
old_test = '''  await assert.rejects(
    () => preflightPexelsSelections(items, "test-key", new Set(), {}, async () => [video]),
    /scene_002, scene_003/,
  );'''
new_test = '''  const result = await preflightPexelsSelections(
    items,
    "test-key",
    new Set(),
    {},
    async () => [video],
  );
  assert.deepEqual(result.failures, ["scene_002", "scene_003"]);
  assert.equal(result.selectedByScene.get("scene_001").selected.video.id, 101);'''
test_text = replace_once(test_text, old_test, new_test, "partial preflight test")
test_path.write_text(test_text)

regression_path = Path("scripts/orvyq_acquire_footage_semantic_regression.test.mjs")
regression = regression_path.read_text()
regression = replace_once(
    regression,
    'import { matchesSemanticText, semanticMatchScore, pick } from "./orvyq_acquire_footage_demand.mjs";',
    'import { matchesSemanticText, semanticMatchScore, evaluateSemanticCandidate, pick } from "./orvyq_acquire_footage_demand.mjs";',
    "regression import",
)
regression += '''

test("semantic token matching accepts conservative singular and plural equivalents", () => {
  const item = { semantic_title_constraints: { required_any_groups: [["worker"], ["vessel"]], forbidden_terms: [] } };
  assert.equal(matchesSemanticText("workers aboard vessels", item), true);
  assert.equal(matchesSemanticText("cargo operations", { semantic_title_constraints: { required_any_groups: [["car"]], forbidden_terms: [] } }), false);
});

test("query assistance may satisfy one missing group but metadata must carry a concrete anchor", () => {
  const item = {
    semantic_title_constraints: {
      required_any_groups: [["research", "scientific"], ["vessel", "ship", "boat"]],
      forbidden_terms: ["fishing", "shipyard"],
      min_metadata_required_groups: 1,
    },
  };
  const assisted = evaluateSemanticCandidate(
    "https://www.pexels.com/video/blue-and-white-boat-at-sea-501/",
    item,
    "research vessel ocean crew",
  );
  assert.equal(assisted.metadataMatchedGroups, 1);
  assert.equal(assisted.queryMatchedGroups, 1);
  assert.equal(assisted.fullyMetadataMatched, false);
  assert.equal(evaluateSemanticCandidate(
    "https://www.pexels.com/video/fishing-boat-at-sea-502/",
    item,
    "research vessel ocean crew",
  ), null);
  assert.equal(evaluateSemanticCandidate(
    "https://www.pexels.com/video-calm-water-503/",
    item,
    "research vessel ocean crew",
  ), null);
});
'''
regression_path.write_text(regression)

package_path = Path("package.json")
package = json.loads(package_path.read_text())
package.get("scripts", {}).pop("postinstall", None)
package_path.write_text(json.dumps(package, indent=2) + "\n")
Path(__file__).unlink(missing_ok=True)

run("node", "--test", "scripts/orvyq_acquire_footage_demand.test.mjs", "scripts/orvyq_acquire_footage_semantic.test.mjs", "scripts/orvyq_acquire_footage_semantic_regression.test.mjs")
run("git", "config", "user.name", "orvyq-maintenance-bot")
run("git", "config", "user.email", "orvyq-maintenance-bot@users.noreply.github.com")
run("git", "add", "-A")
run("git", "commit", "-m", "Preserve partial footage acquisition and query-assisted review")
branch = os.environ.get("TARGET_BRANCH", "agent/systemic-visual-evidence-balance")
run("git", "push", "origin", f"HEAD:{branch}")
