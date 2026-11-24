// AVALON-CLAUDE-CAX-OMEGA-001: onboarding, manuals, outbox, testimonial consents and corporate settings.
// Real PostgreSQL (PGlite) with the full migration chain. Synthetic records ONLY — never production data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const verifiedContract = require('./helpers/verified-contract.cjs');

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const SECOND = '00000000-0000-4000-8000-0000000000b2';
const AGENT = '00000000-0000-4000-8000-0000000000c3';
const HASH = 'a'.repeat(64);

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)', [OWNER, 'o@example.invalid', SECOND, 's@example.invalid', AGENT, 'a@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships values($1,'owner'),($2,'owner'),($3,'operator')", [OWNER, SECOND, AGENT]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [OWNER]);
  const as = u => db.exec(`reset role; set request.jwt.claim.sub='${u}'; set role authenticated;`);
  const anon = () => db.exec("reset role; set request.jwt.claim.sub=''; set role anon;");
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const n = async (q, p) => Number((await one(q, p)).n);
  await as(OWNER);
  return { db, as, anon, one, n };
}

/** Synthetic client → verified contract → confirmed sale (creates its product) → issued invoice. */
async function sale(db, one, name, key) {
  const c = await one("insert into crm_clients(legal_name,trade_name,source,owner_id) values($1,$1,'Manual',$2) returning id", [name, OWNER]);
  const lead = (await one('select public.crm_ensure_client_opportunity($1) id', [c.id])).id;
  await verifiedContract(db, lead);
  const s = (await one('select public.crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: key, client_id: c.id, lead_id: lead, seller_id: OWNER,
    lines: [{ service_code: 'desarrollo-web', unit_price: '900.00' }] })])).r;
  const project = await one('select id from os_projects where client_id=$1 limit 1', [c.id]);
  const inv = (await one('select crm_invoice_record($1::jsonb) r', [JSON.stringify({ sale_id: s.sale_id, number: 'QA-' + key.slice(-4), amount: '900.00' })])).r;
  return { client: c.id, sale: s.sale_id, project: project?.id ?? null, invoice: inv.invoice_id };
}

test('corporate settings: defaults, no invented phone, owners only, verified needs evidence', { timeout: 240000 }, async t => {
  const { db, as, anon, one, n } = await setup();
  t.after(() => db.close());
  const row = await one('select * from avalon_company_settings');
  assert.equal(row.support_email, 'avalonagencymh@gmail.com');
  assert.equal(row.invite_sender_email, 'avalonacoreagency@gmail.com');
  assert.equal(row.invite_sender_status, 'unverified');
  assert.equal(row.support_phone, null);
  assert.equal(row.support_phone_approved, false);
  await assert.rejects(db.query("update avalon_company_settings set support_phone_approved=true, updated_by=$1 where id=1", [OWNER]), /check constraint/);
  await assert.rejects(db.query("update avalon_company_settings set invite_sender_status='verified', invite_sender_evidence='ok', updated_by=$1 where id=1", [OWNER]), /check constraint/);
  await assert.rejects(db.query("update avalon_company_settings set support_hours='x', updated_by=$1 where id=1", [SECOND]), /row-level security/, 'cannot sign as another owner');
  await db.query("update avalon_company_settings set support_hours='L-V 9-17', updated_by=$1 where id=1", [OWNER]);
  await assert.rejects(db.query('insert into avalon_company_settings(id) values(2)'), /permission denied|check constraint/);
  await as(AGENT);
  assert.equal(await n('select count(*) n from avalon_company_settings'), 0, 'agents cannot read corporate settings');
  assert.equal((await db.query("update avalon_company_settings set support_hours='hack', updated_by=$1 where id=1 returning id", [AGENT])).rows.length, 0);
  await anon();
  await assert.rejects(db.query('select * from avalon_company_settings'), /permission denied/);
  await as(OWNER);
  assert.equal((await one('select support_hours from avalon_company_settings')).support_hours, 'L-V 9-17');
});

