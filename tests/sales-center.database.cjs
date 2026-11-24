// Sales Center: accepted quote → "Cerrar venta" → sale with exact terms, variable agreements and settlements.
// Real PostgreSQL (PGlite), synthetic data only. Mirrors the master prompt's acceptance tests 1–11 at the database level.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const verifiedContract = require('./helpers/verified-contract.cjs');
const { PGlite } = require('@electric-sql/pglite');

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const NOFIN = '00000000-0000-4000-8000-0000000000b2'; // owner without finance access
const OUTSIDER = '00000000-0000-4000-8000-0000000000c3';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)', [OWNER, 'o@example.invalid', NOFIN, 'n@example.invalid', OUTSIDER, 'x@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships values($1,'owner'),($2,'owner'),($3,'operator')", [OWNER, NOFIN, OUTSIDER]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [OWNER]);
  const as = u => db.exec(`reset role; set request.jwt.claim.sub='${u}'; set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  await as(OWNER);
  return { db, as, one };
}

const content = (company, over = {}) => ({
  schemaVersion: 1, lang: 'es', currency: 'USD', title: `Propuesta ${company}`, issueDate: '2026-11-23', validUntil: '2099-12-31',
  client: { company, contact: '', email: '', phone: '', address: '' }, issuer: { name: 'Avalon', email: '', phone: '' },
  seller: '', objectives: '', problem: '', solution: 'Solución sintética', scope: 'Alcance sintético', deliverables: 'Entregables', exclusions: 'Exclusiones',
  dependencies: '', timeline: '', support: '', terms: '', notes: '', thirdPartyCosts: '', model: 'fixed',
  lines: [{ code: 'desarrollo-web', name: 'Website', description: 'Sitio con reservas', kind: 'one_time', qty: 2, unitPrice: '750.25' }],
  commission: null, ...over,
});
const revenueShare = (over = {}) => ({ status: 'proposed', kind: 'revenue_share', pct: '12.5', base: 'gross_revenue', baseNote: '', trigger: 'Ingreso cobrado por citas reservadas vía Avalon',
  attributionWindowDays: 30, evidence: 'Reporte mensual del POS conciliado', settlement: 'monthly', exclusions: 'Propinas e impuestos', refunds: 'Se descuentan devoluciones', expiry: '12 meses',
  effectiveDate: '2026-11-01', durationMonths: 12, ...over });
const sha = c => crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');

/** Lead → quote → internal review → approved → sent → accepted, plus a verified contract (won gate). */
async function acceptedQuote(db, one, company, c, { contract = true } = {}) {
  const lead = (await one("insert into crm_leads(company,contact,source,owner_id) values($1,'QA','manual',$2) returning id", [company, OWNER])).id;
  const q = (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [lead, crypto.randomUUID(), JSON.stringify(c), '{}', sha(c)])).r;
  for (const [to, note] of [['internal_review', ''], ['approved', ''], ['sent', 'Enviada por email sintético'], ['accepted', 'Aceptada por email del cliente (sintético)']]) {
    const cur = await one('select version from crm_quotes where id=$1', [q.quote_id]);
    await db.query('select crm_quote_transition($1,$2,$3,$4)', [q.quote_id, cur.version, to, note]);
  }
  if (contract) await verifiedContract(db, lead, `Contrato ${company}`);
  return { lead, quoteId: q.quote_id };
}
const close = (db, quoteId, version = 1, extra = {}) =>
  db.query('select crm_quote_close_sale($1::jsonb) r', [JSON.stringify({ quote_id: quoteId, version_no: version, ...extra })]).then(r => r.rows[0].r);
const settle = (db, saleId, over = {}) => db.query('select crm_sale_settlement_record($1::jsonb) r', [JSON.stringify({ sale_id: saleId, idempotency_key: crypto.randomUUID(),
  period_start: '2026-11-01', period_end: '2026-11-30', eligible_base: '10000.00', excluded_amount: '500.00', evidence: 'Reporte POS noviembre (sintético)', ...over })]).then(r => r.rows[0].r);
const pay = (db, saleId, amount, ref) => db.query("insert into crm_payments(sale_id,amount,currency,received_on,method,reference) values($1,$2,'USD',current_date,'zelle',$3) returning id", [saleId, amount, ref]).then(r => r.rows[0].id);

test('TEST 1 + 6 + 7 — fixed quote closes once, with exactly the accepted lines; replays and races return the same sale', { timeout: 240000 }, async t => {
  const { db, one } = await setup(); t.after(() => db.close());
  const c = content('Fixed QA LLC');
  const { quoteId } = await acceptedQuote(db, one, 'Fixed QA LLC', c);
  await assert.rejects(close(db, quoteId, 2), /quote_version_changed/, 'must close the revision the user reviewed');
  const [a, b] = await Promise.all([close(db, quoteId), close(db, quoteId)]);
  assert.equal(a.sale_id, b.sale_id, 'concurrent closes → one sale');
  const again = await close(db, quoteId);
  assert.equal(again.sale_id, a.sale_id); assert.equal(again.replayed, true);
  assert.equal(Number((await one('select count(*) n from crm_sales')).n), 1);
  const s = await one('select total::text, subtotal::text, commercial_model, quote_id, billing_mode from crm_sales where id=$1', [a.sale_id]);
  assert.deepEqual(s, { total: '1500.50', subtotal: '1500.50', commercial_model: 'fixed', quote_id: quoteId, billing_mode: 'one_time' });
  const line = await one('select quantity::text q, unit_price::text p, description from crm_sale_lines where sale_id=$1', [a.sale_id]);
  assert.deepEqual(line, { q: '2.00', p: '750.25', description: 'Sitio con reservas' });
  const terms = await one('select content, content_sha256, accepted_note, version_no from crm_sale_terms where sale_id=$1', [a.sale_id]);
  assert.deepEqual(terms.content, c, 'immutable copy of exactly what was accepted');
  assert.equal(terms.content_sha256, sha(c));
  assert.match(terms.accepted_note, /Aceptada por email/);
  await db.exec('reset role');
  await assert.rejects(db.query("update crm_sale_terms set accepted_note='x' where sale_id=$1", [a.sale_id]), /sale_terms_immutable/, 'even privileged roles cannot rewrite accepted terms');
  await assert.rejects(db.query('delete from crm_sale_terms where sale_id=$1', [a.sale_id]), /sale_terms_immutable/);
  assert.ok(await one("select 1 from crm_timeline where event_type='sale.closed_from_quote' and sale_id=$1", [a.sale_id]), 'audited');
  assert.ok(Number((await one('select count(*) n from crm_work_orders where sale_id=$1', [a.sale_id])).n) >= 1, 'operations created by the existing engine');
});

test('TEST 2 + 11 — Chino Barber (synthetic): revenue share closes as a variable sale; settlement → verify → payment', { timeout: 240000 }, async t => {
  const { db, as, one } = await setup(); t.after(() => db.close());
  const c = content('Barbería Sintética del Chino', { model: 'commission',
    lines: [{ code: 'marketing-mensual', name: 'Marketing y reservas', description: 'Incluido en la participación', kind: 'monthly', qty: 1, unitPrice: '0' }],
    commission: revenueShare() });
  const { quoteId } = await acceptedQuote(db, one, 'Barbería Sintética del Chino', c);
  const sale = await close(db, quoteId);
  const s = await one('select total::text, commercial_model, client_id from crm_sales where id=$1', [sale.sale_id]);
  assert.deepEqual([s.total, s.commercial_model], ['0.00', 'commission']);
  assert.equal(sale.variable, true);
  const vt = await one('select kind, pct::text, base, settlement, exclusions, effective_on::text, duration_months, client_id from crm_sale_variable_terms where sale_id=$1', [sale.sale_id]);
  assert.deepEqual({ ...vt, client_id: undefined }, { kind: 'revenue_share', pct: '12.50', base: 'gross_revenue', settlement: 'monthly', exclusions: 'Propinas e impuestos', effective_on: '2026-11-01', duration_months: 12, client_id: undefined });
  assert.equal(vt.client_id, s.client_id, 'linked to the client (Clients 360)');
  // Nothing is collectible until a period is settled AND verified.
  await assert.rejects(pay(db, sale.sale_id, '1.00', 'EARLY'), /payment_exceeds_total/);
  for (const bad of [{ eligible_base: 'NaN' }, { eligible_base: '100', excluded_amount: '100' }, { period_start: '2026-10-01' }, { evidence: 'x' }])
    await assert.rejects(settle(db, sale.sale_id, bad), /settlement_invalid_amount|sale_invalid_amount|settlement_invalid_period|settlement_evidence_required/, JSON.stringify(bad));
  const st = await settle(db, sale.sale_id);
  assert.equal(String(st.amount_due), '1187.5', '(10000 − 500) × 12.5% computed by the database');
  await assert.rejects(settle(db, sale.sale_id, { period_start: '2026-11-15', period_end: '2026-12-15' }), /settlement_period_overlap/, 'no double billing of a period');
  await assert.rejects(pay(db, sale.sale_id, '1187.50', 'PRE-VERIFY'), /payment_exceeds_total/, 'recorded ≠ collectible');
  await assert.rejects(db.query("select crm_sale_settlement_transition($1,'verified','')", [st.settlement_id]), /settlement_evidence_required/);
  await db.query("select crm_sale_settlement_transition($1,'verified','POS conciliado por Miguel')", [st.settlement_id]);
  await pay(db, sale.sale_id, '1187.50', 'ZELLE-NOV');
  await assert.rejects(pay(db, sale.sale_id, '0.01', 'OVER'), /payment_exceeds_total/);
  await assert.rejects(db.query("select crm_sale_settlement_transition($1,'void','Error de base')", [st.settlement_id]), /settlement_has_payments/, 'money received cannot be orphaned');
  const r = await one('select total::text, variable_due::text, net_collected::text, balance::text, commercial_model from crm_sale_receivables where sale_id=$1', [sale.sale_id]);
  assert.deepEqual(r, { total: '0.00', variable_due: '1187.50', net_collected: '1187.50', balance: '0.00', commercial_model: 'commission' });
  // TEST 8 — security around money.
  await as(NOFIN);
  await assert.rejects(settle(db, sale.sale_id, { period_start: '2026-12-01', period_end: '2026-12-31' }), /finance_forbidden/);
  assert.equal(Number((await one('select count(*) n from crm_sale_settlements')).n), 0, 'settlements are finance-only (RLS)');
  await as(OUTSIDER);
  await assert.rejects(close(db, quoteId), /crm_forbidden/);
  await assert.rejects(db.query("insert into crm_sale_settlements(idempotency_key,variable_terms_id,sale_id,period_start,period_end,eligible_base,pct,evidence) select gen_random_uuid(), id, sale_id, current_date, current_date, 1, 1, 'xxxxx' from crm_sale_variable_terms"), /permission denied/);
});

test('TEST 3 + 4 + 5 — outcome commission, hybrid setup + percentage, and multiple services keep their components separate', { timeout: 240000 }, async t => {
  const { db, one } = await setup(); t.after(() => db.close());
  const outcome = await acceptedQuote(db, one, 'Outcome QA LLC', content('Outcome QA LLC', { model: 'commission',
    lines: [{ code: 'generacion-leads', name: 'Generación de leads', description: '', kind: 'monthly', qty: 1, unitPrice: '0' }],
    commission: revenueShare({ kind: 'outcome_commission', pct: '8', trigger: 'Contrato firmado por un lead entregado por Avalon', base: 'other', baseNote: 'Valor del primer contrato del lead' }) }));
  const so = await close(db, outcome.quoteId);
  assert.deepEqual(await one('select kind, base, base_note from crm_sale_variable_terms where sale_id=$1', [so.sale_id]), { kind: 'outcome_commission', base: 'other', base_note: 'Valor del primer contrato del lead' });

  const hybrid = await acceptedQuote(db, one, 'Hybrid QA LLC', content('Hybrid QA LLC', { model: 'hybrid',
    lines: [{ code: 'desarrollo-web', name: 'Setup', description: 'Setup inicial', kind: 'one_time', qty: 1, unitPrice: '1200' }], commission: revenueShare({ pct: '10' }) }));
  const sh = await close(db, hybrid.quoteId);
  assert.deepEqual(await one('select total::text, commercial_model from crm_sales where id=$1', [sh.sale_id]), { total: '1200.00', commercial_model: 'hybrid' });
  const st = await settle(db, sh.sale_id, { eligible_base: '5000', excluded_amount: '0' });
  await db.query("select crm_sale_settlement_transition($1,'verified','Reporte verificado')", [st.settlement_id]);
  const r = await one('select total::text, variable_due::text, balance::text from crm_sale_receivables where sale_id=$1', [sh.sale_id]);
  assert.deepEqual(r, { total: '1200.00', variable_due: '500.00', balance: '1700.00' }, 'fixed setup and variable share stay separate, both collectible');

  const multi = await acceptedQuote(db, one, 'Multi QA LLC', content('Multi QA LLC', { model: 'hybrid', lines: [
    { code: 'desarrollo-web', name: 'Web', description: '', kind: 'one_time', qty: 1, unitPrice: '900' },
    { code: 'marketing-mensual', name: 'Marketing', description: '', kind: 'monthly', qty: 1, unitPrice: '300' }] }));
  const sm = await close(db, multi.quoteId);
  assert.deepEqual(await one('select total::text, recurring_monthly::text, billing_mode from crm_sales where id=$1', [sm.sale_id]), { total: '1200.00', recurring_monthly: '300.00', billing_mode: 'mixed' });
  assert.equal(Number((await one('select count(*) n from crm_sale_lines where sale_id=$1', [sm.sale_id])).n), 2);
  assert.equal(await one('select 1 x from crm_sale_variable_terms where sale_id=$1', [sm.sale_id]), undefined, 'no variable agreement invented');
});

test('guards — not accepted, no verified contract, custom concepts and kind mismatches are refused; legacy manual sales still work (TEST 9)', { timeout: 240000 }, async t => {
  const { db, one } = await setup(); t.after(() => db.close());
  const lead = (await one("insert into crm_leads(company,contact,source,owner_id) values('Draft QA','QA','manual',$1) returning id", [OWNER])).id;
  const c = content('Draft QA');
  const draft = (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [lead, crypto.randomUUID(), JSON.stringify(c), '{}', sha(c)])).r;
  await assert.rejects(close(db, draft.quote_id), /quote_not_accepted/);
  const noContract = await acceptedQuote(db, one, 'No Contract QA', content('No Contract QA'), { contract: false });
  await assert.rejects(close(db, noContract.quoteId), /won_requires_verified_contract/);
  assert.equal(Number((await one('select count(*) n from crm_sales')).n), 0, 'atomic: nothing left behind');
  const custom = await acceptedQuote(db, one, 'Custom QA', content('Custom QA', { lines: [{ code: null, name: 'Concepto a medida', description: '', kind: 'one_time', qty: 1, unitPrice: '100' }] }));
  await assert.rejects(close(db, custom.quoteId), /quote_line_not_in_catalog/);
  const mismatch = await acceptedQuote(db, one, 'Kind QA', content('Kind QA', { model: 'monthly', lines: [{ code: 'desarrollo-web', name: 'Web mensual', description: '', kind: 'monthly', qty: 1, unitPrice: '100' }] }));
  await assert.rejects(close(db, mismatch.quoteId), /quote_line_kind_mismatch/);
  assert.equal(Number((await one('select count(*) n from crm_sales')).n), 0);
  // Legacy/manual path (historical import or authorised exception) is intact and unlinked to a quote.
  const legacyLead = (await one("insert into crm_leads(company,contact,source,owner_id) values('Legacy QA','QA','manual',$1) returning id", [OWNER])).id;
  await verifiedContract(db, legacyLead);
  const legacy = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: crypto.randomUUID(), lead_id: legacyLead, new_client: { legal_name: 'Legacy QA' },
    seller_id: OWNER, lines: [{ service_code: 'desarrollo-web', unit_price: '500' }] })])).r;
  assert.deepEqual(await one('select quote_version_id, commercial_model, total::text from crm_sales where id=$1', [legacy.sale_id]), { quote_version_id: null, commercial_model: null, total: '500.00' });
  assert.equal(String((await one('select balance from crm_sale_receivables where sale_id=$1', [legacy.sale_id])).balance), '500.00', 'receivables unchanged for legacy sales');
});

test('Chino case (synthetic copy of the real structure): draft blocked → incomplete v2 refused → complete revision accepted → ONE variable sale at 33% → $1,000 verified base = $330 due, no payment invented', { timeout: 240000 }, async t => {
  const { db, one } = await setup(); t.after(() => db.close());
  const chino = { status: 'proposed', pct: '33', base: 'gross_revenue', baseNote: '', trigger: 'Cliente cobrado a traves de AVALON', attributionWindowDays: 150,
    evidence: 'Reporte del sistema y comprobante de pago', settlement: 'biweekly', exclusions: 'N/A', refunds: '', expiry: 'N/A' };
  const lines = [{ code: 'crm-personalizado', name: 'CRM personalizado', description: '', kind: 'one_time', qty: 1, unitPrice: '0.00' },
    { code: 'desarrollo-web', name: 'Desarrollo web', description: '', kind: 'one_time', qty: 1, unitPrice: '0.00' }];
  const v2 = content('Barbería Sintética QA-33', { model: 'commission', lines, commission: chino });
  // 1. A draft cannot be converted silently.
  const lead = (await one("insert into crm_leads(company,contact,source,owner_id) values('Barbería Sintética QA-33','QA','manual',$1) returning id", [OWNER])).id;
  const draft = (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [lead, crypto.randomUUID(), JSON.stringify(v2), '{}', sha(v2)])).r;
  await assert.rejects(close(db, draft.quote_id), /quote_not_accepted/);
  // 2. Avalon standard: the proposal as written lacks essential terms, so it cannot even be approved (nor sent or
  // accepted) — the client never receives an incomplete variable agreement. Nothing is created.
  await db.query('select crm_quote_transition($1,$2,$3,$4)', [draft.quote_id, 1, 'internal_review', '']);
  const cur = await one('select version from crm_quotes where id=$1', [draft.quote_id]);
  await assert.rejects(db.query('select crm_quote_transition($1,$2,$3,$4)', [draft.quote_id, cur.version, 'approved', '']), /quote_variable_terms_incomplete/);
  assert.equal((await one('select status from crm_quotes where id=$1', [draft.quote_id])).status, 'internal_review');
  assert.equal((await one('select count(*)::int n from crm_sales where quote_id=$1', [draft.quote_id])).n, 0);
  // 3. A complete revision (stated, not inferred), accepted with evidence, closes into exactly ONE variable sale.
  const v3 = content('Barbería Sintética QA-33 (v3)', { model: 'commission', lines, commission: { ...chino, kind: 'revenue_share', effectiveDate: '2026-11-01', durationMonths: 12,
    exclusions: 'Impuestos, propinas, descuentos y gastos de procesamiento', refunds: 'Se descuentan devoluciones y contracargos del periodo' } });
  const ok = await acceptedQuote(db, one, 'Barbería Sintética QA-33 (v3)', v3);
  const [a, b] = await Promise.all([close(db, ok.quoteId), close(db, ok.quoteId)]);
  assert.equal(a.sale_id, b.sale_id, 'retry/race returns the same sale');
  assert.equal((await one('select count(*)::int n from crm_sales where quote_id=$1', [ok.quoteId])).n, 1);
  const vt = await one('select pct::text, settlement, attribution_window_days, duration_months from crm_sale_variable_terms where sale_id=$1', [a.sale_id]);
  assert.deepEqual(vt, { pct: '33.00', settlement: 'biweekly', attribution_window_days: 150, duration_months: 12 }, 'window (150 d) kept apart from contract duration (12 m)');
  // 4. Synthetic settlement: $1,000 verified eligible base × 33% = $330 due; recording it creates NO payment.
  const st = await settle(db, a.sale_id, { period_start: '2026-11-01', period_end: '2026-11-15', eligible_base: '1000.00', excluded_amount: '0' });
  assert.equal(Number(st.amount_due), 330);
  assert.equal((await one('select count(*)::int n from crm_payments where sale_id=$1', [a.sale_id])).n, 0, 'no payment invented');
  await db.query("select crm_sale_settlement_transition($1,'verified','Conciliado con reporte sintético')", [st.settlement_id]);
  assert.equal((await one('select balance::text from crm_sale_receivables where sale_id=$1', [a.sale_id])).balance, '330.00');
});
