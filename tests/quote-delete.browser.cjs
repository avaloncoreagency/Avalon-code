'use strict';
// QUOTES-MANAGEMENT-001 end to end on SYNTHETIC data (PGlite + REST bridge + production build). QUOTE_DELETE_BROWSER=1.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { spawn } = require('node:child_process'), { createServer } = require('node:http');
const OWNER = '00000000-0000-4000-8000-0000000000f8';
const DIR = process.env.EVIDENCE_DIR || 'evidence/quote-delete';

test('Quotes: action menu and owner-only deletion with confirmation modal', { timeout: 300000 }, async t => {
  if (process.env.QUOTE_DELETE_BROWSER !== '1') return t.skip('QUOTE_DELETE_BROWSER=1 required');
  const { PGlite } = require('@electric-sql/pglite'), { chromium } = require('playwright');
  const { startBridge } = require('./support/rest-bridge.cjs');
  fs.mkdirSync(DIR, { recursive: true });
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2)', [OWNER, 'quote-qa@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner')", [OWNER]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [OWNER]);
  await db.exec(`set request.jwt.claim.sub='${OWNER}'; set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const crypto = require('node:crypto');
  const mk = async name => {
    const lead = (await one("insert into crm_leads(company,contact,source,owner_id) values($1,'QA','manual',$2) returning id", [name, OWNER])).id;
    const c = { schemaVersion: 1, lang: 'es', currency: 'USD', title: `Propuesta ${name}`, issueDate: '2026-11-24', validUntil: '2099-12-31',
      client: { company: name, contact: '', email: '', phone: '', address: '' }, issuer: { name: 'Avalon', email: '', phone: '' }, seller: '', objectives: '', problem: '', solution: 's',
      scope: '', deliverables: '', exclusions: '', dependencies: '', timeline: '', support: '', terms: '', notes: '', thirdPartyCosts: '', model: 'fixed',
      lines: [{ code: 'desarrollo-web', name: 'Web', description: '', kind: 'one_time', qty: 1, unitPrice: '500.00' }], commission: null };
    return (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [lead, crypto.randomUUID(), JSON.stringify(c), '{}', crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex')])).r.quote_id;
  };
  const keep = await mk('Conservar QA'), drop = await mk('Eliminar QA');
  const num = async id => (await one('select quote_number from crm_quotes where id=$1', [id])).quote_number;
  const keepNo = await num(keep), dropNo = await num(drop);
  await db.exec('reset role');
  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: OWNER, email: 'quote-qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
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
  await page.goto(`${origin}/admin/workspace/crm/quotes`);
  const row = n => page.locator('tr', { hasText: n });
  // Action menu: View / Edit for drafts; Delete opens the modal with number, client, date, total and status.
  await row(dropNo).locator('[data-quote-actions]').getByRole('link', { name: 'Ver' }).waitFor();
  await row(dropNo).locator('[data-quote-actions]').getByRole('link', { name: 'Editar' }).waitFor();
  await row(dropNo).locator(`[data-open-delete="${dropNo}"]`).click();
  const dialog = page.getByRole('dialog', { name: '¿Estás seguro de que deseas eliminar esta cotización?' });
  await dialog.waitFor();
  const text = await dialog.textContent();
  for (const s of [dropNo, 'Eliminar QA', 'Borrador', '$500.00', 'Cancelar', 'Confirmar eliminación']) assert.ok(text.includes(s), `modal shows ${s}`);
  await page.screenshot({ path: `${DIR}/quote-delete-modal.png` });
  // Cancel changes nothing.
  await dialog.locator('[data-cancel-delete]').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal((await one('select deleted_at from crm_quotes where id=$1', [drop])).deleted_at, null);
  // Confirm: logical deletion, list refreshes, the other quote stays.
  await row(dropNo).locator(`[data-open-delete="${dropNo}"]`).click();
  await dialog.getByLabel(/Motivo/).fill('Duplicada (QA)');
  await dialog.locator('[data-confirm-delete]').click();
  await page.waitForURL(/\/quotes\?ok=deleted$/);
  await page.getByText('Cotización eliminada (archivada)').waitFor();
  assert.equal(await row(dropNo).count(), 0, 'deleted quote leaves the list');
  await row(keepNo).waitFor();
  const r = await one('select deleted_at is not null d, delete_reason from crm_quotes where id=$1', [drop]);
  assert.deepEqual(r, { d: true, delete_reason: 'Duplicada (QA)' });
  assert.equal((await one("select count(*)::int n from crm_timeline where event_type='quote.deleted' and record_id=$1", [drop])).n, 1);
  // The deleted quote's page is read-only with a banner and no delete button.
  await page.goto(`${origin}/admin/workspace/crm/quotes/${drop}`);
  await page.locator('[data-quote-deleted]').waitFor();
  assert.equal(await page.locator('[data-open-delete]').count(), 0);
  assert.equal(await page.locator(`a[href$="/${drop}/edit"], a[href="#close-sale"], form input[name="quote_id"]`).count(), 0, 'archived quotes expose only historical records');
  await page.goto(`${origin}/admin/workspace/crm/quotes/${drop}/edit`);
  await page.locator('[data-quote-deleted]').waitFor();
  assert.equal(new URL(page.url()).pathname, `/admin/workspace/crm/quotes/${drop}`);
  assert.deepEqual(errors, []);
  // Mobile: the modal fits.
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await m.addCookies([cookie, { name: 'avalon-lang', value: 'en', url: origin }]);
  const mp = await m.newPage(); await mp.goto(`${origin}/admin/workspace/crm/quotes`);
  await mp.locator(`[data-open-delete="${keepNo}"]`).click();
  const md = mp.getByRole('dialog', { name: 'Are you sure you want to delete this quote?' }); await md.waitFor();
  const box = await md.boundingBox(); assert.ok(box && box.width <= 390, 'modal fits a 390px screen');
  await md.getByRole('button', { name: 'Cancel' }).click();
  await m.close(); await ctx.close();
});