test('onboarding: one per sale, same-client invoice/project only, delivered needs QA + approver + URL, audited', { timeout: 240000 }, async t => {
  const { db, as, anon, one, n } = await setup();
  t.after(() => db.close());
  const a = await sale(db, one, 'Cafe Sintetico QA', '91000000-0000-4000-8000-000000000001');
  const b = await sale(db, one, 'Barberia Sintetica QA', '91000000-0000-4000-8000-000000000002');
  const ins = (over = {}) => db.query(`insert into crm_client_onboardings(client_id,sale_id,project_id,product_type,title,invoice_id)
    values($1,$2,$3,'website','Sitio web QA',$4) returning id, version`, [over.client ?? a.client, over.sale ?? a.sale, over.project ?? a.project, over.invoice ?? null]);
  await assert.rejects(ins({ sale: b.sale }), /onboarding_sale_other_client/);
  await assert.rejects(ins({ invoice: b.invoice }), /onboarding_invoice_other_client/);
  if (b.project) await assert.rejects(ins({ project: b.project }), /onboarding_project_other_client/);
  const ob = (await ins({ invoice: a.invoice })).rows[0];
  await assert.rejects(ins(), /duplicate key|unique/, 'one onboarding per sale');
  assert.equal(await n("select count(*) n from crm_timeline where entity='crm_client_onboardings' and event_type='onboarding.started'"), 1);
  // Stage changes bump the version and are audited.
  const v2 = await one("update crm_client_onboardings set stage='data_pending' where id=$1 returning version", [ob.id]);
  assert.equal(v2.version, 2);
  assert.equal(await n("select count(*) n from crm_timeline where entity='crm_client_onboardings' and event_type='onboarding.stage'"), 1);
  await assert.rejects(db.query('update crm_client_onboardings set client_id=$2 where id=$1', [ob.id, b.client]), /onboarding_client_locked|onboarding_sale_other_client/);
  await assert.rejects(db.query("update crm_client_onboardings set live_url='http://insecure.example' where id=$1", [ob.id]), /check constraint/);
  // "Delivered" never without evidence.
  await assert.rejects(db.query("update crm_client_onboardings set stage='delivered' where id=$1", [ob.id]), /check constraint/);
  await assert.rejects(db.query("update crm_client_onboardings set stage='delivered', delivered_at=now(), delivered_to='Laura' where id=$1", [ob.id]), /check constraint/);
  await db.query("update crm_client_onboardings set stage='delivered', qa_passed=true, live_url='https://cafe.example.invalid', delivery_approved_by=$2, delivered_at=now(), delivered_to='Laura QA' where id=$1", [ob.id, OWNER]);
  await assert.rejects(db.query("update crm_client_onboardings set delivered_at=now() + interval '1 day' where id=$1", [ob.id]), /onboarding_delivery_immutable/);
  // A voided invoice can never be attached.
  const c = await sale(db, one, 'Tienda Sintetica QA', '91000000-0000-4000-8000-000000000003');
  await db.query("select crm_invoice_void($1, 'error de captura sintetico')", [c.invoice]);
  await assert.rejects(ins({ client: c.client, sale: c.sale, project: c.project, invoice: c.invoice }), /onboarding_invoice_not_issued/);
  // Second owner sees it; an agent (operator) and anon see nothing and cannot write.
  await as(SECOND);
  assert.equal(await n('select count(*) n from crm_client_onboardings'), 1);
  await assert.rejects(ins({ client: c.client, sale: c.sale, project: c.project, invoice: c.invoice }), /onboarding_invoice_other_client/, 'a non-finance owner cannot attach an invoice it cannot see');
  await as(AGENT);
  assert.equal(await n('select count(*) n from crm_client_onboardings'), 0);
  await assert.rejects(db.query("insert into crm_client_onboardings(client_id,product_type,title) values($1,'website','Intento agente')", [a.client]), /row-level security/);
  await anon();
  await assert.rejects(db.query('select * from crm_client_onboardings'), /permission denied/);
});

