const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load() {
  const js = ts.transpileModule(fs.readFileSync("src/lib/crm/prospect-link.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", js)(exports, () => ({}));
  return exports;
}
const { findDuplicateLead, duplicateConflict, linkProspectToExistingLead } = load();

// Tiny PostgREST-like builder over in-memory rows: records filters, applies eq/is/ilike with LIKE semantics.
function fakeDb({ leads = [], prospects = [], updateResult } = {}) {
  const log = { queries: [], updates: [] };
  const likeToRegex = p => new RegExp("^" + p.replace(/\\([\\%_])|([.*+?^${}()|[\]])|%|_/g, (m, esc, special) => esc ? esc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : special ? "\\" + special : m === "%" ? ".*" : ".") + "$", "i");
  return {
    log,
    from(table) {
      const rows = table === "crm_leads" ? leads : prospects;
      const filters = [];
      let patch = null, single = false;
      const api = {
        select: () => api,
        eq: (c, v) => { filters.push(r => r[c] === v); log.queries.push([table, "eq", c, v]); return api; },
        is: (c, v) => { filters.push(r => (v === null ? r[c] == null : r[c] === v)); log.queries.push([table, "is", c, v]); return api; },
        ilike: (c, v) => { filters.push(r => r[c] != null && likeToRegex(v).test(String(r[c]))); log.queries.push([table, "ilike", c, v]); return api; },
        limit: () => api,
        update: p => { patch = p; return api; },
        maybeSingle: async () => {
          const hit = rows.filter(r => filters.every(f => f(r)))[0] ?? null;
          if (patch) { log.updates.push({ table, patch, id: hit?.id }); if (updateResult !== undefined) return updateResult; return { data: hit ? { id: hit.id } : null, error: null }; }
          return { data: hit, error: null };
        },
        then: resolve => resolve({ data: rows.filter(r => filters.every(f => f(r))), error: null }),
      };
      void single;
      return api;
    },
  };
}
const lead = (o = {}) => ({ id: "L1", company: "Orbit Dental", contact: "Clara", email: "clara@orbit.example.invalid", stage_id: "proposal", archived: false, ...o });

test("duplicate lead by e-mail ignores case and spacing, only open leads", async () => {
  const db = fakeDb({ leads: [lead({ archived: true, id: "OLD" }), lead()] });
  assert.deepEqual({ ...(await findDuplicateLead(db, { company: "Orbit SRL", email: "  CLARA@Orbit.Example.invalid " })) }, { id: "L1", company: "Orbit Dental", stage_id: "proposal" });
  assert.ok(db.log.queries.some(q => q[2] === "archived" && q[3] === false), "archived leads are excluded like the unique index does");
  assert.equal(await findDuplicateLead(fakeDb({ leads: [lead()] }), { company: "X", email: "otra@orbit.example.invalid" }), null);
});

test("e-mail wildcards behave as literals and never produce a false match", async () => {
  const db = fakeDb({ leads: [lead({ email: "axb@orbit.example.invalid" })] });
  assert.equal(await findDuplicateLead(db, { company: "x", email: "a_b@orbit.example.invalid" }), null, "_ is not a wildcard");
  const q = db.log.queries.find(x => x[1] === "ilike");
  assert.equal(q[3], "a\\_b@orbit.example.invalid");
  assert.equal(await findDuplicateLead(fakeDb({ leads: [lead({ email: "a%@x.invalid" })] }), { company: "x", email: "a_@x.invalid" }), null);
  // "*" cannot be escaped in PostgREST filters: never guess.
  assert.equal(await findDuplicateLead(fakeDb({ leads: [lead({ email: "a*b@x.invalid" })] }), { company: "x", email: "a*b@x.invalid" }), null);
});

test("without e-mail the rule is company + contact among e-mail-less open leads (mirrors crm_leads_contact_unique)", async () => {
  const noMail = lead({ id: "L2", email: null, company: "Pepe SA", contact: "Pepe Prueba" });
  const db = fakeDb({ leads: [lead(), noMail] });
  assert.equal((await findDuplicateLead(db, { company: " PEPE sa ", contact: "pepe prueba", email: null })).id, "L2");
  assert.equal(await findDuplicateLead(db, { company: "Pepe SA", contact: "Otra persona", email: null }), null);
  assert.ok(db.log.queries.some(q => q[1] === "is" && q[2] === "email"), "only leads without e-mail can conflict");
});

test("conflict payload names the lead and is null when no duplicate exists", async () => {
  const db = fakeDb({ leads: [lead()], prospects: [{ id: "P1", company: "Orbit Dental SRL", contact: "Clara", email: "Clara@Orbit.example.invalid" }] });
  const out = await duplicateConflict(db, "P1");
  assert.equal(out.status, 409);
  assert.equal(out.body.code, "lead_exists");
  assert.equal(out.body.lead.id, "L1");
  assert.match(out.body.error, /ya está en el pipeline como «Orbit Dental»/);
  assert.equal(await duplicateConflict(fakeDb({ leads: [], prospects: [{ id: "P1", company: "Z", email: "z@x.invalid" }] }), "P1"), null);
  assert.equal(await duplicateConflict(fakeDb(), "missing"), null);
});

test("linking: only an APPROVED prospect, only to the server-computed duplicate, with version control", async () => {
  const base = { id: "P1", company: "Orbit SRL", contact: "Clara", email: "clara@orbit.example.invalid", status: "approved", lead_id: null, version: 3 };
  const db = fakeDb({ leads: [lead()], prospects: [base] });
  const ok = await linkProspectToExistingLead(db, "P1");
  assert.deepEqual({ ...ok }, { ok: true, leadId: "L1" });
  assert.deepEqual({ ...db.log.updates[0].patch }, { status: "converted", lead_id: "L1" });
  assert.ok(db.log.queries.some(q => q[2] === "version" && q[3] === 3), "optimistic version check");
  assert.ok(db.log.queries.some(q => q[2] === "status" && q[3] === "approved"));

  const pending = await linkProspectToExistingLead(fakeDb({ leads: [lead()], prospects: [{ ...base, status: "pending" }] }), "P1");
  assert.equal(pending.ok, false); assert.equal(pending.status, 409); assert.match(pending.error, /Aprueba/);

  const none = await linkProspectToExistingLead(fakeDb({ leads: [], prospects: [base] }), "P1");
  assert.equal(none.ok, false); assert.match(none.error, /No hay un lead duplicado/);

  const done = await linkProspectToExistingLead(fakeDb({ leads: [lead()], prospects: [{ ...base, status: "converted", lead_id: "L9" }] }), "P1");
  assert.deepEqual({ ...done }, { ok: true, leadId: "L9" }, "idempotent for an already converted prospect");

  const raced = await linkProspectToExistingLead(fakeDb({ leads: [lead()], prospects: [base], updateResult: { data: null, error: null } }), "P1");
  assert.equal(raced.ok, false); assert.equal(raced.status, 409); assert.match(raced.error, /cambió/);

  assert.equal((await linkProspectToExistingLead(fakeDb(), "nope")).status, 404);
});

test("routes: owner-only, both conversion paths explain the conflict and expose the human link", () => {
  const places = fs.readFileSync("src/app/admin/workspace/crm/radar/places/route.ts", "utf8");
  const api = fs.readFileSync("src/app/admin/workspace/crm/api/route.ts", "utf8");
  for (const [name, src] of [["places", places], ["api", api]]) {
    assert.match(src, /error\?\.code === "23505"/, name + " detects the unique violation");
    assert.match(src, /duplicateConflict\(/, name + " explains it");
    assert.match(src, /linkProspectToExistingLead\(/, name + " offers the human link");
  }
  assert.match(places, /getOwnerSession\(\)/);
  assert.match(api, /if \(!member\) return json\(\{ error: "No autorizado" \}, 403\)/);
  const lib = fs.readFileSync("src/lib/crm/prospect-link.ts", "utf8");
  assert.doesNotMatch(lib, /service_role|SERVICE_ROLE/);
  assert.match(lib, /\.eq\("status", "approved"\)\.eq\("version", p\.version\)/);
});
