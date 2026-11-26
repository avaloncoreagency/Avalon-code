'use strict';
// Sales Center end to end on SYNTHETIC data: PGlite + REST bridge + production build (`npm run build` first).
// Runs with SALES_CENTER_BROWSER=1. Chromium emulation — NOT physical Safari/iOS.
// Flow (TEST 2 / 10 / 12): accepted revenue-share quote → final review → "Cerrar venta" → variable sale (never shown as a
// $0 fixed sale) → settlement recorded and verified in the UI → payment capped at the verified amount → Clients 360 →
// no horizontal page scroll at 320 / 375 / 390 / 430 / 768 px.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const { spawn } = require('node:child_process'), { createServer } = require('node:http');
const verifiedContract = require('./helpers/verified-contract.cjs');

const OWNER = '00000000-0000-4000-8000-0000000000f1';
const DIR = process.env.EVIDENCE_DIR || 'evidence/sales-center';
const COMPANY = 'Barbería Sintética del Chino QA';
// Settlement period = the previous calendar month (a period must have ended before it can be settled).
const now = new Date(), iso = d => d.toISOString().slice(0, 10);
const FROM = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))), TO = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)));

test('Sales Center: accepted quote → Cerrar venta → variable sale → settlement → payment, responsive', { timeout: 420000 }, async t => {
  if (process.env.SALES_CENTER_BROWSER !== '1') return t.skip('SALES_CENTER_BROWSER=1 required');
  const { PGlite } = require('@electric-sql/pglite'), { chromium } = require('playwright');
  const { startBridge } = require('./support/rest-bridge.cjs');
  fs.mkdirSync(DIR, { recursive: true });
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2)', [OWNER, 'sales-center-qa@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner')", [OWNER]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [OWNER]);
  await db.exec(`set request.jwt.claim.sub='${OWNER}'; set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];

  // Synthetic accepted quote: 12.5% of attributable gross revenue, monthly settlement, $0 service line.
  const content = {
    schemaVersion: 1, lang: 'es', currency: 'USD', title: `Propuesta ${COMPANY}`, issueDate: '2026-11-23', validUntil: '2099-12-31',
    client: { company: COMPANY, contact: 'Contacto QA', email: '', phone: '', address: '' }, issuer: { name: 'Avalon', email: '', phone: '' }, seller: '',
    objectives: '', problem: '', solution: 'Reservas y marketing', scope: 'Alcance sintético', deliverables: 'Entregables', exclusions: '', dependencies: '',
    timeline: '', support: '', terms: '', notes: '', thirdPartyCosts: '', model: 'commission',
    lines: [{ code: 'marketing-mensual', name: 'Marketing y reservas', description: 'Incluido en la participación', kind: 'monthly', qty: 1, unitPrice: '0' }],
    commission: { status: 'proposed', kind: 'revenue_share', pct: '12.5', base: 'gross_revenue', baseNote: '', trigger: 'Ingreso cobrado por citas reservadas vía Avalon',
      attributionWindowDays: 30, evidence: 'Reporte mensual del POS conciliado', settlement: 'monthly', exclusions: 'Propinas e impuestos', refunds: 'Se descuentan devoluciones',
      expiry: '12 meses', effectiveDate: FROM, durationMonths: 12 },
  };
  const lead = (await one("insert into crm_leads(company,contact,source,owner_id) values($1,'QA','manual',$2) returning id", [COMPANY, OWNER])).id;
  const sha = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
  const quoteId = (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [lead, crypto.randomUUID(), JSON.stringify(content), '{}', sha])).r.quote_id;
  // The main quote stays a DRAFT: review, approval, sending and acceptance are recorded through the UI below.
  // A second, synthetic copy of the real Chino structure (33% of gross, biweekly, 150-day window, no start date,
  // duration, agreement type or refund policy) must stay visibly blocked: nothing is inferred.
  const chinoContent = { ...content, title: 'Propuesta QA-33 incompleta', client: { ...content.client, company: 'Barbería QA-33 Incompleta' },
    lines: [{ code: 'crm-personalizado', name: 'CRM personalizado', description: '', kind: 'one_time', qty: 1, unitPrice: '0.00' },
      { code: 'desarrollo-web', name: 'Desarrollo web', description: '', kind: 'one_time', qty: 1, unitPrice: '0.00' }],
    commission: { status: 'proposed', pct: '33', base: 'gross_revenue', baseNote: '', trigger: 'Cliente cobrado a traves de AVALON', attributionWindowDays: 150,
      evidence: 'Reporte del sistema y comprobante de pago', settlement: 'biweekly', exclusions: 'N/A', refunds: '', expiry: 'N/A' } };
  const lead33 = (await one("insert into crm_leads(company,contact,source,owner_id) values('Barbería QA-33 Incompleta','QA','manual',$1) returning id", [OWNER])).id;
  const sha33 = crypto.createHash('sha256').update(JSON.stringify(chinoContent)).digest('hex');
  const quote33 = (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [lead33, crypto.randomUUID(), JSON.stringify(chinoContent), '{}', sha33])).r.quote_id;
  await db.exec('reset role');
  // Put the searched draft behind more than 500 newer eligible candidates.
  await db.query(`insert into crm_quotes(quote_number,title,lead_id,status,valid_until,request_key,created_by,updated_at)
    select 'Q-2099-' || (10000+n)::text, 'Synthetic bulk draft', $1, 'draft', '2099-12-31', gen_random_uuid(), $2, now()+interval '1 day'
    from generate_series(1,501) n`, [lead, OWNER]);

  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: OWNER, email: 'sales-center-qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
  const access_token = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: OWNER, exp, role: 'authenticated', aal: 'aal1' }) + '.' + enc('synthetic');
  const session = { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  const bridge = await startBridge(db, { users: new Map([[access_token, user]]) }); t.after(() => bridge.close());
  const reservation = createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const origin = 'http://localhost:' + port;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key', AVALON_RADAR_EXTERNAL_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
  const quoteUrl = `${origin}/admin/workspace/crm/quotes/${quoteId}`;
  const closePanel = () => page.locator('section[aria-labelledby="close-sale"]');

  // 0a. "Crear venta desde cotización": search by number/client, in-progress filter; drafts show what is missing.
  await page.goto(`${origin}/admin/workspace/crm/sales/new?qs=in_progress&q=QA-33`);
  await page.getByRole('heading', { name: 'Crear venta desde cotización' }).waitFor();
  const found = page.getByRole('list', { name: 'Cotizaciones pendientes de cierre' }).locator('li');
  assert.equal(await found.count(), 1, 'search finds the synthetic Chino copy behind 501 newer drafts');
  assert.match(await found.first().textContent(), /Borrador[\s\S]*33% variable/);
  await found.first().getByRole('link', { name: 'Ver qué falta' }).click();
  await page.waitForURL(new RegExp(`/quotes/${quote33}`));
  // 0b. The path to sale is visible on a draft, with the exact missing terms and where to act.
  await closePanel().waitFor();
  assert.equal(await closePanel().getAttribute('data-close-state'), 'blocked');
  for (const f of ['kind', 'effectiveDate', 'durationMonths', 'refunds']) await closePanel().locator(`[data-missing="${f}"]`).waitFor();
  assert.equal(await closePanel().locator('[data-missing="exclusions"]').count(), 0, 'stated terms are not flagged');
  const edit = closePanel().getByRole('link', { name: 'Editar cotización (nueva revisión)' });
  await edit.waitFor();
  assert.equal(await closePanel().getByRole('link', { name: 'Abrir contrato de la oportunidad' }).count(), 0, 'later steps wait for the missing terms');
  assert.equal(await page.locator('section[aria-labelledby="quote-pdf"] iframe').count(), 0, 'PDF never embeds automatically');
  assert.equal(await closePanel().getByRole('button', { name: 'Cerrar venta' }).isDisabled(), true);
  await page.screenshot({ path: `${DIR}/chino-draft-blocked-1440.png`, fullPage: true });
  await edit.click();
  await page.waitForURL(new RegExp(`/quotes/${quote33}/edit'use strict';
// Sales Center end to end on SYNTHETIC data: PGlite + REST bridge + production build (`npm run build` first).
// Runs with SALES_CENTER_BROWSER=1. Chromium emulation — NOT physical Safari/iOS.
// Flow (TEST 2 / 10 / 12): accepted revenue-share quote → final review → "Cerrar venta" → variable sale (never shown as a
// $0 fixed sale) → settlement recorded and verified in the UI → payment capped at the verified amount → Clients 360 →
// no horizontal page scroll at 320 / 375 / 390 / 430 / 768 px.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const { spawn } = require('node:child_process'), { createServer } = require('node:http');
const verifiedContract = require('./helpers/verified-contract.cjs');

const OWNER = '00000000-0000-4000-8000-0000000000f1';
const DIR = process.env.EVIDENCE_DIR || 'evidence/sales-center';
const COMPANY = 'Barbería Sintética del Chino QA';
// Settlement period = the previous calendar month (a period must have ended before it can be settled).
const now = new Date(), iso = d => d.toISOString().slice(0, 10);
const FROM = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))), TO = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)));