test('manual documents are immutable (only issued → superseded) and private to owners', { timeout: 240000 }, async t => {
  const { db, as, anon, one, n } = await setup();
  t.after(() => db.close());
  const a = await sale(db, one, 'Cafe Sintetico QA', '92000000-0000-4000-8000-000000000001');
  const doc = (v, over = {}) => db.query(`insert into crm_client_documents(client_id,project_id,kind,product_type,version,title,generator,snapshot,sha256,created_by)
    values($1,$2,'manual','website',$3,'Manual QA','avalon-manual-1','{"schemaVersion":1}'::jsonb,$4,$5) returning id`, [a.client, a.project, v, over.sha ?? HASH, over.by ?? OWNER]);
  await assert.rejects(doc(1, { by: SECOND }), /row-level security/, 'cannot create a document in another owner\'s name');
  await assert.rejects(doc(1, { sha: 'nothex' }), /check constraint/);
  const d1 = (await doc(1)).rows[0];
  await assert.rejects(doc(1), /duplicate key|unique/, 'versions never collide');
  await assert.rejects(db.query("update crm_client_documents set snapshot='{\"x\":1}'::jsonb where id=$1", [d1.id]), /document_immutable/);
  await assert.rejects(db.query("update crm_client_documents set sha256=$2 where id=$1", [d1.id, 'b'.repeat(64)]), /document_immutable/);
  await assert.rejects(db.query('delete from crm_client_documents where id=$1', [d1.id]), /document_immutable|permission denied/);
  await doc(2);
  await db.query("update crm_client_documents set status='superseded' where id=$1", [d1.id]);
  await assert.rejects(db.query("update crm_client_documents set status='issued' where id=$1", [d1.id]), /document_immutable/);
  assert.equal(await n("select count(*) n from crm_client_documents where status='issued'"), 1);
  await as(AGENT);
  assert.equal(await n('select count(*) n from crm_client_documents'), 0, 'another user cannot see client PDFs');
  await anon();
  await assert.rejects(db.query('select * from crm_client_documents'), /permission denied/);
});

test('e-mail outbox: idempotent, content frozen after preparation, "sent" requires provider evidence', { timeout: 240000 }, async t => {
  const { db, as, anon, one, n } = await setup();
  t.after(() => db.close());
  const a = await sale(db, one, 'Cafe Sintetico QA', '93000000-0000-4000-8000-000000000001');
  const prep = key => db.query(`insert into crm_email_outbox(idempotency_key,kind,client_id,to_email,to_name,from_email,reply_to,subject,body_html,body_text,lang)
    values($1,'client_welcome',$2,'laura@example.invalid','Laura','avalonagencymh@gmail.com','avalonagencymh@gmail.com','Bienvenido a Avalon Core Agency',
    '<p>Hola Laura, bienvenida a Avalon.</p>','Hola Laura, bienvenida a Avalon.','es') returning id`, [key, a.client]);
  const m = (await prep('client_welcome:qa:0001')).rows[0];
  await assert.rejects(prep('client_welcome:qa:0001'), /duplicate key|unique/, 'double click / refresh does not duplicate');
  assert.equal(await n('select count(*) n from crm_email_outbox'), 1);
  await assert.rejects(db.query("update crm_email_outbox set to_email='other@example.invalid' where id=$1", [m.id]), /outbox_content_frozen/);
  await assert.rejects(db.query("update crm_email_outbox set body_html='<p>texto cambiado despues de aprobar</p>' where id=$1", [m.id]), /outbox_content_frozen/);
  await assert.rejects(db.query("update crm_email_outbox set status='approved' where id=$1", [m.id]), /check constraint/, 'approval needs an approver');
  await db.query("update crm_email_outbox set status='approved', approved_by=$2, approved_at=now() where id=$1", [m.id, OWNER]);
  await assert.rejects(db.query("update crm_email_outbox set status='sent', sent_at=now() where id=$1", [m.id]), /check constraint/, 'no "sent" without provider message id');
  await db.query("update crm_email_outbox set status='blocked_no_transport', attempts=1 where id=$1", [m.id]);
  await db.query("update crm_email_outbox set status='approved' where id=$1", [m.id]);
  await db.query("update crm_email_outbox set status='sent', sent_at=now(), provider='smtp', provider_message_id='<qa-1@example.invalid>', attempts=2 where id=$1", [m.id]);
  await assert.rejects(db.query("update crm_email_outbox set status='failed' where id=$1", [m.id]), /outbox_final/);
  await assert.rejects(db.query('delete from crm_email_outbox where id=$1', [m.id]), /outbox_immutable|permission denied/);
  assert.ok(await n("select count(*) n from crm_timeline where entity='crm_email_outbox'") >= 4, 'every status change is audited');
  await as(AGENT);
  assert.equal(await n('select count(*) n from crm_email_outbox'), 0);
  await anon();
  await assert.rejects(db.query('select * from crm_email_outbox'), /permission denied/);
});

