// CRM Intelligence on isolated PostgreSQL (PGlite) with every migration. Synthetic businesses and users only.
// Covers the mandatory scenarios that live in the database: two owners sharing one lead, partial diagnosis, per-question
// conflict protection, history, reassignment, the 13 existing stages, commercial terms, the contract state machine and the
// won/active-client gate, plus negative security cases (non-owner, anon, forged transitions, commission edits).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid(), unique (bucket_id, name));
    alter table storage.objects enable row level security;`);
  await db.exec(`insert into auth.users(id) values('${MIGUEL}'),('${SAMUEL}'),('${STRANGER}')`);
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
    if (file.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${STRANGER}','operator')`);
  }
  const as = async (role, user = '') => db.exec(`reset role;set request.jwt.claim.role='${role}';set request.jwt.claim.sub='${user}';set role ${role}`);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const fails = async (sql, p, re) => {
    await db.exec('savepoint s');
    try { await db.query(sql, p); } catch (e) { await db.exec('rollback to savepoint s'); if (re) assert.match(e.message + ' ' + (e.code ?? ''), re); return e; }
    await db.exec('release savepoint s'); assert.fail('expected failure: ' + sql.slice(0, 120));
  };
  await db.exec('begin');
  return { db, as, q, one, fails };
}
const save = (h, lead, industry, answers, status = null, progress = null) =>
  h.one('select crm_assessment_save($1,$2,$3,$4::jsonb,$5,$6) r', [lead, industry, 'general-1+hvac-fl-1', JSON.stringify(answers), status, progress]).then(x => x.r);