test('Sales Center: accepted quote → Cerrar venta → variable sale → settlement → payment, responsive', { timeout: 420000 }, async t => {
  if (process.env.SALES_CENTER_BROWSER !== '1') return t.skip('SALES_CENTER_BROWSER=1 required');
  const { PGlite } = require('@electric-sql/pglite'), { chromium } = require('playwright');
  const { startBridge } = require('./support/rest-bridge.cjs');
  fs.mkdirSync(DIR, { recursive: true });
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2)', [OWNER, 'sales-center-qa@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner')", [OWNER]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [OWNER]);
  await db.exec(`set request.jwt.claim.sub='${OWNER}'; set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];

  // Synthetic accepted quote: 12.5% of attributable gross revenue, monthly settlement, $0 service line.
  const content = {
    schemaVersion: 1, lang: 'es', currency: 'USD', title: `Propuesta ${COMPANY}`, issueDate: '2026-11-23', validUntil: '2099-12-31',
    client: { company: COMPANY, contact: 'Contacto QA', email: '', phone: '', address: '' }, issuer: { name: 'Avalon', email: '', phone: '' }, seller: '',
    objectives: '', problem: '', solution: 'Reservas y marketing', scope: 'Alcance sintético', deliverables: 'Entregables', exclusions: '', dependencies: '',
    timeline: '', support: '', terms: '', notes: '', thirdPartyCosts: '', model: 'commission',
    lines: [{ code: 'marketing-mensual', name: 'Marketing y reservas', description: 'Incluido en la participación', kind: 'monthly', qty: 1, unitPrice: '0' }],
    commission: { status: 'proposed', kind: 'revenue_share', pct: '12.5', base: 'gross_revenue', baseNote: '', trigger: 'Ingreso cobrado por citas reservadas vía Avalon',
      attributionWindowDays: 30, evidence: 'Reporte mensual del POS conciliado', settlement: 'monthly', exclusions: 'Propinas e impuestos', refunds: 'Se descuentan devoluciones',
      expiry: '12 meses', effectiveDate: FROM, durationMonths: 12 },
  };
  const lead = (await one("insert into crm_leads(company,contact,source,owner_id) values($1,'QA','manual',$2) returning id", [COMPANY, OWNER])).id;
  const sha = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
  const quoteId = (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [lead, crypto.randomUUID(), JSON.stringify(content), '{}', sha])).r.quote_id;
  // The main quote stays a DRAFT: review, approval, sending and acceptance are recorded through the UI below.
  // A second, synthetic copy of the real Chino structure (33% of gross, biweekly, 150-day window, no start date,
  // duration, agreement type or refund policy) must stay visibly blocked: nothing is inferred.
  const chinoContent = { ...content, title: 'Propuesta QA-33 incompleta', client: { ...content.client, company: 'Barbería QA-33 Incompleta' },
    lines: [{ code: 'crm-personalizado', name: 'CRM personalizado', description: '', kind: 'one_time', qty: 1, unitPrice: '0.00' },
      { code: 'desarrollo-web', name: 'Desarrollo web', description: '', kind: 'one_time', qty: 1, unitPrice: '0.00' }],
    commission: { status: 'proposed', pct: '33', base: 'gross_revenue', baseNote: '', trigger: 'Cliente cobrado a traves de AVALON', attributionWindowDays: 150,
      evidence: 'Reporte del sistema y comprobante de pago', settlement: 'biweekly', exclusions: 'N/A', refunds: '', expiry: 'N/A' } };
  const lead33 = (await one("insert into crm_leads(company,contact,source,owner_id) values('Barbería QA-33 Incompleta','QA','manual',$1) returning id", [OWNER])).id;
  const sha33 = crypto.createHash('sha256').update(JSON.stringify(chinoContent)).digest('hex');
  const quote33 = (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [lead33, crypto.randomUUID(), JSON.stringify(chinoContent), '{}', sha33])).r.quote_id;
  await db.exec('reset role');
  // Put the searched draft behind more than 500 newer eligible candidates.
  await db.query(`insert into crm_quotes(quote_number,title,lead_id,status,valid_until,request_key,created_by,updated_at)
    select 'Q-2099-' || (10000+n)::text, 'Synthetic bulk draft', $1, 'draft', '2099-12-31', gen_random_uuid(), $2, now()+interval '1 day'
    from generate_series(1,501) n`, [lead, OWNER]);

  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: OWNER, email: 'sales-center-qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
  const access_token = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: OWNER, exp, role: 'authenticated', aal: 'aal1' }) + '.' + enc('synthetic');
  const session = { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  const bridge = await startBridge(db, { users: new Map([[access_token, user]]) }); t.after(() => bridge.close());
  const reservation = createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const origin = 'http://localhost:' + port;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key', AVALON_RADAR_EXTERNAL_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
  const quoteUrl = `${origin}/admin/workspace/crm/quotes/${quoteId}`;
  const closePanel = () => page.locator('section[aria-labelledby="close-sale"]');

  // 0a. "Crear venta desde cotización": search by number/client, in-progress filter; drafts show what is missing.
  await page.goto(`${origin}/admin/workspace/crm/sales/new?qs=in_progress&q=QA-33`);
  await page.getByRole('heading', { name: 'Crear venta desde cotización' }).waitFor();
  const found = page.getByRole('list', { name: 'Cotizaciones pendientes de cierre' }).locator('li');
  assert.equal(await found.count(), 1, 'search finds the synthetic Chino copy behind 501 newer drafts');
  assert.match(await found.first().textContent(), /Borrador[\s\S]*33% variable/);
  await found.first().getByRole('link', { name: 'Ver qué falta' }).click();
  await page.waitForURL(new RegExp(`/quotes/${quote33}`));
  // 0b. The path to sale is visible on a draft, with the exact missing terms and where to act.
  await closePanel().waitFor();
  assert.equal(await closePanel().getAttribute('data-close-state'), 'blocked');
  for (const f of ['kind', 'effectiveDate', 'durationMonths', 'refunds']) await closePanel().locator(`[data-missing="${f}"]`).waitFor();
  assert.equal(await closePanel().locator('[data-missing="exclusions"]').count(), 0, 'stated terms are not flagged');
));
  assert.equal(ctx.pages().length, 1, 'editing does not open a PDF tab');

  // 0c. Execute the real state machine directly within the path to sale, with required evidence.
  await page.goto(quoteUrl);
  const stepForm = to => closePanel().locator(`form[data-path-transition="${to}"]`);
  const assertStatus = async status => assert.equal((await one('select status from crm_quotes where id=$1', [quoteId])).status, status);
  await stepForm('internal_review').getByRole('button', { name: 'Continuar a revisión' }).click();
  await stepForm('approved').getByRole('button', { name: 'Confirmar aprobación' }).waitFor();
  await assertStatus('internal_review');
  await stepForm('approved').getByRole('button', { name: 'Confirmar aprobación' }).click();
  await stepForm('sent').getByRole('button', { name: 'Guardar registro de envío' }).waitFor();
  await assertStatus('approved');
  assert.equal(await page.locator('section[aria-labelledby="quote-pdf"] iframe').count(), 0);
  const previewLink = page.locator('section[aria-labelledby="quote-pdf"]').getByRole('link', { name: 'Abrir en pestaña nueva' });
  assert.match(await previewLink.getAttribute('href'), /\/pdf\?v=\d+&view=inline$/);
  await stepForm('sent').getByRole('button', { name: 'Guardar registro de envío' }).click();
  assert.equal(await stepForm('sent').locator('textarea').evaluate(el => el.validity.valueMissing), true, 'send requires evidence');
  await assertStatus('approved');
  await stepForm('sent').locator('textarea').fill('PDF enviado por email sintético el día de hoy');
  await stepForm('sent').getByRole('button', { name: 'Guardar registro de envío' }).click();
  await stepForm('accepted').getByRole('button', { name: 'Guardar evidencia de aceptación' }).waitFor();
  await assertStatus('sent');
  await stepForm('accepted').getByRole('button', { name: 'Guardar evidencia de aceptación' }).click();
  assert.equal(await stepForm('accepted').locator('textarea').evaluate(el => el.validity.valueMissing), true, 'acceptance requires evidence');
  await assertStatus('sent');
  await stepForm('accepted').locator('textarea').fill('Aceptada por email del cliente (sintético), archivada en el expediente QA');
  await stepForm('accepted').getByRole('button', { name: 'Guardar evidencia de aceptación' }).click();
  await page.waitForFunction(() => document.querySelector('[data-step="accepted"]')?.getAttribute('data-done') === 'true');
  await assertStatus('accepted');
  assert.equal(ctx.pages().length, 1, 'workflow stays in the quote tab');
  assert.equal(new URL(page.url()).pathname, new URL(quoteUrl).pathname);
  const contractLink = closePanel().getByRole('link', { name: 'Abrir contrato de la oportunidad' });
  await contractLink.click();
  await page.waitForURL(url => url.pathname === `/admin/workspace/crm/lead/${lead}` && url.searchParams.get('tab') === 'contract');
  assert.equal(ctx.pages().length, 1, 'contract navigation stays in the same tab');

  // 1. "Nueva venta" starts from accepted quotes; the manual form is collapsed (history / exceptions only).
  await page.goto(`${origin}/admin/workspace/crm/sales/new`);
  await page.getByRole('heading', { name: 'Crear venta desde cotización' }).waitFor();
  assert.equal(await page.locator('details[data-manual-sale]').getAttribute('open'), null, 'manual record is not the default path');
  const pendingList = page.getByRole('list', { name: 'Cotizaciones pendientes de cierre' });
  await pendingList.getByText(COMPANY, { exact: true }).waitFor();
  await pendingList.getByRole('link', { name: 'Revisar y cerrar venta' }).click();
  await page.waitForURL(new RegExp(`/quotes/${quoteId}`));

  // 2. Final review: without a verified contract the button is disabled and the blocker is explained.
  await closePanel().waitFor();
  await closePanel().locator('[data-blocker="contract_not_verified"]').waitFor();
  assert.equal(await closePanel().getByRole('button', { name: 'Cerrar venta' }).isDisabled(), true);
  await db.exec(`set request.jwt.claim.sub='${OWNER}'; set role authenticated;`);
  await verifiedContract(db, lead, `Contrato ${COMPANY}`);
  await db.exec('reset role');
  await page.goto(quoteUrl); // a hash-only goto would not reload the server-rendered panel
  await page.waitForFunction(() => document.querySelector('section[aria-labelledby="close-sale"]')?.getAttribute('data-close-ready') === 'true')
    .catch(async e => { throw new Error(`close panel not ready: ${(await closePanel().innerText()).slice(0, 600)}`, { cause: e }); });
  const review = await closePanel().textContent();
  for (const expected of ['Participación en ingresos · 12.5%', 'Ingresos brutos atribuibles cobrados', 'Reporte mensual del POS conciliado', 'Mensual', '12 meses', 'Propinas e impuestos', 'Aceptada por email del cliente (sintético)'])
    assert.ok(review.includes(expected), `final review shows "${expected}"`);
  await page.screenshot({ path: `${DIR}/close-review-1440.png`, fullPage: true });

  // 3. Cerrar venta → the sale page, with the accepted terms and the variable agreement (never a $0 fixed sale).
  await closePanel().getByRole('button', { name: 'Cerrar venta' }).click();
  await page.waitForURL(/\/crm\/sales\/[0-9a-f-]{36}\?ok=closed/);
  const saleId = /sales\/([0-9a-f-]{36})/.exec(page.url())[1];
  await page.getByText('Venta cerrada con los términos exactos de la cotización aceptada.').waitFor();
  await page.getByText('Venta por participación en ingresos — importe variable pendiente de liquidación.').waitFor();
  await page.getByText('Según liquidación').waitFor();
  const stored = await one('select quote_id, commercial_model, total::text from crm_sales where id=$1', [saleId]);
  assert.deepEqual(stored, { quote_id: quoteId, commercial_model: 'commission', total: '0.00' });
  // Repeating the close returns the same sale (the quote now links to it).
  await page.goto(quoteUrl);
  await closePanel().getByText('Esta cotización ya se cerró como venta.').waitFor();
  assert.equal((await one('select count(*)::int n from crm_sales where quote_id=$1', [quoteId])).n, 1);

  // 4. Settlement for last month: base 10,000 − 500 excluded → 1,187.50 computed by the database; verify in the UI.
  await page.goto(`${origin}/admin/workspace/crm/sales/${saleId}`);
  const agreement = page.locator('section[aria-labelledby="accepted-terms"]');
  const rec = agreement.getByRole('form', { name: 'Registrar liquidación' });
  await rec.getByLabel('Desde').fill(FROM);
  await rec.getByLabel('Hasta').fill(TO);
  await rec.getByLabel(/Base elegible verificada/).fill('10000.00');
  await rec.getByLabel(/^Exclusiones/).fill('500.00');
  await rec.getByLabel(/Evidencia/).fill('Reporte POS del mes (sintético)');
  await rec.getByRole('button', { name: 'Registrar liquidación' }).click();
  await page.waitForURL(/ok=settlement|error=/);
  assert.match(page.url(), /ok=settlement/, page.url());
  const row = agreement.getByRole('table', { name: 'Liquidaciones' }).locator('tbody tr').first();
  assert.match(await row.textContent(), /1,187\.50|1\.187,50/);
  assert.equal((await one('select variable_due, variable_pending::text from crm_sale_receivables where sale_id=$1', [saleId])).variable_pending, '1187.50', 'recorded, not yet collectible');
  await row.locator('input[name="note"]').fill('Conciliado con extracto bancario sintético');
  await row.getByRole('button', { name: 'Guardar' }).click();
  await page.waitForURL(/ok=settlement/);
  await page.waitForFunction(() => document.querySelector('section[aria-labelledby="accepted-terms"] tbody tr')?.getAttribute('data-status') === 'verified');
  const after = await one('select variable_due::text, balance::text from crm_sale_receivables where sale_id=$1', [saleId]);
  assert.deepEqual(after, { variable_due: '1187.50', balance: '1187.50' });

  // 5. Payment: the verified settlement is collectible; nothing more.
  const payForm = page.locator('section[aria-labelledby="payments"] form');
  await payForm.getByLabel('Importe (USD)').fill('1187.50');
  await payForm.locator('select[name="channel"]').selectOption('zelle');
  await payForm.getByLabel('Referencia (sin datos bancarios)').fill('ZELLE-CHINO-QA-11');
  await payForm.getByRole('button', { name: 'Registrar cobro' }).click();
  await page.getByText('Cobro registrado.').waitFor();
  assert.equal((await one('select balance::text from crm_sale_receivables where sale_id=$1', [saleId])).balance, '0.00');
  await page.screenshot({ path: `${DIR}/variable-sale-1440.png`, fullPage: true });

  // 6. Sales list and Clients 360 show the variable model, not "$0".
  await page.goto(`${origin}/admin/workspace/crm/sales`);
  await page.locator('td[data-model="commission"]').getByText('Variable · según liquidación').waitFor();
  const clientId = (await one('select client_id from crm_sales where id=$1', [saleId])).client_id;
  await page.goto(`${origin}/admin/workspace/crm/clients/${clientId}`);
  await page.locator('[data-variable-agreements]').waitFor();
  await page.locator('td[data-variable="true"]').getByText('Variable · 12.5%').waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();

  // 7. Responsive: no horizontal page scroll on the Sales Center screens.
  const routes = [['/admin/workspace/crm/sales', 'sales'], ['/admin/workspace/crm/sales/new', 'new'], [`/admin/workspace/crm/quotes/${quoteId}`, 'quote'], [`/admin/workspace/crm/sales/${saleId}`, 'sale']];
  for (const width of [320, 375, 390, 430, 768]) {
    const mobile = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: true, deviceScaleFactor: 1 });
    await mobile.addCookies([cookie, { name: 'avalon-lang', value: 'es', url: origin }]);
    const m = await mobile.newPage(); const merr = []; m.on('pageerror', e => merr.push(e.message));
    for (const [route, name] of routes) {
      await m.goto(origin + route);
      await m.locator('main, [class*="hud"]').first().waitFor();
      const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${name} at ${width}px: no horizontal page scroll (overflow ${overflow}px)`);
      if (width === 390 || width === 320) await m.screenshot({ path: `${DIR}/${name}-${width}.png`, fullPage: true });
    }
    assert.deepEqual(merr, [], `no page errors at ${width}px`);
    await mobile.close();
  }
});
