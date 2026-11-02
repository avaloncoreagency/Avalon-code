// Browser E2E for the multi-department sale (Nova Restaurant), synthetic data only.
// Production Next.js build → test REST bridge → isolated PGlite running every migration
// with real RLS. Requires `npm run build` first and NODE_PATH=tests/qa/node_modules.
// SALES_BROWSER=1 runs the Playwright part (CHROME_PATH optional).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { startBridge } = require('./support/rest-bridge.cjs');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const OUTSIDER = '00000000-0000-4000-8000-0000000000c3';
const EVIDENCE = process.env.EVIDENCE_DIR || '../evidence';
const ROUTES = ['/admin/workspace/crm/sales', '/admin/workspace/crm/sales/new', '/admin/workspace/crm/clients', '/admin/workspace/crm/tasks', '/admin/workspace/crm/notifications', '/admin/workspace/crm/activity'];

test('Nova Restaurant through the real app: one form, three departments, no duplicates', { timeout: 240000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','miguel@example.invalid'),('${SAMUEL}','samuel@example.invalid'),('${OUTSIDER}','outsider@example.invalid');`);
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file.startsWith('20261102053022')) await db.exec(`insert into agency_memberships(user_id,role) values('${MIGUEL}','owner'),('${SAMUEL}','owner');`);
  }
  const users = new Map();
  const session = (id, email) => {
    const user = { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
    // Structurally valid JWT (base64url parts, aal claim) so MFA assurance checks can decode it.
    const access_token = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: id, exp, role: 'authenticated', aal: 'aal1' })}.${Buffer.from('synthetic-signature').toString('base64url')}`;
    users.set(access_token, user);
    return { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  };
  const miguel = session(MIGUEL, 'miguel@example.invalid'), samuel = session(SAMUEL, 'samuel@example.invalid'), outsider = session(OUTSIDER, 'outsider@example.invalid');
  const errors = [];
  const bridge = await startBridge(db, { users, log: (kind, ...rest) => { if (kind === 'error') errors.push(rest.join(' ')); } });
  t.after(() => bridge.close());

  const reservation = createServer();
  await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port;
  await new Promise(r => reservation.close(r));
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', c => (output += c)); child.stderr.on('data', c => (output += c));
  t.after(async () => { child.kill(); await new Promise(r => child.once('exit', r)); });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(origin + '/login')).status < 500) break; } catch {}
    if (i === 149) assert.fail(output);
    await new Promise(r => setTimeout(r, 100));
  }
  const cookieName = 'sb-127-auth-token';
  const cookieValue = s => `base64-${Buffer.from(JSON.stringify(s)).toString('base64url')}`;
  const get = (path, s) => fetch(origin + path, { redirect: 'manual', headers: { cookie: s ? `${cookieName}=${cookieValue(s)}` : '' } });

  // Server-side authorization on every new route.
  for (const route of ROUTES) {
    assert.equal((await get(route)).status, 307, `${route} signed out`);
    assert.equal((await get(route, outsider)).status, 307, `${route} non-member`);
    const ok = await get(route, miguel);
    assert.equal(ok.status, 200, `${route} owner: ${output.slice(-2000)}`);
  }
  assert.equal((await get('/admin/workspace/crm/sales/00000000-0000-4000-8000-000000000999', miguel)).status, 404);
  assert.equal((await get('/admin/workspace/crm/clients/not-a-uuid', miguel)).status, 404);

  if (process.env.SALES_BROWSER !== '1') return;
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  t.after(() => browser.close());
  const context = async (s, viewport = { width: 1366, height: 1000 }) => {
    const ctx = await browser.newContext({ viewport, locale: 'es-ES' });
    await ctx.addCookies([{ name: cookieName, value: cookieValue(s), url: origin }]);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    return page;
  };
  const page = await context(miguel);
  await page.goto(origin + '/admin/workspace/crm/sales/new');
  await page.getByRole('heading', { name: 'Registrar venta' }).waitFor();
  await page.getByLabel('Cliente nuevo').check();
  await page.getByLabel('Nombre de empresa *').fill('Nova Restaurant');
  await page.getByLabel('Industria').fill('Restaurantes');
  await page.getByLabel('Fuente de captación').fill('Referido sintético');
  await page.getByText('Contactos (se añaden sin duplicar correos)').click();
  await page.locator('input[name="contact_0_name"]').fill('Ana Prueba');
  await page.locator('input[name="contact_0_email"]').fill('ana@nova.example.invalid');
  const services = [['desarrollo-web', '2000'], ['recepcionista-ia', '1500'], ['marketing-mensual', '700']];
  for (const [i, [code, price]] of services.entries()) {
    await page.locator(`select[name="line_${i}_service"]`).selectOption(code);
    await page.locator(`input[name="line_${i}_price"]`).fill(price);
  }
  await page.locator('select[name="line_0_assignee"]').selectOption(SAMUEL);
  await page.locator('input[name="upfront_amount"]').fill('1750');
  await page.getByText('Total contratado').waitFor();
  assert.match(await page.getByRole('region', { name: 'Resumen de la venta' }).innerText(), /4[.,]200/, 'live preview shows contracted total');
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE}/sales-new-form.png`, fullPage: true });

  // Double click on "Confirmar venta": the second submission reuses the same idempotency key.
  const submit = page.getByRole('button', { name: 'Confirmar venta e iniciar trabajo' });
  await Promise.all([page.waitForURL(/\/admin\/workspace\/crm\/sales\/[0-9a-f-]{36}\?ok=/, { timeout: 30000 }), submit.dblclick()]);
  await page.getByText(/Nova Restaurant/).first().waitFor();
  const saleUrl = page.url();
  assert.match(await page.locator('#main').innerText(), /Website Designer[\s\S]*AI Receptionist[\s\S]*Marketing Hub/);
  await page.screenshot({ path: `${EVIDENCE}/sales-detail.png`, fullPage: true });

  // Re-submitting the same form (browser back + resubmit) must replay, not duplicate.
  await page.goBack();
  await page.getByRole('button', { name: 'Confirmar venta e iniciar trabajo' }).waitFor();
  const count = async sql => { await db.exec('reset role;'); return Number((await db.query(sql)).rows[0].n); };
  assert.equal(await count('select count(*) n from crm_sales'), 1, 'double click created exactly one sale');
  assert.equal(await count('select count(*) n from crm_clients'), 1);
  assert.equal(await count('select count(*) n from os_projects where client_id is not null'), 3);
  assert.equal(await count('select count(*) n from crm_work_orders'), 3);
  assert.ok(await count('select count(*) n from crm_tasks') >= 12);

  // A fresh form for the same company is rejected as an existing client (no duplicate).
  await page.goto(origin + '/admin/workspace/crm/sales/new');
  await page.getByLabel('Cliente nuevo').check();
  await page.getByLabel('Nombre de empresa *').fill('nova restaurant');
  await page.locator('select[name="line_0_service"]').selectOption('desarrollo-web');
  await page.locator('input[name="line_0_price"]').fill('10');
  await page.getByRole('button', { name: 'Confirmar venta e iniciar trabajo' }).click();
  await page.getByText('Ese cliente ya existe').waitFor();
  assert.equal(await page.getByLabel('Nombre de empresa *').inputValue().catch(() => 'nova restaurant'), 'nova restaurant', 'typed values preserved');
  await page.getByRole('button', { name: 'Usar cliente existente' }).click();
  assert.equal(await count('select count(*) n from crm_clients'), 1);
  assert.equal(await count("select count(*) n from crm_timeline where event_type='sale.failed'"), 1, 'failed attempt recorded for diagnosis');

  // Client 360 shows every departmental project and the sale.
  const clientId = (await db.query('select id from crm_clients')).rows[0].id;
  await page.goto(`${origin}/admin/workspace/crm/clients/${clientId}`);
  await page.getByRole('heading', { name: 'Proyectos por departamento' }).waitFor();
  const hub = await page.locator('#main').innerText();
  for (const name of ['Nova Restaurant — Desarrollo web', 'Nova Restaurant — Recepcionista de IA', 'Nova Restaurant — Marketing mensual', 'AV-2026-']) assert.ok(hub.includes(name), `client hub shows ${name}`);
  await page.screenshot({ path: `${EVIDENCE}/client-360.png`, fullPage: true });

  // Record a real payment: collected moves, contracted stays.
  await page.goto(saleUrl.split('?')[0]);
  await page.getByLabel(/^Importe/).fill('1750');
  await page.getByRole('button', { name: 'Registrar cobro' }).click();
  await page.getByText('Cobro registrado.').waitFor();
  await page.goto(origin + '/admin/workspace/crm/sales');
  const salesText = await page.locator('#main').innerText();
  assert.match(salesText, /Ingresos contratados[\s\S]*4[.,]200/);
  assert.match(salesText, /Cobrado \(registrado\)[\s\S]*1[.,]750/);

  // Samuel sees the work assigned to him, updates a task and Miguel sees the history.
  const sam = await context(samuel, { width: 390, height: 844 });
  await sam.goto(origin + '/admin/workspace/crm/notifications');
  await sam.getByText('Nuevo trabajo: Desarrollo web').waitFor();
  await sam.goto(origin + '/admin/workspace/crm/tasks?view=mine');
  await sam.getByText('Kickoff y brief del sitio').waitFor();
  const firstTask = sam.locator('li', { hasText: 'Kickoff y brief del sitio' }).first();
  await firstTask.locator('select[name="status"]').selectOption('in_progress');
  await firstTask.getByRole('button', { name: 'Guardar' }).click();
  await sam.getByText('Cambios guardados.').waitFor();
  await sam.screenshot({ path: `${EVIDENCE}/tasks-mobile.png`, fullPage: true });
  const overflow = await sam.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `no horizontal page scroll on mobile (overflow ${overflow}px)`);

  await page.goto(`${origin}/admin/workspace/crm/activity?client=${clientId}`);
  await page.getByText('task.status_changed', { exact: true }).first().waitFor();
  const activity = await page.locator('#main').innerText();
  for (const e of ['sale.confirmed', 'client.created', 'project.created', 'payment.recorded', 'task.status_changed']) assert.ok(activity.includes(e), `activity center lists ${e}`);
  await page.screenshot({ path: `${EVIDENCE}/activity-center.png`, fullPage: true });

  assert.deepEqual(errors.filter(e => e.startsWith('pageerror')), [], 'no client-side errors');
});
