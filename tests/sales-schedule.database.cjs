// Sales Pro: typed payment schedule, allocation, receivables, refunds and chargebacks on real PostgreSQL (PGlite).
// Synthetic identities and data only; no network, no processor, nothing is charged.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const verifiedContract = require('./helpers/verified-contract.cjs');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2'; // owner WITHOUT finance access
const STRANGER = '00000000-0000-4000-8000-0000000000c3';
const key = i => `92000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)',
    [MIGUEL, 'm@example.invalid', SAMUEL, 's@example.invalid', STRANGER, 'x@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships values($1,'owner'),($2,'owner'),($3,'operator')", [MIGUEL, SAMUEL, STRANGER]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [MIGUEL]);
  const as = u => db.exec(`reset role; set request.jwt.claim.sub='${u}'; set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  await as(MIGUEL);
  // The authority candidate requires an explicit owner-approved catalog offer.
  // Exercise that existing approval path; never bypass the SQL guard.
  await db.query("update crm_service_catalog set suggested_price=1000 where code='desarrollo-web'");
  await db.query("update crm_service_catalog set offer_status='approved' where code='desarrollo-web'");
  return { db, as, one };
}

/** A confirmed 1,000.00 USD sale sold `daysAgo` days ago. */
async function sale(db, one, name, daysAgo = 0, n = 1) {
  const lead = (await one("insert into crm_leads(company,contact,email,source,owner_id) values($1,'QA',$2,'Manual',$3) returning id", [name, `${n}@example.invalid`, MIGUEL])).id;
  await verifiedContract(db, lead, 'Synthetic schedule agreement');
  const soldOn = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  return (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: key(n), lead_id: lead, new_client: { legal_name: name },
    seller_id: MIGUEL, sold_on: soldOn, lines: [{ service_code: 'desarrollo-web', unit_price: '1000.00' }] })])).r;
}
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const setSchedule = (db, saleId, items, version, reason = null) =>
  db.query('select crm_sale_schedule_set($1,$2::jsonb,$3,$4) v', [saleId, JSON.stringify(items), version, reason]);
const pay = (db, saleId, amount, ref, installment = null, method = 'zelle') =>
  db.query("insert into crm_payments(sale_id, amount, currency, received_on, method, reference, installment_id) values($1,$2,'USD',current_date,$3,$4,$5) returning id",
    [saleId, amount, method, ref, installment]).then(r => r.rows[0].id);

