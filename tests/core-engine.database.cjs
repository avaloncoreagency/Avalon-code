// Operation Core Engine (C1–C6) on real PostgreSQL (PGlite). Synthetic identities and data only; no network.
// Covers: catalog offer approval/versioning, active catalog, documented invoices, payment reconciliation, commission
// ledger, finance ledger exactness, project→client lock, cross-client documents, third-party rejection and the
// synthetic barbershop pilot (B2B only) end to end.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const verifiedContract = require('./helpers/verified-contract.cjs');
const approveFixtureOffers = require('./helpers/approve-fixture-offers.cjs');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','miguel@example.invalid'),('${SAMUEL}','samuel@example.invalid'),('${STRANGER}','x@example.invalid');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${STRANGER}','operator');`);
  }
  // Finance read access is an explicit per-owner grant (crm_private.finance_access); both owners have it here.
  await db.exec(`insert into crm_private.finance_access(user_id) values ('${MIGUEL}'),('${SAMUEL}');`);
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const n = async (q, p) => Number((await one(q, p)).n);
  return { db, as, one, n };
}
const uuid = i => `90000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

async function newLead(db, one, company, email) {
  return (await one("insert into crm_leads(company,contact,email,source,owner_id) values($1,'Contacto Sintético',$2,'Manual',$3) returning id", [company, email, MIGUEL])).id;
}
async function sellTo(db, one, leadId, company, key, lines) {
  return (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({
    idempotency_key: key, lead_id: leadId, new_client: { legal_name: company }, seller_id: MIGUEL, lines })])).r;
}

test('catalog: offers start as drafts, approval is attributable, edits reopen a new version; active catalog for this operation', { timeout: 180000 }, async t => {
  const { db, as, one } = await setup();
  t.after(() => db.close());
  await as(MIGUEL);
  const web = await one("select offer_status, offer_version, suggested_price, active from crm_service_catalog where code='desarrollo-web'");
  assert.deepEqual([web.offer_status, web.offer_version, web.suggested_price], ['draft', 1, null], 'no seeded price');
  await assert.rejects(db.query("update crm_service_catalog set offer_status='approved' where code='desarrollo-web'"), /offer_requires_price/);
  await db.query("update crm_service_catalog set suggested_price=1500, monthly_price=80, direct_cost=300, target_margin_pct=55, estimated_days=21, payment_terms='50% inicio, 50% entrega', exclusions='Hosting de terceros' where code='desarrollo-web'");
  await db.query("update crm_service_catalog set offer_status='approved' where code='desarrollo-web'");
  const ok = await one("select offer_status, offer_version, offer_approved_by from crm_service_catalog where code='desarrollo-web'");
  assert.deepEqual([ok.offer_status, ok.offer_version, ok.offer_approved_by], ['approved', 1, MIGUEL]);
  // Samuel cannot record the approval in Miguel's name, and editing the price reopens a new draft version.
  await as(SAMUEL);
  await db.query("update crm_service_catalog set suggested_price=1700 where code='desarrollo-web'");
  const v2 = await one("select offer_status, offer_version, offer_approved_by from crm_service_catalog where code='desarrollo-web'");
  assert.deepEqual([v2.offer_status, v2.offer_version, v2.offer_approved_by], ['draft', 2, null]);
  await db.query("update crm_service_catalog set offer_status='approved' where code='desarrollo-web'");
  assert.equal((await one("select offer_approved_by from crm_service_catalog where code='desarrollo-web'")).offer_approved_by, SAMUEL);
  // Commission rules need a value of the right shape; none is invented.
  await assert.rejects(db.query("update crm_service_catalog set commission_kind='sale_pct' where code='tienda-online'"), /commission_shape/);
  await assert.rejects(db.query("update crm_service_catalog set commission_kind='sale_pct', commission_value=150 where code='tienda-online'"), /commission_pct/);
  // Automations are in the catalog. Taking the AI receptionist out of this operation is an owner decision in the
  // catalog: deactivating keeps the historical record and blocks new sales of it.
  assert.equal((await one("select active from crm_service_catalog where code='automatizacion'")).active, true);
  await db.query("update crm_service_catalog set active=false where code='recepcionista-ia'");
  const active = (await db.query('select code from crm_service_catalog where active order by code')).rows.map(r => r.code);
  assert.deepEqual(active, ['automatizacion', 'crm-personalizado', 'desarrollo-web', 'generacion-leads', 'marketing-mensual', 'tienda-online']);
  const lead = await newLead(db, one, 'Recepción Sintética', 'r@example.invalid');
  await verifiedContract(db, lead);
  await assert.rejects(sellTo(db, one, lead, 'Recepción Sintética', uuid(1), [{ service_code: 'recepcionista-ia', unit_price: '900' }]), err=>err.code==='23514'&&err.message==='commercial_offer_not_approved');
  // A non-owner member cannot change the catalog.
  await as(STRANGER);
  const r = await db.query("update crm_service_catalog set suggested_price=1 where code='automatizacion' returning id");
  assert.equal(r.rows.length, 0, 'RLS hides the catalog from non-owners');
});

