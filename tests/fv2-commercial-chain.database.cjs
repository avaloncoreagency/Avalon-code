// Final Validation 2.0 — "Nova Test Business" commercial chain on real PostgreSQL (PGlite), synthetic data only.
// Website inquiry (+ spam) → human review → lead → pipeline → quote → contract gate → authorized sale → client 360 →
// draft product → project → invoice/finance, with two owners (Miguel, Samuel) and an unauthorized member.
// Gaps it adds over backbone-e2e / core-engine: public intake + message review + quote + contract gate in ONE chain.
// Author: Claude Code (implementation owner) — NOT an independent QA result; Codex should re-run/extend it.
const approveFixtureOffers = require('./helpers/approve-fixture-offers.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const verifiedContract = require('./helpers/verified-contract.cjs');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','m@example.invalid'),('${SAMUEL}','s@example.invalid'),('${STRANGER}','x@example.invalid');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${STRANGER}','operator');`);
  }
  await approveFixtureOffers(db, MIGUEL, [['desarrollo-web', 2000]]);
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const anon = () => db.exec('reset role; set role anon;');
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const n = async (q, p) => Number((await one(q, p)).n);
  return { db, as, anon, one, n };
}
const inquiry = over => ({ company: 'Nova Test Business', name: 'Nora Prueba', email: 'nora@nova-test.example.invalid', phone: '+1 305 555 0199',
  message: 'Necesitamos una web con reservas y un CRM sencillo.', services: ['website', 'crm'], language: 'es', ...over });
const quoteContent = () => ({
  schemaVersion: 1, lang: 'es', currency: 'USD', title: 'Web + CRM para Nova Test Business', issueDate: '2026-11-20', validUntil: '2099-12-31',
  client: { company: 'Nova Test Business', contact: 'Nora Prueba', email: '', phone: '', address: '' }, issuer: { name: 'Avalon', email: '', phone: '' },
  seller: '', objectives: '', problem: '', solution: 'Web con reservas y CRM', scope: '', deliverables: '', exclusions: '', dependencies: '',
  timeline: '', support: '', terms: '', notes: '', thirdPartyCosts: '', model: 'fixed',
  lines: [{ code: 'desarrollo-web', name: 'Website', description: '', kind: 'one_time', qty: 1, unitPrice: '2000' }], commission: null,
});
const sha = c => crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');

