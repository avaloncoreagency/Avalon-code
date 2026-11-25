// Seller pipeline on real PostgreSQL (PGlite in CI). Synthetic identities and data only.
// Ana and Pedro are verified sellers (TOTP + AAL2); Sofía is a non-seller employee. Each seller creates and works
// only their own leads, proposals and sales; the other seller sees nothing of them (by list, by id or by RPC);
// owners see everything, approve pricing and verify contracts/payments. Owners keep full control of calendars.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const verifiedContract = require('./helpers/verified-contract.cjs');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1', SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const ANA = '00000000-0000-4000-8000-0000000000c3', PEDRO = '00000000-0000-4000-8000-0000000000d4';
const SOFIA = '00000000-0000-4000-8000-0000000000e5';

const content = (company, over = {}) => ({
  schemaVersion: 1, lang: 'es', currency: 'USD', title: `Propuesta ${company}`, issueDate: '2026-11-25', validUntil: '2099-12-31',
  client: { company, contact: 'Contacto', email: '', phone: '', address: '' }, issuer: { name: 'Avalon', email: '', phone: '' },
  seller: '', objectives: '', problem: '', solution: 'Solución sintética', scope: 'Alcance sintético', deliverables: 'Entregables',
  exclusions: 'Exclusiones', dependencies: '', timeline: '', support: '', terms: '', notes: '', thirdPartyCosts: '', model: 'fixed',
  lines: [{ code: 'desarrollo-web', name: 'Website', description: 'Sitio', kind: 'one_time', qty: 1, unitPrice: '1500' }],
  commission: null, ...over,
});
const sha = c => crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');

