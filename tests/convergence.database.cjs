// AVL-CLAUDE-CONVERGENCE-001 on real PostgreSQL (PGlite). Synthetic identities and data only; no network, no e-mail.
// Covers: contract terms engine (joint approval + legal review, inactive proposals), contract lifecycle (MSA → SOW,
// termination), versioned catalogue with scoped advance rules, subscriptions (open → activate → renew → suspend →
// reactivate → cancel at period end → usage → invoice link), commercial outbox kinds, owner-only access, and that
// commissions are untouched.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const verifiedContract = require('./helpers/verified-contract.cjs');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const OPERATOR = '00000000-0000-4000-8000-0000000000c3';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','m@example.invalid'),('${SAMUEL}','s@example.invalid'),('${OPERATOR}','o@example.invalid');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${OPERATOR}','operator');`);
  }
  await db.exec(`insert into crm_private.finance_access(user_id) values ('${MIGUEL}'),('${SAMUEL}');`);
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set request.jwt.claims='{"sub":"${u}","aal":"aal1"}';set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const all = async (q, p) => (await db.query(q, p)).rows;
  return { db, as, one, all };
}

test('terms engine: proposals stay inactive until both owners approve and legal review is recorded', { timeout: 240000 }, async t => {
  const { db, as, one, all } = await setup();
  t.after(() => db.close());
  await as(MIGUEL);
  const seeded = await all("select key, status, legal_review, params from crm_contract_term_policies order by key");
  assert.deepEqual(seeded.map(r => [r.key, r.status, r.legal_review]),
    [['initial_cancellation_window', 'draft', 'required'], ['recurring_tool_advance', 'draft', 'required']], 'discussed clauses are drafts only');
  assert.equal(seeded[0].params.business_days, 3);
  const cancel = (await one("select id from crm_contract_term_policies where key='initial_cancellation_window'")).id;
  // Nothing can be attached while it is not approved.
  const lead = (await one("insert into crm_leads(company,contact,email,source,owner_id) values('Barbería Sintética QA','Contacto','c@example.invalid','Manual',$1) returning id", [MIGUEL])).id;
  const [draftContract] = await all("insert into crm_contracts(lead_id,title) values($1,'Contrato borrador QA') returning id", [lead]);
  await assert.rejects(db.query('select crm_contract_attach_term($1,$2)', [draftContract.id, cancel]), /term_policy_not_approved/);
  await assert.rejects(db.query('select crm_term_policy_approve($1)', [cancel]), /term_policy_not_proposed/);
  await db.query('select crm_term_policy_propose($1)', [cancel]);
  // One owner approving is not joint approval; legal review missing also blocks.
  assert.deepEqual(await one('select crm_term_policy_approve($1) r', [cancel]).then(r => [r.r.status, r.r.approvals, r.r.required]), ['proposed', 1, 2]);
  await as(SAMUEL);
  const both = (await one('select crm_term_policy_approve($1) r', [cancel])).r;
  assert.deepEqual([both.status, both.approvals, both.legal_review], ['proposed', 2, 'required'], 'two owners but no legal review: still inactive');
  await assert.rejects(db.query('select crm_term_policy_record_legal_review($1,$2)', [cancel, 'ok']), /legal_note_required/);
  await db.query('select crm_term_policy_record_legal_review($1,$2)', [cancel, 'Revisión jurídica sintética QA-LEGAL-001 (prueba)']);
  assert.equal((await one('select crm_term_policy_approve($1) r', [cancel])).r.status, 'approved');
  // Attach a frozen snapshot; editing the policy later opens a new version and never changes the attached text.
  await as(MIGUEL);
  await db.query('select crm_contract_attach_term($1,$2)', [draftContract.id, cancel]);
  await assert.rejects(db.query('select crm_contract_attach_term($1,$2)', [draftContract.id, cancel]), /already_attached/);
  const v2 = (await one(`select crm_term_policy_save('{"key":"initial_cancellation_window","title_es":"Ventana v2","title_en":"Window v2","body_es":"Texto v2 de prueba sintética","body_en":"Synthetic v2 text","params":{"business_days":5}}'::jsonb) r`)).r;
  assert.deepEqual([v2.version, v2.status], [2, 'draft']);
  await db.query('select crm_term_policy_record_legal_review($1,$2)', [v2.policy_id,'Synthetic legal review for v2 before edit']);
  await db.query('select crm_term_policy_propose($1)', [v2.policy_id]);
  await db.query('select crm_term_policy_approve($1)', [v2.policy_id]);
  await as(SAMUEL);
  await db.query(`select crm_term_policy_save('{"key":"initial_cancellation_window","body_en":"Changed synthetic legal wording"}'::jsonb)`);
  const edited = await one('select legal_review,legal_reviewed_by,legal_reviewed_at,status from crm_contract_term_policies where id=$1',[v2.policy_id]);
  assert.deepEqual(edited,{legal_review:'required',legal_reviewed_by:null,legal_reviewed_at:null,status:'draft'});
  assert.equal((await all('select * from crm_contract_term_policy_approvals where policy_id=$1',[v2.policy_id])).length,0);
  await as(MIGUEL);
  const attached = await one('select policy_version, params, sha256 from crm_contract_terms where contract_id=$1', [draftContract.id]);
  assert.deepEqual([attached.policy_version, attached.params.business_days], [1, 3]);
  assert.match(attached.sha256, /^[0-9a-f]{64}$/);
  // The proposal with monthly-cost advances is still a draft (never activated by this mission).
  assert.equal((await one("select status from crm_contract_term_policies where key='recurring_tool_advance'")).status, 'draft');
  // Non-owners: no read, no write.
  await as(OPERATOR);
  assert.equal((await all('select * from crm_contract_term_policies')).length, 0);
  await assert.rejects(db.query('select crm_term_policy_propose($1)', [cancel]), /crm_forbidden/);
});

