'use strict';
// AVALON-CLAUDE-CAX-OMEGA-001 end to end on SYNTHETIC data: PGlite + REST bridge + production build (`npm run build` first).
// Runs with CLIENT_EXPERIENCE_BROWSER=1. Chromium emulation — NOT physical Safari/iOS.
// Flow: confirmed sale → "Iniciar onboarding" → product/invoice/URL → checklist → PDF manual (private, hash-verified) →
// welcome e-mail prepared and previewed → automatic sending BLOCKED without SMTP → manual send recorded with evidence →
// delivery gate lists blockers → Clients 360 panel → Settings (client SMTP BLOCKED, no agent invites there) → no horizontal scroll at
// 320 / 375 / 390 / 430 / 768 / 1440 px. No e-mail is sent and no external service is called.
// Agent invitations are covered by tests/agent-portal-invitations.test.cjs (rendered panel) — they belong to AGENT PORTAL.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { spawn } = require('node:child_process'), { createServer } = require('node:http');
const verifiedContract = require('./helpers/verified-contract.cjs');

const OWNER = '00000000-0000-4000-8000-0000000000f1';
const DIR = process.env.EVIDENCE_DIR || 'evidence/client-experience';
const COMPANY = 'Cafetería Sintética QA';
const SIGNER = 'Owner Sintético QA';

