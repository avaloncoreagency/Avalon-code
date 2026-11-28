'use strict';
// Sales Pro collections end to end on SYNTHETIC data: PGlite + REST bridge + production build (`npm run build` first).
// Runs with SALES_SCHEDULE_BROWSER=1. Chromium emulation at 1440 and 390 px — NOT physical Safari.
// Flow: confirmed sale → schedule created in the UI (exact total) → receipt allocated to an installment → payment
// verified in the UI → partial refund → chargeback opened (status "disputed") and resolved → list filters and KPI.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { spawn } = require('node:child_process'), { createServer } = require('node:http');
const verifiedContract = require('./helpers/verified-contract.cjs');
const approveFixtureOffers = require('./helpers/approve-fixture-offers.cjs');

const OWNER = '00000000-0000-4000-8000-0000000000e1';
const DIR = process.env.EVIDENCE_DIR || 'evidence/sales-schedule';

test('Sales Pro collections: schedule, allocation, verification, refund and chargeback through the real UI', { timeout: 300000 }, async t => {
  if (process.env.SALES_SCHEDULE_BROWSER !== '1') return t.skip('SALES_SCHEDULE_BROWSER=1 required');
  const { PGlite } = require('@electric-sql/pglite'), { chromium } = require('playwright');
  const { startBridge } = require('./support/rest-bridge.cjs');
  fs.mkdirSync(DIR, { recursive: true });
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2)', [OWNER, 'finance-qa@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner')", [OWNER]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [OWNER]);
  await approveFixtureOffers(db,OWNER,[['desarrollo-web',1000]]);
  await db.exec(`set request.jwt.claim.sub='${OWNER}'; set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const sale = async (name, n, daysAgo) => {
    const lead = (await one("insert into crm_leads(company,contact,email,source,owner_id) values($1,'QA',$2,'Manual',$3) returning id", [name, `${n}@example.invalid`, OWNER])).id;
    await verifiedContract(db, lead, 'Synthetic agreement');
    const soldOn = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
    return (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: `93000000-0000-4000-8000-00000000000${n}`, lead_id: lead,
      new_client: { legal_name: name }, seller_id: OWNER, sold_on: soldOn, lines: [{ service_code: 'desarrollo-web', unit_price: '1000.00' }] })])).r;
  };
  const main = await sale('Collections QA LLC', 1, 0);
  // A second sale with an installment already past due, to exercise the overdue filter and KPI.
  const late = await sale('Late Payer QA LLC', 2, 40);
  await db.query('select crm_sale_schedule_set($1,$2::jsonb,0,null)', [late.sale_id, JSON.stringify([
    { kind: 'installment', due_on: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10), amount: '500.00' },
    { kind: 'balance', due_on: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10), amount: '500.00' }])]);
  await db.exec('reset role');

  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: OWNER, email: 'finance-qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
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
  const saleUrl = `${origin}/admin/workspace/crm/sales/${main.sale_id}`;
  const panel = () => page.locator('section[aria-labelledby="collections"]');
  const statusIs = async value => page.waitForFunction(v => document.querySelector('section[aria-labelledby="collections"]')?.getAttribute('data-payment-status') === v, value);

  // 1. Create the schedule in the editor: start from one balance row, add a second, split 400 / 600 exactly.
  await page.goto(saleUrl);
  const editor = panel().getByRole('form', { name: 'Editor del calendario de pagos' });
  await editor.waitFor();
  await editor.getByRole('button', { name: 'Añadir cuota' }).click();
  await editor.getByLabel('Importe 1', { exact: true }).fill('400.00');
  await editor.getByText(/falta USD 600\.00/).waitFor();
  assert.equal(await editor.getByRole('button', { name: 'Crear calendario' }).isDisabled(), true, 'cannot submit a schedule that does not add up');
  await editor.getByLabel('Importe 2', { exact: true }).fill('600.00');
  await editor.getByText('cuadra exactamente').waitFor();
  await editor.getByRole('button', { name: 'Crear calendario' }).click();
  await page.getByText('Calendario de pagos guardado.').waitFor();
  const rows = panel().getByRole('table', { name: 'Cuotas' }).locator('tbody tr');
  assert.equal(await rows.count(), 2);
  assert.equal((await one('select count(*)::int n from crm_sale_installments where sale_id=$1 and status=$2', [main.sale_id, 'scheduled'])).n, 2, 'persisted');

  // 2. Record a Zelle receipt allocated to installment #1 (manual channel; no processor).
  const payForm = page.locator('section[aria-labelledby="payments"] form');
  await payForm.getByLabel('Importe (USD)').fill('400.00');
  await payForm.locator('select[name="channel"]').selectOption('zelle');
  await payForm.locator('select[name="installment_id"]').selectOption({ index: 1 });
  await payForm.getByLabel('Referencia (sin datos bancarios)').fill('ZELLE-QA-001');
  await payForm.getByRole('button', { name: 'Registrar cobro' }).click();
  await page.getByText('Cobro registrado.').waitFor();
  await statusIs('partially_paid');
  const stored = await one('select method, reference, installment_id is not null allocated from crm_payments where sale_id=$1', [main.sale_id]);
  assert.deepEqual(stored, { method: 'zelle', reference: 'ZELLE-QA-001', allocated: true }, 'real channel stored, no [channel] prefix');
  assert.equal(await rows.first().locator('td').last().textContent(), 'Pagada');

  // 3. Verify the receipt through the existing reconciliation panel, then a partial refund through the new form.
  const verify = page.getByRole('button', { name: 'Verificar pago' });
  await verify.locator('xpath=ancestor::form').getByLabel('Referencia de evidencia').fill('Extracto Zelle sintético');
  await verify.click();
  await page.waitForFunction(() => document.body.innerText.includes('Reembolso o contracargo del pago'));
  await page.goto(saleUrl);
  await panel().getByText(/Reembolso o contracargo del pago/).click();
  const refund = panel().locator('form').filter({ has: page.locator('input[name="payment_id"]') });
  await refund.getByLabel(/^Importe/).fill('150.00');
  await refund.getByLabel('Motivo documentado').fill('Ajuste de alcance acordado por escrito');
  await refund.getByRole('button', { name: 'Registrar' }).click();
  await page.getByText(/Reembolso o contracargo registrado/).waitFor();
  assert.match(await panel().getByText(/^Reembolso · /).first().textContent(), /150/);

  // 4. Chargeback on the rest → "En disputa"; resolve won → back to partially paid.
  await panel().getByText(/Reembolso o contracargo del pago/).click();
  const cb = panel().locator('form').filter({ has: page.locator('input[name="payment_id"]') });
  await cb.locator('select[name="kind"]').selectOption('chargeback');
  await cb.getByLabel('Motivo documentado').fill('Disputa abierta por el banco emisor');
  await cb.getByRole('button', { name: 'Registrar' }).click();
  await page.getByText(/Reembolso o contracargo registrado/).waitFor();
  await statusIs('disputed');
  await panel().locator('input[name="note"]').fill('Banco falló a favor; fondos devueltos');
  await panel().getByRole('button', { name: 'Resolver' }).click();
  await page.getByText('Contracargo resuelto.').waitFor();
  await statusIs('partially_paid');
  const rec = await one('select net_collected::text, refunded::text, open_chargebacks from crm_sale_receivables where sale_id=$1', [main.sale_id]);
  assert.deepEqual(rec, { net_collected: '250.00', refunded: '150.00', open_chargebacks: 0 });
  await page.screenshot({ path: `${DIR}/sale-collections-1440.png`, fullPage: true });

  // 5. Sales list: collections column, overdue filter scoped in PostgreSQL, agency KPI.
  await page.goto(`${origin}/admin/workspace/crm/sales`);
  await page.getByText('Cobros vencidos').waitFor();
  await page.getByRole('navigation', { name: 'Filtrar ventas por cobranza' }).getByRole('link', { name: 'Vencidas' }).click();
  await page.waitForURL(/payment=overdue/);
  const listed = page.locator('table tbody tr');
  assert.equal(await listed.count(), 1);
  assert.match(await listed.first().textContent(), /Late Payer QA LLC[\s\S]*Vencida/);
  assert.deepEqual(errors, []);
  await ctx.close();

  // 6. iPhone-width layout: no horizontal page scroll on the sale with its collections panel.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await mobile.addCookies([cookie, { name: 'avalon-lang', value: 'en', url: origin }]);
  const m = await mobile.newPage(); const merr = []; m.on('pageerror', e => merr.push(e.message));
  await m.goto(saleUrl);
  await m.getByRole('heading', { name: 'Collections and payment schedule' }).waitFor();
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `no horizontal page scroll at 390 px (overflow ${overflow}px)`);
  await m.screenshot({ path: `${DIR}/sale-collections-390.png`, fullPage: true });
  assert.deepEqual(merr, []);
  await mobile.close();
});