test('schedule: exact total, validation, optimistic concurrency, finance-only, and history is never deleted', { timeout: 240000 }, async t => {
  const { db, as, one } = await setup(); t.after(() => db.close());
  const s = await sale(db, one, 'Schedule QA LLC');
  const plan = [{ kind: 'deposit', due_on: day(0), amount: '300.00' }, { kind: 'installment', due_on: day(30), amount: '350.00' }, { kind: 'installment', due_on: day(60), amount: '350.00' }];
  await assert.rejects(setSchedule(db, s.sale_id, [...plan.slice(0, 2)], 0), /schedule_total_mismatch/, 'must sum exactly to the sale total');
  await assert.rejects(setSchedule(db, s.sale_id, [{ ...plan[0], amount: 'NaN' }, ...plan.slice(1)], 0), /sale_invalid_amount|schedule_invalid_amount/);
  await assert.rejects(setSchedule(db, s.sale_id, [{ ...plan[0], amount: '300.001' }, ...plan.slice(1)], 0), /sale_invalid_amount/);
  await assert.rejects(setSchedule(db, s.sale_id, [{ ...plan[0], due_on: day(-400) }, ...plan.slice(1)], 0), /schedule_invalid_date/, 'not before the sale date');
  await assert.rejects(setSchedule(db, s.sale_id, [{ ...plan[0], kind: 'loan' }, ...plan.slice(1)], 0), /schedule_invalid/);
  assert.equal((await one('select v from crm_sale_schedule_set($1,$2::jsonb,0,null) v', [s.sale_id, JSON.stringify(plan)])).v, 1);
  await assert.rejects(setSchedule(db, s.sale_id, plan, 0, 'reprogramación'), /schedule_version_conflict/, 'stale editors are refused');
  await assert.rejects(setSchedule(db, s.sale_id, plan, 1), /schedule_reason_required/, 'replacing needs a reason');
  // Owner without finance access, and a non-owner, cannot touch money schedules.
  await as(SAMUEL);
  await assert.rejects(setSchedule(db, s.sale_id, plan, 1, 'intento sin permiso'), /finance_forbidden/);
  assert.equal(Number((await one('select count(*) n from crm_sale_installments')).n), 0, 'RLS: no finance access, no rows');
  await as(STRANGER);
  await assert.rejects(setSchedule(db, s.sale_id, plan, 1, 'intento sin permiso'), /finance_forbidden/);
  await assert.rejects(db.query("insert into crm_sale_installments(sale_id,seq,kind,due_on,amount,currency) values($1,99,'deposit',current_date,1,'USD')", [s.sale_id]), /permission denied/);
  await as(MIGUEL);
  // Replace: two equal halves. Old rows are cancelled with the reason, not deleted.
  await setSchedule(db, s.sale_id, [{ kind: 'installment', due_on: day(10), amount: '500.00' }, { kind: 'balance', due_on: day(40), amount: '500.00' }], 1, 'Cliente pidió dos pagos');
  const rows = (await db.query('select seq, status, cancel_reason from crm_sale_installments where sale_id=$1 order by seq', [s.sale_id])).rows;
  assert.deepEqual(rows.map(r => r.status), ['cancelled', 'cancelled', 'cancelled', 'scheduled', 'scheduled']);
  assert.equal(rows[0].cancel_reason, 'Cliente pidió dos pagos');
  assert.equal((await one('select schedule_version v from crm_sales where id=$1', [s.sale_id])).v, 2);
  assert.ok(await one("select 1 from crm_timeline where event_type='sale.schedule_set' and sale_id=$1 limit 1", [s.sale_id]), 'audited');
});

test('allocation: receipts never exceed an installment; paid installments survive rescheduling; new manual channels', { timeout: 240000 }, async t => {
  const { db, one } = await setup(); t.after(() => db.close());
  const s = await sale(db, one, 'Allocation QA LLC');
  const other = await sale(db, one, 'Other QA LLC', 0, 2);
  await setSchedule(db, s.sale_id, [{ kind: 'deposit', due_on: day(0), amount: '400.00' }, { kind: 'balance', due_on: day(30), amount: '600.00' }], 0);
  const [dep, bal] = (await db.query("select id from crm_sale_installments where sale_id=$1 and status='scheduled' order by seq", [s.sale_id])).rows.map(r => r.id);
  await assert.rejects(pay(db, s.sale_id, '400.01', 'ZL-1', dep), /payment_exceeds_installment/);
  await assert.rejects(pay(db, other.sale_id, '10.00', 'ZL-2', dep), /payment_invalid_installment/, 'installment of another sale');
  await assert.rejects(pay(db, s.sale_id, '10.00', 'ZL-3', null, 'stripe'), /crm_payments_method_check/, 'no processor channel without an authorised integration');
  await pay(db, s.sale_id, '250.00', 'ZL-4', dep);
  await pay(db, s.sale_id, '150.00', 'ACH-5', dep, 'ach');
  await assert.rejects(pay(db, s.sale_id, '0.01', 'ZL-6', dep), /payment_exceeds_installment/, 'fully allocated');
  // Rescheduling keeps the funded deposit exactly; only the unfunded balance can be split.
  await assert.rejects(setSchedule(db, s.sale_id, [{ kind: 'installment', due_on: day(30), amount: '300.00' }, { kind: 'installment', due_on: day(60), amount: '200.00' }], 1, 'Dividir saldo'), /schedule_total_mismatch/);
  await setSchedule(db, s.sale_id, [{ kind: 'installment', due_on: day(30), amount: '300.00' }, { kind: 'installment', due_on: day(60), amount: '300.00' }], 1, 'Dividir saldo');
  const live = (await db.query("select id, amount::text a from crm_sale_installments where sale_id=$1 and status='scheduled' order by seq", [s.sale_id])).rows;
  assert.deepEqual(live.map(r => r.a), ['400.00', '300.00', '300.00']);
  assert.equal(live[0].id, dep, 'the funded installment is the same row');
  assert.equal((await one('select status from crm_sale_installments where id=$1', [bal])).status, 'cancelled');
  await assert.rejects(pay(db, s.sale_id, '10.00', 'ZL-7', bal), /payment_invalid_installment/, 'cancelled installment');
});

