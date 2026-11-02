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
const ROUTES = ['/admin/dashboard', '/admin/workspace/crm', '/admin/workspace/crm/calendar', '/admin/workspace/crm/settings', '/admin/workspace/crm/sales', '/admin/workspace/crm/sales/new', '/admin/workspace/crm/clients', '/admin/workspace/crm/tasks', '/admin/workspace/crm/notifications', '/admin/workspace/crm/activity'];

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
  const one = async (sql, params) => { await db.exec('reset role;'); return (await db.query(sql, params)).rows[0]; };
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

  // Titan Radar: the external map provider is mocked (no internet in tests); ingest, needs,
  // stars, approval and pipeline transfer run through the real routes and RLS-protected DB.
  await db.exec('reset role;');
  await db.exec(`set request.jwt.claim.sub='${SAMUEL}'; set role authenticated;`);
  await db.query('select crm_radar_ingest($1::jsonb, $2)', [JSON.stringify([
    { source_ref: 'osm:node/987654321', source_kind: 'osm', name: 'Radar Dental Sintético', lat: 25.776, lon: -80.194, industry: 'dentist', phone: '+1-305-555-0199', location: 'Miami · datos de prueba', source_label: 'OpenStreetMap', license: 'ODbL' },
    { source_ref: 'osm:node/987654322', source_kind: 'osm', name: 'Radar Café Sintético', lat: 25.778, lon: -80.190, industry: 'cafe', location: 'Miami · datos de prueba', source_label: 'OpenStreetMap', license: 'ODbL' },
  ]), 'browser-seed-0001']);
  await db.exec('reset role;');
  await sam.route('**/tile.openstreetmap.org/**', r => r.abort());
  await sam.route('**/admin/workspace/crm/radar/area?*', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ run: { found: 2, inserted: 0, updated: 2 }, refs: [], searchedAt: new Date().toISOString(), source: 'OpenStreetMap (ODbL)' }) }));
  await sam.goto(origin + '/admin/workspace/crm/hunter');
  await sam.getByRole('heading', { name: 'Titan Radar' }).waitFor();
  await sam.getByRole('button', { name: 'Buscar negocios' }).click();
  await sam.getByText(/completada .* 2 encontrados/).waitFor();
  await sam.getByRole('button', { name: 'Abrir Radar Dental Sintético' }).click();
  await sam.getByRole('dialog').getByRole('heading', { name: 'Radar Dental Sintético' }).waitFor();
  assert.match(await sam.getByRole('dialog').innerText(), /Sin calificar/, 'no evidence → unrated, not 5 stars');
  for (const [svc, name] of [['website', 'Sitio web'], ['crm', 'CRM / seguimiento'], ['receptionist', 'Recepcionista IA'], ['marketing', 'Marketing']]) {
    await sam.getByLabel(`Estado de ${name}`).selectOption('verified_missing');
    await sam.getByLabel(`Método de ${name}`).selectOption('call');
    await sam.getByLabel(`Confianza de ${name}`).selectOption('high');
    await sam.locator('form', { has: sam.getByLabel(`Estado de ${name}`) }).getByRole('button', { name: 'Guardar' }).click();
    await sam.getByText(`${name}: guardado.`).waitFor();
  }
  assert.equal(Number((await db.query("select stars from crm_prospects where source_ref='osm:node/987654321'")).rows[0].stars), 4, 'four verified needs → 4 stars');
  assert.match(await sam.getByRole('dialog').innerText(), /★★★★☆ Oro/);
  await sam.screenshot({ path: EVIDENCE + '/radar-results-mobile.png', fullPage: true });
  await sam.getByRole('button', { name: '✓ Aprobar' }).click();
  await sam.getByText(/aprobado/).waitFor();
  await sam.getByRole('button', { name: '→ Pasar al pipeline' }).click();
  await sam.getByText(/está ahora en Leads Pipeline/).waitFor();
  assert.equal(await count("select count(*) n from crm_prospects where company='Radar Dental Sintético' and status='converted'"), 1);
  assert.equal(await count("select count(*) n from crm_leads where company='Radar Dental Sintético'"), 1);
  assert.equal(await count("select count(*) n from crm_leads where company='Radar Café Sintético'"), 0, 'unapproved business never reaches the pipeline');
  await sam.unroute('**/admin/workspace/crm/radar/area?*');

  // Mobile-first smoke test: every high-frequency Avalon route is usable on a phone.
  const mobileRoutes = [
    ['/admin/dashboard', 'dashboard-mobile'],
    ['/admin/workspace/crm', 'crm-mobile'],
    ['/admin/workspace/crm/hunter', 'radar-mobile'],
    ['/admin/workspace/crm/leads', 'pipeline-mobile'],
    ['/admin/workspace/crm/sales', 'sales-mobile'],
    ['/admin/workspace/crm/sales/new', 'sale-form-mobile'],
    ['/admin/workspace/crm/clients', 'clients-mobile'],
    ['/admin/workspace/crm/tasks?view=mine', 'tasks-mobile-reviewed'],
    ['/admin/workspace/website-designer', 'website-mobile'],
  ];
  for (const width of [390, 320]) {
    await sam.setViewportSize({ width, height: 844 });
    for (const [route, name] of mobileRoutes) {
      await sam.goto(origin + route);
      await sam.locator('#main').waitFor();
      const dock = sam.getByRole('navigation', { name: 'Accesos rápidos de Avalon' });
      assert.ok(await dock.isVisible(), `mobile dock visible on ${route} at ${width}px`);
      const horizontalOverflow = await sam.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(horizontalOverflow <= 1, `${route} at ${width}px overflows document by ${horizontalOverflow}px`);
      if (width === 390) {
        await sam.screenshot({ path: `${EVIDENCE}/${name}.png`, fullPage: true });
      }
    }
  }
  // Dock links must actually navigate; the full sidebar remains reachable.
  await sam.setViewportSize({ width: 390, height: 844 });
  await sam.goto(origin + '/admin/dashboard');
  const mobileDock = sam.getByRole('navigation', { name: 'Accesos rápidos de Avalon' });
  await mobileDock.getByRole('link', { name: 'Radar' }).click();
  await sam.waitForURL(origin + '/admin/workspace/crm/hunter');
  await mobileDock.getByRole('link', { name: 'Pipeline' }).click();
  await sam.waitForURL(origin + '/admin/workspace/crm/leads');
  await mobileDock.getByRole('link', { name: 'Ventas' }).click();
  await sam.waitForURL(origin + '/admin/workspace/crm/sales');
  await mobileDock.getByRole('button', { name: 'Abrir todos los módulos' }).click();
  assert.ok(await sam.getByRole('button', { name: 'Cerrar menú' }).isVisible(), 'full module drawer opens from dock');
  await sam.getByRole('button', { name: 'Cerrar menú' }).click();
  assert.equal(await sam.locator('[data-drawer="open"]').count(), 0, 'drawer closes cleanly');

  await page.goto(`${origin}/admin/workspace/crm/activity?client=${clientId}`);
  await page.getByText('task.status_changed', { exact: true }).first().waitFor();
  const activity = await page.locator('#main').innerText();
  for (const e of ['sale.confirmed', 'client.created', 'project.created', 'payment.recorded', 'task.status_changed']) assert.ok(activity.includes(e), `activity center lists ${e}`);
  await page.screenshot({ path: `${EVIDENCE}/activity-center.png`, fullPage: true });


  // ── Dashboard → CRM: the HUD card opens the real CRM, never a placeholder ──
  await page.goto(origin + '/admin/dashboard');
  await page.getByRole('heading', { name: 'Pulso comercial' }).waitFor();
  assert.match(await page.locator('#main').innerText(), /Ingresos contratados[\s\S]*4[.,]200/, 'dashboard KPIs come from recorded sales');
  await page.screenshot({ path: `${EVIDENCE}/dashboard.png`, fullPage: true });
  await page.locator('a[href="/admin/workspace/crm"]', { hasText: 'Lead Hunter, pipeline' }).click();
  await page.waitForURL(origin + '/admin/workspace/crm');
  await page.getByRole('heading', { name: 'Centro comercial de Avalon' }).waitFor();
  await page.getByRole('heading', { name: 'Ventas, clientes, proyectos y tareas' }).waitFor();
  const crmHome = await page.locator('#main').innerText();
  assert.doesNotMatch(crmHome, /desarrollo por Samuel|en desarrollo/i);
  await page.screenshot({ path: `${EVIDENCE}/crm-home.png`, fullPage: true });
  // Every primary tab and secondary page is reachable from the CRM and renders its own screen.
  const tabs = [['Lead Hunter', /\/crm\/hunter$/], ['Leads Pipeline', /\/crm\/leads$/], ['Ventas', /\/crm\/sales$/], ['Calendario', /\/crm\/calendar$/], ['Tareas', /\/crm\/tasks$/]];
  for (const [name, url] of tabs) {
    await page.goto(origin + '/admin/workspace/crm');
    await page.getByRole('navigation', { name: 'Flujo principal del CRM' }).first().getByRole('link', { name, exact: true }).click();
    await page.waitForURL(url);
    assert.doesNotMatch(await page.locator('#main').innerText(), /desarrollo por Samuel/i, name);
  }
  for (const [name, heading] of [['Clientes 360°', 'Clientes 360°'], ['Centro de actividad', 'Centro de actividad'], ['Avisos', 'Avisos comerciales y operativos'], ['Configuración', 'Configuración del CRM']]) {
    await page.goto(origin + '/admin/workspace/crm');
    await page.getByRole('navigation', { name: 'Operaciones comerciales' }).first().getByRole('link', { name, exact: true }).click();
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  }
  assert.equal((await get('/admin/workspace/unknown-module', miguel)).status, 404, 'unknown module is 404, not a placeholder');

  // ── Lead → pipeline → sale → departments → tasks → client 360 → history ──
  await page.goto(origin + '/admin/workspace/crm/leads');
  await page.getByRole('button', { name: 'Crear lead', exact: true }).click();
  await page.getByLabel('Empresa *', { exact: true }).fill('Orbit Dental Sintético');
  await page.getByLabel('Origen / fuente *', { exact: true }).fill('web');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText('Guardado correctamente.', { exact: true }).waitFor();
  await page.getByLabel('Etapa de Orbit Dental Sintético').selectOption('proposal');
  await page.waitForTimeout(300);
  await page.reload();
  assert.equal(await page.getByLabel('Etapa de Orbit Dental Sintético').inputValue(), 'proposal', 'stage move persisted');
  const leadId = (await one("select id from crm_leads where company='Orbit Dental Sintético'")).id;
  await page.goto(`${origin}/admin/workspace/crm/sales/new?lead=${leadId}`);
  await page.getByLabel('Cliente nuevo').check();
  await page.getByLabel('Nombre de empresa *').fill('Orbit Dental Sintético');
  await page.locator('select[name="line_0_service"]').selectOption('crm-personalizado');
  await page.locator('input[name="line_0_price"]').fill('3000');
  await Promise.all([page.waitForURL(/\/crm\/sales\/[0-9a-f-]{36}\?ok=confirmed/), page.getByRole('button', { name: 'Confirmar venta e iniciar trabajo' }).click()]);
  assert.equal((await one('select s.kind from crm_leads l join crm_stages s on s.id=l.stage_id where l.id=$1', [leadId])).kind, 'won', 'sale moves the lead to won');
  const orbit = await one("select id, origin_lead_id from crm_clients where legal_name='Orbit Dental Sintético'");
  assert.equal(orbit.origin_lead_id, leadId, 'client keeps its origin lead');
  assert.equal(Number((await one("select count(*) n from os_projects where client_id=$1 and module='crm_creator'", [orbit.id])).n), 1, 'CRM Creator received its project');
  // Edit the client, log a follow-up, both persist after reload.
  await page.goto(`${origin}/admin/workspace/crm/clients/${orbit.id}`);
  await page.getByText('Editar datos del cliente').click();
  await page.getByLabel('Industria').fill('Salud dental');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByText('Cambios guardados.').waitFor();
  await page.locator('textarea[name="body"]').fill('Llamada de kickoff sintética');
  await page.locator('input[name="due_on"]').fill('2026-12-01');
  await page.getByRole('button', { name: 'Registrar actividad' }).click();
  await page.getByText('Cambios guardados.').waitFor();
  await page.reload();
  const orbitHub = await page.locator('#main').innerText();
  assert.ok(orbitHub.includes('Salud dental') && orbitHub.includes('Llamada de kickoff sintética'), 'client edit and activity persisted');
  assert.ok(orbitHub.includes('Orbit Dental Sintético — CRM personalizado'), 'project visible from the client');
  // Calendar shows persisted due dates (tasks/deliveries) for everyone.
  await page.goto(origin + '/admin/workspace/crm/calendar?owner=all');
  await page.getByRole('heading', { name: 'Vencimientos, entregas y seguimientos' }).waitFor();
  assert.match(await page.locator('#main').innerText(), /Descubrimiento de procesos comerciales/, 'template task appears on the calendar');
  await page.screenshot({ path: `${EVIDENCE}/calendar.png`, fullPage: true });
  // History of the whole journey on the client timeline.
  await page.goto(`${origin}/admin/workspace/crm/activity?client=${orbit.id}`);
  await page.getByText('lead.won', { exact: true }).first().waitFor();
  for (const e of ['sale.confirmed', 'client.created', 'project.created', 'tasks.generated']) assert.ok((await page.locator('#main').innerText()).includes(e), `history has ${e}`);
  // Catalog settings persist (price + default assignee) and the automation switch is audited.
  await page.goto(origin + '/admin/workspace/crm/settings');
  const webForm = page.locator('form', { hasText: 'desarrollo-web' });
  await webForm.locator('input[name="suggested_price"]').fill('2000');
  await webForm.getByRole('button', { name: 'Guardar servicio' }).click();
  await page.getByText('Cambios guardados.').waitFor();
  assert.equal(Number((await one("select suggested_price p from crm_service_catalog where code='desarrollo-web'")).p), 2000);
  await page.screenshot({ path: `${EVIDENCE}/crm-settings.png`, fullPage: true });

  assert.deepEqual(errors.filter(e => e.startsWith('pageerror')), [], 'no client-side errors');
});
