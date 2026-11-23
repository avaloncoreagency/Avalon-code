// Finance P0 (PR #322 follow-up): no money column or money RPC can store NaN or ±Infinity.
// PostgreSQL numeric accepts 'NaN' and orders it ABOVE every number, so `amount > 0` checks alone let it through.
// Synthetic PGlite only; no network, no real data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const verifiedContract = require('./helpers/verified-contract.cjs');
const { PGlite } = require('@electric-sql/pglite');

const OWNER = '00000000-0000-4000-8000-0000000000a1';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2)', [OWNER, 'owner@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships values($1,'owner')", [OWNER]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [OWNER]);
  await db.exec(`set request.jwt.claim.sub='${OWNER}'; set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  return { db, one };
}

test('every numeric column refuses NaN and ±Infinity at the table level', { timeout: 180000 }, async t => {
  const { db, one } = await setup(); t.after(() => db.close());
  await db.exec('reset role');
  const cols = (await db.query(`select c.table_name t, c.column_name c from information_schema.columns c
    join information_schema.tables x using (table_schema, table_name)
    where c.table_schema = 'public' and c.data_type = 'numeric' and x.table_type = 'BASE TABLE'`)).rows;
  assert.ok(cols.length >= 40, 'schema has the expected money/number columns');
  const missing = [];
  for (const { t: table, c } of cols) {
    const def = await one(`select string_agg(pg_get_constraintdef(oid), ' | ') d from pg_constraint
      where conrelid = format('public.%I', $1::text)::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%NaN%'
        and pg_get_constraintdef(oid) ilike '%' || $2 || '%'`, [table, c]);
    if (!def.d) missing.push(`${table}.${c}`);
  }
  assert.deepEqual(missing, [], 'numeric columns without a finite-value constraint');
});

test('sale → invoice → payment → commission: NaN and Infinity are refused at every money entry point', { timeout: 240000 }, async t => {
  const { db, one } = await setup(); t.after(() => db.close());
  const lead = (await one("insert into crm_leads(company,contact,email,source,owner_id) values('Finite QA LLC','QA','qa@example.invalid','Manual',$1) returning id", [OWNER])).id;
  await verifiedContract(db, lead, 'Synthetic finite-money agreement');
  const sale = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({
    idempotency_key: '91000000-0000-4000-8000-000000000001', lead_id: lead, new_client: { legal_name: 'Finite QA LLC' },
    seller_id: OWNER, lines: [{ service_code: 'desarrollo-web', unit_price: '1000.00' }] })])).r;
  // Sale lines already use a strict decimal pattern.
  await assert.rejects(db.query('select crm_confirm_sale($1::jsonb)', [JSON.stringify({
    idempotency_key: '91000000-0000-4000-8000-000000000002', lead_id: lead, new_client: { legal_name: 'Finite QA LLC' },
    seller_id: OWNER, lines: [{ service_code: 'desarrollo-web', unit_price: 'NaN' }] })]), /sale_invalid_amount/);

  // Invoice RPC: NaN passes `amount <= 0` but (by accident) is caught by the cap against the sale total, since NaN
  // orders above every number; Infinity fails the numeric(15,2) cast. Either way nothing may be stored.
  for (const amount of ['NaN', 'Infinity']) {
    await assert.rejects(db.query('select crm_invoice_record($1::jsonb)', [JSON.stringify({ sale_id: sale.sale_id, number: 'F-' + amount, amount })]),
      /invoice_invalid_amount|invoice_exceeds_sale_total|_finite/);
  }
  assert.equal(Number((await one('select count(*) n from crm_invoices')).n), 0);

  // Payments are inserted directly (RLS); NaN is caught by the total cap trigger, Infinity by the finite constraint.
  await assert.rejects(db.query("insert into crm_payments(sale_id, amount, currency, received_on, method, reference) values($1, 'NaN', 'USD', current_date, 'transfer', 'NAN-REF-1')", [sale.sale_id]), /payment_exceeds_total|_finite/);
  await assert.rejects(db.query("insert into crm_payments(sale_id, amount, currency, received_on, method, reference) values($1, 'Infinity', 'USD', current_date, 'transfer', 'INF-REF-1')", [sale.sale_id]), /payment_exceeds_total|finite|out of range|overflow/i);
  assert.equal(Number((await one('select count(*) n from crm_payments')).n), 0);

  // Commission agreement with a fixed amount: on main@04969aa this STORED a NaN commission (no cap applies).
  await assert.rejects(db.query('select crm_commission_agree($1::jsonb)', [JSON.stringify({ sale_id: sale.sale_id, kind: 'referral', beneficiary_name: 'Synthetic referrer', fixed_amount: 'NaN', basis: 'Synthetic written referral basis' })]),
    /crm_commissions_fixed_amount_finite|crm_commissions_amount_finite/);
  assert.equal(Number((await one('select count(*) n from crm_commissions')).n), 0);

  // Normal exact amounts still work end to end.
  const inv = (await one('select crm_invoice_record($1::jsonb) r', [JSON.stringify({ sale_id: sale.sale_id, number: 'F-0001', amount: '1000.00' })])).r;
  const pay = await one("insert into crm_payments(sale_id, amount, currency, received_on, method, reference, invoice_id) values($1, 999.99, 'USD', current_date, 'transfer', 'OK-REF-1', $2) returning amount::text a", [sale.sale_id, inv.invoice_id]);
  assert.equal(pay.a, '999.99');
});