test('receivables: overdue, next due and balance from allocations and unallocated receipts', { timeout: 240000 }, async t => {
  const { db, one } = await setup(); t.after(() => db.close());
  const s = await sale(db, one, 'Receivables QA LLC', 90);
  await setSchedule(db, s.sale_id, [
    { kind: 'deposit', due_on: day(-90), amount: '200.00' }, { kind: 'installment', due_on: day(-60), amount: '200.00' },
    { kind: 'installment', due_on: day(-30), amount: '200.00' }, { kind: 'installment', due_on: day(5), amount: '200.00' },
    { kind: 'balance', due_on: day(35), amount: '200.00' }], 0);
  const dep = (await one("select id from crm_sale_installments where sale_id=$1 and kind='deposit'", [s.sale_id])).id;
  await pay(db, s.sale_id, '200.00', 'DEP-1', dep);
  await pay(db, s.sale_id, '250.00', 'LUMP-1'); // unallocated: covers the -60 one fully and 50 of the -30 one
  const r = await one('select total::text, recorded::text, net_collected::text, balance::text, overdue::text, next_due::text, installments from crm_sale_receivables where sale_id=$1', [s.sale_id]);
  assert.deepEqual(r, { total: '1000.00', recorded: '450.00', net_collected: '450.00', balance: '550.00', overdue: '150.00', next_due: day(5), installments: 5 });
});

test('collections read model counts and filters beyond 500 sales using only authorized receivables', { timeout: 240000 }, async t => {
  const { db, as, one } = await setup();
  t.after(() => db.close());
  await db.exec('reset role');
  const { id: client } = await one("insert into crm_clients(legal_name,source,owner_id) values('Collections capacity QA','Manual',$1) returning id", [MIGUEL]);
  await db.query(`insert into crm_sales(sale_number,idempotency_key,correlation_id,client_id,sold_on,currency,subtotal,total,billing_mode,seller_id)
    select 'COLLECT-' || lpad(n::text,4,'0'),gen_random_uuid(),gen_random_uuid(),$1,current_date-30,
      case when n = 502 then 'EUR' else 'USD' end,10.25,10.25,'one_time',$2
    from generate_series(1,503) n`, [client, MIGUEL]);
  await db.query(`insert into crm_sale_installments(sale_id,seq,kind,due_on,amount,currency)
    select id,1,'balance',case when sale_number='COLLECT-0503' then current_date+1 else current_date-1 end,total,currency
    from crm_sales where client_id=$1`, [client]);

  await as(MIGUEL);
  const count = async kind => Number((await one('select count(*) n from crm_sales_with_receivables($1)', [kind])).n);
  assert.equal(await count('overdue'), 502);
  assert.equal(await count('open'), 503);
  assert.equal(await count('unknown'), 0);
  const last = (await db.query("select sale_number from crm_sales_with_receivables('overdue') where client_id=$1 and contract_status='pending_signature' order by sale_number offset 500 limit 2", [client])).rows;
  assert.deepEqual(last.map(x => x.sale_number), ['COLLECT-0501', 'COLLECT-0502']);
  const metrics = (await db.query('select currency, overdue_amount::text amount, sales::int sales from crm_overdue_collection_metrics()')).rows;
  assert.deepEqual(metrics, [{ currency: 'EUR', amount: '10.25', sales: 1 }, { currency: 'USD', amount: '5135.25', sales: 501 }]);

  for (const identity of [SAMUEL, STRANGER]) {
    await as(identity);
    assert.equal(await count('open'), 0);
    assert.equal((await db.query('select * from crm_overdue_collection_metrics()')).rows.length, 0);
  }
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query("select * from crm_sales_with_receivables('open')"), /permission denied/i);
  await assert.rejects(db.query('select * from crm_overdue_collection_metrics()'), /permission denied/i);
  await db.exec('reset role');
  const pinned = (await db.query("select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('crm_sales_with_receivables', 'crm_overdue_collection_metrics') order by 1")).rows;
  assert.deepEqual(pinned.map(r => [r.proname, r.proconfig]), [['crm_overdue_collection_metrics', ['search_path=""']], ['crm_sales_with_receivables', ['search_path=""']]], 'finance read models pin an empty search_path');
});

