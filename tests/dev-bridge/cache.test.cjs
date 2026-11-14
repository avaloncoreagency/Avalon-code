const {test} = require("node:test");
const assert = require("node:assert/strict");
const bridge = require("../../scripts/dev-bridge/load.cjs");
const sha = "a".repeat(40), base = "b".repeat(40), newerBase = "c".repeat(40);
const updatedAt = "2026-11-13T12:00:00Z";

function fakeApi(activeBase, calls) {
  return {
    pages: async path => {
      calls.push(path);
      if (path.includes("/issues?")) return [];
      if (path.includes("/pulls?state=open")) return [{
        number: 11, title: "Existing review", body: "Refs #8",
        html_url: "https://github.com/org/repo/pull/11", updated_at: updatedAt,
        head: {ref: "feature/demo", sha}, base: {ref: "main", sha: activeBase},
      }];
      if (path.includes("/pulls/11/files")) return [{filename: "src/lib/dev-bridge/core.ts"}];
      if (path.includes("/pulls/11/reviews")) return [{state: "DISMISSED"}];
      if (path.includes("/branches") || path.includes("/commits?")) return [];
      throw Error("Unexpected listing: " + path);
    },
    get: async path => {
      calls.push(path);
      if (path.includes("/check-runs")) return {
        total_count: 1, check_runs: [{name: "Security", app: {slug: "github-actions"}, conclusion: "failure"}],
      };
      if (path.includes("/compare/")) return {ahead_by: 3};
      if (path.includes("/git/trees/")) return {tree: []};
      throw Error("Unexpected GET: " + path);
    },
  };
}

function savedSnapshot() {
  return {coverage: "full", issues: [], pulls: [{
    number: 11, title: "Existing review", branch: "feature/demo",
    base_branch: "main", head_sha: sha, base_sha: base,
    updated_at: updatedAt, url: "https://github.com/org/repo/pull/11",
    files: ["src/lib/dev-bridge/core.ts"], ci: "PASSED", reviews: ["APPROVED"],
    conflict: null, behind: 1, issues: [8],
  }], commits: [], branches: [], migrations: []};
}

test("unchanged verified full PR reuses immutable paths and divergence but checks current CI and reviews", async () => {
  const calls = [];
  const result = await bridge.github({repo: "org/repo", githubToken: "synthetic"}, undefined, savedSnapshot(), fakeApi(base, calls));
  assert.equal(result.pulls[0].ci, "FAILED", "new CI failures cannot be hidden");
  assert.deepEqual(result.pulls[0].reviews, ["DISMISSED"], "reviews must refresh");
  assert.deepEqual(result.pulls[0].files, ["src/lib/dev-bridge/core.ts"]);
  assert.equal(result.pulls[0].behind, 1);
  assert.ok(calls.some(x => x.includes("/check-runs")));
  assert.ok(calls.some(x => x.includes("/pulls/11/reviews")));
  assert.ok(!calls.some(x => x.includes("/pulls/11/files")));
  assert.ok(!calls.some(x => x.includes("/compare/")));
});

test("changed base SHA requires new file and divergence checks; public snapshots never authorize reuse", async () => {
  const prior = savedSnapshot(), calls = [];
  const moved = await bridge.github({repo: "org/repo", githubToken: "synthetic"}, undefined, prior, fakeApi(newerBase, calls));
  assert.equal(moved.pulls[0].behind, 3);
  assert.ok(calls.some(x => x.includes("/pulls/11/files")));
  assert.ok(calls.some(x => x.includes("/compare/")));
  const publicPrior = {...savedSnapshot(), coverage: "summary"}, publicCalls = [];
  await bridge.github({repo: "org/repo", githubToken: "synthetic"}, undefined, publicPrior, fakeApi(base, publicCalls));
  assert.ok(publicCalls.some(x => x.includes("/pulls/11/files")));
  assert.ok(publicCalls.some(x => x.includes("/compare/")));
});
