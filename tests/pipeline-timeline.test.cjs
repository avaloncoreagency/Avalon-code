const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");

// Gaps 4, 5 and 7 of docs/independent-qa/PIPELINE_HANDOFF.md (#253): partial failures are reported, truncation is
// explicit, and audit edits expose changed field NAMES only.
const LEAD = "00000000-0000-4000-8000-0000000000a1";
function route(session) {
  const mod = { exports: {} };
  const deps = { "next/server": { NextResponse }, "@/lib/auth/session": { getOwnerSession: async () => session } };
  const code = ts.transpileModule(fs.readFileSync("src/app/admin/workspace/crm/pipeline/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)(name => { assert.ok(name in deps, name); return deps[name]; }, mod, mod.exports);
  return mod.exports;
}
/** Minimal PostgREST-like chain. results[table] may be a function of the recorded filters. */
function db(results, calls = []) {
  return {
    from(table) {
      const call = { table, filters: {}, limit: null };
      calls.push(call);
      const chain = {
        select() { return chain; }, order() { return chain; },
        eq(k, v) { call.filters[k] = v; return chain; }, in(k, v) { call.filters[k] = v; return chain; },
        limit(n) { call.limit = n; return chain; },
        then(resolve, reject) {
          const r = results[table];
          return Promise.resolve(typeof r === "function" ? r(call) : r).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}
const get = (api, qs = "") => api.GET(new NextRequest(`https://qa.example.invalid/admin/workspace/crm/pipeline?lead=${LEAD}${qs}`));
const ok = rows => ({ data: rows, error: null });
const rows = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test("a failed history or files query marks the timeline incomplete instead of returning an empty-but-complete list", async () => {
  for (const broken of ["crm_lead_stage_history", "crm_attachments"]) {
    const results = { crm_lead_stage_history: ok([]), crm_activities: ok([{ id: "a1", created_at: "2026-11-20T00:00:00Z" }]), crm_attachments: ok([]), crm_audit: ok([]) };
    results[broken] = { data: null, error: { code: "08006", message: "synthetic connection failure" } };
    const r = await get(route({ user: { id: "u" }, supabase: db(results) }));
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.deepEqual(body.incomplete, [broken === "crm_lead_stage_history" ? "history" : "files"]);
    assert.equal(body.activities.length, 1, "the sources that loaded are still shown");
    assert.equal(body.unavailable, null, "a connection error is not reported as a missing migration");
  }
});

test("every source failing is an error, not an empty history", async () => {
  const fail = { data: null, error: { code: "08006" } };
  const r = await get(route({ user: { id: "u" }, supabase: db({ crm_lead_stage_history: fail, crm_activities: fail, crm_attachments: fail, crm_audit: fail }) }));
  assert.equal(r.status, 503);
});

test("truncation is explicit and the limit is bounded", async () => {
  const calls = [];
  const results = {
    crm_lead_stage_history: c => ok(rows(c.limit, i => ({ id: `h${i}`, changed_at: "2026-11-20T00:00:00Z" }))),
    crm_activities: ok([]), crm_attachments: ok([]), crm_audit: ok([]),
  };
  const body = await (await get(route({ user: { id: "u" }, supabase: db(results, calls) }), "&limit=50")).json();
  assert.equal(body.history.length, 50);
  assert.equal(body.truncated.history, true);
  assert.equal(body.truncated.activities, false);
  assert.equal(calls.find(c => c.table === "crm_lead_stage_history").limit, 51, "limit+1 detects more rows");
  for (const [raw, expected] of [["99999", 1000], ["1", 50], ["abc", 200]]) {
    const c2 = [];
    const b2 = await (await get(route({ user: { id: "u" }, supabase: db({ ...results, crm_lead_stage_history: ok([]) }, c2) }), "&limit=" + raw)).json();
    assert.equal(b2.limit, expected);
  }
});

test("audit edits reveal which fields changed and who changed them — never the values", async () => {
  const secret = "nota privada del cliente 555-0199";
  const results = {
    crm_lead_stage_history: ok([]), crm_attachments: ok([]),
    crm_activities: ok([{ id: "act-1", created_at: "2026-11-19T00:00:00Z" }]),
    crm_audit: c => c.filters.entity === "crm_leads"
      ? ok([
          { id: "e1", entity: "crm_leads", record_id: LEAD, actor_id: "owner-b", created_at: "2026-11-20T10:00:00Z", before_data: { phone: "1", notes: "a", version: 1, updated_at: "x" }, after_data: { phone: secret, notes: secret, version: 2, updated_at: "y" } },
          { id: "e2", entity: "crm_leads", record_id: LEAD, actor_id: "owner-a", created_at: "2026-11-20T09:00:00Z", before_data: { stage_id: "new", version: 1 }, after_data: { stage_id: "contacted", version: 2 } },
        ])
      : ok([{ id: "e3", entity: "crm_activities", record_id: "act-1", actor_id: "owner-a", created_at: "2026-11-20T08:00:00Z", before_data: { body: "a" }, after_data: { body: secret, mystery_column: 1 } }]),
  };
  const r = await get(route({ user: { id: "u" }, supabase: db(results) }));
  const text = await r.text();
  assert.doesNotMatch(text, /555-0199|nota privada/, "no audit values leave the server");
  const body = JSON.parse(text);
  assert.deepEqual(body.edits.map(e => [e.id, e.actor_id, e.target, e.fields]), [
    ["e1", "owner-b", "lead", ["Teléfono", "Notas"]],
    ["e3", "owner-a", "activity", ["Texto", "Otro campo"]],
  ], "bookkeeping-only and stage-only updates are omitted (stage moves are already in stage history)");
});

test("anonymous and malformed requests are still refused before any query", async () => {
  assert.equal((await get(route(null))).status, 403);
  const api = route({ user: { id: "u" }, supabase: { from() { throw Error("must not query"); } } });
  assert.equal((await api.GET(new NextRequest("https://qa.example.invalid/admin/workspace/crm/pipeline?lead=nope"))).status, 400);
});
