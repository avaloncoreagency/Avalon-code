// V5 Phase 5 — commission receivable lifecycle (owed TO Avalon). PGlite, synthetic data only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SECOND = "00000000-0000-4000-8000-0000000000b2";

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec(`insert into auth.users(id,email) values ('${OWNER}','owner@example.invalid'),('${SECOND}','second@example.invalid');`);
  for (const file of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
    if (file.startsWith("20261102053022")) await db.exec(`insert into agency_memberships values ('${OWNER}','owner'),('${SECOND}','owner');`);
  }
  await db.exec(`insert into crm_private.finance_access(user_id) values ('${OWNER}');`);
  const as = id => db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated;`);
  const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
  await as(OWNER);
  // Synthetic contractor with an approved 5% revenue-share agreement and a verified signed contract.
  const lead = (await one("insert into crm_leads(company,contact,source,owner_id) values('Roofing Demo','QA','manual',$1) returning id", [OWNER])).id;
  const client = (await one("insert into crm_clients(legal_name,source,owner_id,origin_lead_id) values('Roofing Demo LLC','manual',$1,$2) returning id", [OWNER, lead])).id;
  const terms = await one(`insert into crm_commercial_terms(lead_id,kind,billing_model,commission_pct,commission_base,commission_approved_by,attribution_rules,cancellation_terms,currency)
    values($1,'agreed','commission',5,'gross_revenue',$2,'Jobs from tracked Avalon leads','Taxes, permits and refunds excluded','USD') returning id`, [lead, OWNER]);
  const contract = await one("insert into crm_contracts(lead_id,title,terms_id) values($1,'Synthetic revenue share',$2) returning id", [lead, terms.id]);
  await db.query("update crm_contracts set status='sent_for_signature' where id=$1", [contract.id]);
  await db.query("update crm_contracts set status='signed_pending_verification',signed_at=now(),signer_name='Synthetic signer',external_reference='ENV-QA-5' where id=$1", [contract.id]);
  await db.query("update crm_contracts set status='verified_signed',verification_method='document_review',verification_note='Synthetic document verified' where id=$1", [contract.id]);
  const record = async (ref, gross, excluded = "0") =>
    (await one("select crm_attribution_record($1::jsonb) id", [JSON.stringify({ client_id: client, source: "Tracked lead form", external_ref: ref, gross_collected: gross, excluded_amount: excluded })])).id;
  const advance = (id, to, evidence, version) => db.query("select crm_attribution_advance($1,$2,$3,$4) v", [id, to, evidence, version]);
  const row = id => one("select status,version,commission_due::text due,gross_collected::text gross from crm_attributed_conversions where id=$1", [id]);
  const summary = async () => (await one("select crm_attribution_summary($1) s", [client])).s.currencies[0];
  return { db, as, one, client, record, advance, row, summary };
}

test("$10,000 customer job at 5% = $500 commission; customer revenue is never Avalon revenue; cash only when paid", { timeout: 240000 }, async t => {
  const { db, one, record, advance, row, summary } = await setup();
  t.after(() => db.close());
  const id = await record("JOB-10000", "10000.00");
  let r = await row(id);
  assert.equal(r.gross, "10000.00");
  assert.equal(r.due, "500.00", "theoretical commission = 5% of base");
  assert.equal(r.status, "reported");
  let s = await summary();
  assert.equal(s.eligible, "0", "a reported result is not eligible");
  assert.equal(s.paid, "0", "a calculated commission is not collected");
  assert.equal(s.unverified, "500.00");
  // Skipping steps is rejected; every step needs evidence and the current version.
  await assert.rejects(advance(id, "eligible", "skip attempt", 1), /invalid_conversion_transition/);
  await assert.rejects(advance(id, "paid", "TRANSFER-1", 1), /invalid_conversion_transition/);
  await assert.rejects(advance(id, "client_paid_verified", "x", 1), /evidence_required/);
  await advance(id, "client_paid_verified", "Customer bank receipt RCPT-77", 1);
  await assert.rejects(advance(id, "attribution_verified", "stale screen", 1), /conversion_version_conflict/, "stale version cannot overwrite");
  await advance(id, "attribution_verified", "CRM source + call log match", 2);
  await advance(id, "eligible", "Agreement v1 clause 4 applies", 3);
  await assert.rejects(advance(id, "paid", "WIRE-BYPASS-001", 4), /invalid_conversion_transition/,
    "even eligible owners cannot skip invoice evidence");
  await assert.rejects(db.query("select crm_attribution_transition($1,'paid','LEGACY-BYPASS')", [id]),
    /permission denied|legacy_attribution_transition_disabled/i, "old RPC never bypasses evidence");
  assert.equal((await row(id)).version, 4, "rejected shortcuts cannot change a row version");
  s = await summary();
  assert.equal(s.eligible, "500.00");
  assert.equal(s.pending, "500.00");
  assert.equal(s.paid, "0");
  await advance(id, "invoiced", "AV-INV-2026-0001", 4);
  s = await summary();
  assert.equal(s.invoiced, "500.00");
  assert.equal(s.paid, "0", "invoiced is not collected");
  await advance(id, "paid", "Wire TRANSFER-500", 5);
  s = await summary();
  assert.equal(s.paid, "500.00");
  assert.equal(s.pending, "0");
  await assert.rejects(advance(id, "void", "Refund after payment", 6), /invalid_conversion_transition/, "paid is final; corrections are separate records");
  const events = (await db.query("select from_status,to_status from crm_attribution_events where conversion_id=$1 order by created_at,to_status", [id])).rows;
  assert.deepEqual(events.map(e => e.to_status).sort(), ["attribution_verified", "client_paid_verified", "eligible", "invoiced", "paid"], "every accepted decision appended; rejected attempts are not");
  // Separation: nothing written to payouts BY Avalon, sales or payments.
  for (const table of ["crm_commissions", "crm_sales", "crm_payments", "crm_invoices"]) {
    assert.equal(Number((await one(`select count(*) n from ${table}`)).n), 0, `${table} untouched by a receivable commission`);
  }
});

test("exclusions, disputes, resolution, void and period", { timeout: 240000 }, async t => {
  const { db, as, record, advance, row, summary } = await setup();
  t.after(() => db.close());
  const id = await record("JOB-EXCL", "1000.00", "200.00");
  assert.equal((await row(id)).due, "40.00", "5% of (1000 - 200 excluded)");
  await db.query("select crm_attribution_set_period($1,'2026-11-01','2026-11-30')", [id]);
  await assert.rejects(db.query("select crm_attribution_set_period($1,'2026-11-30','2026-11-01')", [id]), /conversion_invalid/);
  await advance(id, "client_paid_verified", "Receipt RCPT-88", 2);
  await advance(id, "disputed", "Client says lead came from a referral", 3);
  let s = await summary();
  assert.equal(s.disputed, "40.00");
  assert.equal(s.eligible, "0", "disputed money is never eligible");
  await assert.rejects(advance(id, "eligible", "jump out of dispute", 4), /invalid_conversion_transition/);
  await advance(id, "client_paid_verified", "Call recording confirms Avalon form", 4);
  assert.equal((await row(id)).status, "client_paid_verified", "resolution returns to the disputed step");
  await advance(id, "void", "Customer refunded the job", 5);
  assert.equal((await row(id)).status, "void");
  // Owner without the finance grant cannot advance or read.
  const other = await record("JOB-OTHER", "300.00");
  await as(SECOND);
  await assert.rejects(advance(other, "client_paid_verified", "Receipt RCPT-9", 1), /finance_forbidden/);
  assert.equal((await db.query("select id from crm_attribution_events")).rows.length, 0);
  await assert.rejects(db.query("insert into crm_attribution_events(conversion_id,from_status,to_status,evidence,actor_id) values($1,'reported','paid','forged',$2)", [other, SECOND]), /permission denied/);
});
