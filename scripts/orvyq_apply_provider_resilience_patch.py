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

old_search = '''async function search(query, key, perPage, page = 1) {
  const url = new URL(PEXELS_API);
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("size", "large");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  const response = await fetch(url, {
    headers: { Authorization: key, "user-agent": "ORVYQ-demand-footage/1.1" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Pexels search ${response.status}: ${query}`);
  return (await response.json()).videos || [];
}
'''
new_search = '''const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function numericHeader(headers, name) {
  const value = Number(headers?.get?.(name));
  return Number.isFinite(value) ? value : null;
}

export async function searchPexels(
  query,
  key,
  perPage,
  page = 1,
  {
    fetchFn = fetch,
    sleepFn = wait,
    maxRetries = 1,
    maxRetryDelayMs = 3000,
  } = {},
) {
  const url = new URL(PEXELS_API);
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("size", "large");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchFn(url, {
        headers: { Authorization: key, "user-agent": "ORVYQ-demand-footage/1.2" },
        signal: AbortSignal.timeout(60000),
      });
      if (response.ok) {
        const payload = await response.json();
        return {
          videos: payload.videos || [],
          rate_limit: {
            limit: numericHeader(response.headers, "x-ratelimit-limit"),
            remaining: numericHeader(response.headers, "x-ratelimit-remaining"),
            reset_epoch_seconds: numericHeader(response.headers, "x-ratelimit-reset"),
          },
        };
      }
      const error = new Error(`Pexels search ${response.status}: ${query}`);
      error.status = response.status;
      error.provider = "pexels";
      lastError = error;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= maxRetries) throw error;
      const retryAfterSeconds = numericHeader(response.headers, "retry-after");
      const retryDelay = Math.min(
        maxRetryDelayMs,
        retryAfterSeconds !== null ? retryAfterSeconds * 1000 : 500 * (2 ** attempt),
      );
      await sleepFn(Math.max(0, retryDelay));
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable = status === 429 || status >= 500 || status === 0;
      if (!retryable || attempt >= maxRetries) throw error;
      await sleepFn(Math.min(maxRetryDelayMs, 500 * (2 ** attempt)));
    }
  }
  throw lastError;
}
'''
source = replace_once(source, old_search, new_search, "quota-aware Pexels search")

old_preflight = '''export async function preflightPexelsSelections(items, key, usedIds, policy, searchFn = search) {
  const selectedByScene = new Map();
  const failures = [];
  for (const item of items) {
    const id = sceneId(item.scene_id);
    const queries = [...new Set([...(item.queries || []), ...(item.fallback_queries || [])]
      .map(String)
      .map((query) => query.trim())
      .filter(Boolean))];
    let selected;
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
      const candidate = pick([...videosById.values()], usedIds, item, query);
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
    if (!selected) {
      failures.push(id);
      continue;
    }
    usedIds.add(String(selected.video.id));
    selectedByScene.set(id, { selected, selectedQuery });
  }
  return { selectedByScene, failures };
}
'''
new_preflight = '''export async function preflightPexelsSelections(
  items,
  key,
  usedIds,
  policy,
  searchFn = searchPexels,
) {
  const selectedByScene = new Map();
  const failures = [];
  const providerIssues = [];
  const searchCache = new Map();
  const pagesPerQuery = Math.max(1, Math.min(3, Number(policy.pages_per_query || 2)));
  const perPage = Math.max(1, Math.min(80, Number(policy.results_per_query || 30)));
  const maxQueriesPerScene = Math.max(1, Math.min(8, Number(policy.max_queries_per_scene || 4)));
  const maxRequestsPerRun = Math.max(1, Math.min(180, Number(policy.max_requests_per_run || 80)));
  const rateLimitReserve = Math.max(0, Number(policy.rate_limit_reserve || 20));
  const requestDelayMs = Math.max(0, Number(policy.request_delay_ms || 200));
  let requestCount = 0;
  let lastRequestAt = 0;
  let providerUnavailable = false;

  for (const item of items) {
    const id = sceneId(item.scene_id);
    const queries = [...new Set([...(item.queries || []), ...(item.fallback_queries || [])]
      .map(String)
      .map((query) => query.trim())
      .filter(Boolean))]
      .slice(0, maxQueriesPerScene);
    let selected;
    let selectedQuery;
    let strongMetadataMatch = false;

    if (!providerUnavailable) {
      for (const query of queries) {
        const videosById = new Map();
        for (let page = 1; page <= pagesPerQuery; page += 1) {
          const cacheKey = `${query}\u0000${perPage}\u0000${page}`;
          let result = searchCache.get(cacheKey);
          if (!result) {
            if (requestCount >= maxRequestsPerRun) {
              providerIssues.push({
                scene_id: id,
                query,
                page,
                type: "request_budget_exhausted",
                max_requests_per_run: maxRequestsPerRun,
              });
              providerUnavailable = true;
              break;
            }
            const elapsed = Date.now() - lastRequestAt;
            if (lastRequestAt && elapsed < requestDelayMs) await wait(requestDelayMs - elapsed);
            try {
              result = await searchFn(query, key, perPage, page, {
                maxRetries: Number(policy.max_search_retries || 1),
                maxRetryDelayMs: Number(policy.max_retry_delay_ms || 3000),
              });
              requestCount += 1;
              lastRequestAt = Date.now();
              if (Array.isArray(result)) result = { videos: result, rate_limit: {} };
              searchCache.set(cacheKey, result);
            } catch (error) {
              requestCount += 1;
              lastRequestAt = Date.now();
              providerIssues.push({
                scene_id: id,
                query,
                page,
                type: Number(error?.status) === 429 ? "rate_limited" : "provider_search_error",
                status: Number(error?.status || 0) || null,
                message: error.message,
              });
              if (Number(error?.status) === 429) providerUnavailable = true;
              break;
            }
          }
          const pageVideos = result?.videos || [];
          for (const video of pageVideos) videosById.set(String(video.id), video);
          const candidate = pick([...videosById.values()], usedIds, item, query);
          if (candidate) {
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
            if (candidate.semanticMetadataFullyMatched) {
              strongMetadataMatch = true;
              break;
            }
          }
          const remaining = Number(result?.rate_limit?.remaining);
          if (Number.isFinite(remaining) && remaining <= rateLimitReserve) {
            providerIssues.push({
              scene_id: id,
              query,
              page,
              type: "rate_limit_reserve_reached",
              remaining,
              reserve: rateLimitReserve,
              reset_epoch_seconds: result?.rate_limit?.reset_epoch_seconds ?? null,
            });
            providerUnavailable = true;
            break;
          }
          if (pageVideos.length < perPage) break;
        }
        if (strongMetadataMatch || providerUnavailable) break;
      }
    }

    if (!selected) {
      failures.push(id);
      continue;
    }
    usedIds.add(String(selected.video.id));
    selectedByScene.set(id, { selected, selectedQuery });
  }
  return {
    selectedByScene,
    failures,
    providerIssues,
    requestCount,
    providerUnavailable,
  };
}
'''
source = replace_once(source, old_preflight, new_preflight, "budgeted cached partial preflight")