test('seller pipeline: own leads, proposals and sales; isolation between sellers; owners approve and verify', { timeout: 300000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)',
    [MIGUEL, 'm@example.invalid', SAMUEL, 's@example.invalid', ANA, 'ana@example.invalid', PEDRO, 'pedro@example.invalid', SOFIA, 'sofia@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner'),($2,'owner'),($3,'operator'),($4,'operator'),($5,'operator')", [MIGUEL, SAMUEL, ANA, PEDRO, SOFIA]);
  }
  await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified'),($2,'verified'),($3,'verified')", [ANA, PEDRO, SOFIA]);
  const as = async (u, aal = 'aal2') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false), set_config('request.jwt.claim.sub',$2,false)", [JSON.stringify({ sub: u, aal }), u]);
    await db.exec('set role authenticated');
  };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const createLead = (req) => one('select staff_lead_create($1::jsonb) r', [JSON.stringify(req)]).then(r => r.r);
  // Owners read the table; sellers only their brokered projection.
  const quoteVersion = async id => (await one("select coalesce((select version from crm_quotes where id=$1), (staff_seller_quote($1)->>'version')::int) version", [id])).version;

  await as(MIGUEL);
  await q("insert into staff_portal_access(user_id,active,job_title) values($1,true,'seller'),($2,true,'seller'),($3,true,'support')", [ANA, PEDRO, SOFIA]);
  const [ownerLead] = await q("insert into crm_leads(company,contact,source,owner_id) values('Lead de la dirección','QA','QA',$1) returning id", [MIGUEL]);

  // ── Leads ────────────────────────────────────────────────────────────────────────────────────────────────────
  await as(SOFIA);
  await assert.rejects(createLead({ request_key: crypto.randomUUID(), company: 'No soy vendedora' }), /crm_forbidden/, 'non-seller employees cannot create leads');
  await as(ANA, 'aal1');
  await assert.rejects(createLead({ request_key: crypto.randomUUID(), company: 'Sin AAL2' }), /crm_forbidden/, 'AAL1 session cannot act');
  // Same rule as the app (verified TOTP + AAL2): another factor type, or an unverified TOTP, never opens the portal.
  const factor = async (type, status) => { await db.exec('reset role'); await db.query('update auth.mfa_factors set factor_type=$2, status=$3 where user_id=$1', [ANA, type, status]); };
  for (const [type, status] of [['phone', 'verified'], ['webauthn', 'verified'], ['totp', 'unverified']]) {
    await factor(type, status); await as(ANA);
    await assert.rejects(createLead({ request_key: crypto.randomUUID(), company: `Factor ${type}` }), /crm_forbidden/, `${type}/${status} is not enough`);
    assert.equal((await q('select * from staff_seller_leads()')).length, 0);
  }
  await factor('totp', 'verified');

  await as(ANA);
  const key = crypto.randomUUID();
  const a1 = await createLead({ request_key: key, company: 'Barbería Ana QA', contact: 'Luis', email: 'Luis@Example.invalid', phone: '+1 555 0100', value: '2500', next_action: 'Llamar el lunes' });
  assert.equal(a1.existing, false);
  assert.deepEqual(await createLead({ request_key: key, company: 'Barbería Ana QA' }), { lead_id: a1.lead_id, existing: true }, 'idempotent replay');
  await assert.rejects(createLead({ request_key: crypto.randomUUID(), company: '' }), /staff_lead_invalid/);
  await assert.rejects(createLead({ request_key: crypto.randomUUID(), company: 'Correo malo', email: 'no-es-correo' }), /staff_lead_invalid/);
  const mine = await q('select * from staff_seller_leads()');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].company, 'Barbería Ana QA');
  assert.equal(mine[0].email, 'luis@example.invalid');
  assert.equal(mine[0].stage_id, 'new');
  assert.equal((await q('select * from crm_leads')).length, 0, 'the CRM tables stay closed to sellers');
  await assert.rejects(q("insert into crm_leads(company,source,owner_id) values('Directo','QA',$1)", [ANA]), /row-level security|permission denied|forbidden/i);
  // A forged seller context does not open table writes either (RLS is still the gate).
  await q("select set_config('avalon.seller_act',$1,false)", [ANA]);
  await assert.rejects(q("insert into crm_leads(company,source,owner_id) values('Forjado','QA',$1)", [ANA]), /row-level security|permission denied|forbidden/i);
  await q("select set_config('avalon.seller_act','',false)");
  // Ana works her lead: stage and next action; never 'won' by hand; lost needs a reason.
  let v = mine[0].version;
  v = (await one('select staff_lead_update($1,$2,$3::jsonb) r', [a1.lead_id, v, JSON.stringify({ stage_id: 'contacted', next_action: 'Enviar propuesta' })])).r;
  await assert.rejects(q('select staff_lead_update($1,$2,$3::jsonb)', [a1.lead_id, v - 1, '{"stage_id":"qualified"}']), /staff_lead_version_conflict/);
  await assert.rejects(q('select staff_lead_update($1,$2,$3::jsonb)', [a1.lead_id, v, '{"stage_id":"won"}']), /staff_lead_won_by_sale/);
  await assert.rejects(q('select staff_lead_update($1,$2,$3::jsonb)', [a1.lead_id, v, '{"stage_id":"lost"}']), /staff_lead_loss_reason_required/);
  assert.equal((await q('select * from staff_my_leads()')).length, 1, 'her own lead is also in the existing granted-leads view');
  // Ana cannot touch the owners' lead.
  await assert.rejects(q('select staff_lead_update($1,1,$2::jsonb)', [ownerLead.id, '{"stage_id":"contacted"}']), /crm_forbidden/);

  // Pedro sees nothing of Ana's, by list, by id or by RPC.
  await as(PEDRO);
  const p1 = await createLead({ request_key: crypto.randomUUID(), company: 'Restaurante Pedro QA' });
  assert.deepEqual((await q('select company from staff_seller_leads()')).map(r => r.company), ['Restaurante Pedro QA']);
  assert.equal((await q('select * from staff_my_leads()')).length, 1);
  await assert.rejects(q('select staff_lead_update($1,1,$2::jsonb)', [a1.lead_id, '{"stage_id":"contacted"}']), /crm_forbidden/);
  const cA = content('Barbería Ana QA');
  await assert.rejects(q('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5)', [a1.lead_id, crypto.randomUUID(), JSON.stringify(cA), '{}', sha(cA)]), /crm_forbidden/);

  // ── Proposals ────────────────────────────────────────────────────────────────────────────────────────────────
  await as(ANA);
  const qa = (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [a1.lead_id, crypto.randomUUID(), JSON.stringify(cA), '{"directCosts":"","marginNote":"Margen privado de Ana","confidential":""}', sha(cA)])).r;
  await assert.rejects(q('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5)', [ownerLead.id, crypto.randomUUID(), JSON.stringify(cA), '{}', sha(cA)]), /crm_forbidden/, 'not on the owners\' lead');
  const myQuotes = await q('select * from staff_seller_quotes()');
  assert.equal(myQuotes.length, 1);
  assert.equal(myQuotes[0].status, 'draft');
  assert.equal(Number(myQuotes[0].one_time_total), 1500);
  const detail = (await one('select staff_seller_quote($1) r', [qa.quote_id])).r;
  assert.equal(detail.quote_number, qa.quote_number);
  assert.deepEqual(detail.content, cA);
  // Revise, then submit for review. Pricing approval belongs to the owners.
  const cA2 = content('Barbería Ana QA', { lines: [{ code: 'desarrollo-web', name: 'Website', description: 'Sitio + reservas', kind: 'one_time', qty: 1, unitPrice: '1800' }] });
  assert.equal((await one('select crm_quote_revise($1,$2,$3::jsonb,$4::jsonb,$5,$6) r', [qa.quote_id, await quoteVersion(qa.quote_id), JSON.stringify(cA2), '{"directCosts":"","marginNote":"Margen privado de Ana v2","confidential":""}', sha(cA2), 'Ajuste de precio'])).r, 2);
  assert.equal((await one('select staff_seller_quote($1) r', [qa.quote_id])).r.internal.marginNote, 'Margen privado de Ana v2', 'the author sees her own internal notes');
  await q('select crm_quote_transition($1,$2,$3,$4)', [qa.quote_id, await quoteVersion(qa.quote_id), 'internal_review', '']);
  await assert.rejects(q('select crm_quote_transition($1,$2,$3,$4)', [qa.quote_id, await quoteVersion(qa.quote_id), 'approved', '']), /quote_owner_approval_required/);

  await as(PEDRO);
  assert.equal((await q('select * from staff_seller_quotes()')).length, 0);
  assert.equal((await one('select staff_seller_quote($1) r', [qa.quote_id])).r, null, 'not even by id');
  await assert.rejects(q('select crm_quote_transition($1,$2,$3,$4)', [qa.quote_id, 1, 'superseded', 'Intento ajeno de cerrar']), /crm_forbidden/);
  await assert.rejects(q('select crm_quote_delete($1,$2,$3)', [qa.quote_id, 1, 'x']), /quote_delete_forbidden/);
  // Deleting is reserved to the owners: not even the author may delete her own draft.
  await as(ANA);
  const cD = content('Barbería Ana QA', { title: 'Borrador duplicado' });
  const qd = (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [a1.lead_id, crypto.randomUUID(), JSON.stringify(cD), '{}', sha(cD)])).r;
  await assert.rejects(q('select crm_quote_delete($1,$2,$3)', [qd.quote_id, await quoteVersion(qd.quote_id), 'Duplicado']), /quote_delete_forbidden/, 'sellers never delete');
  await as(MIGUEL);
  assert.equal((await one('select crm_quote_delete($1,$2,$3) r', [qd.quote_id, await quoteVersion(qd.quote_id), 'Duplicado (QA sintético)'])).r.replayed, false, 'owners may delete');
  await as(ANA);
  assert.deepEqual((await q('select quote_id from staff_seller_quotes()')).map(r => r.quote_id), [qa.quote_id], 'a deleted proposal leaves the seller view');

  await as(SAMUEL);
  await q('select crm_quote_transition($1,$2,$3,$4)', [qa.quote_id, await quoteVersion(qa.quote_id), 'approved', '']);
  assert.equal((await q('select * from crm_quotes where deleted_at is null')).length, 1, 'owners see every proposal');

  await as(ANA);
  await q('select crm_quote_transition($1,$2,$3,$4)', [qa.quote_id, await quoteVersion(qa.quote_id), 'sent', 'Enviada por email al cliente (sintético)']);
  await q('select crm_quote_transition($1,$2,$3,$4)', [qa.quote_id, await quoteVersion(qa.quote_id), 'accepted', 'Cliente aceptó por email (sintético)']);
  const close = () => one('select crm_quote_close_sale($1::jsonb) r', [JSON.stringify({ quote_id: qa.quote_id, version_no: 2, seller_id: MIGUEL })]).then(r => r.r);
  // ── Sales ────────────────────────────────────────────────────────────────────────────────────────────────────
  await assert.rejects(close(), /won_requires_verified_contract/, 'the contract is verified by an owner first');
  await assert.rejects(q('select crm_confirm_sale($1::jsonb)', [JSON.stringify({ idempotency_key: crypto.randomUUID(), lead_id: a1.lead_id, lines: [{ service_code: 'desarrollo-web' }] })]), /crm_forbidden/,
    'sellers never call the raw sale confirmation');
  // Even a forged close context only reaches an accepted, current revision of a quote on that same lead.
  await q("select set_config('avalon.seller_act',$1,false), set_config('avalon.seller_close',$2,false)", [ANA, crypto.randomUUID()]);
  await assert.rejects(q('select crm_confirm_sale($1::jsonb)', [JSON.stringify({ idempotency_key: crypto.randomUUID(), lead_id: a1.lead_id, quote_version_id: await one("select current_setting('avalon.seller_close') v").then(r => r.v), lines: [{ service_code: 'desarrollo-web', unit_price: '1' }] })]), /crm_forbidden/,
    'a forged context is not a quote');
  await q("select set_config('avalon.seller_act','',false), set_config('avalon.seller_close','',false)");
  await as(MIGUEL);
  await verifiedContract(db, a1.lead_id, 'Contrato Barbería Ana QA');
  await as(PEDRO);
  await assert.rejects(close(), /crm_forbidden/, 'another seller cannot close it');
  await as(ANA);
  const sale = await close();
  const replay = await close();
  assert.equal(replay.sale_id, sale.sale_id);
  assert.equal(replay.replayed, true);
  const mySales = await q('select * from staff_seller_sales()');
  assert.equal(mySales.length, 1);
  assert.equal(mySales[0].sale_number, sale.sale_number);
  assert.equal(Number(mySales[0].total), 1800);
  assert.equal(Number(mySales[0].paid_verified), 0);
  assert.equal((await q('select stage_id from staff_seller_leads() where lead_id=$1', [a1.lead_id]))[0].stage_id, 'won');
  // Payments, verification and commissions stay with the owners.
  await assert.rejects(q("insert into crm_payments(sale_id,amount,currency,received_on,method,reference) values($1,100,'USD',current_date,'zelle','x')", [sale.sale_id]), /row-level security|permission denied|forbidden|payment_invalid_sale/i);
  assert.equal((await q('select * from crm_sales')).length, 0);
  await as(PEDRO);
  assert.equal((await q('select * from staff_seller_sales()')).length, 0);

  await as(MIGUEL);
  const s = await one('select seller_id, status from crm_sales where id=$1', [sale.sale_id]);
  assert.deepEqual(s, { seller_id: ANA, status: 'confirmed' }, 'the seller is Ana even if another seller_id was sent');
  const assignees = await q('select distinct assignee_id from crm_work_orders where sale_id=$1', [sale.sale_id]);
  assert.ok(assignees.every(a => a.assignee_id !== ANA), 'delivery work is not dumped on the seller');
  assert.equal((await q('select * from crm_leads')).length, 3, 'owners see every lead');

  // Owners hand a lead to exactly one seller; the previous seller loses it.
  await q('select crm_lead_assign_seller($1,$2)', [ownerLead.id, PEDRO]);
  await as(PEDRO);
  assert.equal((await q('select * from staff_seller_leads() where lead_id=$1', [ownerLead.id])).length, 1);
  await as(MIGUEL);
  await q('select crm_lead_assign_seller($1,$2)', [ownerLead.id, ANA]);
  await assert.rejects(q('select crm_lead_assign_seller($1,$2)', [ownerLead.id, SOFIA]), /staff_seller_invalid/, 'only active sellers');
  await as(PEDRO);
  assert.equal((await q('select * from staff_seller_leads() where lead_id=$1', [ownerLead.id])).length, 0);
  assert.equal((await q('select * from staff_my_leads() where lead_id=$1', [ownerLead.id])).length, 0);
  await as(ANA);
  assert.equal((await q('select * from staff_seller_leads()')).length, 2);
  await assert.rejects(q('select crm_lead_assign_seller($1,$2)', [ownerLead.id, ANA]), /crm_forbidden/);
  await assert.rejects(q("insert into staff_lead_grants(user_id,lead_id,access_level) values($1,$2,'work')", [ANA, p1.lead_id]), /row-level security|permission denied|staff_lead_use_assignment/);

  // ── Transfer: the lead moves, the history stays with whoever earned it ───────────────────────────────────────────
  await as(MIGUEL);
  await assert.rejects(q("insert into staff_lead_grants(user_id,lead_id,access_level) values($1,$2,'work')", [ANA, p1.lead_id]), /staff_lead_use_assignment/,
    'a seller is never granted another seller\'s lead: owners reassign it');
  const com = (await one('select crm_commission_agree($1::jsonb) r', [JSON.stringify({ sale_id: sale.sale_id, kind: 'sale', beneficiary_id: ANA, rate_pct: '10', basis: 'Comisión de venta acordada por escrito (sintético)' })])).r;
  const before = await one('select beneficiary_id, amount, status from crm_commissions where id=$1', [com.commission_id]);
  // Ana prepares an upsell (draft) on the same lead with private notes, then the lead is handed to Pedro.
  await as(ANA);
  const cU = content('Barbería Ana QA', { title: 'Ampliación' });
  const qu = (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [a1.lead_id, crypto.randomUUID(), JSON.stringify(cU), '{"directCosts":"","marginNote":"Nota privada de Ana","confidential":""}', sha(cU)])).r;
  await as(MIGUEL);
  await q('select crm_lead_assign_seller($1,$2)', [a1.lead_id, PEDRO]);
  await as(PEDRO);
  assert.equal((await q('select * from staff_seller_leads() where lead_id=$1', [a1.lead_id])).length, 1, 'Pedro now works the lead');
  const inherited = await q('select quote_id, sale_id, sale_number from staff_seller_quotes() where lead_id=$1 order by quote_number', [a1.lead_id]);
  assert.equal(inherited.length, 2);
  assert.ok(inherited.every(r => r.sale_id === null && r.sale_number === null), 'Ana\'s sale is not shown to Pedro');
  const qaSeen = (await one('select staff_seller_quote($1) r', [qa.quote_id])).r;
  assert.equal(qaSeen.internal, null, 'internal notes stay with the author');
  assert.equal(qaSeen.sale_id, null);
  assert.equal(qaSeen.closed, true, 'Pedro knows it is closed (no close button), not whose sale it is');
  assert.ok(qaSeen.events.length > 0 && qaSeen.events.every(e => e.note === null), 'negotiation notes stay with the author');
  assert.equal((await one('select staff_seller_quote($1) r', [qu.quote_id])).r.internal, null);
  await assert.rejects(close(), /quote_closed_by_other_seller/, 'replaying Ana\'s close reveals nothing to Pedro');
  assert.equal((await q('select * from staff_seller_sales()')).length, 0, 'Pedro inherits no sales');
  assert.equal((await q('select * from staff_own_commercial_history()')).length, 0, 'nor commissions');
  // Pedro may revise the inherited draft's client-facing content; Ana's internal notes are carried over, not replaced.
  const cU2 = content('Barbería Ana QA', { title: 'Ampliación revisada' });
  await q('select crm_quote_revise($1,$2,$3::jsonb,$4::jsonb,$5,$6)', [qu.quote_id, await quoteVersion(qu.quote_id), JSON.stringify(cU2), '{"directCosts":"","marginNote":"Pedro sobrescribe","confidential":""}', sha(cU2), 'Revisión de Pedro']);
  await as(ANA);
  assert.equal((await q('select * from staff_seller_leads() where lead_id=$1', [a1.lead_id])).length, 0, 'Ana no longer sees the lead');
  assert.equal((await one('select staff_seller_quote($1) r', [qa.quote_id])).r, null, 'nor its proposals');
  assert.deepEqual((await q('select sale_number from staff_seller_sales()')).map(r => r.sale_number), [sale.sale_number], 'Ana keeps her sale');
  assert.equal(replay.sale_id, (await close()).sale_id, 'and her close stays idempotent');
  assert.deepEqual((await q('select record_kind from staff_own_commercial_history() order by record_kind')).map(r => r.record_kind), ['commission', 'sale'], 'and her commission');
  await as(MIGUEL);
  assert.deepEqual(await one('select beneficiary_id, amount, status from crm_commissions where id=$1', [com.commission_id]), before, 'commission untouched');
  assert.equal((await one('select seller_id from crm_sales where id=$1', [sale.sale_id])).seller_id, ANA, 'sale attribution untouched');
  const qu3 = await one('select v.internal, v.created_by from crm_quote_versions v join crm_quotes q on q.id=v.quote_id and v.version_no=q.current_version where q.id=$1', [qu.quote_id]);
  assert.deepEqual([qu3.internal.marginNote, qu3.created_by], ['Nota privada de Ana', PEDRO]);
  assert.deepEqual((await q('select user_id, active from staff_lead_grants where lead_id=$1 order by active', [a1.lead_id])).map(r => [r.user_id, r.active]), [[ANA, false], [PEDRO, true]],
    'one active seller per lead');
  await q('select crm_lead_assign_seller($1,$2)', [a1.lead_id, ANA]);

  // Suspension closes everything immediately.
  await as(MIGUEL);
  await q('update staff_portal_access set active=false where user_id=$1', [ANA]);
  await as(ANA);
  assert.equal((await q('select * from staff_seller_leads()')).length, 0);
  assert.equal((await q('select * from staff_seller_quotes()')).length, 0);
  assert.equal((await q('select * from staff_seller_sales()')).length, 0);
  await assert.rejects(createLead({ request_key: crypto.randomUUID(), company: 'Suspendida' }), /crm_forbidden/);
  await db.exec('reset role; set role anon');
  await assert.rejects(q('select * from staff_seller_leads()'), /permission denied/);
});

