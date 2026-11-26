// Quoting Studio through the REAL app: production Next.js build → test REST bridge → isolated PGlite with every migration
// and real RLS. Synthetic owners and a synthetic barbershop only. Requires `npm run build` and NODE_PATH=tests/qa/node_modules.
// CRM_BROWSER=1 (or QUOTES_BROWSER=1) runs the Playwright part: desktop + iPhone, full quote → contract flow.
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
const EVIDENCE = process.env.EVIDENCE_DIR || 'evidence/quotes';
const SECRET = 'COSTO-INTERNO-SECRETO-900';

test('Quoting Studio in the real app: wizard, PDF without internal data, states, download, contract from quote, iPhone', { timeout: 300000 }, async t => {
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
    const access_token = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: id, exp, role: 'authenticated', aal: 'aal1' })}.${Buffer.from('synthetic-signature').toString('base64url')}`;
    users.set(access_token, user);
    return { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  };
  const miguel = session(MIGUEL, 'miguel@example.invalid'), outsider = session(OUTSIDER, 'outsider@example.invalid');
  const errors = [];
  const bridge = await startBridge(db, { users, log: (kind, ...rest) => { if (kind === 'error') errors.push(rest.join(' ')); } });
  t.after(() => bridge.close());
  const reservation = createServer();
  await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port;
  await new Promise(r => reservation.close(r));
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', c => (output += c)); child.stderr.on('data', c => (output += c));
  t.after(() => require('./support/stop-child.cjs')(child));
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null || child.signalCode !== null) assert.fail(output);
    try { if ((await fetch(origin + '/login', { signal: AbortSignal.timeout(2000) })).status < 500) break; } catch {}
    if (i === 149) assert.fail(output);
    await new Promise(r => setTimeout(r, 100));
  }
  const cookieName = 'sb-127-auth-token';
  const cookieValue = s => `base64-${Buffer.from(JSON.stringify(s)).toString('base64url')}`;
  const get = (path, s) => fetch(origin + path, { signal: AbortSignal.timeout(15000), redirect: 'manual', headers: { cookie: s ? `${cookieName}=${cookieValue(s)}` : '' } });
  const one = async (sql, p) => { await db.exec('reset role;'); return (await db.query(sql, p)).rows[0]; };

  await db.exec(`reset role; set request.jwt.claim.sub='${MIGUEL}'; set role authenticated;`);
  const lead = (await db.query(`insert into crm_leads(company,contact,email,source,owner_id) values('Barbería Piloto Sintética','Contacto QA','piloto@example.test','Entrada manual',$1) returning id`, [MIGUEL])).rows[0].id;
  const client = (await db.query(`insert into crm_clients(legal_name,source,owner_id,origin_lead_id,location) values('Barbería Piloto Sintética LLC','manual',$1,$2,'100 Synthetic Ave, Miami') returning id`, [MIGUEL, lead])).rows[0].id;
  await db.exec('reset role;');

  // Server-side authorization on every new route.
  for (const route of ['/admin/workspace/crm/quotes', `/admin/workspace/crm/quotes/new?lead=${lead}`, `/admin/workspace/crm/quotes/new?client=${client}`, '/admin/workspace/crm/quotes/new']) {
    assert.equal((await get(route)).status, 307, `${route} signed out`);
    assert.equal((await get(route, outsider)).status, 307, `${route} non-member`);
    assert.equal((await get(route, miguel)).status, 200, `${route} owner: ${output.slice(-1500)}`);
  }
  assert.equal((await get('/admin/workspace/crm/quotes/00000000-0000-4000-8000-000000000999', miguel)).status, 404);
  assert.equal((await get('/admin/workspace/crm/quotes/new?lead=not-a-uuid', miguel)).status, 404);
  for (const who of [undefined, outsider]) // Middleware redirects (307) or the route itself refuses (403): never a PDF.
    assert.ok([307, 403].includes((await get(`/admin/workspace/crm/quotes/00000000-0000-4000-8000-000000000999/pdf?v=1`, who)).status), 'PDF requires an owner');

  if (process.env.CRM_BROWSER !== '1' && process.env.QUOTES_BROWSER !== '1') return;
  const { chromium, devices } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  t.after(() => browser.close());
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const context = async (s, opts = { viewport: { width: 1366, height: 1000 } }, lang = 'es') => {
    const ctx = await browser.newContext({ ...opts, locale: lang === 'es' ? 'es-ES' : 'en-US', acceptDownloads: true });
    await ctx.addCookies([{ name: cookieName, value: cookieValue(s), url: origin }, { name: 'avalon-lang', value: lang, url: origin }]);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`pageerror [${page.url()}]: ${e.message}`));
    return page;
  };
  const submit = async (page, locator) => {
    const done = page.waitForResponse(r => r.request().method() === 'POST' && !!r.request().headers()['next-action'], { timeout: 30000 });
    await locator.click();
    await done;
    await page.waitForLoadState('networkidle');
  };

  // 1. Guided wizard from Clients 360 (desktop).
  const m = await context(miguel);
  await m.goto(origin + `/admin/workspace/crm/clients/${client}`);
  await Promise.all([m.waitForURL(/\/quotes\/new\?client=/), m.getByRole('link', { name: '+ Crear cotización' }).click()]);
  await m.getByLabel('Título de la propuesta').fill('Website, CRM y crecimiento para la barbería');
  assert.equal(await m.getByLabel('Empresa').inputValue(), 'Barbería Piloto Sintética LLC', 'company prefilled from Clients 360');
  assert.equal(await m.getByLabel('Correo del contacto').inputValue(), 'piloto@example.test', 'contact prefilled from the lead');
  await m.getByRole('button', { name: 'Siguiente' }).click();
  // Catalog has no approved prices: the line is added with an EMPTY price the owner must type.
  await m.getByRole('button', { name: /\+ Desarrollo web · sin precio aprobado/ }).click();
  assert.equal(await m.getByLabel('Precio unitario (USD)').first().inputValue(), '', 'no invented price');
  await m.getByLabel('Precio unitario (USD)').first().fill('1500');
  await m.getByRole('button', { name: '+ Concepto personalizado' }).click();
  await m.getByLabel('Concepto', { exact: true }).nth(1).fill('Mantenimiento y soporte');
  await m.getByLabel('Tipo').nth(1).selectOption('monthly');
  await m.getByLabel('Precio unitario (USD)').nth(1).fill('150');
  // V5 service configurator + receptionist estimator (synthetic rate; nothing is called or activated).
  await m.getByLabel('Configurar un servicio').selectOption('receptionist');
  await m.getByLabel('Llamadas por mes').fill('100');
  await m.getByLabel('Duración promedio (s)').fill('90');
  await m.getByLabel('Proveedor', { exact: true }).fill('Synthetic Voice');
  const estimate = m.getByRole('table', { name: /Costos mensuales estimados del proveedor/ });
  assert.match(await estimate.innerText(), /N\/D/, 'no verified rate → N/D, never a guessed price');
  for (const label of ['Plataforma incluye telefonía', 'Incluye STT/TTS', 'Incluye modelo IA']) await m.getByLabel(label).selectOption('yes');
  await m.getByLabel('Plataforma por minuto (USD)').fill('0.10');
  assert.match(await estimate.innerText(), /N\/D/, 'a rate without source/date is still N/D');
  await m.getByLabel('Fuente (URL o contrato)').first().fill('synthetic-test-rate');
  await m.getByLabel('Verificada el').first().fill('2026-11-21');
  assert.match(await estimate.getByRole('row', { name: /Total mensual/ }).innerText(), /\$20[.,]00/, '100 calls × 90 s billed per minute = 200 min × $0.10');
  await m.screenshot({ path: `${EVIDENCE}/quote-receptionist-estimator.png`, fullPage: true });
  await m.getByRole('button', { name: 'Añadir a la cotización' }).click();
  const linesAfterStudio = await m.getByLabel('Precio unitario (USD)').count();
  assert.equal(linesAfterStudio, 3, 'studio adds one line');
  assert.equal(await m.getByLabel('Precio unitario (USD)').nth(2).inputValue(), '', 'no approved catalog price → empty, owner decides');
  await m.getByRole('button', { name: 'Quitar' }).nth(2).click();
  await m.getByRole('button', { name: 'Siguiente' }).click();
  await m.getByLabel('Híbrido').check();
  await m.getByLabel('Porcentaje propuesto').check();
  await m.getByLabel('Porcentaje (%)').fill('10');
  await m.getByLabel('Qué genera el derecho a comisión').fill('Cita atribuida a la campaña y efectivamente cobrada');
  await m.getByLabel('Evidencia requerida').fill('Reporte del sistema de reservas y comprobante de cobro');
  // Avalon standard: every essential variable term is explicit (type, start, duration, exclusions, refunds).
  await m.getByLabel('Tipo de acuerdo variable').selectOption('revenue_share');
  await m.getByLabel('Fecha efectiva').fill('2026-12-01');
  await m.getByLabel('Duración (meses)').fill('12');
  await m.getByLabel('Exclusiones', { exact: true }).fill('Clientes existentes antes del inicio y ventas sin cobro');
  await m.getByLabel('Reembolsos y contracargos').fill('Se descuentan del periodo en que ocurren');
  await m.getByRole('button', { name: 'Siguiente' }).click();
  await m.getByLabel('Solución propuesta (obligatoria)').fill('Sitio web con reservas conectado a un CRM con recordatorios.');
  await m.getByText('Información interna de Avalon (nunca aparece en el PDF)').click();
  await m.getByLabel('Costos directos estimados').fill(SECRET);
  await m.getByRole('button', { name: 'Siguiente' }).click();
  await m.getByText('Todo listo.').waitFor();
  await m.screenshot({ path: `${EVIDENCE}/01-wizard-review.png`, fullPage: true });
  await Promise.all([m.waitForURL(/\/quotes\/[0-9a-f-]{36}\?ok=created/), m.getByRole('button', { name: 'Guardar cotización' }).click()]);
  const quoteId = m.url().match(/quotes\/([0-9a-f-]{36})/)[1];
  await m.getByText('$1,500.00').first().waitFor();
  await m.getByText('$150.00').first().waitFor();
  await m.getByText('La descarga para el cliente se habilita cuando esta revisión está aprobada internamente.').waitFor();

  const row = await one('select q.status, v.one_time_total::text o, v.monthly_total::text mo, v.commission_pct::text pct, v.internal->>\'directCosts\' secret, v.content::text content, q.client_id from crm_quotes q join crm_quote_versions v on v.quote_id=q.id where q.id=$1', [quoteId]);
  assert.deepEqual([row.status, row.o, row.mo, row.pct, row.secret, row.client_id], ['draft', '1500.00', '150.00', '10.00', SECRET, client]);
  assert.equal(row.content.includes(SECRET), false, 'internal costs are not stored in the client content');

  // 2. The preview PDF carries the exact amounts and never the internal data; download is blocked while in draft.
  const preview = await m.request.get(origin + `/admin/workspace/crm/quotes/${quoteId}/pdf?v=1&view=inline`);
  assert.equal(preview.status(), 200);
  const pdfBytes = Buffer.from(await preview.body());
  const pdfText = pdfBytes.toString('latin1');
  assert.ok(pdfText.startsWith('%PDF-1.4') && pdfText.includes('($1,500.00)') && pdfText.includes('(10%)'));
  assert.equal(pdfText.includes(SECRET), false, 'internal costs never reach the PDF');
  // Preserve the verified synthetic PDF for human visual QA in CI artifacts.
  // No real client details or internal costs are present in this fixture.
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(`${EVIDENCE}/quote-preview-synthetic.pdf`, pdfBytes);
  assert.equal((await m.request.get(origin + `/admin/workspace/crm/quotes/${quoteId}/pdf?v=1`)).status(), 409, 'no client download before approval');

  // 3. States: review → approved → download (after explicit review) → manual send → acceptance with evidence.
  const guided = m.locator('section[aria-labelledby="close-sale"]');
  await submit(m, guided.getByRole('button', { name: 'Continuar a revisión' }));
  await submit(m, guided.getByRole('button', { name: 'Confirmar aprobación' }));
  await m.getByText('Aprobada internamente. Ya puedes descargarla').waitFor();
  assert.equal(await m.getByRole('button', { name: 'Descargar PDF' }).isDisabled(), true, 'download requires the review checkbox');
  await m.getByLabel(/Revisé la vista previa/).check();
  const [download] = await Promise.all([m.waitForEvent('download'), m.getByRole('link', { name: 'Descargar PDF' }).click()]);
  assert.match(download.suggestedFilename(), /^Avalon-Quote-Q-\d{4}-\d{4}-v1\.pdf$/);
  assert.equal((await one('select status from crm_quotes where id=$1', [quoteId])).status, 'approved', 'downloading is not sending');
  const evidenceDate = new Date().toISOString().slice(0,10);
  const sent = guided.locator('form[data-path-transition="sent"]');
  await sent.locator('select[name="path_channel"]').selectOption('email');
  await sent.locator('input[name="path_date"]').fill(evidenceDate);
  await sent.locator('textarea').fill('PDF enviado por correo al contacto sintético');
  await submit(m, sent.getByRole('button', { name: 'Guardar registro de envío' }));
  const accepted = guided.locator('form[data-path-transition="accepted"]');
  await accepted.locator('select[name="path_channel"]').selectOption('email');
  await accepted.locator('input[name="path_date"]').fill(evidenceDate);
  await accepted.locator('input[name="path_person"]').fill('Contacto QA');
  await accepted.locator('textarea').fill('Contacto QA aceptó por correo; guardado en el expediente');
  await submit(m, accepted.getByRole('button', { name: 'Guardar evidencia de aceptación' }));
  await m.getByText('Aceptación registrada. No se creó ninguna venta ni pago').waitFor();
  await m.screenshot({ path: `${EVIDENCE}/02-quote-accepted.png`, fullPage: true });
  assert.equal((await one('select count(*)::int n from crm_sales')).n, 0, 'acceptance creates no sale');
  assert.equal((await one("select count(*)::int n from crm_quote_events where quote_id=$1", [quoteId])).n, 5);

  // 4. Contract Studio prefilled from the exact accepted revision.
  await Promise.all([m.waitForURL(/\/contracts\?quote=/), m.getByRole('link', { name: 'Crear contrato desde cotización' }).click()]);
  await m.getByText('Datos importados desde la cotización aceptada').waitFor();
  assert.equal(await m.locator('input[name="setupFee"]').inputValue(), '1500.00');
  assert.equal(await m.locator('input[name="monthlyFee"]').inputValue(), '150.00');
  assert.match(await m.locator('textarea[name="commission"]').inputValue(), /^10% of attributable gross revenue actually collected/);
  assert.equal(await m.locator('input[name="services"][value="Website"]').isChecked(), true);
  await m.locator('select[name="agencyLegalForm"]').selectOption('individual');
  await m.locator('input[name="agencyName"]').fill('Persona Sintética QA');
  await m.locator('input[name="agencyAddress"]').fill('1 Synthetic Way, Miami, FL');
  await m.locator('input[name="agencyEmail"]').fill('agency@example.test');
  await m.locator('input[name="county"]').fill('Miami-Dade');
  // The owner completes the legal fields a quote does not cover; quote-derived fields stay as imported.
  const missing = await m.evaluate(() => [...document.querySelectorAll('form [required]')].filter(e => !e.value).map(e => e.getAttribute('name')));
  assert.deepEqual(missing.filter(n => ['setupFee', 'monthlyFee', 'commission', 'scope', 'services'].includes(n)), [], 'quote-derived fields are prefilled');
  for (const name of missing) await m.locator(`[name="${name}"]`).fill(name === 'clientEmail' ? 'piloto@example.test' : 'Synthetic owner-entered value ' + name);
  await Promise.all([m.waitForURL(/ok=(created|existing)|error=/), m.getByRole('button', { name: 'Guardar borrador y abrir PDF' }).click()]);
  if (/error=/.test(m.url())) { await m.screenshot({ path: `${EVIDENCE}/contract-error.png`, fullPage: true }); assert.fail('contract save failed: ' + m.url() + ' ' + output.slice(-800)); }
  const draft = await one('select d.quote_version_id, v.quote_id from crm_client_agreement_drafts d join crm_quote_versions v on v.id=d.quote_version_id where d.client_id=$1', [client]);
  assert.equal(draft.quote_id, quoteId, 'the agreement references the exact accepted quote revision');
  assert.equal((await one('select count(*)::int n from crm_sales')).n, 0, 'a contract draft creates no sale');
  await m.goto(origin + `/admin/workspace/crm/quotes/${quoteId}`);
  await m.getByText('Ya existe un borrador de contrato basado en esta cotización.').waitFor();
  await m.goto(origin + '/admin/workspace/crm/quotes');
  await m.getByText('Barbería Piloto Sintética LLC').first().waitFor();
  await m.screenshot({ path: `${EVIDENCE}/03-quotes-list.png`, fullPage: true });

  // 5. iPhone: wizard steps and detail fit the screen; no horizontal page scroll.
  const phone = await context(miguel, { ...devices['iPhone 13'] });
  await phone.goto(origin + `/admin/workspace/crm/quotes/new?lead=${lead}`);
  await phone.getByLabel('Título de la propuesta').waitFor();
  const overflow = async () => phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(await overflow() <= 1, 'wizard has no horizontal scroll on iPhone');
  await phone.screenshot({ path: `${EVIDENCE}/04-iphone-wizard.png`, fullPage: true });
  await phone.goto(origin + `/admin/workspace/crm/quotes/${quoteId}`);
  await phone.getByText('Siguiente paso: contrato').waitFor();
  assert.ok(await overflow() <= 1, 'detail has no horizontal scroll on iPhone');
  await phone.screenshot({ path: `${EVIDENCE}/05-iphone-detail.png`, fullPage: true });

  assert.deepEqual(errors.filter(e => !/favicon|ResizeObserver/.test(e)), []);
});