source = replace_once(
    source,
    '''  const { selectedByScene: preselected, failures } = await preflightPexelsSelections(
    pendingPexels,
    key,
    new Set(usedIds),
    policy,
  );''',
    '''  const {
    selectedByScene: preselected,
    failures,
    providerIssues,
    requestCount,
    providerUnavailable,
  } = await preflightPexelsSelections(
    pendingPexels,
    key,
    new Set(usedIds),
    policy,
  );''',
    "provider preflight diagnostics",
)
source = replace_once(
    source,
    '''    unresolved_scene_ids: [...unresolved],
    records,
    pass: unresolved.size === 0 && records.length === plan.assets.length,''',
    '''    unresolved_scene_ids: [...unresolved],
    provider_search_issues: providerIssues,
    provider_request_count: requestCount,
    provider_unavailable: providerUnavailable,
    records,
    pass: unresolved.size === 0 && records.length === plan.assets.length,''',
    "runtime quota diagnostics",
)
source = replace_once(
    source,
    '''    partial: unresolved.size > 0,
    unresolved: [...unresolved],
    capacity,''',
    '''    partial: unresolved.size > 0,
    unresolved: [...unresolved],
    provider_issues: providerIssues,
    provider_request_count: requestCount,
    provider_unavailable: providerUnavailable,
    capacity,''',
    "result quota diagnostics",
)
source_path.write_text(source)