test('testimonial consents: nothing preselected, explicit evidence, results need substantiation, revocation is final', { timeout: 240000 }, async t => {
  const { db, as, one, n } = await setup();
  t.after(() => db.close());
  const a = await sale(db, one, 'Cafe Sintetico QA', '94000000-0000-4000-8000-000000000001');
  const req = async () => (await one("insert into crm_testimonial_consents(client_id,signer_name) values($1,'Laura QA') returning id, scopes, channels, status", [a.client]));
  const r = await req();
  assert.deepEqual([r.status, r.scopes, r.channels], ['requested', [], []], 'no scope or channel is preselected');
  await assert.rejects(db.query("update crm_testimonial_consents set status='granted', granted_at=now(), evidence='Correo firmado del cliente' where id=$1", [r.id]), /check constraint/);
  await assert.rejects(db.query("update crm_testimonial_consents set status='granted', granted_at=now(), scopes='{testimonial}', channels='{website}', evidence='Correo firmado del cliente' where id=$1", [r.id]), /check constraint/, 'testimonial needs approved text');
  await assert.rejects(db.query("update crm_testimonial_consents set status='granted', granted_at=now(), scopes='{results}', channels='{ads}', evidence='Correo firmado del cliente' where id=$1", [r.id]), /check constraint/, 'results need substantiation');
  await assert.rejects(db.query("update crm_testimonial_consents set scopes='{fake_scope}' where id=$1", [r.id]), /check constraint/);
  await db.query("update crm_testimonial_consents set status='granted', granted_at=now(), scopes='{name,testimonial}', channels='{website}', approved_text='Avalon entregó nuestro sitio a tiempo.', evidence='Correo firmado del cliente 2026-11-24' where id=$1", [r.id]);
  await assert.rejects(db.query("update crm_testimonial_consents set channels='{website,ads}' where id=$1", [r.id]), /consent_granted_frozen/, 'a grant cannot be widened silently');
  await assert.rejects(db.query("update crm_testimonial_consents set status='revoked', revoked_at=now() where id=$1", [r.id]), /check constraint/);
  await db.query("update crm_testimonial_consents set status='revoked', revoked_at=now(), revoke_reason='Cliente lo solicitó' where id=$1", [r.id]);
  await assert.rejects(db.query("update crm_testimonial_consents set status='granted' where id=$1", [r.id]), /consent_final/);
  await assert.rejects(db.query('delete from crm_testimonial_consents where id=$1', [r.id]), /consent_history_kept|permission denied/);
  await as(AGENT);
  assert.equal(await n('select count(*) n from crm_testimonial_consents'), 0);
});

test('outbox lifecycle kinds (migration 20261124190000): new kinds accepted, unknown kinds refused, rules unchanged', { timeout: 240000 }, async t => {
  const { db, one } = await setup();
  t.after(() => db.close());
  const a = await sale(db, one, 'Cafe Sintetico QA', '96000000-0000-4000-8000-000000000001');
  const ins = (key, kind) => db.query(`insert into crm_email_outbox(idempotency_key,kind,client_id,to_email,from_email,reply_to,subject,body_html,body_text,lang)
    values($1,$2,$3,'laura@example.invalid','avalonagencymh@gmail.com','avalonagencymh@gmail.com','Asunto QA','<p>Hola Laura, contenido QA.</p>','Hola Laura, contenido QA.','es') returning id`, [key, kind, a.client]);
  for (const k of ['onboarding_confirmation', 'progress_update', 'delivery_notice', 'support_info', 'renewal_review']) await ins(`${k}:qa:0001`, k);
  await assert.rejects(ins('mass_marketing:qa:0001', 'mass_marketing'), /crm_email_outbox_kind_check/);
  const m = (await ins('progress_update:qa:0002', 'progress_update')).rows[0];
  await assert.rejects(db.query("update crm_email_outbox set status='sent', sent_at=now() where id=$1", [m.id]), /check constraint/, 'still no "sent" without approval and message id');
});