test('Nova Test Business: inquiry → review → lead → quote → contract gate → sale → client 360 → product → finance; two owners; outsider denied', { timeout: 300000 }, async t => {
  const { db, as, anon, one, n } = await setup();
  t.after(() => db.close());

  // 1. Public website: one legitimate business (two different messages), one vendor pitch from another sender.
  await anon();
  for (const req of [inquiry(), inquiry({ message: 'Además queremos una tienda en línea más adelante.', services: ['ecommerce'] }),
    inquiry({ company: 'SEO Vendor Sintético', name: 'Bot', email: 'pitch@seo-vendor.example.invalid', message: 'We offer customized SEO services. May I send a price list?', services: ['marketing'] })])
    assert.equal((await one('select crm_public_inquiry($1::jsonb) r', [JSON.stringify(req)])).r, 'ok');
  assert.equal((await one('select crm_public_inquiry($1::jsonb) r', [JSON.stringify(inquiry())])).r, 'ok', 'identical replay accepted idempotently');
  await assert.rejects(db.query('select * from crm_prospects'), /permission denied/, 'anon cannot read what it submitted');

  // 2. Owners review: every message is kept; spam is labelled, never converted; nothing is deleted.
  await as(MIGUEL);
  const nova = await one("select id, status from crm_prospects where company='Nova Test Business'");
  const vendor = await one("select id from crm_prospects where company='SEO Vendor Sintético'");
  assert.equal(await n('select count(*) n from crm_prospects'), 2, 'one prospect per sender, no duplicates');
  assert.equal(await n('select count(*) n from crm_public_inquiries where prospect_id=$1', [nova.id]), 2, 'both distinct messages kept; replay not duplicated');
  const pitch = await one('select id from crm_public_inquiries where prospect_id=$1', [vendor.id]);
  await db.query("update crm_public_inquiries set review_status='possible_spam', review_note='Proveedor, no cliente' where id=$1", [pitch.id]);
  assert.equal((await one('select status from crm_prospects where id=$1', [vendor.id])).status, 'pending', 'review of a message never converts the prospect');
  await assert.rejects(db.query('select crm_convert_prospect($1)', [vendor.id]), /aprueba/i, 'unreviewed spam cannot become a lead');

  // 3. Samuel approves the real business; Miguel converts it (replay-safe). Both owners see the same single lead.
  await as(SAMUEL);
  await db.query('select crm_prospect_approve($1,$2)', [nova.id, 'Solicitud real verificada por teléfono (sintético)']);
  await as(MIGUEL);
  const lead = (await one('select crm_convert_prospect($1) id', [nova.id])).id;
  assert.equal((await one('select crm_convert_prospect($1) id', [nova.id])).id, lead, 'conversion is idempotent');
  await as(SAMUEL);
  assert.equal(await n('select count(*) n from crm_leads'), 1, 'Samuel sees the same single lead');
  for (const stage of ['contacted', 'proposal']) await db.query('update crm_leads set stage_id=$2 where id=$1', [lead, stage]);

  // 4. Quote: status machine with owner notes; nothing is accepted automatically.
  await as(MIGUEL);
  const content = quoteContent();
  const q = (await one("select crm_quote_create($1,$2,$3::jsonb,'{}'::jsonb,$4) r", [lead, crypto.randomUUID(), JSON.stringify(content), sha(content)])).r;
  const quoteId = q.quote_id ?? q.id;
  const step = async (to, note = '') => { const r = await one('select version from crm_quotes where id=$1', [quoteId]); return db.query('select crm_quote_transition($1,$2,$3,$4)', [quoteId, r.version, to, note]); };
  await assert.rejects(step('accepted', 'atajo'), /quote_invalid_transition/, 'cannot jump to accepted');
  await step('internal_review'); await step('approved'); await step('sent', 'Enviada por correo (sintético)'); await step('accepted', 'Cliente aceptó por correo (sintético)');

  // 5. Sale is refused until a signed contract is VERIFIED — no client, sale or revenue appears in between.
  const saleReq = { idempotency_key: '99999999-9999-4999-8999-999999999999', lead_id: lead, new_client: { legal_name: 'Nova Test Business' },
    billing_mode: 'one_time', upfront_amount: '0', lines: [{ service_code: 'desarrollo-web', unit_price: '2000' }] };
  await assert.rejects(db.query('select crm_confirm_sale($1::jsonb)', [JSON.stringify(saleReq)]), /won_requires_verified_contract|contract/);
  assert.deepEqual([await n('select count(*) n from crm_clients'), await n('select count(*) n from crm_sales')], [0, 0], 'refusal created nothing');
  assert.equal((await one('select stage_id from crm_leads where id=$1', [lead])).stage_id, 'proposal');
  await verifiedContract(db, lead, 'Acuerdo Nova Test Business (sintético)');
  const sale = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify(saleReq)])).r;
  assert.equal((await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify(saleReq)])).r.replayed, true, 'idempotent replay');
  assert.deepEqual([await n('select count(*) n from crm_clients'), await n('select count(*) n from crm_sales')], [1, 1], 'one client, one sale');
  assert.equal((await one('select stage_id from crm_leads where id=$1', [lead])).stage_id, 'won', 'a real sale moves the opportunity to Won');
  assert.equal((await one('select origin_lead_id from crm_clients where id=$1', [sale.client_id])).origin_lead_id, lead, 'client keeps its origin lead');

  // 6. Client 360: a draft product without a website is allowed and linked; no URL is invented.
  await db.query("insert into os_projects(module,name,status,client_id,settings,created_by) values('website','Web Nova (borrador)','draft',$1,'{}'::jsonb,$2)", [sale.client_id, MIGUEL]);
  assert.ok(await n('select count(*) n from os_projects where client_id=$1', [sale.client_id]) >= 2, 'sale project + draft product on the same client');

  // 7. Finance is a separate explicit permission (crm_private.finance_access), not implied by being an owner.
  await as(SAMUEL);
  await assert.rejects(db.query('select crm_client_finance_summary($1)', [sale.client_id]), /finance_forbidden/, 'owner without finance access is refused');
  await db.exec('reset role;');
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [MIGUEL]); // synthetic grant, setup only
  await as(MIGUEL);
  // Invoice capped and idempotent; collected only after a recorded payment; no invented figures.
  const before = (await one('select crm_client_finance_summary($1) s', [sale.client_id])).s;
  assert.equal(Number(before.collected ?? 0), 0, 'nothing collected before a payment is recorded');
  const inv = (await one('select crm_invoice_record($1::jsonb) r', [JSON.stringify({ sale_id: sale.sale_id, number: 'NTB-0001', amount: '2000' })])).r;
  assert.equal((await one('select crm_invoice_record($1::jsonb) r', [JSON.stringify({ sale_id: sale.sale_id, number: 'NTB-0001', amount: '2000' })])).r.invoice_id, inv.invoice_id, 'invoice not duplicated');
  await assert.rejects(db.query('select crm_invoice_record($1::jsonb)', [JSON.stringify({ sale_id: sale.sale_id, number: 'NTB-0002', amount: '1' })]), /invoice_exceeds_sale_total/);
  assert.equal(await n('select count(*) n from crm_invoices where sale_id=$1', [sale.sale_id]), 1);

  // 8. Outsider (non-owner member) sees nothing and can act on nothing; anon cannot read.
  await as(STRANGER);
  for (const tbl of ['crm_prospects', 'crm_public_inquiries', 'crm_leads', 'crm_quotes', 'crm_contracts', 'crm_clients', 'crm_sales', 'crm_invoices', 'os_projects'])
    assert.equal(await n(`select count(*) n from ${tbl}`), 0, tbl + ' hidden from a non-owner');
  await assert.rejects(db.query('select crm_confirm_sale($1::jsonb)', [JSON.stringify({ ...saleReq, idempotency_key: '12121212-1212-4212-8212-121212121212' })]));
  await assert.rejects(db.query("update crm_public_inquiries set review_status='legitimate' where id=$1", [pitch.id]).then(r => { if (r.affectedRows === 0) throw Error('no rows'); }));
  await anon();
  await assert.rejects(db.query('select * from crm_clients'), /permission denied/);
});
