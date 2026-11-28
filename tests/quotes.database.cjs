// Quoting Studio on real PostgreSQL (PGlite). Synthetic data only; no external APIs, no production access.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite");
const approveFixtureOffers = require('./helpers/approve-fixture-offers.cjs');

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SECOND = "00000000-0000-4000-8000-0000000000b2";
const OUTSIDER = "00000000-0000-4000-8000-0000000000c3";

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec(`insert into auth.users(id,email) values ('${OWNER}','owner@example.invalid'),('${SECOND}','second@example.invalid'),('${OUTSIDER}','outsider@example.invalid');`);
  for (const file of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
    if (file.startsWith("20261102053022"))
      await db.exec(`insert into agency_memberships values ('${OWNER}','owner'),('${SECOND}','owner'),('${OUTSIDER}','operator');`);
  }
  await approveFixtureOffers(db, OWNER, [['desarrollo-web',750.25]]);
  const as = id => db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated;`);
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  return { db, as, one };
}

const content = (over = {}) => ({
  schemaVersion: 1, lang: "es", currency: "USD", title: "Website para Barbería QA", issueDate: "2026-11-19", validUntil: "2099-12-31",
  client: { company: "Barbería QA", contact: "", email: "", phone: "", address: "" }, issuer: { name: "Avalon", email: "", phone: "" },
  seller: "", objectives: "", problem: "", solution: "Sitio con reservas", scope: "", deliverables: "", exclusions: "", dependencies: "",
  timeline: "", support: "", terms: "", notes: "", thirdPartyCosts: "", model: "fixed",
  lines: [{ code: "desarrollo-web", name: "Website", description: "", kind: "one_time", qty: 2, unitPrice: "750.25" }],
  commission: null, ...over,
});
const sha = c => crypto.createHash("sha256").update(JSON.stringify(c)).digest("hex");
const commission = (over = {}) => ({ status: "proposed", pct: "10", base: "gross_revenue", baseNote: "", trigger: "Cita cobrada", attributionWindowDays: 30,
  evidence: "Reporte de reservas", settlement: "monthly", exclusions: "", refunds: "", expiry: "", ...over });

test("quotes: owner-only RPCs, exact totals, immutable revisions, status machine and contract link", { timeout: 240000 }, async t => {
  const { db, as, one } = await setup();
  t.after(() => db.close());
  await as(OWNER);
  const lead = (await one("insert into crm_leads(company,contact,source,owner_id) values('Barbería QA','Contacto','manual',$1) returning id", [OWNER])).id;
  const otherLead = (await one("insert into crm_leads(company,contact,source,owner_id) values('Otra Empresa QA','X','manual',$1) returning id", [OWNER])).id;
  const client = (await one("insert into crm_clients(legal_name,source,owner_id,origin_lead_id) values('Barbería QA','manual',$1,$2) returning id", [OWNER, lead])).id;

  const c1 = content();
  const key = crypto.randomUUID();
  const created = (await one("select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r", [lead, key, JSON.stringify(c1), JSON.stringify({ directCosts: "INTERNAL-900", marginNote: "", confidential: "" }), sha(c1)])).r;
  assert.match(created.quote_number, /^Q-\d{4}-\d{4}$/);
  assert.equal(created.version, 1);
  // Idempotent: a double tap returns the same quote.
  const again = (await one("select crm_quote_create($1,$2,$3::jsonb,'{}'::jsonb,$4) r", [lead, key, JSON.stringify(c1), sha(c1)])).r;
  assert.equal(again.quote_id, created.quote_id);
  assert.equal(again.existing, true);
  assert.equal((await one("select count(*)::int n from crm_quotes")).n, 1);

  const q = await one("select * from crm_quotes where id=$1", [created.quote_id]);
  assert.equal(q.client_id, client, "client is derived from the opportunity, never from the caller");
  assert.equal(q.status, "draft");
  const v1 = await one("select one_time_total::text o, monthly_total::text m, internal from crm_quote_versions where quote_id=$1 and version_no=1", [q.id]);
  assert.equal(v1.o, "1500.50", "exact numeric totals computed by the database");
  assert.equal(v1.m, "0.00");
  assert.equal(v1.internal.directCosts, "INTERNAL-900");

  // No direct writes: totals or content cannot be forged through REST.
  await assert.rejects(db.query("update crm_quotes set status='accepted' where id=$1", [q.id]), /permission denied/);
  await assert.rejects(db.query("update crm_quote_versions set one_time_total=1 where quote_id=$1", [q.id]), /permission denied/);
  await assert.rejects(db.query("delete from crm_quote_versions where quote_id=$1", [q.id]), /permission denied/);
  await assert.rejects(db.query("insert into crm_quote_events(quote_id,version_no,to_status,actor_id) values($1,1,'accepted',$2)", [q.id, OWNER]), /permission denied/);

  // Shape validation in the database mirrors the app.
  const bad = async (c, re) => assert.rejects(db.query("select crm_quote_create($1,$2,$3::jsonb,'{}'::jsonb,$4)", [lead, crypto.randomUUID(), JSON.stringify(c), sha(c)]), re);
  await bad(content({ lines: [...c1.lines, { code: null, name: "Soporte", description: "", kind: "monthly", qty: 1, unitPrice: "150" }] }), /quote_invalid_model_shape/);
  await bad(content({ model: "hybrid" }), /quote_invalid_model_shape/);
  await bad(content({ lines: [{ ...c1.lines[0], unitPrice: "1.234" }] }), /quote_invalid_lines/);
  await bad(content({ lines: [{ ...c1.lines[0], qty: 0 }] }), /quote_invalid_lines/);
  await bad(content({ validUntil: "2026-01-01" }), /quote_invalid_dates/);
  await bad(content({ currency: "EUR" }), /quote_invalid_content/);
  await bad(content({ model: "commission", lines: [], commission: commission({ pct: "150" }) }), /quote_invalid_commission/);
  await bad(content({ model: "commission", lines: [], commission: commission({ status: "to_negotiate", pct: "5" }) }), /quote_invalid_commission/);
  await assert.rejects(db.query("select crm_quote_create($1,$2,$3::jsonb,'{}'::jsonb,'x')", [lead, crypto.randomUUID(), JSON.stringify(c1)]), /quote_invalid_digest/);

  // Revision: append-only, back to draft, optimistic concurrency, no-op on identical retry.
  const c2 = content({ model: "hybrid", lines: [...c1.lines, { code: null, name: "Soporte", description: "", kind: "monthly", qty: 1, unitPrice: "150" }] });
  assert.equal((await one("select crm_quote_revise($1,$2,$3::jsonb,'{}'::jsonb,$4,'Agrega soporte') v", [q.id, q.version, JSON.stringify(c2), sha(c2)])).v, 2);
  await assert.rejects(db.query("select crm_quote_revise($1,$2,$3::jsonb,'{}'::jsonb,$4)", [q.id, q.version, JSON.stringify(c2), sha(c2)]), /quote_version_conflict/);
  let cur = await one("select * from crm_quotes where id=$1", [q.id]);
  assert.equal((await one("select crm_quote_revise($1,$2,$3::jsonb,'{}'::jsonb,$4) v", [q.id, cur.version, JSON.stringify(c2), sha(c2)])).v, 2, "identical retry is a no-op");
  assert.equal((await one("select count(*)::int n from crm_quote_versions where quote_id=$1", [q.id])).n, 2);
  assert.equal((await one("select monthly_total::text m from crm_quote_versions where quote_id=$1 and version_no=2", [q.id])).m, "150.00");

  // Status machine: no skipping, notes required where a human decision is recorded.
  const go = async (to, note = "") => { cur = await one("select * from crm_quotes where id=$1", [q.id]); return db.query("select crm_quote_transition($1,$2,$3,$4)", [q.id, cur.version, to, note]); };
  await assert.rejects(go("accepted", "Cliente aceptó por correo"), /quote_invalid_transition/);
  await assert.rejects(go("sent", "Enviado"), /quote_invalid_transition/);
  await go("internal_review");
  await go("approved");
  await assert.rejects(go("sent", "x"), /quote_note_required/);
  await go("sent", "Descargado y enviado por correo el 19/11");
  assert.ok((await one("select sent_at from crm_quotes where id=$1", [q.id])).sent_at);
  // A sent quote cannot be silently changed.
  cur = await one("select * from crm_quotes where id=$1", [q.id]);
  await assert.rejects(db.query("select crm_quote_revise($1,$2,$3::jsonb,'{}'::jsonb,$4)", [q.id, cur.version, JSON.stringify(c1), sha(c1)]), /quote_not_revisable/);

  // Contract draft cannot reference a quote that is not accepted.
  const v2id = (await one("select id from crm_quote_versions where quote_id=$1 and version_no=2", [q.id])).id;
  const draft = (extra = {}) => db.query(`insert into crm_client_agreement_drafts(client_id,template_version,snapshot,snapshot_sha256,created_by,quote_version_id)
    values($1,'v1','{}'::jsonb,$2,$3,$4)`, [extra.client || client, crypto.randomBytes(32).toString("hex"), OWNER, extra.version || v2id]);
  await assert.rejects(draft(), /agreement_quote_not_accepted/);

  await go("accepted", "Aceptada por correo del contacto, guardado en expediente");
  const accepted = await one("select status, decided_by, accepted_at from crm_quotes where id=$1", [q.id]);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.decided_by, OWNER);
  // Acceptance creates NO sale, NO invoice, NO payment, NO commission.
  for (const table of ["crm_sales", "crm_invoices", "crm_payments", "crm_commissions"])
    assert.equal((await one(`select count(*)::int n from ${table}`)).n, 0, table + " untouched");
  await assert.rejects(go("draft"), /quote_invalid_transition/);

  // Wrong client is refused even for an accepted quote.
  const otherClient = (await one("insert into crm_clients(legal_name,source,owner_id,origin_lead_id) values('Otra Empresa QA','manual',$1,$2) returning id", [OWNER, otherLead])).id;
  await assert.rejects(draft({ client: otherClient }), /agreement_quote_not_accepted/);
  await draft();
  assert.equal((await one("select count(*)::int n from crm_client_agreement_drafts where quote_version_id=$1", [v2id])).n, 1);

  // Commission still to be negotiated can be sent but never accepted.
  const cn = content({ model: "commission", lines: [], commission: commission({ status: "to_negotiate", pct: "" }) });
  const qn = (await one("select crm_quote_create($1,$2,$3::jsonb,'{}'::jsonb,$4) r", [otherLead, crypto.randomUUID(), JSON.stringify(cn), sha(cn)])).r;
  const step = async (to, note = "") => { const r = await one("select version from crm_quotes where id=$1", [qn.quote_id]); return db.query("select crm_quote_transition($1,$2,$3,$4)", [qn.quote_id, r.version, to, note]); };
  await step("internal_review"); await step("approved"); await step("sent", "Enviado para negociar porcentaje");
  await assert.rejects(step("accepted", "Cliente dice que sí"), /quote_commission_to_negotiate/);
  await step("rejected", "No llegamos a acuerdo en porcentaje");

  const summary = (await one("select crm_quote_summary() s")).s;
  assert.deepEqual(summary, { draft: 0, sent: 0, overdue: 0, accepted_without_contract: 0 });

  // Audit trail: every transition is in the event log and the timeline.
  assert.equal((await one("select count(*)::int n from crm_quote_events where quote_id=$1", [q.id])).n, 6);
  assert.ok((await one("select count(*)::int n from crm_timeline where event_type like 'quote.%'")).n >= 9);

  // Second owner sees everything; a non-owner member sees nothing and cannot write.
  await as(SECOND);
  assert.equal((await db.query("select id from crm_quotes")).rows.length, 2);
  await as(OUTSIDER);
  assert.equal((await db.query("select id from crm_quotes")).rows.length, 0);
  assert.equal((await db.query("select id from crm_quote_versions")).rows.length, 0);
  await assert.rejects(db.query("select crm_quote_create($1,$2,$3::jsonb,'{}'::jsonb,$4)", [lead, crypto.randomUUID(), JSON.stringify(c1), sha(c1)]), /crm_forbidden/);
  await assert.rejects(db.query("select crm_quote_transition($1,1,'draft','')", [q.id]), /crm_forbidden/);
  await db.exec("reset role; set role anon;");
  await assert.rejects(db.query("select crm_quote_create($1,$2,$3::jsonb,'{}'::jsonb,$4)", [lead, crypto.randomUUID(), JSON.stringify(c1), sha(c1)]), /permission denied/);
  await assert.rejects(db.query("select * from crm_quotes"), /permission denied/);
});
