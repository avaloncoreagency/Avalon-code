// Isolated PGlite verification: synthetic owners, sandbox IDs, no Stripe network calls.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const MIGUEL = "00000000-0000-4000-8000-0000000000a1";
const SAMUEL = "00000000-0000-4000-8000-0000000000b2";
const STRANGER = "00000000-0000-4000-8000-0000000000c3";

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec(`insert into auth.users(id,email) values
    ('${MIGUEL}','miguel@example.invalid'),('${SAMUEL}','samuel@example.invalid'),('${STRANGER}','stranger@example.invalid');`);
  for (const f of fs.readdirSync("supabase/migrations").filter(x => x.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + f, "utf8"));
    if (f.startsWith("20261102053022")) await db.exec(`insert into agency_memberships(user_id,role)
      values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${STRANGER}','operator');`);
  }
  const owner = id => db.exec(`reset role; set request.jwt.claim.sub='${id}'; set request.jwt.claim.role='authenticated'; set role authenticated;`);
  const service = () => db.exec("reset role; set request.jwt.claim.sub=''; set request.jwt.claim.role='service_role'; set role service_role;");
  const first = async (sql, params) => (await db.query(sql, params)).rows[0];
  const count = async (sql, params) => Number((await first(sql, params)).n);
  return { db, owner, service, first, count };
}
const saleInput = {
  idempotency_key: "33333333-3333-4333-8333-333333333333",
  new_client: { legal_name: "Stripe Test Shop", source: "Synthetic", country:"US", location:"Test, FL" },
  contacts: [{ full_name: "Test Person", email: "buyer@example.invalid", role: "Owner" }],
  sold_on:"2026-11-02", currency:"USD", billing_mode:"one_time", upfront_amount:"0",
  seller_id: MIGUEL,
  lines: [{ service_code:"desarrollo-web", unit_price:"250.00", description:"Synthetic website", assignee_id:SAMUEL }],
};

test("Stripe invoice reserves the unpaid balance, rejects strangers and reconciles signed-event payload exactly once", {timeout:120000}, async t => {
  const {db, owner, service, first, count}=await setup();
  t.after(()=>db.close());
  await owner(MIGUEL);
  const sale=(await first("select crm_confirm_sale($1::jsonb) r",[JSON.stringify(saleInput)])).r;
  const saleId=sale.sale_id;
  assert.equal(Number((await first("select total from crm_sales where id=$1",[saleId])).total),250);
  await db.query("insert into crm_payments(sale_id, amount, currency, received_on, method) values ($1,50,'USD','2026-11-02','transfer')",[saleId]);
  const reserved=(await db.query("select * from crm_stripe_reserve_invoice($1)",[saleId])).rows[0];
  assert.equal(Number(reserved.amount_minor), 20000);
  const replay=(await db.query("select * from crm_stripe_reserve_invoice($1)",[saleId])).rows[0];
  assert.equal(replay.id,reserved.id);
  assert.equal(await count("select count(*) n from crm_stripe_invoices"),1);
  await db.query("select crm_stripe_attach_invoice($1,$2,$3)",[reserved.id,"in_TEST001","cus_TEST001"]);
  const row=await first("select status,stripe_invoice_id from crm_stripe_invoices where id=$1",[reserved.id]);
  assert.equal(row.status,"draft");
  assert.equal(row.stripe_invoice_id,"in_TEST001");

  // Simulate sending first and the app losing the DB response; Stripe's signed
  // webhook must restore the hosted URL and open status for the owner UI.
  await service();
  const sentEvent={id:"evt_SENT001",type:"invoice.sent",livemode:false,
    data:{object:{id:"in_TEST001",status:"open",livemode:false,
      hosted_invoice_url:"https://invoice.stripe.com/i/qa-example"}}};
  const sentResult=(await first("select crm_stripe_process_event($1::jsonb) r",[JSON.stringify(sentEvent)])).r;
  assert.equal(sentResult.status,"processed");
  await owner(MIGUEL);
  const persisted=await first("select status,hosted_invoice_url from crm_stripe_invoices where id=$1",[reserved.id]);
  assert.equal(persisted.status,"open");
  assert.equal(persisted.hosted_invoice_url,"https://invoice.stripe.com/i/qa-example");

  await owner(STRANGER);
  await assert.rejects(db.query("select crm_stripe_reserve_invoice($1)",[saleId]),/crm_forbidden/);
  assert.equal(await count("select count(*) n from crm_stripe_invoices"),0);
  await assert.rejects(db.query("select crm_stripe_process_event('{}'::jsonb)"),/permission denied|crm_forbidden/);
  await service();
  const event={
    id:"evt_TEST001", type:"invoice.payment_succeeded", livemode:false, created:1793650000,
    data:{object:{id:"in_TEST001",status:"paid",currency:"usd",customer:"cus_TEST001",amount_paid:20000,livemode:false}}
  };
  // invoice.paid can also be a staff-recorded payment outside Stripe.
  // It must NOT add a cash receipt; it only raises a review flag.
  let result=(await first("select crm_stripe_process_event($1::jsonb) r",[
    JSON.stringify({...event,id:"evt_NOTICE001",type:"invoice.paid"})
  ])).r;
  assert.equal(result.status,"review");
  await owner(MIGUEL);
  assert.equal(await count("select count(*) n from crm_payments where sale_id=$1",[saleId]),1);
  await service();
  result=(await first("select crm_stripe_process_event($1::jsonb) r",[JSON.stringify(event)])).r;
  assert.equal(result.status,"processed");
  result=(await first("select crm_stripe_process_event($1::jsonb) r",[JSON.stringify(event)])).r;
  assert.equal(result.status,"duplicate");
  result=(await first("select crm_stripe_process_event($1::jsonb) r",[JSON.stringify({...event,id:"evt_TEST002"})])).r;
  assert.equal(result.status,"already_recorded");
  await owner(MIGUEL);
  assert.equal(await count("select count(*) n from crm_payments where sale_id=$1",[saleId]),2);
  assert.equal(Number((await first("select sum(amount) total from crm_payments where sale_id=$1",[saleId])).total),250);
  assert.equal((await first("select status,needs_review from crm_stripe_invoices where id=$1",[reserved.id])).status,"paid");
  assert.equal(await count("select count(*) n from crm_audit where entity='crm_payments' and actor_id=$1",[MIGUEL]),2, "both manual and Stripe payments attributed to a verified owner");

  await service();
  const refund={id:"evt_TEST003",type:"credit_note.created",livemode:false,data:{object:{id:"cn_TEST",invoice:"in_TEST001"}}};
  result=(await first("select crm_stripe_process_event($1::jsonb) r",[JSON.stringify(refund)])).r;
  assert.equal(result.status,"review");
  await owner(MIGUEL);
  assert.equal((await first("select needs_review from crm_stripe_invoices where id=$1",[reserved.id])).needs_review,true);
});

