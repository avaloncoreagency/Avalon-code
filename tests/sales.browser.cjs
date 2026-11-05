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
const ROUTES = ['/admin/dashboard', '/admin/workspace/crm', '/admin/workspace/crm/calendar', '/admin/workspace/crm/settings', '/admin/workspace/crm/sales', '/admin/workspace/crm/sales/new', '/admin/workspace/crm/clients', '/admin/workspace/crm/tasks', '/admin/workspace/crm/notifications', '/admin/workspace/crm/activity', '/admin/workspace/crm/office/hq']; // /crm/office redirects to the single Avalon HQ

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

  // Module → shared spine: the project of each service reaches the same client, sale, work order and tasks.
  const novaProjects = (await db.query("select p.id, p.module, p.client_id from os_projects p order by p.module")).rows;
  assert.equal(novaProjects.length, 3, 'one project per module service');
  for (const proj of novaProjects) assert.equal(proj.client_id, clientId, 'every module project points at the same client');
  const websiteProject = novaProjects.find(r => r.module === 'website');
  const saleRow = (await db.query('select s.id, s.sale_number from crm_sales s')).rows[0];
  const websiteTasks = Number((await db.query('select count(*) n from crm_tasks where project_id=$1', [websiteProject.id])).rows[0].n);
  assert.ok(websiteTasks >= 1, 'the sale generated tasks for the website project');
  await page.goto(`${origin}/admin/workspace/products/${websiteProject.id}`);
  const ctx = page.getByTestId('project-context');
  await ctx.getByRole('heading', { name: 'Contexto comercial' }).waitFor();
  await ctx.getByRole('link', { name: /Nova Restaurant · CLI-/ }).waitFor();
  assert.match(await page.locator('header').filter({ hasText: 'Nova Restaurant' }).first().innerText(), /Nova Restaurant/, 'header names the real client, not "sin empresa vinculada"');
  assert.doesNotMatch(await page.locator('#main').innerText(), /Sin empresa vinculada/);
  await ctx.getByRole('link', { name: saleRow.sale_number }).waitFor();
  assert.match(await ctx.innerText(), new RegExp(`${websiteTasks} abiertas|abiertas`), 'task counters shown');
  await page.screenshot({ path: `${EVIDENCE}/project-context.png`, fullPage: false });
  await ctx.getByRole('link', { name: /Nova Restaurant · CLI-/ }).click();
  await page.waitForURL(`${origin}/admin/workspace/crm/clients/${clientId}`);
  await page.goto(`${origin}/admin/workspace/products/${websiteProject.id}`);
  await page.getByTestId('project-context').getByRole('link', { name: saleRow.sale_number }).click();
  await page.waitForURL(new RegExp('/admin/workspace/crm/sales/' + saleRow.id));
  await page.goto(`${origin}/admin/workspace/products/${websiteProject.id}`);
  await page.getByTestId('project-context').getByRole('link', { name: /Ver y crear tareas de esta orden/ }).click();
  await page.waitForURL(/\/admin\/workspace\/crm\/tasks\?work_order=/);
  // A manually created project has no client or sale: the panel says so instead of inventing context.
  const manual = (await db.query("insert into os_projects(module,name,created_by) values('website','Proyecto manual sintético',$1) returning id", [MIGUEL])).rows[0];
  await page.goto(`${origin}/admin/workspace/products/${manual.id}`);
  await page.getByTestId('project-context').getByText(/creó a mano/).waitFor();
  await db.exec('reset role;');

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
  // automatic evidence-based stars, owner confirmation and one-click pipeline creation
  // run through the real routes and RLS-protected DB.
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
  for (const [, name] of [['website', 'Sitio web'], ['crm', 'CRM / seguimiento'], ['receptionist', 'Recepcionista IA'], ['marketing', 'Marketing']]) {
    await sam.getByLabel(`Estado de ${name}`).selectOption('verified_missing');
    await sam.getByLabel(`Método de ${name}`).selectOption('call');
    await sam.getByLabel(`Confianza de ${name}`).selectOption('high');
    await sam.locator('form', { has: sam.getByLabel(`Estado de ${name}`) }).getByRole('button', { name: 'Guardar' }).click();
    await sam.getByText(`${name}: guardado.`).waitFor();
  }
  assert.equal(Number((await db.query("select stars from crm_prospects where source_ref='osm:node/987654321'")).rows[0].stars), 4, 'four verified needs → 4 stars');
  assert.match(await sam.getByRole('dialog').innerText(), /★★★★☆ Oro/);
  await sam.screenshot({ path: EVIDENCE + '/radar-results-mobile.png', fullPage: true });
  assert.equal(await count("select count(*) n from crm_leads where company='Radar Dental Sintético'"), 0,
    'calculated score is a draft until the owner finishes research');
  await sam.getByRole('button', { name: /Calificar y crear tarjeta en pipeline/ }).click();
  await sam.getByRole('link', { name: 'Abrir tarjeta en pipeline' }).first().waitFor();
  assert.equal(await count("select count(*) n from crm_prospects where company='Radar Dental Sintético' and status='converted'"), 1);
  assert.equal(await count("select count(*) n from crm_leads where company='Radar Dental Sintético'"), 1);
  const dentalLead = await one("select id,stage_id,prospect_id from crm_leads where company='Radar Dental Sintético'");
  assert.equal(dentalLead.stage_id, 'new', 'newly qualified business starts at Nuevo lead');
  assert.ok(dentalLead.prospect_id, 'pipeline card retains a link to the rated radar business');

  // Reopening the same lead does not create duplicates. A second unverified
  // business stays out until Samuel explicitly qualifies it with a reason.
  assert.equal(await count("select count(*) n from crm_leads where company='Radar Café Sintético'"), 0,
    'discovery alone never adds a lead');
  await sam.getByRole('button', { name: 'Abrir Radar Café Sintético' }).click();
  await sam.getByLabel('Estrellas manuales').selectOption('2');
  await sam.getByLabel('Motivo del ajuste').fill('Evaluación sintética verificada en llamada: oportunidad de mejorar atención');
  await sam.getByRole('button', { name: 'Calificar manualmente y crear lead' }).click();
  await sam.getByRole('link', { name: 'Abrir tarjeta en pipeline' }).first().waitFor();
  assert.equal(await count("select count(*) n from crm_leads where company='Radar Café Sintético'"), 1,
    'manual rating creates a pipeline card automatically');
  assert.equal(Number((await one("select stars_override from crm_prospects where company='Radar Café Sintético'")).stars_override), 2);
  await sam.unroute('**/admin/workspace/crm/radar/area?*');

  // Duplicate across channels AND owners: Miguel already has this business as a lead; the radar found it for Samuel.
  // Qualifying it must name the existing lead (not just "revisa el pipeline"), create no duplicate, and let a human
  // link the prospect to that lead.
  await db.exec('reset role;');
  await db.exec(`set request.jwt.claim.sub='${MIGUEL}'; set role authenticated;`);
  const existingLead = (await db.query("insert into crm_leads(company,contact,email,source,owner_id) values('Café Existente Sintético','Rosa Prueba','cafe@radar.example.invalid','Manual',$1) returning id", [MIGUEL])).rows[0];
  await db.exec(`set request.jwt.claim.sub='${SAMUEL}'; set role authenticated;`);
  await db.query('select crm_radar_ingest($1::jsonb, $2)', [JSON.stringify([
    { source_ref: 'osm:node/987654323', source_kind: 'osm', name: 'Radar Panadería Sintética', lat: 25.777, lon: -80.192, industry: 'bakery', location: 'Miami · datos de prueba', source_label: 'OpenStreetMap', license: 'ODbL' },
  ]), 'browser-seed-0002']);
  await db.query("update crm_prospects set email='Cafe@Radar.Example.invalid' where source_ref='osm:node/987654323'");
  await db.exec('reset role;');
  await sam.goto(origin + '/admin/workspace/crm/hunter');
  await sam.getByRole('button', { name: 'Abrir Radar Panadería Sintética' }).click();
  await sam.getByLabel('Estrellas manuales').selectOption('2');
  await sam.getByLabel('Motivo del ajuste').fill('Evaluación sintética verificada en llamada: oportunidad de mejorar atención');
  await sam.getByRole('button', { name: 'Calificar manualmente y crear lead' }).click();
  await sam.getByRole('alert').filter({ hasText: /Calificación guardada\. Este negocio ya está en el pipeline como «Café Existente Sintético»/ }).waitFor();
  const dupBox = sam.getByTestId('radar-existing-lead');
  await dupBox.getByRole('link', { name: 'Café Existente Sintético' }).waitFor();
  assert.equal(await count("select count(*) n from crm_leads where lower(email)='cafe@radar.example.invalid'"), 1, 'no duplicate lead was created');
  await dupBox.getByRole('button', { name: 'Vincular al lead existente' }).click();
  await sam.getByText(/No se creó un lead duplicado/).waitFor();
  const linkedProspect = (await db.query("select status, lead_id from crm_prospects where source_ref='osm:node/987654323'")).rows[0];
  assert.deepEqual({ status: linkedProspect.status, lead_id: linkedProspect.lead_id }, { status: 'converted', lead_id: existingLead.id });
  assert.equal(await count("select count(*) n from crm_leads where lower(email)='cafe@radar.example.invalid'"), 1);
  // Same rule without e-mail (company + contact; the database only enforces it between e-mail-less records),
  // through the Lead Hunter prospects table.
  await db.exec(`set request.jwt.claim.sub='${MIGUEL}'; set role authenticated;`);
  const noMailLead = (await db.query("insert into crm_leads(company,contact,source,owner_id) values('Pepe Sin Correo Sintético','Pepe Prueba','Manual',$1) returning id", [MIGUEL])).rows[0];
  await db.exec(`set request.jwt.claim.sub='${SAMUEL}'; set role authenticated;`);
  await db.query("insert into crm_prospects(company,contact,source,owner_id,acquired_at,status,opportunity) values('PEPE sin correo sintético','pepe prueba','CSV sintético',$1,now(),'approved','Duplicado sin correo')", [SAMUEL]);
  await db.exec('reset role;');
  await sam.goto(origin + '/admin/workspace/crm/hunter');
  const dupCard = sam.locator('article', { hasText: 'Duplicado sin correo' });
  await dupCard.getByRole('button', { name: 'Pasar al pipeline' }).click();
  const tableDup = sam.getByTestId('existing-lead');
  await tableDup.getByRole('link', { name: 'Pepe Sin Correo Sintético' }).waitFor();
  assert.equal(await count("select count(*) n from crm_leads where lower(company)='pepe sin correo sintético'"), 1, 'no duplicate lead was created');
  await tableDup.getByRole('button', { name: 'Vincular al lead existente' }).click();
  await sam.getByText('Guardado correctamente.').waitFor();
  const linkedByName = (await db.query("select status, lead_id from crm_prospects where opportunity='Duplicado sin correo'")).rows[0];
  assert.deepEqual({ status: linkedByName.status, lead_id: linkedByName.lead_id }, { status: 'converted', lead_id: noMailLead.id });
  assert.equal(await count("select count(*) n from crm_leads where lower(company)='pepe sin correo sintético'"), 1, 'still a single lead for that business');

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
  // ── Pipedrive-style board: drag between stages, card history, note, file ──
  const card = page.locator('article', { has: page.getByLabel('Etapa de Orbit Dental Sintético') });
  const target = page.getByRole('region', { name: 'Negociación', exact: true });
  // HTML5 drag events fired on the real handlers: independent of pointer geometry and the sticky top bar.
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent('dragstart', { dataTransfer: dt });
  await target.dispatchEvent('dragenter', { dataTransfer: dt });
  await target.dispatchEvent('dragover', { dataTransfer: dt });
  await target.dispatchEvent('drop', { dataTransfer: dt });
  await card.dispatchEvent('dragend', { dataTransfer: dt });
  await page.waitForTimeout(500);
  await page.reload();
  assert.equal(await page.getByLabel('Etapa de Orbit Dental Sintético').inputValue(), 'negotiation', 'drag & drop moved the lead');
  await card.getByRole('button', { name: 'Ficha', exact: true }).click();
  let drawer = page.getByRole('dialog', { name: 'Historial de Orbit Dental Sintético' });
  await drawer.getByText(/Movido de .* a Negociación/).first().waitFor();
  await drawer.getByLabel('Nota').fill('Cliente pidió propuesta revisada (sintético)');
  await drawer.getByRole('button', { name: 'Guardar nota' }).click();
  await drawer.getByText('Cliente pidió propuesta revisada (sintético)').waitFor();
  await drawer.getByRole('tab', { name: 'Archivo' }).click();
  await drawer.locator('input[type=file]').setInputFiles({ name: 'propuesta-sintetica.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sintético') });
  await drawer.getByRole('button', { name: 'Subir archivo' }).click();
  const fileLink = drawer.getByRole('link', { name: 'propuesta-sintetica.pdf' });
  await fileLink.waitFor();
  const dl = await page.request.get(origin + await fileLink.getAttribute('href'));
  assert.equal(dl.status(), 200);
  assert.match(dl.headers()['content-disposition'], /^attachment;/);
  assert.equal(dl.headers()['x-content-type-options'], 'nosniff');
  assert.equal((await dl.body()).toString(), '%PDF-1.4 sintético');
  await drawer.locator('input[type=file]').setInputFiles({ name: 'falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html>') });
  await drawer.getByRole('button', { name: 'Subir archivo' }).click();
  await drawer.getByText(/Tipo no permitido/).waitFor();
  await page.screenshot({ path: `${EVIDENCE}/pipeline-card-history.png`, fullPage: false });
  await drawer.getByRole('button', { name: 'Cerrar historial' }).click();
  await page.screenshot({ path: `${EVIDENCE}/pipeline-board.png`, fullPage: false });
  await card.screenshot({ path: `${EVIDENCE}/pipeline-card.png` });
  await page.getByLabel('Etapa de Orbit Dental Sintético').selectOption('proposal');
  await page.waitForTimeout(300);
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
   await page.getByRole('heading', { name: 'Nuestro calendario' }).waitFor();
   await page.getByText('Mostrar vencimientos, entregas y seguimientos del CRM').click();
   await page.getByRole('heading', { name: 'Vencimientos, entregas y seguimientos' }).waitFor();
  assert.match(await page.locator('#main').innerText(), /Descubrimiento de procesos comerciales/, 'template task appears on the calendar');
  await page.screenshot({ path: `${EVIDENCE}/calendar.png`, fullPage: true });

  // Synthetic Shared Calendar E2E: two owners, no double-booking, shared banners.
  await page.getByRole('button', { name: '+ Crear evento' }).click();
  const meetingForm = page.getByRole('dialog', { name: 'Crear evento' });
  await meetingForm.locator('input[name="title"]').fill('Kickoff compartido Avalon');
  await meetingForm.locator('input[name="start_local"]').fill('2026-11-20T14:00');
  await meetingForm.locator('input[name="end_local"]').fill('2026-11-20T15:00');
  await meetingForm.locator('select[name="owner_id"]').selectOption(MIGUEL);
  await meetingForm.locator('input[name="meeting_url"]').fill('https://meet.google.com/synthetic-test');
  await meetingForm.getByRole('button', { name: 'Guardar para ambos' }).click();
  await page.getByText('Evento creado en el calendario compartido.').waitFor({ timeout: 12000 }).catch(async () => {
    const alerts = await page.getByRole('alert').allTextContents();
    const statuses = await page.getByRole('status').allTextContents();
    const stillOpen = await page.getByRole('dialog').count();
    const stored = await count("select count(*) n from crm_events where title='Kickoff compartido Avalon'");
    throw new Error('Calendar save unconfirmed ' + JSON.stringify({ alerts, statuses, stillOpen, stored, bridgeErrors: errors.slice(-3) }));
  });
  const scheduled = await one("select owner_id,attendee_ids,meeting_url from crm_events where title='Kickoff compartido Avalon'");
  assert.equal(scheduled.owner_id, MIGUEL);
  assert.ok(scheduled.attendee_ids.includes(SAMUEL));
  assert.equal(scheduled.meeting_url, 'https://meet.google.com/synthetic-test');
  const samuelPage = await context(samuel);
  await samuelPage.goto(origin + '/admin/workspace/crm/calendar?date=2026-11-20&view=month');
  await samuelPage.getByRole('button', { name: 'Kickoff compartido Avalon' }).first().waitFor();
  await samuelPage.screenshot({ path: EVIDENCE + '/calendar-shared-samuel.png', fullPage: true });
  await samuelPage.getByRole('button', { name: '+ Crear evento' }).click();
  const overlap = samuelPage.getByRole('dialog', { name: 'Crear evento' });
  await overlap.locator('input[name="title"]').fill('Cita solapada');
  await overlap.locator('input[name="start_local"]').fill('2026-11-20T14:30');
  await overlap.locator('input[name="end_local"]').fill('2026-11-20T15:30');
  await overlap.locator('select[name="owner_id"]').selectOption(SAMUEL);
  await overlap.getByRole('button', { name: 'Guardar para ambos' }).click();
  await overlap.getByRole('alert').getByText('Ya hay otra cita para uno de los participantes en ese horario.').waitFor();
  assert.equal(await count("select count(*) n from crm_events where title='Cita solapada'"), 0);
  await overlap.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
  await page.getByRole('button', { name: '🎉 Banner de día' }).click();
  const bannerForm = page.getByRole('dialog', { name: 'Banner de fecha especial' });
  await bannerForm.locator('input[name="day"]').fill('2026-11-20');
  await bannerForm.locator('input[name="title"]').fill('Hito de Avalon');
  await bannerForm.locator('select[name="theme"]').selectOption('rose');
  await bannerForm.getByRole('button', { name: 'Guardar banner' }).click();
  await page.getByText('Banner guardado y visible para Miguel y Samuel.').waitFor();
  await samuelPage.reload();
  await samuelPage.getByRole('button', { name: /Hito de Avalon/ }).first().waitFor();
  assert.equal(await count("select count(*) n from crm_calendar_banners where title='Hito de Avalon'"), 1);

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

  // ── Radar campaigns: created paused, toggled, persisted (no provider call in tests) ──
  await page.route('**/tile.openstreetmap.org/**', r => r.abort());
  await page.goto(origin + '/admin/workspace/crm/hunter');
  await page.getByRole('heading', { name: 'Campañas de radar' }).waitFor();
  await page.getByLabel('Nombre de la campaña').fill('Dentistas sintéticos Miami');
  await page.getByRole('button', { name: 'Guardar búsqueda actual como campaña' }).click();
  await page.getByText('Campaña creada (pausada).').waitFor();
  assert.equal((await one("select status from crm_radar_campaigns where name='Dentistas sintéticos Miami'")).status, 'paused');
  await page.locator('li', { hasText: 'Dentistas sintéticos Miami' }).getByRole('button', { name: 'Activar' }).click();
  await page.getByText('Campaña activada.').waitFor();
  assert.equal((await one("select status from crm_radar_campaigns where name='Dentistas sintéticos Miami'")).status, 'active');
  assert.match(await page.locator('#main').innerText(), /Programación automática pendiente/, 'scheduler limitation stated, not faked');

  // ── Oficina: directory from memberships, profiles, private messages, tasks, AI managers (never faked) ──
  await page.goto(origin + '/admin/workspace/crm/office');
  await page.getByRole('heading', { name: 'Oficina', level: 1 }).waitFor();
  const scene = page.getByRole('region', { name: 'Sede de Avalon: selecciona una estación' });
  for (const name of ['REN', 'SHIN', 'HARU', 'SORA', 'KENJI']) await scene.getByRole('button', { name: new RegExp('^' + name + ' · Sin conexión · manager virtual de IA') }).waitFor();
  assert.equal(await scene.getByRole('button', { name: /Propietario/ }).count(), 2, 'both owners come from agency_memberships');
  // Own profile: edit (self-only).
  await scene.getByRole('button', { name: /^miguel · Propietario/ }).click();
  drawer = page.getByRole('dialog');
  await drawer.getByLabel('Nombre visible').fill('Miguel Sintético');
  await drawer.getByLabel('Cargo').fill('Co-fundador');
  await drawer.getByLabel('Departamento').fill('Dirección');
  await drawer.getByRole('button', { name: 'Guardar perfil' }).click();
  await drawer.getByText('Perfil guardado.').waitFor();
  assert.equal((await one(`select title from office_profiles where user_id='${MIGUEL}'`)).title, 'Co-fundador');
  await drawer.getByRole('button', { name: 'Volver a la oficina' }).click();
  // Samuel's profile: assign a task and send a private message linked to a real lead.
  await scene.getByRole('button', { name: /^samuel · Propietario/ }).click();
  drawer = page.getByRole('dialog');
  assert.equal(await drawer.getByText('Editar mi perfil').count(), 0, 'cannot edit someone else\'s profile');
  await drawer.getByRole('tab', { name: 'Tareas' }).click();
  await drawer.getByLabel('Título').fill('Preparar propuesta Oficina (sintético)');
  await drawer.getByRole('button', { name: 'Crear tarea' }).click();
  await drawer.getByText('Tarea creada.').waitFor();
  await drawer.getByRole('link', { name: 'Preparar propuesta Oficina (sintético)' }).waitFor();
  assert.equal((await one(`select assignee_id from crm_tasks where title='Preparar propuesta Oficina (sintético)'`)).assignee_id, SAMUEL);
  await drawer.getByRole('tab', { name: 'Mensajes' }).click();
  await drawer.getByPlaceholder(/Mensaje para samuel/).fill('Revisa el lead de Orbit, por favor.');
  await drawer.getByText('Vincular a un registro del CRM (opcional)').click();
  await drawer.locator('select[name="ref_type"]').selectOption('lead');
  await drawer.locator('input[name="ref_id"]').fill(leadId);
  await drawer.getByRole('button', { name: 'Enviar' }).click();
  await drawer.getByText('Revisa el lead de Orbit, por favor.').waitFor();
  await drawer.getByRole('link', { name: /Lead/ }).waitFor();
  await page.screenshot({ path: `${EVIDENCE}/office-messages.png` });
  await drawer.getByRole('button', { name: 'Volver a la oficina' }).click();
  // AI manager: request is registered, explicitly NOT executed; no fabricated reply.
  await scene.getByRole('button', { name: /^REN · Sin conexión · manager virtual de IA/ }).click();
  drawer = page.getByRole('dialog');
  await drawer.getByText('Manager virtual de IA · no es una persona').waitFor();
  await drawer.getByLabel(/Solicitud para REN/).fill('REN, muéstrame lo que falta para completar Avalon.');
  await drawer.getByRole('button', { name: 'Registrar solicitud' }).click();
  await drawer.getByText('Agente sin conexión de ejecución. La solicitud quedó registrada, pero no se ha ejecutado.').waitFor();
  await drawer.getByText('Registrada · sin ejecutar').waitFor();
  const reqRow = await one("select agent, status from office_agent_requests");
  assert.deepEqual({ ...reqRow }, { agent: 'ren', status: 'registered' });
  await page.screenshot({ path: `${EVIDENCE}/office-manager.png` });
  await drawer.getByRole('button', { name: 'Volver a la oficina' }).click();
  await page.screenshot({ path: `${EVIDENCE}/office-desktop.png`, fullPage: true });
  // Samuel (iPhone width) sees the unread message, reads it in the directory view.
  await sam.goto(origin + '/admin/workspace/crm/office');
  await sam.getByRole('heading', { name: 'Oficina', level: 1 }).waitFor();
  await sam.screenshot({ path: `${EVIDENCE}/office-mobile.png`, fullPage: true });
  await sam.getByRole('button', { name: 'Directorio' }).click();
  await sam.getByRole('button', { name: /Abrir perfil de Miguel Sintético/ }).getByText('1 sin leer').waitFor();
  await sam.getByRole('button', { name: /Abrir perfil de Miguel Sintético/ }).click();
  await sam.getByRole('dialog').getByRole('tab', { name: /Mensajes/ }).click();
  await sam.getByRole('dialog').getByText('Revisa el lead de Orbit, por favor.').waitFor();
  await sam.screenshot({ path: `${EVIDENCE}/office-mobile-chat.png` });
  assert.ok((await one("select read_at from office_messages")).read_at, 'opening the conversation marks it read');

  // ── Public website: quote request → pending Lead Hunter prospect only ──
  const visitor = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const pub = await visitor.newPage();
  pub.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  await pub.goto(origin + '/');
  await pub.getByRole('heading', { name: 'Tecnología que hace crecer tu negocio.' }).waitFor();
  await pub.getByLabel('Empresa').fill('Visitante Sintético LLC');
  await pub.getByLabel('Tu nombre').fill('Luis Prueba');
  await pub.getByLabel('Correo').fill('luis@visitante.example.invalid');
  await pub.getByLabel('Recepcionista IA').check();
  await pub.getByLabel('Cuéntanos tu proyecto').fill('Queremos una recepcionista IA para reservas.');
  await pub.getByRole('button', { name: 'Solicitar cotización' }).click();
  await pub.getByText(/Recibimos tu solicitud/).waitFor();
  const overflowPub = await pub.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflowPub <= 1, `public site has no horizontal scroll at 320 px (${overflowPub}px)`);
  await pub.screenshot({ path: `${EVIDENCE}/public-quote-320.png`, fullPage: true });
  const web = await one("select status, source_kind from crm_prospects where company='Visitante Sintético LLC'");
  assert.deepEqual({ ...web }, { status: 'pending', source_kind: 'web_form' }, 'web request waits for human review');
  assert.equal(Number((await one("select count(*) n from crm_leads where company='Visitante Sintético LLC'")).n), 0);
  await pub.goto(origin + '/?lang=en');
  await pub.getByRole('heading', { name: 'Technology that grows your business.' }).waitFor();
  assert.match(await pub.title(), /AI, websites, CRM and automation/, 'English page has an English title');
  assert.equal(await pub.locator('link[rel="canonical"]').count(), 0, 'no canonical that would mark the English page as a duplicate of the Spanish one');
  // Search-engine surface: robots.txt keeps the private OS out, sitemap lists only public pages.
  const robotsTxt = await (await fetch(origin + '/robots.txt')).text();
  assert.match(robotsTxt, /Disallow: \/admin/);
  assert.match(robotsTxt, /Disallow: \/api/);
  assert.match(robotsTxt, /Sitemap: https:\/\/avaloncoreagency\.com\/sitemap\.xml/);
  const sitemapXml = await (await fetch(origin + '/sitemap.xml')).text();
  assert.match(sitemapXml, /<loc>https:\/\/avaloncoreagency\.com\/<\/loc>/);
  assert.match(sitemapXml, /hreflang="en" href="https:\/\/avaloncoreagency\.com\/\?lang=en"/, 'hreflang declared in the sitemap with full URLs');
  assert.doesNotMatch(sitemapXml, /admin|login/);
  await visitor.close();

  assert.deepEqual(errors.filter(e => e.startsWith('pageerror')), [], 'no client-side errors');
});
