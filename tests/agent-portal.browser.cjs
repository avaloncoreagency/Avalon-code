'use strict';
// AGENT PORTAL on SYNTHETIC data: PGlite + REST bridge + production build (`npm run build` first). Runs with
// AGENT_PORTAL_BROWSER=1. Chromium emulation — NOT physical Safari. No invitation is sent (no Edge Function runs here).
// Checks: sidebar entry «AGENT PORTAL» directly above «Configuración»; invitations and the invitation identity live in
// the portal (sender exact, BLOCKED without evidence, preview signed by the signed-in owner); Configuración has no
// agent-invitation settings; «verified» is refused without evidence; no horizontal scroll at 320–1440 px.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { spawn } = require('node:child_process'), { createServer } = require('node:http');

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const DIR = process.env.EVIDENCE_DIR || 'evidence/agent-portal';
const SIGNER = 'Owner Sintético QA';

test('AGENT PORTAL: above Configuración, owns invitations and agent management', { timeout: 420000 }, async t => {
  if (process.env.AGENT_PORTAL_BROWSER !== '1') return t.skip('AGENT_PORTAL_BROWSER=1 required');
  const { PGlite } = require('@electric-sql/pglite'), { chromium } = require('playwright');
  const { startBridge } = require('./support/rest-bridge.cjs');
  fs.mkdirSync(DIR, { recursive: true });
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2)', [OWNER, 'agent-portal-qa@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner')", [OWNER]);
  }
  await db.exec(`set request.jwt.claim.sub='${OWNER}'; set role authenticated;`);
  await db.query("insert into office_profiles(user_id,display_name,title) values($1,$2,'Cofundador')", [OWNER, SIGNER]);
  await db.exec('reset role');

  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: OWNER, email: 'agent-portal-qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
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

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  t.after(() => browser.close());
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }, { name: 'avalon-lang', value: 'es', url: origin }]);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(20000);

  // 1. Sidebar: «AGENT PORTAL» is the entry right above «Configuración».
  await page.goto(`${origin}/admin/dashboard`);
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  const hrefs = await nav.locator('a').evaluateAll(as => as.map(a => [a.getAttribute('href'), a.textContent.trim()]));
  const portal = hrefs.findIndex(([h]) => h === '/admin/staff'), settings = hrefs.findIndex(([h]) => h === '/admin/settings');
  assert.ok(portal >= 0 && settings === portal + 1, `AGENT PORTAL directly above Configuración: ${JSON.stringify(hrefs)}`);
  assert.equal(hrefs[portal][1], 'AGENT PORTAL');
  await nav.getByRole('link', { name: 'AGENT PORTAL' }).click();
  await page.waitForURL(/\/admin\/staff/);

  // 2. The portal owns invitations: invite form + invitation identity panel signed by the signed-in owner.
  await page.getByRole('heading', { level: 1, name: 'AGENT PORTAL' }).waitFor();
  const form = page.locator('form[data-agent-invite-form]');
  for (const n of ['employee_email', 'invitee_name', 'invite_job_title', 'invite_lang']) assert.equal(await form.locator(`[name="${n}"]`).count(), 1, n);
  assert.equal(await form.locator('[name="inviter_name"]').count(), 0, 'the browser never sends the inviter name');
  const identity = page.locator('section[data-agent-invite-identity]');
  assert.equal(await identity.getAttribute('data-agent-invite-identity'), 'blocked');
  const text = await identity.innerText();
  assert.match(text, /avalonacoreagency@gmail\.com/);
  assert.match(text, /BLOQUEADO: sin verificar/);
  assert.match(text, new RegExp(`${SIGNER} · Cofundador \\| Avalon Core Agency`));
  await page.frameLocator('iframe[data-preview="invite"]').getByText(`${SIGNER} te ha enviado una invitación`, { exact: false }).waitFor();
  await page.frameLocator('iframe[data-preview="invite"]').getByText('ACTIVAR MI CUENTA').waitFor();
  await page.screenshot({ path: `${DIR}/agent-portal-1440.png`, fullPage: true });
  await page.screenshot({ path: `${DIR}/agent-portal-sidebar-1440.png` });
  await page.locator('iframe[data-preview="invite"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator('iframe[data-preview="invite"]').screenshot({ path: `${DIR}/agent-portal-invite-preview.png` });
  await identity.locator('dl[data-invite-identity]').screenshot({ path: `${DIR}/agent-portal-identity.png` });

  // 3. «Verified» without evidence is refused; with evidence it is recorded (and the sender keeps the exact address).
  await identity.locator('summary', { hasText: 'Cambiar remitente' }).click();
  const sender = identity.locator('form[data-invite-sender-form]');
  await sender.locator('select[name="invite_sender_status"]').selectOption('verified');
  await sender.getByRole('button', { name: 'Guardar remitente' }).click();
  await page.waitForURL(u => u.searchParams.get('invite_sender') === 'invalid', { waitUntil: 'commit' });
  await page.locator('section[data-agent-invite-identity] [role="alert"]').waitFor();
  assert.equal((await db.query('select invite_sender_status s from avalon_company_settings')).rows[0].s, 'unverified');
  await page.locator('section[data-agent-invite-identity] summary', { hasText: 'Cambiar remitente' }).click();
  const sender2 = page.locator('form[data-invite-sender-form]');
  await sender2.locator('select[name="invite_sender_status"]').selectOption('verified');
  await sender2.locator('textarea[name="invite_sender_evidence"]').fill('Authentication-Results: spf=pass dkim=pass header.d=gmail.com (sintético QA)');
  await sender2.getByRole('button', { name: 'Guardar remitente' }).click();
  await page.waitForURL(u => u.searchParams.get('invite_sender') === 'saved', { waitUntil: 'commit' });
  await page.locator('section[data-agent-invite-identity="evidence-recorded"]').waitFor();
  const row = (await db.query('select invite_sender_email e, invite_sender_status s, updated_by u from avalon_company_settings')).rows[0];
  assert.deepEqual([row.e, row.s, row.u], ['avalonacoreagency@gmail.com', 'verified', OWNER]);

  // 4. Configuración no longer holds agent invitations; it links to AGENT PORTAL.
  await page.goto(`${origin}/admin/settings/communications`);
  // The corporate mailbox is now ALSO the client sender (AVL-COMMS-FINAL-001), so the address itself may appear here;
  // what must never appear is the invitation sender setting or its evidence form.
  assert.doesNotMatch(await page.locator('#main').innerText(), /Invitación de agente|Remitente de invitaciones|Invitation sender/);
  assert.equal(await page.locator('[name="invite_sender_email"], [name="invite_sender_evidence"]').count(), 0);
  assert.equal(await page.locator('[data-agent-portal-link] a').getAttribute('href'), '/admin/staff');

  // 5. Responsive: no horizontal page scroll; mobile evidence.
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/admin/staff`);
    await page.locator('h1').first().waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `/admin/staff overflows by ${overflow}px at ${width}px`);
    if (width === 390) await page.screenshot({ path: `${DIR}/agent-portal-390.png`, fullPage: true });
  }
  assert.deepEqual(errors, [], 'no client-side errors');
});