test('refunds and chargebacks: verified money only, capped, idempotent, resolvable, and block reversal', { timeout: 240000 }, async t => {
  const { db, as, one } = await setup(); t.after(() => db.close());
  const s = await sale(db, one, 'Refund QA LLC');
  const p = await pay(db, s.sale_id, '600.00', 'TR-1', null, 'wire');
  const refund = (k, amount, kind = 'refund', extra = {}) => db.query('select crm_payment_refund($1::jsonb) r',
    [JSON.stringify({ idempotency_key: key(100 + k), payment_id: p, kind, amount, reason: 'Devolución parcial acordada', ...extra })]).then(x => x.rows[0].r);
  await assert.rejects(refund(1, '50.00'), /refund_requires_verified_payment/, 'unverified receipts are corrected by reversal, not refunds');
  await db.query("select crm_payment_verify($1,'Extracto bancario sintético')", [p]);
  await assert.rejects(refund(2, 'NaN'), /sale_invalid_amount|refund_invalid_amount/);
  await assert.rejects(refund(3, '600.01'), /refund_exceeds_payment/);
  const first = await refund(4, '100.00');
  assert.equal(first.replayed, false);
  assert.equal((await refund(4, '100.00')).replayed, true, 'same key = same refund');
  await assert.rejects(refund(4, '90.00'), /refund_idempotency_conflict/);
  const cb = await refund(5, '500.00', 'chargeback');
  await assert.rejects(refund(6, '0.01'), /refund_exceeds_payment/, 'open chargeback counts against the payment');
  let r = await one('select refunded::text, net_collected::text, balance::text, open_chargebacks from crm_sale_receivables where sale_id=$1', [s.sale_id]);
  assert.deepEqual(r, { refunded: '600.00', net_collected: '0.00', balance: '1000.00', open_chargebacks: 1 });
  await assert.rejects(db.query("select crm_chargeback_resolve($1,'won','x')", [cb.refund_id]), /chargeback_invalid/, 'needs a note');
  await db.query("select crm_chargeback_resolve($1,'won','Banco falló a favor; fondos devueltos')", [cb.refund_id]);
  await assert.rejects(db.query("select crm_chargeback_resolve($1,'lost','Segundo intento de resolución')", [cb.refund_id]), /chargeback_not_open/);
  r = await one('select refunded::text, net_collected::text, open_chargebacks from crm_sale_receivables where sale_id=$1', [s.sale_id]);
  assert.deepEqual(r, { refunded: '100.00', net_collected: '500.00', open_chargebacks: 0 });
  await assert.rejects(db.query("select crm_payment_reverse($1,'error de captura')", [p]), /payment_has_refunds/, 'money that moved cannot be erased');
  assert.ok(await one("select 1 from crm_timeline where event_type='payment.chargeback_won' and sale_id=$1", [s.sale_id]));
  await as(SAMUEL);
  await assert.rejects(refund(7, '1.00'), /finance_forbidden/);
  assert.equal(Number((await one('select count(*) n from crm_payment_refunds')).n), 0, 'RLS: refunds are finance-only');
});