test('calendars: sellers keep their own; owners create, edit, cancel and delete any employee item', { timeout: 300000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8)',
    [MIGUEL, 'm@example.invalid', ANA, 'ana@example.invalid', PEDRO, 'pedro@example.invalid', SOFIA, 'sofia@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner'),($2,'operator'),($3,'operator'),($4,'operator')", [MIGUEL, ANA, PEDRO, SOFIA]);
  }
  await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified'),($2,'verified'),($3,'verified')", [ANA, PEDRO, SOFIA]);
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set request.jwt.claims='{"sub":"${u}","aal":"aal2"}';set role authenticated;`);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const at = (d, h) => `2026-12-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00-05:00`;
  await as(MIGUEL);
  // can_create_events is false for everyone: sellers still own a calendar; a support employee does not.
  await q("insert into staff_portal_access(user_id,active,job_title,can_create_events) values($1,true,'seller',false),($2,true,'seller',false),($3,true,'support',false)", [ANA, PEDRO, SOFIA]);

  await as(ANA);
  const lead = (await q("select staff_lead_create($1::jsonb) r", [JSON.stringify({ request_key: crypto.randomUUID(), company: 'Cita QA' })]))[0].r.lead_id;
  const [own] = await q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,starts_at,ends_at,lead_id) values($1,'appointment','staff_created',$2,'Cita con cliente',$3,$4,$5) returning id,version",
    [crypto.randomUUID(), ANA, at(2, 10), at(2, 11), lead]);
  await q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at) values($1,'task','staff_created',$2,'Preparar propuesta',$3)", [crypto.randomUUID(), ANA, at(3, 17)]);
  await q("update staff_work_items set starts_at=$2, ends_at=$3 where id=$1", [own.id, at(2, 12), at(2, 13)]);
  await assert.rejects(q('delete from staff_work_items where id=$1 returning id', [own.id]).then(r => { if (!r.length) throw new Error('no rows deleted'); }), /no rows deleted|permission denied/,
    'employees cannot delete');
  await as(SOFIA);
  await assert.rejects(q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at) values($1,'task','staff_created',$2,'X',$3)", [crypto.randomUUID(), SOFIA, at(3, 9)]), /row-level security|policy/i);
  await as(PEDRO);
  assert.equal((await q('select * from staff_work_items')).length, 0, 'Pedro never sees Ana\'s calendar');

  await as(MIGUEL);
  assert.equal((await q('select * from staff_work_items where assignee_id=$1', [ANA])).length, 2, 'owners see every employee calendar');
  const [assigned] = await q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,starts_at,priority) values($1,'appointment','staff_assigned',$2,'Reunión de ventas',$3,'high') returning id", [crypto.randomUUID(), ANA, at(4, 9)]);
  await q("update staff_work_items set title='Cita con cliente (confirmada)', starts_at=$2, ends_at=$3 where id=$1", [own.id, at(5, 9), at(5, 10)]);
  await q("update staff_work_items set status='cancelled' where id=$1", [assigned.id]);
  assert.equal((await q('delete from staff_work_items where id=$1 returning id', [assigned.id])).length, 1, 'owners can delete');
  await as(ANA);
  const items = await q('select title from staff_work_items order by title');
  assert.deepEqual(items.map(i => i.title), ['Cita con cliente (confirmada)', 'Preparar propuesta']);
});
