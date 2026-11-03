const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("src/lib/crm/radar-qualification.ts", "utf8");
const transpiled = ts.transpileModule(source, {
  fileName: "radar-qualification.ts",
  reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const errors = (transpiled.diagnostics || [])
  .filter(d => d.category === ts.DiagnosticCategory.Error)
  .map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
assert.deepEqual(errors, []);
const mod = { exports: {} };
new Function("module", "exports", "require", transpiled.outputText)(mod, mod.exports, require);
const { qualifyRadarProspect } = mod.exports;

const ID = "00000000-0000-4000-8000-000000000011";
const LEAD = "00000000-0000-4000-8000-000000000022";
const record = (extra = {}) => ({
  id: ID, source_ref: "osm:node/123", status: "pending",
  do_not_contact: false, stars: 3, stars_override: null, lead_id: null,
  ...extra,
});

function fixture(prospect, options = {}) {
  const events = [];
  let row = prospect ? { ...prospect } : null;
  const chain = (response) => ({
    eq() { return this; },
    is() { return this; },
    select() { return this; },
    maybeSingle: async () => response,
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); },
  });
  const db = {
    from(table) {
      if (table === "crm_prospects") return {
        select() { return chain({ data: row, error: options.readError || null }); },
        update(patch) {
          events.push({ kind: "approve", patch });
          if (!options.approvalMissing && row) Object.assign(row, patch);
          return chain({ data: options.approvalMissing ? null : { id: ID }, error: options.approvalError || null });
        },
      };
      if (table === "crm_leads") return {
        update(patch) { events.push({ kind: "link", patch }); return chain({ error: options.linkError || null }); },
      };
      throw new Error("Unexpected table: " + table);
    },
    async rpc(name, args) {
      events.push({ kind: "rpc", name, args });
      return { data: options.convertError ? null : LEAD, error: options.convertError || null };
    },
  };
  return { db, events };
}

test("unverified map records are not invented into leads", async () => {
  const { db, events } = fixture(record({ stars: null }));
  assert.deepEqual(await qualifyRadarProspect(db, ID), { kind: "unrated", stars: null });
  assert.deepEqual(events, []);
});

test("owner-confirmed evidence score creates one pipeline card and links its source", async () => {
  const { db, events } = fixture(record({ stars: 4 }));
  const result = await qualifyRadarProspect(db, ID);
  assert.deepEqual(result, { kind: "pipeline", stars: 4, leadId: LEAD, created: true, linkWarning: false });
  assert.equal(events.filter(e => e.kind === "approve").length, 1);
  assert.equal(events.filter(e => e.kind === "rpc").length, 1);
  assert.deepEqual(events.find(e => e.kind === "rpc").args, { prospect_id: ID });
  assert.equal(events.find(e => e.kind === "link").patch.prospect_id, ID);
});

test("already converted is idempotent, never creates a second lead", async () => {
  const { db, events } = fixture(record({ status: "converted", stars: 5, lead_id: LEAD }));
  const out = await qualifyRadarProspect(db, ID);
  assert.equal(out.kind, "pipeline");
  assert.equal(out.created, false);
  assert.deepEqual(events, []);
});

test("DNC and discarded businesses cannot enter the pipeline even with stars", async () => {
  for (const extra of [{ do_not_contact: true }, { status: "rejected" }]) {
    const { db, events } = fixture(record(extra));
    const result = await qualifyRadarProspect(db, ID);
    assert.equal(result.kind, "blocked");
    assert.deepEqual(events, []);
  }
});

test("similar existing lead stops at duplicate conflict instead of creating another", async () => {
  const { db, events } = fixture(record(), { convertError: { code: "23505" } });
  const out = await qualifyRadarProspect(db, ID);
  assert.equal(out.kind, "failed");
  assert.equal(out.code, "duplicate");
  assert.equal(out.status, 409);
  assert.ok(!events.some(e => e.kind === "link"));
});

test("approval status racing or failing cannot invoke conversion", async () => {
  for (const options of [{ approvalMissing: true }, { approvalError: { code: "42501" } }]) {
    const { db, events } = fixture(record(), options);
    const out = await qualifyRadarProspect(db, ID);
    assert.equal(out.kind, "failed");
    assert.ok(!events.some(e => e.kind === "rpc"));
  }
});

test("lead link failure is reported but never replays conversion", async () => {
  const { db } = fixture(record(), { linkError: { code: "23503" } });
  const out = await qualifyRadarProspect(db, ID);
  assert.equal(out.kind, "pipeline");
  assert.equal(out.linkWarning, true);
});

test("only qualified user actions invoke promotion, no automatic map ingestion", () => {
  const route = fs.readFileSync("src/app/admin/workspace/crm/radar/places/route.ts", "utf8");
  const search = fs.readFileSync("src/lib/crm/radar-search.ts", "utf8");
  const ui = fs.readFileSync("src/components/crm/titan-radar.tsx", "utf8");
  assert.match(route, /case "qualify"/);
  assert.match(route, /if \(stars !== null\) return qualifiedReply\(\)/);
  assert.match(route, /const session = await getOwnerSession\(\)/);
  assert.doesNotMatch(search, /qualifyRadarProspect|crm_convert_prospect/);
  assert.match(ui, /Calificar y crear tarjeta en pipeline/);
  assert.match(ui, /Calificar manualmente y crear lead/);
});