# Add provider resilience regressions.
test_path = Path("scripts/orvyq_acquire_footage_demand.test.mjs")
test_text = test_path.read_text()
test_text = replace_once(
    test_text,
    '''  materializeAssignments,
  preflightPexelsSelections,
} from "./orvyq_acquire_footage_demand.mjs";''',
    '''  materializeAssignments,
  preflightPexelsSelections,
  searchPexels,
} from "./orvyq_acquire_footage_demand.mjs";''',
    "test search import",
)
insert_before = 'test("materializeAssignments resolves the downloaded hash path and is idempotent", async () => {'
new_tests = '''test("Pexels search retries one transient 429 and exposes quota headers", async () => {
  const responses = [
    {
      ok: false,
      status: 429,
      headers: { get: () => null },
    },
    {
      ok: true,
      status: 200,
      headers: {
        get: (name) => ({
          "x-ratelimit-limit": "200",
          "x-ratelimit-remaining": "178",
          "x-ratelimit-reset": "2000000000",
        })[name.toLowerCase()] ?? null,
      },
      json: async () => ({ videos: [{ id: 55 }] }),
    },
  ];
  const sleeps = [];
  const result = await searchPexels("research vessel", "key", 30, 1, {
    fetchFn: async () => responses.shift(),
    sleepFn: async (milliseconds) => sleeps.push(milliseconds),
    maxRetries: 1,
    maxRetryDelayMs: 1000,
  });
  assert.deepEqual(result.videos, [{ id: 55 }]);
  assert.equal(result.rate_limit.remaining, 178);
  assert.deepEqual(sleeps, [500]);
});

test("Pexels preflight keeps earlier selections and reports a later provider limit", async () => {
  const video = {
    id: 101,
    duration: 12,
    url: "https://www.pexels.com/video/working-ship-ocean-waves-101/",
    user: { name: "Source Creator" },
    video_files: [{
      id: 201,
      file_type: "video/mp4",
      width: 1920,
      height: 1080,
      link: "https://videos.pexels.com/video-files/101/101-hd.mp4",
    }],
  };
  let calls = 0;
  const searchFn = async () => {
    calls += 1;
    if (calls === 1) return { videos: [video], rate_limit: { remaining: 150 } };
    const error = new Error("Pexels search 429: underwater robot");
    error.status = 429;
    throw error;
  };
  const result = await preflightPexelsSelections([
    {
      scene_id: "scene_001",
      queries: ["working ship"],
      min_duration_seconds: 8,
      semantic_title_constraints: {
        required_any_groups: [["working"], ["ship"]],
        forbidden_terms: [],
      },
    },
    {
      scene_id: "scene_002",
      queries: ["underwater robot"],
      min_duration_seconds: 8,
      semantic_title_constraints: {
        required_any_groups: [["underwater"], ["robot"]],
        forbidden_terms: [],
      },
    },
    {
      scene_id: "scene_003",
      queries: ["research laboratory"],
      min_duration_seconds: 8,
      semantic_title_constraints: {
        required_any_groups: [["research"], ["laboratory"]],
        forbidden_terms: [],
      },
    },
  ], "key", new Set(), { request_delay_ms: 0 }, searchFn);
  assert.equal(result.selectedByScene.get("scene_001").selected.video.id, 101);
  assert.deepEqual(result.failures, ["scene_002", "scene_003"]);
  assert.equal(result.providerIssues[0].type, "rate_limited");
  assert.equal(result.providerUnavailable, true);
  assert.equal(calls, 2);
});

test("Pexels preflight reuses duplicate query pages inside one run", async () => {
  const video = {
    id: 101,
    duration: 12,
    url: "https://www.pexels.com/video/working-ship-ocean-waves-101/",
    user: { name: "Source Creator" },
    video_files: [{
      id: 201,
      file_type: "video/mp4",
      width: 1920,
      height: 1080,
      link: "https://videos.pexels.com/video-files/101/101-hd.mp4",
    }],
  };
  let calls = 0;
  const item = (scene) => ({
    scene_id: scene,
    queries: ["working ship"],
    min_duration_seconds: 8,
    semantic_title_constraints: {
      required_any_groups: [["working"], ["ship"]],
      forbidden_terms: [],
    },
  });
  const result = await preflightPexelsSelections(
    [item("scene_001"), item("scene_002")],
    "key",
    new Set(),
    { request_delay_ms: 0 },
    async () => {
      calls += 1;
      return { videos: [video], rate_limit: { remaining: 150 } };
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.requestCount, 1);
  assert.deepEqual(result.failures, ["scene_002"]);
});

'''
test_text = replace_once(test_text, insert_before, new_tests + insert_before, "provider resilience tests")
test_path.write_text(test_text)

# Keep each normal acquisition under a conservative fraction of the official hourly budget.
plan_path = Path("projects/002-the-new-war-beneath-the-ocean/research/footage_acquisition_plan.json")
plan = json.loads(plan_path.read_text())
policy = plan.setdefault("acquisition_policy", {})
policy["pages_per_query"] = 2
policy["max_queries_per_scene"] = 4
policy["max_requests_per_run"] = 80
policy["rate_limit_reserve"] = 20
policy["request_delay_ms"] = 200
policy["max_search_retries"] = 1
policy["max_retry_delay_ms"] = 3000
plan_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n")

package_path = Path("package.json")
package = json.loads(package_path.read_text())
package.get("scripts", {}).pop("postinstall", None)
package_path.write_text(json.dumps(package, indent=2) + "\n")
Path(__file__).unlink(missing_ok=True)

run("node", "--test", "scripts/orvyq_acquire_footage_demand.test.mjs", "scripts/orvyq_acquire_footage_semantic.test.mjs", "scripts/orvyq_acquire_footage_semantic_regression.test.mjs")
run("git", "config", "user.name", "orvyq-maintenance-bot")
run("git", "config", "user.email", "orvyq-maintenance-bot@users.noreply.github.com")
run("git", "add", "-A")
run("git", "commit", "-m", "Make footage acquisition resilient to provider quotas")
branch = os.environ.get("TARGET_BRANCH", "agent/systemic-visual-evidence-balance")
run("git", "push", "origin", f"HEAD:{branch}")