test('Client experience: onboarding → manual → welcome e-mail → Clients 360 → settings, responsive', { timeout: 480000 }, async t => {
  if (process.env.CLIENT_EXPERIENCE_BROWSER !== '1') return t.skip('CLIENT_EXPERIENCE_BROWSER=1 required');
  const { PGlite } = require('@electric-sql/pglite'), { chromium } = require('playwright');
  const { startBridge } = require('./support/rest-bridge.cjs');
  fs.mkdirSync(DIR, { recursive: true });
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2)', [OWNER, 'client-experience-qa@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner')", [OWNER]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [OWNER]);
  await db.exec(`set request.jwt.claim.sub='${OWNER}'; set role authenticated;`);
  await db.query("insert into office_profiles(user_id,display_name,title) values($1,$2,'Cofundador')", [OWNER, SIGNER]); // own profile only
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const client = (await one("insert into crm_clients(legal_name,trade_name,source,owner_id) values($1,$1,'Manual',$2) returning id", [COMPANY, OWNER])).id;
  await db.query("insert into crm_contacts(client_id,full_name,email,is_primary) values($1,'Laura QA','laura.qa@example.invalid',true)", [client]);
  const lead = (await one('select public.crm_ensure_client_opportunity($1) id', [client])).id;
  await verifiedContract(db, lead);
  const sale = (await one('select public.crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: '95000000-0000-4000-8000-000000000001', client_id: client, lead_id: lead, seller_id: OWNER,
    lines: [{ service_code: 'desarrollo-web', unit_price: '900.00' }] })])).r;
  const invoice = (await one('select crm_invoice_record($1::jsonb) r', [JSON.stringify({ sale_id: sale.sale_id, number: 'QA-FAC-0001', amount: '900.00' })])).r.invoice_id;
  await db.exec('reset role');

  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: OWNER, email: 'client-experience-qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
  const access_token = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: OWNER, exp, role: 'authenticated', aal: 'aal1' }) + '.' + enc('synthetic');
  const session = { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  const bridge = await startBridge(db, { users: new Map([[access_token, user]]) }); t.after(() => bridge.close());
  const reservation = createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const origin = 'http://localhost:' + port;
  const env = { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key', AVALON_RADAR_EXTERNAL_ENABLED: 'false' };
  for (const k of Object.keys(env)) if (k.startsWith('AVALON_SMTP_')) delete env[k]; // no transport: nothing can be sent
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '-p', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', b => log += b); child.stderr.on('data', b => log += b);
  t.after(() => require('./support/stop-child.cjs')(child));
  for (let i = 0; i < 150; i++) { try { if ((await fetch(origin + '/login')).status < 500) break; } catch {} if (i === 149) assert.fail(log); await new Promise(r => setTimeout(r, 100)); }

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  t.after(() => browser.close());
  const cookie = { name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addCookies([cookie, { name: 'avalon-lang', value: 'es', url: origin }]);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(20000);

  // 1. The confirmed sale is eligible; starting onboarding is idempotent per sale.
  await page.goto(`${origin}/admin/workspace/crm/onboarding`);
  const eligible = page.locator('[data-eligible-sale]');
  await eligible.first().waitFor();
  await eligible.first().getByRole('button', { name: 'Iniciar onboarding' }).click();
  await page.waitForURL(/\/crm\/onboarding\/[0-9a-f-]{36}/);
  const onboardingId = page.url().match(/onboarding\/([0-9a-f-]{36})/)[1];
  assert.equal(await page.locator('[data-onboarding-stage]').getAttribute('data-onboarding-stage'), 'preparation');
  const row = await one('select client_id, sale_id from crm_client_onboardings where id=$1', [onboardingId]);
  assert.deepEqual([row.client_id, row.sale_id], [client, sale.sale_id], 'onboarding hangs off crm_clients.id and the sale');

  // 2. Product, issued invoice and the real https URL.
  const details = page.locator('form').filter({ has: page.locator('input[name="live_url"]') });
  await details.locator('select[name="project_id"]').selectOption({ index: 1 });
  await details.locator('select[name="invoice_id"]').selectOption(invoice);
  await details.locator('input[name="live_url"]').fill('https://cafeteria-qa.example.invalid');
  await details.getByRole('button', { name: 'Guardar' }).click();
  await page.waitForURL(u => u.searchParams.get('ok') === 'saved'); // the reloaded page carries the new optimistic version
  assert.equal((await one('select invoice_id from crm_client_onboardings where id=$1', [onboardingId])).invoice_id, invoice);

  // 3. Checklist item toggled and persisted.
  const firstItem = page.locator('[data-checklist]').first();
  const key = await firstItem.getAttribute('data-checklist');
  await firstItem.getByRole('button', { name: 'Marcar hecho' }).click();
  await page.locator(`[data-checklist="${key}"][data-done="1"]`).waitFor()
    .catch(async e => { throw new Error(`checklist not saved: ${page.url()} ${await page.locator('[role="alert"]').allInnerTexts()}`, { cause: e }); });

  // 4. PDF manual: generated from real data, downloadable only by an owner and only under its onboarding.
  await page.getByRole('button', { name: 'Generar manual PDF' }).click();
  await page.locator('[data-document="issued"]').waitFor();
  const doc = await one("select id, sha256 from crm_client_documents where onboarding_id=$1 and status='issued'", [onboardingId]);
  const pdf = await page.request.get(`${origin}/admin/workspace/crm/onboarding/${onboardingId}/documents/${doc.id}`);
  assert.equal(pdf.status(), 200);
  assert.match(pdf.headers()['content-type'], /application\/pdf/);
  assert.match(pdf.headers()['cache-control'] ?? '', /no-store/);
  const bytes = await pdf.body();
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), doc.sha256, 'downloaded bytes match the stored hash');
  assert.match(bytes.toString('latin1'), /https:\/\/cafeteria-qa\.example\.invalid/);
  const foreign = await page.request.get(`${origin}/admin/workspace/crm/onboarding/00000000-0000-4000-8000-00000000dead/documents/${doc.id}`);
  assert.equal(foreign.status(), 404, 'a document is never served under another onboarding');
  const anonymous = await (await browser.newContext()).request.get(`${origin}/admin/workspace/crm/onboarding/${onboardingId}/documents/${doc.id}`, { maxRedirects: 0 });
  assert.notEqual(anonymous.status(), 200, 'no public PDF');

  // 5. Welcome e-mail: prepared with real data and the signed-in owner's signature; automatic sending is BLOCKED.
  await page.locator('[data-transport="blocked"]').waitFor();
  const prep = page.locator('form').filter({ has: page.getByRole('button', { name: 'Preparar mensaje' }) });
  await prep.locator('select[name="kind"]').selectOption('client_welcome');
  await prep.getByRole('button', { name: 'Preparar mensaje' }).click();
  await page.locator('[data-outbox="prepared"]').waitFor();
  const msg = await one('select id, subject, body_html, to_email, attachments, status from crm_email_outbox where onboarding_id=$1', [onboardingId]);
  assert.equal(msg.subject, 'Bienvenido a Avalon Core Agency — Comencemos tu proyecto');
  assert.equal(msg.to_email, 'laura.qa@example.invalid');
  assert.match(msg.body_html, new RegExp(SIGNER));
  assert.match(msg.body_html, /avalonagencymh@gmail\.com/);
  assert.ok(!/Teléfono/.test(msg.body_html), 'no phone without an approved business number');
  assert.equal(await page.locator('[data-outbox="prepared"]').getByRole('button', { name: 'Aprobar y enviar' }).isDisabled(), true);
  // Refresh / second click does not duplicate the same message.
  await prep.getByRole('button', { name: 'Preparar mensaje' }).click();
  await page.locator('[data-outbox="prepared"]').waitFor();
  assert.equal(Number((await one('select count(*) n from crm_email_outbox where onboarding_id=$1', [onboardingId])).n), 1);
  await page.screenshot({ path: `${DIR}/onboarding-1440.png`, fullPage: true });
  // Manual send from Gmail recorded with evidence (never "sent" without it).
  const manual = page.locator('[data-outbox="prepared"] form').filter({ has: page.getByRole('button', { name: 'Registrar envío manual' }) });
  await manual.locator('input[name="evidence"]').fill('Gmail message-id <qa-synthetic-0001@example.invalid>');
  await manual.getByRole('button', { name: 'Registrar envío manual' }).click();
  await page.locator('[data-outbox="sent"]').waitFor();
  const sent = await one('select status, provider, provider_message_id from crm_email_outbox where id=$1', [msg.id]);
  assert.deepEqual([sent.status, sent.provider], ['sent', 'manual']);
  assert.match(sent.provider_message_id, /qa-synthetic-0001/);

  // 6. Delivery gate: cannot be recorded while blockers remain.
  const gate = await page.locator('#delivery').getAttribute('data-delivery-blockers');
  for (const b of ['checklist_incomplete', 'qa_not_passed', 'contract_missing']) assert.ok(gate.includes(b), `${b} listed: ${gate}`);
  assert.equal(await page.getByRole('button', { name: 'Registrar entrega' }).isDisabled(), true);

  // 7. Clients 360 shows onboarding, manual and communications for the same crm_clients.id.
  await page.goto(`${origin}/admin/workspace/crm/clients/${client}`);
  const panel = page.locator('[data-client-experience="ready"]');
  await panel.waitFor();
  await panel.locator('[data-client-onboarding]').first().waitFor();
  assert.match(await panel.innerText(), /Bienvenido a Avalon Core Agency/);
  await page.screenshot({ path: `${DIR}/client-360-1440.png`, fullPage: true });

  // 8. Settings holds client communications only; agent invitations live in AGENT PORTAL (never in Configuración).
  await page.goto(`${origin}/admin/settings/communications`);
  const status = await page.locator('section[aria-labelledby="status"]').innerText();
  assert.match(status, /BLOQUEADO: SMTP sin configurar/);
  assert.doesNotMatch(await page.locator('#main').innerText(), /avalonacoreagency@gmail\.com|Invitación de agente/, 'no agent invitation settings in Configuración');
  assert.equal(await page.locator('iframe[data-preview="invite"]').count(), 0);
  assert.equal(await page.locator('[data-agent-portal-link] a').getAttribute('href'), '/admin/staff', 'the Agent Portal ships in this branch');
  assert.match(await page.locator('[data-agent-portal-link]').innerText(), /AGENT PORTAL/);
  assert.equal(await page.locator('input[name="support_phone"]').inputValue(), '', 'phone stays pending');
  assert.equal(await page.locator('input[name="invite_sender_email"]').count(), 0);
  await page.frameLocator('iframe[data-preview="welcome"]').getByText('Hola, Nombre del cliente', { exact: false }).first().waitFor();
  await page.screenshot({ path: `${DIR}/settings-1440.png`, fullPage: true });
  // Saving support details works and is signed by the owner; the invitation sender is untouched.
  await page.locator('input[name="support_hours"]').fill('Lunes a viernes 9:00–17:00 (QA)');
  await page.locator('form[data-company-settings]').getByRole('button', { name: 'Guardar' }).click();
  await page.waitForURL(u => u.searchParams.get('ok') === 'settings', { waitUntil: 'commit' });
  const cfg = await one('select support_hours, updated_by, invite_sender_email, invite_sender_status from avalon_company_settings');
  assert.deepEqual([cfg.support_hours, cfg.updated_by, cfg.invite_sender_email, cfg.invite_sender_status], ['Lunes a viernes 9:00–17:00 (QA)', OWNER, 'avalonacoreagency@gmail.com', 'unverified']);

  // 9. Responsive: no horizontal page scroll.
  const pages = [`/admin/workspace/crm/onboarding`, `/admin/workspace/crm/onboarding/${onboardingId}`, `/admin/workspace/crm/clients/${client}`, `/admin/settings/communications`];
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const p of pages) {
      await page.goto(origin + p);
      await page.waitForLoadState('load'); await page.locator('h1').first().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${p} overflows by ${overflow}px at ${width}px`);
    }
    if (width === 390) await page.screenshot({ path: `${DIR}/onboarding-390.png`, fullPage: true });
  }
  assert.deepEqual(errors, [], 'no client-side errors');
});

// Production today does NOT have migration 20261124140000: every new page must render (no HTTP 500) and say so.
test('Client experience pages degrade honestly before migration 20261124140000', { timeout: 300000 }, async t => {
  if (process.env.CLIENT_EXPERIENCE_BROWSER !== '1') return t.skip('CLIENT_EXPERIENCE_BROWSER=1 required');
  const { PGlite } = require('@electric-sql/pglite'), { startBridge } = require('./support/rest-bridge.cjs');
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2)', [OWNER, 'client-experience-qa@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && !f.startsWith('20261124140000')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner')", [OWNER]);
  }
  await db.exec(`set request.jwt.claim.sub='${OWNER}'; set role authenticated;`);
  const client = (await db.query("insert into crm_clients(legal_name,trade_name,source,owner_id) values('Cliente Pre QA','Cliente Pre QA','Manual',$1) returning id", [OWNER])).rows[0].id;
  await db.exec('reset role');
  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: OWNER, email: 'client-experience-qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
  const access_token = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: OWNER, exp, role: 'authenticated', aal: 'aal1' }) + '.' + enc('synthetic');
  const session = { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  const bridge = await startBridge(db, { users: new Map([[access_token, user]]) }); t.after(() => bridge.close());
  const reservation = createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const origin = 'http://localhost:' + port;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key', AVALON_RADAR_EXTERNAL_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', b => log += b); child.stderr.on('data', b => log += b);
  t.after(() => require('./support/stop-child.cjs')(child));
  for (let i = 0; i < 150; i++) { try { if ((await fetch(origin + '/login')).status < 500) break; } catch {} if (i === 149) assert.fail(log); await new Promise(r => setTimeout(r, 100)); }
  const cookie = 'sb-127-auth-token=base64-' + Buffer.from(JSON.stringify(session)).toString('base64url') + '; avalon-lang=es';
  for (const [path, text] of [['/admin/workspace/crm/onboarding', /migración 20261124140000/], [`/admin/workspace/crm/onboarding/00000000-0000-4000-8000-000000000001`, /migración 20261124140000/],
    [`/admin/workspace/crm/clients/${client}`, /Requiere la migración 20261124140000/], ['/admin/settings/communications', /Migración 20261124140000 pendiente/]]) {
    const r = await fetch(origin + path, { headers: { cookie }, redirect: 'manual' });
    const body = await r.text();
    assert.equal(r.status, 200, `${path} → ${r.status}`);
    assert.match(body, text, path);
  }
});