test('contracts, catalogue and subscriptions: MSA→SOW, termination, scoped advance rules, recurring lifecycle, outbox kinds', { timeout: 240000 }, async t => {
  const { db, as, one, all } = await setup();
  t.after(() => db.close());
  await as(MIGUEL);
  const commissionsBefore = await all('select * from crm_commissions order by id');
  const catalogCommissionBefore = await all('select code, commission_kind, commission_value from crm_service_catalog order by code');

  // ── Catalogue: an advance rule only for services with recurring vendor cost; approvals are versioned snapshots.
  await assert.rejects(db.query("update crm_service_catalog set advance_policy='setup_and_first_period' where code='desarrollo-web'"), /advance_scope/);
  await assert.rejects(db.query("update crm_service_catalog set annual_discount_pct=10 where code='desarrollo-web'"), /annual_scope/);
  await db.query("update crm_service_catalog set monthly_price=200, direct_cost=60, incurs_recurring_vendor_cost=true, advance_policy='setup_and_first_period', annual_discount_pct=10, technical_dependencies='Cuenta del proveedor (sintético)' where code='marketing-mensual'");
  await db.query("update crm_service_catalog set offer_status='approved' where code='marketing-mensual'");
  await db.query("update crm_service_catalog set suggested_price=1500 where code='desarrollo-web'");
  await db.query("update crm_service_catalog set offer_status='approved' where code='desarrollo-web'");
  let snap = await all("select v.offer_version, v.snapshot from crm_service_catalog_versions v join crm_service_catalog c on c.id=v.service_id where c.code='marketing-mensual'");
  assert.deepEqual(snap.map(s => [s.offer_version, s.snapshot.advance_policy, s.snapshot.annual_discount_pct]), [[1, 'setup_and_first_period', 10]]);
  // Changing a new commercial field reopens the approved offer as a new draft version.
  await db.query("update crm_service_catalog set annual_discount_pct=15 where code='marketing-mensual'");
  assert.deepEqual(await one("select offer_status, offer_version from crm_service_catalog where code='marketing-mensual'"), { offer_status: 'draft', offer_version: 2 });
  await as(SAMUEL);
  await db.query("update crm_service_catalog set offer_status='approved' where code='marketing-mensual'");
  snap = await all("select v.offer_version, v.approved_by from crm_service_catalog_versions v join crm_service_catalog c on c.id=v.service_id where c.code='marketing-mensual' order by 1");
  assert.deepEqual(snap.map(s => [s.offer_version, s.approved_by]), [[1, MIGUEL], [2, SAMUEL]]);

  // ── Sale with a one-time and a monthly line (synthetic), contract verified first.
  await as(MIGUEL);
  const lead = (await one("insert into crm_leads(company,contact,email,source,owner_id) values('Chino Barber Sintético QA','Contacto','cb@example.invalid','Manual',$1) returning id", [MIGUEL])).id;
  const msaId = await verifiedContract(db, lead, 'MSA sintético QA');
  await db.query("update crm_service_catalog set availability='unavailable' where code='desarrollo-web'");
  await db.query("update crm_service_catalog set offer_status='approved' where code='desarrollo-web'");
  const blocked = {idempotency_key:'91000000-0000-4000-8000-000000000099',lead_id:lead,new_client:{legal_name:'Chino Barber Sintético QA'},seller_id:MIGUEL,lines:[{service_code:'desarrollo-web',unit_price:'1500'}]};
  await assert.rejects(db.query('select crm_confirm_sale($1::jsonb)',[JSON.stringify(blocked)]),/commercial_offer_not_approved/);
  assert.equal((await all('select * from crm_sales')).length,0);
  await db.query("update crm_service_catalog set availability='available' where code='desarrollo-web'");
  await db.query("update crm_service_catalog set offer_status='approved' where code='desarrollo-web'");
  const sale = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: '91000000-0000-4000-8000-000000000001', lead_id: lead,
    new_client: { legal_name: 'Chino Barber Sintético QA' }, seller_id: MIGUEL,
    lines: [{ service_code: 'desarrollo-web', unit_price: '1500' }, { service_code: 'marketing-mensual', unit_price: '200' }] })])).r;
  const lines = await all('select l.id, c.code from crm_sale_lines l join crm_service_catalog c on c.id=l.service_id where l.sale_id=$1 order by l.position', [sale.sale_id]);
  const web = lines.find(l => l.code === 'desarrollo-web'), mkt = lines.find(l => l.code === 'marketing-mensual');
  const adv = await all('select service_code, advance_policy, required_amount from crm_sale_advance_requirement($1)', [sale.sale_id]);
  assert.deepEqual(adv.map(a => [a.service_code, a.advance_policy, Number(a.required_amount)]), [['marketing-mensual', 'setup_and_first_period', 200]],
    'advance rule applies only to the service with recurring vendor cost');

  // ── Contract lifecycle: SOW under the verified MSA of the same lead; termination is recorded, never deleted.
  const msa = msaId ?? (await one("select id from crm_contracts where lead_id=$1 and status='verified_signed'", [lead])).id;
  await db.query(`select crm_contract_set_lifecycle($1, '{"doc_kind":"msa","effective_on":"2026-12-01","renewal_mode":"manual","renewal_notice_days":30}'::jsonb)`, [msa])
    .then(() => assert.fail('verified contracts are frozen'), e => assert.match(e.message, /contract_lifecycle_frozen/));

  const [sow] = await all("insert into crm_contracts(lead_id,title) values($1,'SOW sintético QA') returning id", [lead]);
  await db.query(`select crm_contract_set_lifecycle($1, $2::jsonb)`, [sow.id, JSON.stringify({ doc_kind: 'sow', parent_contract_id: msa, effective_on: '2026-12-01', ends_on: '2027-11-30', renewal_mode: 'manual' })]);
  const other = (await one("insert into crm_leads(company,contact,source,owner_id) values('Otro QA','X','Manual',$1) returning id", [MIGUEL])).id;
  const [foreign] = await all("insert into crm_contracts(lead_id,title) values($1,'Ajeno QA') returning id", [other]);
  await assert.rejects(db.query(`select crm_contract_set_lifecycle($1, $2::jsonb)`, [foreign.id, JSON.stringify({ doc_kind: 'sow', parent_contract_id: msa })]), /contract_parent_invalid/);
  await assert.rejects(db.query(`select crm_contract_set_lifecycle($1, '{"effective_on":"2027-01-10","ends_on":"2027-01-01"}'::jsonb)`, [sow.id]), /contract_lifecycle_invalid/);
  await assert.rejects(db.query('select crm_contract_terminate($1,$2,$3)', [sow.id, '2027-01-01', 'Fin anticipado QA']), /contract_not_verified/);
  await db.query('select crm_contract_terminate($1,$2,$3)', [msa, '2027-06-30', 'Terminación sintética de prueba']);
  await db.query('select crm_contract_terminate($1,$2,$3)', [msa, '2027-07-30', 'Repetición']);
  const term = await one('select status, terminated_on, termination_reason from crm_contracts where id=$1', [msa]);
  assert.deepEqual([term.status, term.termination_reason], ['verified_signed', 'Terminación sintética de prueba'], 'idempotent; signed record kept');

  // ── Subscriptions.
  await assert.rejects(db.query('select crm_subscription_open($1)', [web.id]), /not_recurring/);
  const opened = (await one(`select crm_subscription_open($1, '{"included_usage":"100","usage_unit":"mensajes"}'::jsonb) r`, [mkt.id])).r;
  assert.equal((await one('select crm_subscription_open($1) r', [mkt.id])).r.existing, true, 'idempotent');
  const sid = opened.subscription_id;
  let s = await one('select status, amount, currency, period from crm_subscriptions where id=$1', [sid]);
  assert.deepEqual([s.status, Number(s.amount), s.currency, s.period], ['pending_activation', 200, 'USD', 'monthly'], 'amount comes from the sale line');
  await db.query('select crm_subscription_activate($1,$2)', [sid, '2026-12-01']);
  await db.query('select crm_subscription_activate($1,$2)', [sid, '2026-12-01']);
  s = await one('select status, current_period_start, current_period_end from crm_subscriptions where id=$1', [sid]);
  assert.equal(s.status, 'active');
  const iso = d => new Date(d).toISOString().slice(0, 10);
  assert.deepEqual([iso(s.current_period_start), iso(s.current_period_end)], ['2026-12-01', '2026-12-31']);
  assert.deepEqual((await one('select crm_subscription_record_usage($1,$2,$3) r', [sid, 130, 'Uso sintético'])).r, { usage: 130, included: 100, overage: 30 });
  // Link the canonical invoice of the same sale to period 1 (no amounts are created here).
  const inv = (await one('select crm_invoice_record($1::jsonb) r', [JSON.stringify({ sale_id: sale.sale_id, number: 'F-QA-SUB-1', amount: '200' })])).r;
  const p1 = (await one('select id from crm_subscription_periods where subscription_id=$1 and seq=1', [sid])).id;
  await db.query('select crm_subscription_link_invoice($1,$2)', [p1, inv.invoice_id]);
  await db.query('select crm_subscription_link_invoice($1,$2)', [p1, inv.invoice_id]);
  // Renew exactly once per period.
  await assert.rejects(db.query('select crm_subscription_renew($1,$2)', [sid, '2026-12-30']), /invalid_transition/);
  const r1 = (await one('select crm_subscription_renew($1,$2) r', [sid, '2026-12-31'])).r;
  assert.deepEqual([r1.period_start, r1.period_end, r1.replayed], ['2027-01-01', '2027-01-31', false]);
  assert.equal((await one('select crm_subscription_renew($1,$2) r', [sid, '2026-12-31'])).r.replayed, true);
  await assert.rejects(db.query('select crm_subscription_link_invoice($1,$2)', [(await one('select id from crm_subscription_periods where subscription_id=$1 and seq=2', [sid])).id, inv.invoice_id]), /invoice_invalid/,
    'one invoice cannot pay two periods');
  // Suspend / reactivate / cancel at period end → the next renewal closes it.
  await assert.rejects(db.query('select crm_subscription_suspend($1,$2)', [sid, 'x']), /reason_required/);
  await db.query('select crm_subscription_suspend($1,$2)', [sid, 'Impago sintético QA']);
  await assert.rejects(db.query('select crm_subscription_renew($1,$2)', [sid, '2027-01-31']), /invalid_transition/);
  await db.query('select crm_subscription_reactivate($1,$2)', [sid, 'Pago verificado (sintético)']);
  await db.query('select crm_subscription_cancel($1,$2,$3)', [sid, 'end_of_period', 'El cliente no renueva (sintético)']);
  assert.equal((await one('select crm_subscription_renew($1,$2) r', [sid, '2027-01-31'])).r.status, 'cancelled');
  s = await one('select status, ended_on from crm_subscriptions where id=$1', [sid]);
  assert.deepEqual([s.status, iso(s.ended_on)], ['cancelled', '2027-01-31']);
  const events = (await all('select event from crm_subscription_events where subscription_id=$1 order by created_at, id', [sid])).map(e => e.event);
  for (const e of ['opened', 'activated', 'usage_recorded', 'invoice_linked', 'renewed', 'suspended', 'reactivated', 'cancel_scheduled', 'cancelled']) assert.ok(events.includes(e), e);
  // Append-only history: no direct writes for anyone.
  await assert.rejects(db.query("update crm_subscriptions set status='active' where id=$1", [sid]), /permission denied/);
  await assert.rejects(db.query('delete from crm_subscription_events where subscription_id=$1', [sid]), /permission denied/);

  // ── Commercial outbox kinds exist (prepared rows only; nothing is sent here).
  const client = (await one('select client_id from crm_sales where id=$1', [sale.sale_id])).client_id;
  for (const kind of ['quote_sent', 'contract_confirmation', 'payment_confirmation', 'subscription_renewal_notice', 'cancellation_confirmation']) {
    await db.query(`insert into crm_email_outbox(idempotency_key,kind,client_id,to_email,from_email,reply_to,subject,body_html,body_text,lang)
      values($1,$2,$3,'cb@example.invalid','avalonacoreagency@gmail.com','avalonacoreagency@gmail.com','Asunto sintético','<p>Cuerpo sintético de prueba</p>','Cuerpo sintético de prueba','es')`,
      [`qa:${kind}:0001`, kind, client]);
  }
  await assert.rejects(db.query(`insert into crm_email_outbox(idempotency_key,kind,client_id,to_email,from_email,reply_to,subject,body_html,body_text,lang)
      values('qa:bogus:0001','marketing_blast',$1,'cb@example.invalid','a@example.invalid','a@example.invalid','Asunto sintético','<p>Cuerpo sintético de prueba</p>','Cuerpo sintético de prueba','es')`, [client]), /kind_check/);

  // ── Isolation and the commissions guardrail.
  await as(OPERATOR);
  for (const tname of ['crm_subscriptions', 'crm_subscription_periods', 'crm_subscription_events', 'crm_service_catalog_versions', 'crm_contract_terms']) {
    assert.equal((await all(`select * from ${tname}`)).length, 0, tname);
  }
  await assert.rejects(db.query('select crm_subscription_cancel($1,$2,$3)', [sid, 'immediate', 'Intento ajeno']), /crm_forbidden/);
  assert.equal((await all('select * from crm_sale_advance_requirement($1)', [sale.sale_id])).length, 0, 'non-owners get nothing');
  await as(MIGUEL);
  assert.deepEqual(await all('select * from crm_commissions order by id'), commissionsBefore, 'no commission row created or changed');
  assert.deepEqual(await all('select code, commission_kind, commission_value from crm_service_catalog order by code'), catalogCommissionBefore, 'catalogue commission rules untouched');
});