test('barbershop pilot (synthetic, B2B): diagnosis → proposal → contract → sale → orders → invoice → payment → commission → ledger', { timeout: 240000 }, async t => {
  const { db, as, one, n } = await setup();
  t.after(() => db.close());
  await approveFixtureOffers(db,MIGUEL,[['desarrollo-web',1500],['crm-personalizado',900.10],['marketing-mensual',300]]);
  await as(MIGUEL);
  const company = 'Barbería Piloto Sintética';
  const lead = await newLead(db, one, company, 'piloto@barberia.example.invalid');
  for (const stage of ['contacted', 'qualified', 'proposal']) await db.query('update crm_leads set stage_id=$2 where id=$1', [lead, stage]);
  // Proposal (Website + CRM): proposed terms only; no commission is agreed here.
  await db.query("insert into crm_commercial_terms(lead_id, kind, services, setup_price, monthly_fee) values($1,'proposed',array['desarrollo-web','crm-personalizado'],2400,90)", [lead]);
  // Without a verified contract the sale is refused whole.
  const lines = [{ service_code: 'desarrollo-web', unit_price: '1500.00' }, { service_code: 'crm-personalizado', unit_price: '900.10' }];
  await assert.rejects(sellTo(db, one, lead, company, uuid(10), lines), /won_requires_verified_contract/);
  assert.equal(await n('select count(*) n from crm_sales'), 0);
  await verifiedContract(db, lead, 'Acuerdo Website + CRM (sintético)');

  // Double submission → one sale.
  const sale = await sellTo(db, one, lead, company, uuid(11), lines);
  const again = await sellTo(db, one, lead, company, uuid(11), lines);
  assert.equal(again.sale_id, sale.sale_id);
  assert.equal(again.replayed, true);
  const s = await one('select total::text, subtotal::text, client_id, currency from crm_sales where id=$1', [sale.sale_id]);
  assert.equal(s.total, '2400.10', 'exact decimals');
  assert.equal(await n('select count(*) n from crm_work_orders where sale_id=$1', [sale.sale_id]), 2);
  assert.equal(await n('select count(*) n from os_projects where client_id=$1', [s.client_id]), 2);

  // A second sale for the same company must reuse the client (no duplicate client).
  const lead2 = await newLead(db, one, company + ' (segunda línea)', 'otra@barberia.example.invalid');
  await verifiedContract(db, lead2);
  await assert.rejects(sellTo(db, one, lead2, company, uuid(12), [{ service_code: 'marketing-mensual', unit_price: '300' }]), /duplicate|client_exists|23505|existe/i);
  assert.equal(await n('select count(*) n from crm_clients'), 1);

  // Documented invoice (issued outside Avalon), capped by the contracted total; currency must match.
  await assert.rejects(db.query('select crm_invoice_record($1::jsonb)', [JSON.stringify({ sale_id: sale.sale_id, number: 'F-0001', amount: '2400.11' })]), /invoice_exceeds_sale_total/);
  await assert.rejects(db.query('select crm_invoice_record($1::jsonb)', [JSON.stringify({ sale_id: sale.sale_id, number: 'F-0001', amount: '100', currency: 'EUR' })]), /invoice_currency_mismatch/);
  const inv = (await one('select crm_invoice_record($1::jsonb) r', [JSON.stringify({ sale_id: sale.sale_id, number: 'F-0001', amount: '1200.05' })])).r;
  const invReplay = (await one('select crm_invoice_record($1::jsonb) r', [JSON.stringify({ sale_id: sale.sale_id, number: 'F-0001', amount: '1200.05' })])).r;
  assert.equal(invReplay.invoice_id, inv.invoice_id);
  assert.equal(invReplay.replayed, true);

  // Payment linked to the invoice; the same bank reference cannot be entered twice.
  const pay = await one("insert into crm_payments(sale_id, amount, currency, received_on, method, reference, invoice_id) values($1, 1200.05, $2, current_date, 'transfer', 'BANK-REF-0001', $3) returning id, status", [sale.sale_id, s.currency, inv.invoice_id]);
  assert.equal(pay.status, 'recorded');
  await assert.rejects(db.query("insert into crm_payments(sale_id, amount, currency, received_on, method, reference) values($1, 10, $2, current_date, 'transfer', 'bank-ref-0001')", [sale.sale_id, s.currency]), /crm_payments_sale_reference_unique/);
  // An invoice with live payments cannot be voided.
  await assert.rejects(db.query("select crm_invoice_void($1, 'error de captura')", [inv.invoice_id]), /invoice_has_payments/);

  // Commission for the referral: agreed with a written basis; cannot accrue before money is verified.
  const com = (await one('select crm_commission_agree($1::jsonb) r', [JSON.stringify({
    sale_id: sale.sale_id, kind: 'referral', beneficiary_name: 'Referente Sintético', rate_pct: '10',
    basis: 'Acuerdo de referido por escrito REF-SINT-001 (sintético)' })])).r;
  assert.equal(com.amount, '240.01', '10% of the net sale value, rounded to cents');
  await assert.rejects(db.query("select crm_commission_transition($1,'accrued')", [com.commission_id]), /commission_requires_verified_payment/);
  await as(SAMUEL);
  await assert.rejects(db.query("select crm_payment_verify($1,'')", [pay.id]), /payment_evidence_required/);
  await db.query("select crm_payment_verify($1,'Extracto bancario sintético 2026-11')", [pay.id]);
  await db.query("select crm_commission_transition($1,'accrued')", [com.commission_id]);
  await assert.rejects(db.query("select crm_commission_transition($1,'paid','')", [com.commission_id]), /commission_payout_reference_required/);
  await db.query("select crm_commission_transition($1,'paid','PAYOUT-SINT-01')", [com.commission_id]);
  await assert.rejects(db.query("select crm_commission_transition($1,'cancelled','ya no aplica')", [com.commission_id]), /commission_invalid_transition/);

  // A second payment entered by mistake and reversed never counts as collected.
  const wrong = await one("insert into crm_payments(sale_id, amount, currency, received_on, method, reference) values($1, 500, $2, current_date, 'cash', 'RECIBO-02') returning id", [sale.sale_id, s.currency]);
  await db.query("select crm_payment_reverse($1, 'duplicado por error de captura')", [wrong.id]);
  // Real expense.
  await db.query("insert into crm_client_costs(client_id, amount, currency, category, memo, incurred_on) values($1, 150.50, $2, 'Dominio', 'Dominio y correo (sintético)', current_date)", [s.client_id, s.currency]);

  const ledger = (await one('select crm_client_finance_ledger($1) r', [s.client_id])).r.currencies[0];
  assert.deepEqual({ ...ledger }, {
    currency: s.currency, contracted: '2400.10', recurring_monthly: '0.00', invoiced: '1200.05', collected: '1200.05',
    collected_verified: '1200.05', expenses: '150.50', commissions_agreed: '240.01', commissions_accrued: '240.01',
    commissions_paid: '240.01', profit: '809.54', outstanding: '1200.05',
  });
  const summary = (await one('select crm_client_finance_summary($1) r', [s.client_id])).r.currencies[0];
  assert.equal(summary.collected, '1200.05', 'Client 360° summary ignores the reversed payment too');
  const metrics = await one('select collected::text from crm_sales_metrics()');
  assert.equal(metrics.collected, '1200.05');

  // History survives a "reload" (fresh session) and is attributable.
  await as(MIGUEL);
  const events = (await db.query("select event_type from crm_timeline where sale_id=$1 order by created_at, event_type", [sale.sale_id])).rows.map(r => r.event_type);
  for (const e of ['sale.confirmed', 'invoice.recorded', 'payment.recorded', 'payment.verified', 'payment.reversed', 'commission.agreed', 'commission.accrued', 'commission.paid'])
    assert.ok(events.includes(e), e + ' recorded');

  // B2B isolation: the barbershop is ONE Avalon lead/client; its own customers are never Avalon crm_leads.
  assert.equal(await n("select count(*) n from crm_leads where company like 'Barbería Piloto%'"), 2);
  assert.equal(await n('select count(*) n from crm_clients'), 1);

  // Third party: a non-owner member sees nothing and cannot call the money RPCs.
  await as(STRANGER);
  for (const table of ['crm_invoices', 'crm_commissions', 'crm_payments', 'crm_sales', 'crm_clients'])
    assert.equal(await n(`select count(*) n from ${table}`), 0, table);
  await assert.rejects(db.query('select crm_client_finance_ledger($1)', [s.client_id]), /crm_forbidden/);
  await assert.rejects(db.query("select crm_payment_verify($1,'x evidence')", [pay.id]), /crm_forbidden/);
  await assert.rejects(db.query('select crm_invoice_record($1::jsonb)', [JSON.stringify({ sale_id: sale.sale_id, number: 'F-X', amount: '1' })]), /crm_forbidden/);
  await assert.rejects(db.query('select crm_commission_agree($1::jsonb)', [JSON.stringify({ sale_id: sale.sale_id, kind: 'sale', beneficiary_id: STRANGER, fixed_amount: '1', basis: 'intento no autorizado' })]), /crm_forbidden/);
});

