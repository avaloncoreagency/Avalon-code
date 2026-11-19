// Real PostgreSQL (PGlite) regression tests, synthetic data only. No external APIs.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SECOND = "00000000-0000-4000-8000-0000000000b2";
const OUTSIDER = "00000000-0000-4000-8000-0000000000c3";

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec(`insert into auth.users(id,email) values
    ('${OWNER}','owner@example.invalid'),('${SECOND}','second@example.invalid'),
    ('${OUTSIDER}','outsider@example.invalid');`);
  for (const file of fs.readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/"+file,"utf8"));
    if (file.startsWith("20261102053022"))
      await db.exec(`insert into agency_memberships values
        ('${OWNER}','owner'),('${SECOND}','owner'),('${OUTSIDER}','operator');`);
  }
  await db.exec(`insert into crm_private.finance_access(user_id) values ('${OWNER}');`);
  const as = id => db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated;`);
  const one = async (sql,params=[]) => (await db.query(sql,params)).rows[0];
  return {db,as,one};
}

test("attributed revenue: approved signed terms, exact cents, finance isolation and evidence transitions", {timeout:240000}, async t => {
  const {db,as,one} = await setup();
  t.after(()=>db.close());
  await as(OWNER);
  const lead = (await one("insert into crm_leads(company,contact,source,owner_id) values('Barbería QA','Contacto','manual',$1) returning id",[OWNER])).id;
  const client = (await one("insert into crm_clients(legal_name,source,owner_id,origin_lead_id) values('Barbería QA','manual',$1,$2) returning id",[OWNER,lead])).id;
  const input = {client_id:client,source:"Tracking campaign A",external_ref:"APPT-001",gross_collected:"100.00",excluded_amount:"20.00"};
  await assert.rejects(db.query("select crm_attribution_record($1::jsonb)",[JSON.stringify(input)]),/approved_revenue_commission_required/);

  const terms = await one(`insert into crm_commercial_terms(lead_id,kind,billing_model,commission_pct,commission_base,
    commission_approved_by,attribution_rules,cancellation_terms,currency)
    values($1,'agreed','commission',15,'gross_revenue',$2,'Unique tracked bookings','Taxes and refunds excluded','USD')
    returning id`,[lead,OWNER]);
  await assert.rejects(db.query("select crm_attribution_record($1::jsonb)",[JSON.stringify(input)]),/signed_current_terms_required/);
  const contract = await one("insert into crm_contracts(lead_id,title,terms_id) values($1,'Synthetic signed contract',$2) returning id",[lead,terms.id]);
  await db.query("update crm_contracts set status='sent_for_signature' where id=$1",[contract.id]);
  await db.query("update crm_contracts set status='signed_pending_verification',signed_at=now(),signer_name='Synthetic signer',external_reference='ENVELOPE-QA-001' where id=$1",[contract.id]);
  await db.query("update crm_contracts set status='verified_signed',verification_method='document_review',verification_note='Synthetic document verified by owner' where id=$1",[contract.id]);

  const conversion=(await one("select crm_attribution_record($1::jsonb) id",[JSON.stringify(input)])).id;
  const row=await one("select status,commission_due::text,rate_pct::text from crm_attributed_conversions where id=$1",[conversion]);
  assert.equal(row.status,"reported");
  assert.equal(row.commission_due,"12.00");
  assert.equal(row.rate_pct,"15.00");
  await assert.rejects(db.query("select crm_attribution_record($1::jsonb)",[JSON.stringify(input)]),/duplicate|unique|crm_attributed_conversions_client_id_external_ref_key/i);
  await assert.rejects(db.query("select crm_attribution_transition($1,'paid','TRANSFER-001')",[conversion]),/invalid_conversion_transition/);
  await db.query("select crm_attribution_transition($1,'verified','Receipt and booking verified')",[conversion]);
  const summary1=(await one("select crm_attribution_summary($1) s",[client])).s.currencies[0];
  assert.equal(summary1.currency,"USD");
  assert.equal(summary1.eligible,"12.00");
  assert.equal(summary1.pending,"12.00");
  assert.equal(summary1.paid,"0");
  await db.query("select crm_attribution_transition($1,'paid','TRANSFER-001')",[conversion]);
  const summary2=(await one("select crm_attribution_summary($1) s",[client])).s.currencies[0];
  assert.equal(summary2.pending,"0");
  assert.equal(summary2.paid,"12.00");
  await assert.rejects(db.query("select crm_attribution_transition($1,'void','Refunded transaction')",[conversion]),/invalid_conversion_transition/);

  await as(OUTSIDER);
  const unauthorized = await db.query("select id from crm_attributed_conversions");
  assert.equal(unauthorized.rows.length,0,"RLS hides client revenue from non-owners");
  await assert.rejects(db.query("select crm_attribution_record($1::jsonb)",[JSON.stringify({...input,external_ref:"APPT-002"})]),/finance_forbidden/);
  await as(SECOND);
  const noFinance=await db.query("select id from crm_attributed_conversions");
  assert.equal(noFinance.rows.length,0,"An owner without finance grant cannot read this ledger");
  await assert.rejects(db.query("select crm_attribution_summary($1)",[client]),/finance_forbidden/);
  await assert.rejects(db.query("insert into crm_attributed_conversions(client_id,terms_id,contract_id,source,external_ref,currency,gross_collected,rate_pct,created_by) values($1,$2,$3,'manual','DIRECT-INSERT','USD',100,15,$4)",[client,terms.id,contract.id,SECOND]),/permission denied/);
});
