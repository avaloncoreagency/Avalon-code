const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const worker = require("../scripts/office-manager-free-github.cjs");

const path = "src/app/admin/workspace/crm/office/manager-work/github-history/api/route.ts";
const file = fs.readFileSync(path, "utf8");
const js = ts.transpileModule(file, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
let owner = false;
new Function("module", "exports", "require", js)(mod, mod.exports, id => {
  if (id === "next/server") return {
    NextResponse: { json: (data, opts = {}) => ({ data, status: opts.status ?? 200 }) },
  };
  if (id === "@/lib/auth/session") return { getOwnerSession: async () => owner ? { id: "synthetic-owner" } : null };
  throw new Error("unexpected_import: " + id);
});
const { decodePublicReport, GET } = mod.exports;
const when = new Date("2026-11-03T20:00:00.000Z");
const pulls = [{ number: 10, title: "CRM ventas", state: "open", draft: true }];
const runs = [{ id: 121, status: "completed", conclusion: "success" }];
const issues = [{ number: 98, state: "open" }];
const report = worker.buildsReport({ pulls, runs, issues }, when, 123456);
const document = worker.issueDocument(report);

test("free history renders FIVE validated, real GitHub records without Supabase", () => {
  const parsed = decodePublicReport(document, new Date(when.valueOf() + 60000));
  assert.equal(Object.keys(parsed.last).length, 5);
  assert.equal(parsed.last.ren.source, "github_actions_public_repo");
  assert.equal(parsed.last.shin.display_status, "completed");
  assert.equal(parsed.last.kenji.result.metrics[0].count, 1);
  assert.equal(parsed.last.sora.result.status, "completed");
  assert.equal(parsed.last.haru.result.source, "github_actions_public_repo");
  assert.ok(!JSON.stringify(parsed).includes("secret"));
});
test("records age into stale after missed hourly runs instead of green always", () => {
  const parsed = decodePublicReport(document, new Date(when.valueOf() + 2 * 3600000));
  assert.ok(Object.values(parsed.last).every(x => x.display_status === "stale"));
});
test("no workflow run / malformed body / forged evidence cannot claim active", () => {
  for (const raw of [
    "",
    "<script>alert(1)</script>",
    worker.issueDocument({ ...report, observed_at: null }),
    worker.issueDocument({ ...report, run_id: "hacker" }),
    worker.issueDocument({ ...report, schema_version: 99 }),
    worker.issueDocument({ ...report, source: "fictional" }),
    worker.issueDocument({ ...report, managers: { ...report.managers,
      ren: {...report.managers.ren, metrics:[{label:"x",count:-1}]}}}),
  ]) assert.throws(() => decodePublicReport(raw, when));
  assert.throws(() => decodePublicReport(document, new Date(when.valueOf() - 3600000)),
    /invalid_report_timestamp/);
});
test("historical Github endpoint rejects non-owner before accessing GitHub API", async () => {
  const originalFetch = global.fetch;
  let fetched = false;
  global.fetch = async () => { fetched = true; throw Error("must not call GitHub"); };
  try {
    owner = false;
    const result = await GET();
    assert.equal(result.status, 403);
    assert.equal(fetched, false);
  } finally {
    global.fetch = originalFetch;
  }
});
test("owner reads public issue, not server secrets, and invalid reports fail closed", async () => {
  const originalFetch = global.fetch;
  owner = true;
  try {
    global.fetch = async (url, opts) => {
      assert.equal(url, "https://api.github.com/repos/avaloncoreagency/Avalon-code/issues/108");
      assert.ok(!JSON.stringify(opts).includes("authorization"));
      return { ok: true, json: async () => ({ number: 108, body: document }) };
    };
    const result = await GET();
    assert.equal(result.status, 200);
    assert.equal(Object.keys(result.data.last).length, 5);
    global.fetch = async () => ({ ok: true, json: async () => ({ number: 108, body: "bad" }) });
    const failed = await GET();
    assert.equal(failed.status, 503);
  } finally {
    owner = false;
    global.fetch = originalFetch;
  }
});
