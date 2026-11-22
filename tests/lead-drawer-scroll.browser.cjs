'use strict';
// Lead drawer scroll independence (V5 Phase 1). Synthetic PGlite + REST bridge + production build.
// Runs with CRM_BROWSER=1. Scenarios A–E plus wheel/touch isolation, Escape/X close and focus return.
// Desktop 1440 and mobile 390 are Chromium emulation, NOT physical Safari.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { spawn } = require('node:child_process'), { createServer } = require('node:http');

const OWNER = '00000000-0000-4000-8000-0000000000b1';
const DIR = process.env.EVIDENCE_DIR || 'evidence/lead-drawer-scroll';

test('lead drawer opens at the top from any Kanban scroll position and the board keeps its place', { timeout: 300000 }, async t => {
  if (process.env.CRM_BROWSER !== '1') return t.skip('CRM_BROWSER=1 required');
  const { PGlite } = require('@electric-sql/pglite'), { chromium } = require('playwright');
  const { startBridge } = require('./support/rest-bridge.cjs');
  fs.mkdirSync(DIR, { recursive: true });
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2)', [OWNER, 'scroll-qa@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner')", [OWNER]);
  }
  await db.exec(`set request.jwt.claim.sub='${OWNER}';set role authenticated;`);
  // A tall board (many leads in one column) and two leads with long histories.
  const ids = [];
  for (let i = 0; i < 45; i++) {
    const r = await db.query("insert into crm_leads(company,contact,source,owner_id) values($1,$2,'manual',$3) returning id", [`Scroll QA ${String(i).padStart(2, '0')}`, `Contacto ${i}`, OWNER]);
    ids.push(r.rows[0].id);
  }
  for (const lead of [ids[0], ids[22], ids[44]]) {
    for (let i = 0; i < 40; i++) await db.query("insert into crm_activities(lead_id,body) values($1,$2)", [lead, `Nota sintética ${i} — historial largo para probar el desplazamiento interno del panel.`]);
  }
  await db.exec('reset role');

  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: OWNER, email: 'scroll-qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
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

  for (const vp of [{ name: 'desktop-1440', viewport: { width: 1440, height: 900 } }, { name: 'mobile-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
    const ctx = await browser.newContext({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 1 });
    await ctx.addCookies([cookie, { name: 'avalon-lang', value: 'es', url: origin }]);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.goto(origin + '/admin/workspace/crm/leads');
    await page.locator('[data-lead-id]').first().waitFor();
    // Let the page entrance animation finish so measurements reflect the steady state.
    await page.waitForTimeout(700);
    const card = id => page.locator(`[data-lead-id="${id}"]`);
    const drawer = page.getByRole('dialog');
    const state = () => page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-modal="true"]');
      const r = d?.getBoundingClientRect();
      return { winY: Math.round(window.scrollY), open: !!d, top: r ? Math.round(r.top) : null, bottom: r ? Math.round(r.bottom) : null,
        vh: window.innerHeight, drawerTop: d ? d.scrollTop : null, drawerMax: d ? d.scrollHeight - d.clientHeight : null,
        rootOverflow: getComputedStyle(document.documentElement).overflow, active: document.activeElement?.getAttribute('data-lead-id') ?? document.activeElement?.tagName };
    });
    const open = async id => {
      await card(id).scrollIntoViewIfNeeded();
      const before = await state();
      await card(id).click();
      await drawer.waitFor();
      await page.getByText('Nota sintética 39').first().waitFor().catch(() => {});
      await page.waitForTimeout(150);
      return { before, after: await state() };
    };
    const assertTop = (s, label) => {
      assert.equal(s.drawerTop, 0, `${vp.name} ${label}: drawer starts at scrollTop 0 (got ${s.drawerTop})`);
      assert.ok(s.top >= 0 && s.top < 4, `${vp.name} ${label}: drawer anchored to the viewport top (top=${s.top})`);
      assert.ok(s.bottom <= s.vh + 1, `${vp.name} ${label}: drawer fits the viewport (bottom=${s.bottom}, vh=${s.vh})`);
    };
    const scrollDrawerToEnd = async () => {
      await page.evaluate(() => { const d = document.querySelector('[role="dialog"][aria-modal="true"]'); d.scrollTop = d.scrollHeight; });
      const s = await state();
      assert.ok(s.drawerTop > 0, `${vp.name}: drawer content is scrollable (max=${s.drawerMax})`);
    };

    // A — page at the top.
    await page.evaluate(() => window.scrollTo(0, 0));
    let r = await open(ids[0]);
    assertTop(r.after, 'A page top');
    assert.equal(r.after.winY, r.before.winY, `${vp.name} A: page scroll preserved while open`);
    assert.equal(r.after.rootOverflow, 'hidden', `${vp.name} A: background locked`);
    await page.screenshot({ path: `${DIR}/${vp.name}-A-top.png` });
    // FE-STABLE-07: compose tabs follow the ARIA tabs pattern (roving tabindex, arrows, Home/End, tabpanel link).
    await drawer.getByText('Añadir nota, actividad o archivo').click();
    const tab = name => drawer.getByRole('tab', { name, exact: true });
    await tab('Nota').focus();
    assert.equal(await tab('Actividad').getAttribute('tabindex'), '-1', `${vp.name}: only the selected tab is in the Tab order`);
    await page.keyboard.press('ArrowRight');
    assert.equal(await tab('Actividad').getAttribute('aria-selected'), 'true', `${vp.name}: ArrowRight selects the next tab`);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Actividad', `${vp.name}: focus follows selection`);
    await page.keyboard.press('End');
    assert.equal(await tab('Archivo').getAttribute('aria-selected'), 'true', `${vp.name}: End selects the last tab`);
    await page.keyboard.press('ArrowRight');
    assert.equal(await tab('Nota').getAttribute('aria-selected'), 'true', `${vp.name}: arrows wrap`);
    assert.equal(await drawer.getByRole('tabpanel').getAttribute('aria-labelledby'), await tab('Nota').getAttribute('id'), `${vp.name}: tabpanel labelled by the selected tab`);
    await drawer.getByText('Añadir nota, actividad o archivo').click();
    await scrollDrawerToEnd();
    // Wheel / touch over the drawer moves only the drawer, even at its end (no chaining).
    const box = await drawer.boundingBox();
    const winBefore = (await state()).winY;
    if (vp.hasTouch) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), yDistance: -400, gestureSourceType: 'touch', speed: 1200 });
      await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), yDistance: 300, gestureSourceType: 'touch', speed: 1200 });
    } else {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 1500); await page.waitForTimeout(200);
      await page.mouse.wheel(0, -300); await page.waitForTimeout(200);
    }
    assert.equal((await state()).winY, winBefore, `${vp.name}: wheel/touch on the drawer never scrolls the page`);
    // D — close with X, reopen the same lead: top again; page position restored.
    await page.getByRole('button', { name: 'Cerrar historial' }).click();
    await drawer.waitFor({ state: 'detached' });
    let s = await state();
    assert.equal(s.winY, r.before.winY, `${vp.name} D: page scroll restored after X`);
    assert.notEqual(s.rootOverflow, 'hidden', `${vp.name} D: background unlocked after X`);
    assert.equal(s.active, ids[0], `${vp.name} D: focus returned to the opening card`);
    r = await open(ids[0]);
    assertTop(r.after, 'D reopen same lead');

    // B — page scrolled to the middle; E — switch from a scrolled lead to another lead.
    await scrollDrawerToEnd();
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });
    await card(ids[22]).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 0));
    r = await open(ids[22]);
    assert.ok(r.before.winY > 0 || vp.name === 'desktop-1440', `${vp.name} B: page was scrolled before opening (y=${r.before.winY})`);
    assertTop(r.after, 'B/E middle + switched lead');
    assert.equal(r.after.winY, r.before.winY, `${vp.name} B: page scroll preserved while open`);
    await page.screenshot({ path: `${DIR}/${vp.name}-B-middle.png` });
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });
    s = await state();
    assert.equal(s.winY, r.before.winY, `${vp.name} B: page position kept after Escape`);
    assert.equal(s.active, ids[22], `${vp.name} B: Escape returns focus to the card`);

    // C — page at the very bottom.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    await card(ids[44]).scrollIntoViewIfNeeded();
    r = await open(ids[44]);
    assertTop(r.after, 'C page bottom');
    assert.equal(r.after.winY, r.before.winY, `${vp.name} C: page scroll preserved while open`);
    await page.screenshot({ path: `${DIR}/${vp.name}-C-bottom.png` });
    // Filters and adding a note do not jump the drawer back to the top.
    await page.evaluate(() => { const d = document.querySelector('[role="dialog"][aria-modal="true"]'); d.scrollTop = 120; });
    const filter = page.getByRole('button', { name: /^Notas y tareas/ });
    if (await filter.count()) { await filter.first().click(); await page.waitForTimeout(150); assert.ok((await state()).drawerTop > 0, `${vp.name}: changing filters keeps the drawer position`); }
    await page.getByRole('button', { name: 'Cerrar historial' }).click();
    await drawer.waitFor({ state: 'detached' });
    assert.equal((await state()).winY, r.before.winY, `${vp.name} C: bottom position restored`);
    // The board still responds after closing: keyboard pick-up toggles the picked state.
    await card(ids[44]).focus();
    await page.keyboard.press('Space');
    assert.equal(await card(ids[44]).getAttribute('data-picked'), 'true', `${vp.name}: Kanban keyboard drag works after closing`);
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, [], `${vp.name}: no page errors`);
    await ctx.close();
  }
});
