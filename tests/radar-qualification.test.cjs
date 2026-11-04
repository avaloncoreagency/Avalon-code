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
// radar-qualification.ts imports its sibling "./prospect-link" (duplicate-lead lookup); resolve it for this isolated evaluation.
const linkModule = { exports: {} };
new Function("module", "exports", ts.transpileModule(fs.readFileSync("src/lib/crm/prospect-link.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(linkModule, linkModule.exports);
const localRequire = name => (name === "./prospect-link" ? linkModule.exports : require(name));
const mod = { exports: {} };
new Function("module", "exports", "require", transpiled.outputText)(mod, mod.exports, localRequire);
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
    ilike() { return this; },
    limit() { return this; },
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
        // Duplicate-lead lookup used to explain a unique-violation (prospect-link.ts).
        select() { return chain({ data: options.existingLead ? [options.existingLead] : [], error: null }); },
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

test("provisional 1-2 stars from a directory never become a pipeline lead without verified evidence", async () => {
  for (const stars of [1, 2]) {
    const { db, events } = fixture(record({
      stars, stars_reasons: [
        "0 necesidad(es) verificada(s)",
        "Precalificación automática: ficha pública identificada con categoría y ubicación.",
        "Sin necesidad comercial demostrada; puntuación provisional.",
      ],
    }));
    assert.deepEqual(await qualifyRadarProspect(db, ID), { kind: "unrated", stars: null });
    assert.deepEqual(events, [], "owner click cannot accidentally approve or convert a profile-only rating");
  }
  // A recorded owner override remains a deliberate, audited exception.
  const { db, events } = fixture(record({
    stars: 2, stars_override: 2,
    stars_reasons: ["Precalificación automática: ficha pública identificada"],
  }));
  const accepted = await qualifyRadarProspect(db, ID);
  assert.equal(accepted.kind, "pipeline");
  assert.equal(events.filter(event => event.kind === "rpc").length, 1);
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

test("a duplicate names the existing lead so the owner can open or link it (no card is created)", async () => {
  const existing = { id: LEAD, company: "Café Existente", contact: "Rosa", email: "cafe@example.invalid", stage_id: "proposal" };
  const { db, events } = fixture(record({ company: "Café Radar", contact: "", email: "Cafe@Example.invalid" }), { convertError: { code: "23505" }, existingLead: existing });
  const out = await qualifyRadarProspect(db, ID);
  assert.equal(out.kind, "failed");
  assert.equal(out.code, "duplicate");
  assert.equal(out.status, 409);
  assert.deepEqual({ ...out.lead }, { id: LEAD, company: "Café Existente", stage_id: "proposal" });
  assert.match(out.message, /^Calificación guardada\. Este negocio ya está en el pipeline como «Café Existente»/);
  assert.ok(!events.some(e => e.kind === "link"), "no provenance link and no second lead");
});

test("if the duplicate lookup itself fails, the original conflict is still reported (never a second failure)", async () => {
  const { db } = fixture(record({ company: "X", email: "x@example.invalid" }), { convertError: { code: "23505" } });
  const real = db.from;
  db.from = table => { if (table === "crm_leads") throw new Error("boom"); return real(table); };
  const out = await qualifyRadarProspect(db, ID);
  assert.equal(out.kind, "failed");
  assert.equal(out.code, "duplicate");
  assert.equal(out.lead, undefined);
  assert.match(out.message, /ya existe un lead con esos datos/);
});
