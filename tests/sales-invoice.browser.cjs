'use strict';
// SALES-INVOICE-001 end to end on SYNTHETIC data: PGlite + REST bridge + production build (`npm run build` first).
// Runs with SALES_INVOICE_BROWSER=1. Chromium emulation, NOT physical Safari/iOS print.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { spawn } = require('node:child_process'), { createServer } = require('node:http');
const verifiedContract = require('./helpers/verified-contract.cjs');
const OWNER = '00000000-0000-4000-8000-0000000000f7';
const DIR = process.env.EVIDENCE_DIR || 'evidence/sales-invoice';

test('Invoices: view, PDF and print are read-only, correct, private and IDOR-safe', { timeout: 300000 }, async t => {
  if (process.env.SALES_INVOICE_BROWSER !== '1') return t.skip('SALES_INVOICE_BROWSER=1 required');
  const { PGlite } = require('@electric-sql/pglite'), { chromium } = require('playwright');
  const { startBridge } = require('./support/rest-bridge.cjs');
  fs.mkdirSync(DIR, { recursive: true });
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2)', [OWNER, 'invoice-qa@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner')", [OWNER]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [OWNER]);
  await db.exec(`set request.jwt.claim.sub='${OWNER}'; set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const sale = async (name, n) => {
    const lead = (await one("insert into crm_leads(company,contact,email,source,owner_id) values($1,'QA',$2,'Manual',$3) returning id", [name, `inv${n}@example.invalid`, OWNER])).id;
    await verifiedContract(db, lead, 'Synthetic agreement');
    return (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: `95000000-0000-4000-8000-00000000000${n}`, lead_id: lead,
      new_client: { legal_name: name }, seller_id: OWNER, sold_on: new Date().toISOString().slice(0, 10), lines: [{ service_code: 'desarrollo-web', unit_price: '1000.00', description: 'Sitio con reservas' }] })])).r;
  };
  const main = await sale('Invoice QA LLC', 1), other = await sale('Other Invoice QA LLC', 2);
  const today = new Date().toISOString().slice(0, 10), due = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  const inv = (await one('select crm_invoice_record($1::jsonb) r', [JSON.stringify({ sale_id: main.sale_id, number: 'INV-QA-0001', amount: '1000.00', issued_on: today, due_on: due, note: 'NOTA INTERNA QA — no para el cliente' })])).r;
  const pay = (await one("insert into crm_payments(sale_id,amount,currency,received_on,method,reference,invoice_id) values($1,'400.00','USD',current_date,'zelle','ZELLE-QA',$2) returning id", [main.sale_id, inv.invoice_id])).id;
  await db.query("select crm_payment_verify($1,'Extracto bancario sintético')", [pay]);
  await db.exec('reset role');
  const snapshot = async () => (await db.query(`select (select count(*) from crm_invoices)::int inv, (select count(*) from crm_payments)::int pay,
    (select string_agg(number||status||amount::text, ',' order by number) from crm_invoices) invs, (select count(*) from crm_timeline)::int tl,
    (select count(*) from crm_sales)::int sales, (select sum(total)::text from crm_sales) total`)).rows[0];
  const before = await snapshot();

  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: OWNER, email: 'invoice-qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
  const access_token = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: OWNER, exp, role: 'authenticated', aal: 'aal1' }) + '.' + enc('synthetic');
  const bridge = await startBridge(db, { users: new Map([[access_token, user]]) }); t.after(() => bridge.close());
  const reservation = createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const origin = 'http://localhost:' + port;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key', AVALON_RADAR_EXTERNAL_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', b => log += b); child.stderr.on('data', b => log += b);
  t.after(() => require('./support/stop-child.cjs')(child));
  for (let i = 0; i < 150; i++) { try { if ((await fetch(origin + '/login')).status < 500) break; } catch {} if (i === 149) assert.fail(log); await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true }); t.after(() => browser.close());
  const session = { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  const cookie = { name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addCookies([cookie, { name: 'avalon-lang', value: 'es', url: origin }]);
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(20000);
  const invUrl = `${origin}/admin/workspace/crm/sales/${main.sale_id}/invoices/${inv.invoice_id}`;

  // 1. From the sale: closing summary (responsible person, closing basis), then View invoice.
  await page.goto(`${origin}/admin/workspace/crm/sales/${main.sale_id}`);
  const summary = page.locator('[data-closing-summary]');
  assert.match(await summary.locator('[data-closing-seller]').textContent(), /invoice-qa/);
  assert.match(await summary.locator('[data-closing-basis]').textContent(), /Cerrada por \$1,000\.00/);
  assert.match(await summary.locator('[data-closing-invoice]').textContent(), /INV-QA-0001/);
  assert.equal(await summary.locator('[data-issue-invoice]').count(), 0, 'fully invoiced: nothing more to issue');
  await page.locator('[data-invoice-actions]').getByRole('link', { name: 'Ver factura' }).click();
  await page.waitForURL(invUrl);
  const sheet = page.getByRole('article', { name: 'Factura INV-QA-0001' });
  await sheet.waitFor();
  assert.match(await sheet.locator('[data-invoice-amount]').textContent(), /1,000\.00/);
  assert.match(await sheet.locator('[data-invoice-balance]').textContent(), /600\.00/, 'balance = 1000 − verified 400');
  assert.equal(await sheet.getAttribute('data-invoice-state'), 'partially_paid');
  assert.match(await sheet.locator('[data-invoice-seller]').textContent(), /invoice-qa/, 'invoice names the person responsible');
  assert.match(await sheet.locator('[data-invoice-closing]').textContent(), /Cerrada por \$1,000\.00/, 'invoice says how the sale closed');
  const html = await page.content();
  assert.ok(!html.includes('NOTA INTERNA QA'), 'internal invoice note never reaches the client document');
  assert.ok(/Sitio con reservas/.test(html) && /Invoice QA LLC/.test(html));
  await page.screenshot({ path: `${DIR}/invoice-1440.png`, fullPage: true });
  // 2. Print layout: toolbar and app chrome hidden.
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('nav[aria-label="Acciones de la factura"]').isVisible(), false);
  await page.pdf({ path: `${DIR}/invoice-print-letter.pdf`, format: 'Letter' });
  await page.emulateMedia({ media: 'screen' });
  // 3. Download PDF.
  const pdf = await page.request.get(invUrl + '/pdf');
  assert.equal(pdf.status(), 200);
  assert.match(pdf.headers()['content-type'], /application\/pdf/);
  assert.match(pdf.headers()['content-disposition'], /Avalon-Invoice-INV-QA-0001\.pdf/);
  const body = (await pdf.body()).toString('latin1');
  assert.ok(body.startsWith('%PDF-1.4') && body.includes('(INV-QA-0001)') && !body.includes('NOTA INTERNA'));
  assert.ok(body.includes('Responsable de la venta: invoice-qa'), 'PDF names the person responsible');
  fs.writeFileSync(`${DIR}/Avalon-Invoice-INV-QA-0001.pdf`, await pdf.body());
  // 4. IDOR: the same invoice id under another sale is not served.
  assert.equal((await page.request.get(`${origin}/admin/workspace/crm/sales/${other.sale_id}/invoices/${inv.invoice_id}/pdf`)).status(), 404);
  const idor = await page.goto(`${origin}/admin/workspace/crm/sales/${other.sale_id}/invoices/${inv.invoice_id}`);
  assert.equal(idor.status(), 404);
  // 5. Sales list and Clients 360 point to the same record; the other sale shows "not invoiced".
  await page.goto(`${origin}/admin/workspace/crm/sales`);
  await page.getByRole('link', { name: 'INV-QA-0001', exact: true }).waitFor();
  await page.locator(`[data-issue-invoice="${other.sale_number}"]`).getByRole('button', { name: 'Emitir factura' }).waitFor();
  await page.goto(`${origin}/admin/workspace/crm/clients/${main.client_id}`);
  await page.locator('[data-client-invoice]').filter({ hasText: 'INV-QA-0001' }).getByRole('link', { name: 'Ver factura' }).waitFor();
  // 6. Nothing changed: no new invoice, number, payment, total or timeline event.
  assert.deepEqual(await snapshot(), before, 'viewing / printing / downloading is read-only');
  // 6b. "Emitir factura" (explicit click) for a sale without invoice: one invoice for the full total, numbered from the sale.
  await page.goto(`${origin}/admin/workspace/crm/sales`);
  await page.locator(`[data-issue-invoice="${other.sale_number}"]`).getByRole('button', { name: 'Emitir factura' }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}\?ok=invoiced$/);
  const issued = page.getByRole('article', { name: `Factura FAC-${other.sale_number}` });
  await issued.waitFor();
  assert.match(await issued.locator('[data-invoice-amount]').textContent(), /1,000\.00/);
  await page.locator('[data-invoice-issued]').waitFor();
  const issuedPdf = await page.request.get(page.url().replace(/\?.*$/, '') + '/pdf');
  assert.equal(issuedPdf.status(), 200);
  // A second click (stale page / double submit) never creates another invoice.
  await page.goto(`${origin}/admin/workspace/crm/sales/${other.sale_id}`);
  assert.equal(await page.locator('[data-closing-summary] [data-issue-invoice]').count(), 0);
  const after = await snapshot();
  assert.equal(after.inv, before.inv + 1, 'exactly one invoice issued');
  assert.equal(after.total, before.total, 'sale totals unchanged');
  assert.equal(after.pay, before.pay, 'no payment created');
  assert.deepEqual(errors, []);
  await ctx.close();
  // 7. Mobile.
  for (const width of [320, 390, 768]) {
    const m = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: true, deviceScaleFactor: 1 });
    await m.addCookies([cookie, { name: 'avalon-lang', value: 'en', url: origin }]);
    const mp = await m.newPage(); await mp.goto(invUrl); await mp.getByRole('article', { name: 'Invoice INV-QA-0001' }).waitFor();
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `invoice at ${width}px overflow ${overflow}px`);
    if (width === 390) await mp.screenshot({ path: `${DIR}/invoice-390.png`, fullPage: true });
    await m.close();
  }
});
