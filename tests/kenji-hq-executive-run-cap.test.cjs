// KENJI #47 / #132: do not publish a capped 7-day manager sample as a verified total.
// Regression fixture is fully synthetic; no server, browser, Supabase or client data.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

test("KENJI: 501 HQ runs cannot be reported as exactly 500 without a partial-data warning", async () => {
  const routePath = "src/app/admin/workspace/crm/office/executive/route.ts";
  assert.ok(fs.existsSync(routePath), "Depends on Claude #132: HQ executive route must be integrated before this regression can pass");

  const rows = Array.from({ length: 501 }, (_, i) => ({
    id: String(i + 1),
    manager_key: ["ren", "shin", "haru", "sora", "kenji"][i % 5],
    task_title: "Synthetic run " + i,
    status: "completed",
    trigger: "manual",
    created_at: "2026-11-05T10:00:00.000Z",
    finished_at: "2026-11-05T10:01:00.000Z",
    error_code: null,
    evidence_refs: [{ type: "synthetic" }],
  }));
  const query = input => {
    let data = input;
    const q = {
      select: () => q,
      gte: () => q,
      eq: () => q,
      order: () => q,
      limit(n) { if (Array.isArray(data)) data = data.slice(0, n); return q; },
      maybeSingle: async () => ({ data, error: null }),
      then(resolve, reject) { return Promise.resolve({ data, error: null }).then(resolve, reject); },
    };
    return q;
  };
  const sources = {
    crm_agent_runs: rows,
    crm_agent_missions: [],
    crm_agent_settings: { kill_switch: false, automatic_enabled: false },
    crm_ai_usage: [],
  };
  const supabase = { from(table) {
    assert.ok(Object.hasOwn(sources, table), "Unexpected database source: " + table);
    return query(sources[table]);
  } };
  const compiled = ts.transpileModule(fs.readFileSync(routePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const injected = name => {
    if (name === "next/server") return {
      NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
    };
    if (name === "@/lib/auth/session") return { getOwnerSession: async () => ({ supabase }) };
    throw new Error("Unexpected dependency: " + name);
  };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: injected, Date, Promise });
  const response = await mod.exports.GET();
  assert.equal(response.status, 200);
  const result = response.body;
  // A 500-row LIMIT is acceptable only if the UI/API marks counts incomplete or retrieves a reliable total.
  const truthful = result?.runs?.received === 501 ||
    result?.runs?.received === null ||
    result?.runs?.partial === true ||
    result?.runs?.truncated === true ||
    result?.runs?.has_more === true ||
    result?.runs?.complete === false ||
    result?.partial === true ||
    result?.data_complete === false;
  assert.ok(truthful,
    "501 synthetic stored runs: 'received: 500' without an explicit truncation/unknown marker is a misleading 7-day total. Owner: Claude #132; do not remove the cap to conceal the error.");
});