test('cross-client protection: documents and projects cannot be attached to another client', { timeout: 180000 }, async t => {
  const { db, as, one } = await setup();
  t.after(() => db.close());
  await approveFixtureOffers(db,MIGUEL,[['desarrollo-web',1000]]);
  await as(MIGUEL);
  const a = await newLead(db, one, 'Cliente A Sintético', 'a@example.invalid');
  const b = await newLead(db, one, 'Cliente B Sintético', 'b@example.invalid');
  await verifiedContract(db, a); await verifiedContract(db, b);
  const sa = await sellTo(db, one, a, 'Cliente A Sintético', uuid(20), [{ service_code: 'desarrollo-web', unit_price: '1000' }]);
  const sb = await sellTo(db, one, b, 'Cliente B Sintético', uuid(21), [{ service_code: 'desarrollo-web', unit_price: '1000' }]);
  const content = Buffer.from('%PDF-1.4 sintético');
  const sha = crypto.createHash('sha256').update(content).digest('hex');
  const docB = await one("insert into crm_attachments(client_id, filename, mime, size_bytes, sha256, content) values($1,'factura-b.pdf','application/pdf',$2,$3,$4) returning id", [sb.client_id, content.length, sha, content]);
  await assert.rejects(db.query('select crm_invoice_record($1::jsonb)', [JSON.stringify({ sale_id: sa.sale_id, number: 'A-001', amount: '100', attachment_id: docB.id })]), /invoice_document_other_client/);
  const ok = (await one('select crm_invoice_record($1::jsonb) r', [JSON.stringify({ sale_id: sb.sale_id, number: 'B-001', amount: '100', attachment_id: docB.id })])).r;
  assert.ok(ok.invoice_id);
  const projA = await one('select id from os_projects where client_id=$1 limit 1', [sa.client_id]);
  await assert.rejects(db.query('update os_projects set client_id=$2 where id=$1', [projA.id, sb.client_id]), /project_client_locked/);
  // Invoices and payments are append-only for API roles.
  await assert.rejects(db.query("update crm_invoices set amount=1 where number='B-001'"), /permission denied/);
  await assert.rejects(db.query("delete from crm_payments"), /permission denied/);
});