test('CRM Intelligence: two owners, partial diagnosis, conflicts, history, scoring, terms, contract gate', { timeout: 180000 }, async () => {
  const h = await setup();
  const { as, q, one, fails } = h;

  // 1–2. Miguel quick-adds an HVAC lead with only the basics.
  await as('authenticated', MIGUEL);
  const lead = (await one(`insert into crm_leads(company, phone, source, owner_id, origin, city, zip, industry_key)
    values('Cool Breeze HVAC Sintético', '+1 (305) 555-0101', 'Entrada manual', $1, 'manual', 'Miami', '33101', 'hvac') returning *`, [MIGUEL]));
  assert.deepEqual([lead.stage_id, lead.diagnosis_status, lead.contract_status, lead.audience, lead.created_by, lead.lead_grade],
    ['new', 'not_started', 'not_started', 'agency_b2b', MIGUEL, null], 'a lead saves with minimal data and honest initial states');
  await fails(`insert into crm_leads(company, source, owner_id, audience) values('Consumer', 'x', $1, 'client_consumer')`, [MIGUEL], /audience_check|check constraint/);

  // 3. Miguel completes part of the diagnosis later (partial save allowed).
  const s1 = await save(h, lead.id, 'hvac', { g_main_problem: { v: 'Pocas instalaciones', s: 'answered' }, h_techs: { v: 4, s: 'answered' }, h_ad_budget: { s: 'unknown' } });
  assert.equal(s1.changed, 3); assert.deepEqual(s1.conflicts, []);
  const after1 = await one('select diagnosis_status, industry_key from crm_leads where id=$1', [lead.id]);
  assert.deepEqual(after1, { diagnosis_status: 'in_progress', industry_key: 'hvac' });
  const techAt = s1.answers.h_techs.at;

  // 5–6. Samuel opens the same lead and adds answers + a note without destroying Miguel's work.
  await as('authenticated', SAMUEL);
  assert.equal((await q('select id from crm_leads where id=$1', [lead.id])).length, 1, 'both owners see agency leads');
  const s2 = await save(h, lead.id, 'hvac', { h_install: { v: true, s: 'answered' }, h_techs: { v: 5, s: 'answered', base: techAt } });
  assert.equal(s2.changed, 2);
  await q(`insert into crm_activities(lead_id, body, kind) values($1, 'Llamada: interesado en AI Receptionist', 'call')`, [lead.id]);
  // 25. Miguel still holds the OLD version of h_techs in his form: his stale write is reported as a conflict, not applied.
  await as('authenticated', MIGUEL);
  const s3 = await save(h, lead.id, 'hvac', { h_techs: { v: 3, s: 'answered', base: techAt }, h_repairs: { v: true, s: 'answered' } });
  assert.deepEqual(s3.conflicts, ['h_techs']);
  assert.equal(s3.answers.h_techs.v, 5, "Samuel's newer answer survives");
  assert.equal(s3.answers.h_repairs.v, true, 'non-conflicting answers are still saved');
  assert.equal(s3.answers.g_main_problem.by, MIGUEL); assert.equal(s3.answers.h_install.by, SAMUEL, 'per-answer authorship');
  // A first-time answer that someone else created meanwhile is also a conflict (no blind overwrite).
  await as('authenticated', SAMUEL);
  await save(h, lead.id, 'hvac', { h_vehicles: { v: 2, s: 'answered' } });
  await as('authenticated', MIGUEL);
  const s4 = await save(h, lead.id, 'hvac', { h_vehicles: { v: 9, s: 'answered', base: null } });
  assert.equal(s4.answers.h_vehicles.v, 2);
  // 7. History: every saved change, by whom, with previous and new values; last interaction from the call.
  const revs = await q('select changed_by, changes, conflicts from crm_lead_assessment_revisions where lead_id=$1 order by created_at, version', [lead.id]);
  assert.ok(revs.length >= 3);
  assert.deepEqual(revs.find(r => r.changes.h_techs?.to?.v === 5).changed_by, SAMUEL);
  assert.ok(revs.some(r => r.conflicts.includes('h_techs')), 'conflicts are recorded in the history');
  assert.ok((await one('select last_interaction_at from crm_leads where id=$1', [lead.id])).last_interaction_at, 'call updates last interaction');

  // 16. Switching industry keeps the previous answers (separate assessment per industry).
  await save(h, lead.id, 'barber', { b_cut_price: { v: 30, s: 'answered' } });
  assert.equal((await q('select industry_key from crm_lead_assessments where lead_id=$1 order by industry_key', [lead.id])).length, 2);
  assert.equal((await one(`select answers->'h_techs'->>'v' v from crm_lead_assessments where lead_id=$1 and industry_key='hvac'`, [lead.id])).v, '5');
  await save(h, lead.id, 'hvac', {});
  await fails(`select crm_assessment_save($1,'hvac','general-1',$2::jsonb)`, [lead.id, JSON.stringify({ 'Bad Id': { v: 1, s: 'answered' } })], /assessment_invalid/);

  // 4. Score: append-only, applied to the lead; manual adjustment needs a written reason; history is kept.
  await q(`insert into crm_lead_scores(lead_id, rules_version, score, grade, breakdown) values($1,'score-1',84,'A','[]')`, [lead.id]);
  assert.deepEqual(await one('select lead_score, lead_grade from crm_leads where id=$1', [lead.id]), { lead_score: 84, lead_grade: 'A' });
  await fails(`insert into crm_lead_scores(lead_id, rules_version, score, grade, breakdown, manual_score) values($1,'score-1',84,'A','[]',60)`, [lead.id], /check/);
  await q(`insert into crm_lead_scores(lead_id, rules_version, score, grade, breakdown, manual_score, manual_reason) values($1,'score-1',84,'A','[]',62,'Capacidad real menor de la declarada')`, [lead.id]);
  assert.deepEqual(await one('select lead_score, lead_grade from crm_leads where id=$1', [lead.id]), { lead_score: 62, lead_grade: 'B' });
  await fails(`insert into crm_lead_scores(lead_id, rules_version, score, grade, breakdown) values($1,'score-1',null,'A','[]')`, [lead.id], /check/);
  await fails(`update crm_lead_scores set score=99`, [], /permission denied/);
  assert.equal((await q('select id from crm_lead_scores where lead_id=$1', [lead.id])).length, 2, 'historical scores kept');

  // 8. Reassignment is a plain update of the existing owner field — audited, no duplicate lead.
  const v0 = (await one('select version from crm_leads where id=$1', [lead.id])).version;
  await q('update crm_leads set owner_id=$2 where id=$1 and version=$3', [lead.id, SAMUEL, v0]);
  assert.equal((await one('select owner_id from crm_leads where id=$1', [lead.id])).owner_id, SAMUEL);
  const stale = await q('update crm_leads set owner_id=$2 where id=$1 and version=$3 returning id', [lead.id, MIGUEL, v0]);
  assert.equal(stale.length, 0, 'a stale lead edit changes nothing (optimistic version)');
  assert.ok((await one(`select count(*)::int n from crm_audit where entity='crm_leads' and record_id=$1`, [lead.id])).n >= 2);
  assert.equal((await one('select count(*)::int n from crm_leads')).n, 1);

  // 9. The existing 13 stages are untouched and usable.
  assert.equal((await one('select count(*)::int n from crm_stages')).n, 13);
  for (const st of ['researched', 'contacted', 'qualified', 'diagnosed', 'proposal', 'negotiation']) await q('update crm_leads set stage_id=$2 where id=$1', [lead.id, st]);

  // 10. Commercial terms: proposed and agreed kept apart; ad budget is the client's spend; commission needs a human.
  await q(`insert into crm_commercial_terms(lead_id, kind, services, setup_price, monthly_fee, client_ad_budget, billing_model, commission_pct, commission_base)
    values($1,'proposed','{ai_receptionist,crm}',1500,900,2500,'hybrid',8,'gross_profit')`, [lead.id]);
  await fails(`insert into crm_commercial_terms(lead_id, kind, billing_model, commission_pct) values($1,'agreed','hybrid',7)`, [lead.id], /check/);
  await fails(`insert into crm_commercial_terms(lead_id, kind, commission_pct) values($1,'agreed',120)`, [lead.id], /check/);
  await fails(`insert into crm_commercial_terms(lead_id, kind, billing_model, commission_pct, commission_approved_by) values($1,'agreed','monthly',7,$2)`, [lead.id, MIGUEL], /check/);
  const agreed = await one(`insert into crm_commercial_terms(lead_id, kind, setup_price, monthly_fee, billing_model, commission_pct, commission_base, commission_approved_by)
    values($1,'agreed',1500,800,'hybrid',7,'gross_profit',$2) returning *`, [lead.id, MIGUEL]);
  assert.equal((await q('select kind from crm_commercial_terms where lead_id=$1 order by kind', [lead.id])).length, 2);

  // 11. No Won and no active client without a verified signed contract.
  await fails('update crm_leads set stage_id=$2 where id=$1', [lead.id, 'won'], /won_requires_verified_contract/);
  await fails(`select crm_confirm_sale($1::jsonb)`, [JSON.stringify({ idempotency_key: '70000000-0000-4000-8000-000000000001', lead_id: lead.id,
    new_client: { legal_name: 'Cool Breeze HVAC Sintético' }, lines: [{ service_code: 'recepcionista-ia', unit_price: '900' }] })], /won_requires_verified_contract/);
  assert.equal((await one('select count(*)::int n from crm_clients')).n, 0);

  // 23. Contract state machine: no skipping, evidence required, a checkbox is not a signature.
  const c = await one(`insert into crm_contracts(lead_id, title, terms_id) values($1,'Acuerdo Avalon · Cool Breeze',$2) returning *`, [lead.id, agreed.id]);
  await fails(`insert into crm_contracts(lead_id, title, status) values($1,'Forjado','verified_signed')`, [lead.id], /contract_transition_invalid/);
  await fails(`update crm_contracts set status='verified_signed', verification_method='document_review', verification_note='Forjado desde el navegador' where id=$1`, [c.id], /contract_transition_invalid/);
  await q(`update crm_contracts set status='sent_for_signature' where id=$1`, [c.id]);
  assert.ok((await one('select sent_at from crm_contracts where id=$1', [c.id])).sent_at);
  await fails(`update crm_contracts set status='signed_pending_verification' where id=$1`, [c.id], /contract_signature_details_required/);
  await fails(`update crm_contracts set status='signed_pending_verification', signed_at=now(), signer_name='Dueño' where id=$1`, [c.id], /contract_evidence_required/);
  // 24. The signed document is a private crm_attachments row of THIS lead (no public URL); a foreign attachment is refused.
  const other = await one(`insert into crm_leads(company, source, owner_id) values('Otra empresa', 'x', $1) returning id`, [MIGUEL]);
  const foreign = await one(`insert into crm_attachments(lead_id, filename, mime, size_bytes, sha256, content) values($1,'otro.pdf','application/pdf',4,repeat('a',64),'\\x25504446') returning id`, [other.id]);
  await fails(`update crm_contracts set attachment_id=$2 where id=$1`, [c.id, foreign.id], /contract_attachment_foreign/);
  const doc = await one(`insert into crm_attachments(lead_id, filename, mime, size_bytes, sha256, content) values($1,'acuerdo-firmado.pdf','application/pdf',4,repeat('b',64),'\\x25504446') returning id`, [lead.id]);
  await q(`update crm_contracts set status='signed_pending_verification', signed_at=now(), signer_name='Dueño Sintético', attachment_id=$2 where id=$1`, [c.id, doc.id]);
  await fails(`update crm_contracts set status='verified_signed', verification_method='document_review', verification_note='ok' where id=$1`, [c.id], /contract_verification_evidence_required/);
  await as('authenticated', SAMUEL);
  await q(`update crm_contracts set status='verified_signed', verification_method='document_review', verification_note='PDF firmado revisado: firma y fecha coinciden con el acuerdo.' where id=$1`, [c.id]);
  const verified = await one('select verified_by, verified_at from crm_contracts where id=$1', [c.id]);
  assert.equal(verified.verified_by, SAMUEL, 'the verifying owner is recorded by the database, not by the client');
  await fails(`update crm_contracts set verification_note='reescrito después de verificar' where id=$1`, [c.id], /contract_verified_immutable/);
  const events = await q('select from_status, to_status, actor_id from crm_contract_events where contract_id=$1 order by created_at', [c.id]);
  assert.deepEqual(events.map(e => e.to_status), ['draft', 'sent_for_signature', 'signed_pending_verification', 'verified_signed']);
  assert.equal((await one('select contract_status from crm_leads where id=$1', [lead.id])).contract_status, 'verified_signed');

  // 12. With the verified contract, Won and the formal client are allowed (existing sale/convert paths).
  const sale = (await one(`select crm_confirm_sale($1::jsonb) r`, [JSON.stringify({ idempotency_key: '70000000-0000-4000-8000-000000000002', lead_id: lead.id,
    new_client: { legal_name: 'Cool Breeze HVAC Sintético' }, lines: [{ service_code: 'recepcionista-ia', unit_price: '900' }] })])).r;
  assert.equal(sale.client_created, true);
  assert.equal((await one('select s.kind from crm_leads l join crm_stages s on s.id=l.stage_id where l.id=$1', [lead.id])).kind, 'won');
  assert.equal((await one('select status from crm_clients where id=$1', [sale.client_id])).status, 'active');
  assert.ok((await one(`select count(*)::int n from crm_timeline where event_type='contract.verified_signed'`)).n >= 1, 'contract changes on the timeline');

  // 19–22. Non-owners and anonymous users: nothing readable, nothing writable.
  await as('authenticated', STRANGER);
  for (const t of ['crm_leads', 'crm_lead_assessments', 'crm_lead_assessment_revisions', 'crm_lead_scores', 'crm_commercial_terms', 'crm_contracts', 'crm_contract_events', 'crm_lead_recommendations'])
    assert.equal((await q(`select * from ${t}`)).length, 0, `operator reads nothing from ${t}`);
  await fails(`select crm_assessment_save($1,'hvac','general-1','{}'::jsonb)`, [lead.id], /crm_forbidden/);
  await fails(`update crm_commercial_terms set commission_pct=50 where lead_id=$1`, [lead.id], /CRM forbidden|permission|0 rows/).catch(() => {});
  const forged = await q(`update crm_commercial_terms set commission_pct=50 where lead_id=$1 returning id`, [lead.id]).catch(e => e);
  assert.ok(forged instanceof Error || forged.length === 0, 'an unauthorized user cannot modify commissions');
  await as('anon');
  for (const t of ['crm_lead_assessments', 'crm_commercial_terms', 'crm_contracts', 'crm_lead_scores'])
    await fails(`select * from ${t}`, [], /permission denied/);
  await fails(`select crm_assessment_save($1,'hvac','general-1','{}'::jsonb)`, [lead.id], /permission denied|crm_forbidden/);
  await fails(`insert into crm_contract_events(contract_id, lead_id, to_status, actor_id) values($1,$2,'verified_signed',$3)`, [c.id, lead.id, MIGUEL], /permission denied/);
  await as('authenticated', MIGUEL);
  await fails(`insert into crm_contract_events(contract_id, lead_id, to_status, actor_id) values($1,$2,'verified_signed',$3)`, [c.id, lead.id, MIGUEL], /permission denied/);
});