test("Mismatched invoice amount is flagged, never silently recorded as revenue", {timeout:120000}, async t => {
  const {db,owner,service,first,count}=await setup();
  t.after(()=>db.close());
  await owner(MIGUEL);
  const s=(await first("select crm_confirm_sale($1::jsonb) r",[JSON.stringify(saleInput)])).r;
  const inv=(await db.query("select * from crm_stripe_reserve_invoice($1)",[s.sale_id])).rows[0];
  await db.query("select crm_stripe_attach_invoice($1,'in_TEST002','cus_TEST002')",[inv.id]);
  await service();
  const evt={
    id:"evt_BAD001",type:"invoice.paid",livemode:false,
    data:{object:{id:"in_TEST002",status:"paid",currency:"usd",customer:"cus_TEST002",amount_paid:1234,livemode:false}}
  };
  const r=(await first("select crm_stripe_process_event($1::jsonb) r",[JSON.stringify(evt)])).r;
  assert.equal(r.status,"review");
  await owner(MIGUEL);
  assert.equal(await count("select count(*) n from crm_payments where sale_id=$1",[s.sale_id]),0);
  assert.equal((await first("select status from crm_stripe_invoices where id=$1",[inv.id])).status,"review");
});

test("Stripe invoice.paid alone NEVER records cash when paid out of band", {timeout:120000}, async t => {
  const {db,owner,service,first,count}=await setup();
  t.after(()=>db.close());
  await owner(MIGUEL);
  const sale=(await first("select crm_confirm_sale($1::jsonb) r",[JSON.stringify(saleInput)])).r;
  const inv=(await db.query("select * from crm_stripe_reserve_invoice($1)",[sale.sale_id])).rows[0];
  await db.query("select crm_stripe_attach_invoice($1,'in_MANUAL001','cus_MANUAL001')",[inv.id]);
  await service();
  const notice={id:"evt_MANUAL001",type:"invoice.paid",livemode:false,
    data:{object:{id:"in_MANUAL001",status:"paid",currency:"usd",customer:"cus_MANUAL001",amount_paid:25000,livemode:false}}};
  const result=(await first("select crm_stripe_process_event($1::jsonb) r",[JSON.stringify(notice)])).r;
  assert.equal(result.status,"review");
  await owner(MIGUEL);
  assert.equal(await count("select count(*) n from crm_payments where sale_id=$1",[sale.sale_id]),0);
  const row=await first("select status,needs_review,review_reason from crm_stripe_invoices where id=$1",[inv.id]);
  assert.equal(row.status,"review");
  assert.equal(row.needs_review,true);
  assert.equal(row.review_reason,"payment_source_unverified");
});

test("Out-of-order signed payment event is retried until its invoice reservation is linked", {timeout:120000}, async t => {
  const {db,owner,service,first,count}=await setup();
  t.after(()=>db.close());
  await owner(MIGUEL);
  const sale=(await first("select crm_confirm_sale($1::jsonb) r",[JSON.stringify(saleInput)])).r;
  const inv=(await db.query("select * from crm_stripe_reserve_invoice($1)",[sale.sale_id])).rows[0];
  const event={id:"evt_EARLY001",type:"invoice.payment_succeeded",livemode:false,
    data:{object:{id:"in_EARLY001",status:"paid",currency:"usd",customer:"cus_EARLY001",
      amount_paid:25000,livemode:false,metadata:{
        avalon_invoice_id:inv.id,avalon_sale_id:sale.sale_id,avalon_client_id:inv.client_id
      }}}};
  await service();
  await assert.rejects(
    db.query("select crm_stripe_process_event($1::jsonb)",[JSON.stringify(event)]),
    /stripe_invoice_pending_link/
  );
  // The transaction rolled back its preliminary event insert.
  assert.equal(await count("select count(*) n from crm_stripe_events"),0);
  await owner(MIGUEL);
  await db.query("select crm_stripe_attach_invoice($1,'in_EARLY001','cus_EARLY001')",[inv.id]);
  await service();
  const processed=(await first("select crm_stripe_process_event($1::jsonb) r",[JSON.stringify(event)])).r;
  assert.equal(processed.status,"processed");
  await owner(MIGUEL);
  assert.equal(await count("select count(*) n from crm_payments where sale_id=$1",[sale.sale_id]),1);
});
