// Avalon HQ 3D through the real production build: synthetic Supabase (PGlite + REST bridge), synthetic owners.
// HQ_BROWSER=1 runs Playwright and writes screenshots to HQ_EVIDENCE (default ../evidence/hq).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { startBridge } = require('./support/rest-bridge.cjs');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1', SAMUEL = '00000000-0000-4000-8000-0000000000b2', OUTSIDER = '00000000-0000-4000-8000-0000000000c3';
const EVIDENCE = process.env.HQ_EVIDENCE || '../evidence/hq';

test('Avalon HQ 3D: owner-only, ten stations, real manager data, actions, light view, mobile', { timeout: 300000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','miguel@example.invalid'),('${SAMUEL}','samuel@example.invalid'),('${OUTSIDER}','outsider@example.invalid');`);
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file.startsWith('20261102053022')) await db.exec(`insert into agency_memberships(user_id,role) values('${MIGUEL}','owner'),('${SAMUEL}','owner');`);
  }
  // Synthetic CRM state + one real daily mission through the engine.
  await db.exec(`reset role; set request.jwt.claim.sub='${MIGUEL}'; set role authenticated;
    insert into crm_leads(company,source,owner_id,follow_up_at,created_by) values ('Lead Sintético Vencido','test','${MIGUEL}',now()-interval '1 day','${MIGUEL}');
    select crm_agent_mission_start(null,null,'hq-browser-0001'); reset role;`);
  const users = new Map();
  const session = (id, email) => {
    const user = { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
    const exp = Math.floor(Date.now() / 1000) + 3600; const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
    const access_token = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: id, exp, role: 'authenticated', aal: 'aal1' })}.${Buffer.from('synthetic-signature').toString('base64url')}`;
    users.set(access_token, user); return { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  };
  const miguel = session(MIGUEL, 'miguel@example.invalid'), outsider = session(OUTSIDER, 'outsider@example.invalid');
  const errors = [];
  const bridge = await startBridge(db, { users, log: (kind, ...rest) => { if (kind === 'error') errors.push(rest.join(' ')); } });
  t.after(() => bridge.close());
  const reservation = createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', c => (output += c)); child.stderr.on('data', c => (output += c));
  t.after(async () => { child.kill(); await new Promise(r => child.once('exit', r)); });
  for (let i = 0; i < 150; i++) { try { if ((await fetch(origin + '/login')).status < 500) break; } catch {} if (i === 149) assert.fail(output); await new Promise(r => setTimeout(r, 100)); }
  // Use the real @supabase/ssr cookie encoder instead of guessing its storage-key or token wire format.
  // The issuer and the Auth/Data bridge are 100% synthetic; no production keys or accounts are used.
  async function cookieJar(session) {
    const jar = new Map();
    const client = require('@supabase/ssr').createServerClient(bridge.url, 'synthetic-key', {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: values => values.forEach(({ name, value }) => jar.set(name, value)),
      },
    });
    const { error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    assert.equal(error, null, 'synthetic session creation must use the real auth-js API');
    assert.ok([...jar.keys()].some(name => name.endsWith('auth-token')), 'Supabase SSR wrote its real auth cookie');
    return [...jar].map(([name, value]) => ({ name, value }));
  }
  const ownerCookies = await cookieJar(miguel);
  const outsiderCookies = await cookieJar(outsider);
  const get = (p, s) => fetch(origin + p, { redirect: 'manual', headers: {
    cookie: (s === miguel ? ownerCookies : s === outsider ? outsiderCookies : []).map(({ name, value }) => `${name}=${value}`).join('; '),
  } });

  for (const route of ['/admin/workspace/crm/office', '/admin/workspace/crm/office/hq', '/admin/workspace/crm/office/manager-activity', '/admin/workspace/crm/office/executive']) {
    assert.equal((await get(route)).status, 307, route + ' signed out');
    assert.notEqual((await get(route, outsider)).status, 200, route + ' non-owner');
    if (route === '/admin/workspace/crm/office') {
      const r = await get(route, miguel); // ONE office: the old route redirects to the official HQ (no broken links)
      assert.equal(r.status, 307); assert.match(r.headers.get('location') || '', /\/admin\/workspace\/crm\/office\/hq$/);
    } else assert.equal((await get(route, miguel)).status, 200, route + ' owner: ' + output.slice(-1500));
  }
  const exec = await (await get('/admin/workspace/crm/office/executive', miguel)).json();
  assert.equal(exec.runs.received, exec.runs.pending + exec.runs.active + exec.runs.completed + exec.runs.failed_or_blocked, 'executive counts add up from real rows');
  const activity = await (await get('/admin/workspace/crm/office/manager-activity', miguel)).json();
  assert.deepEqual(activity.managers.map(m => m.status), ['completed', 'completed', 'completed', 'completed', 'completed'], 'real runs, no invented states');

  if (process.env.HQ_BROWSER !== '1') return;
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const { chromium, devices } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  t.after(() => browser.close());
  const open = async (options) => {
    const ctx = await browser.newContext({ locale: 'es-ES', ...options });
    await ctx.addCookies(ownerCookies.map(({ name, value }) => ({ name, value, url: origin })));
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push('pageerror: ' + e.message)); return page;
  };
  const page = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(origin + '/admin/workspace/crm/office/hq');
  await page.getByRole('heading', { name: 'Avalon HQ' }).waitFor();
  await page.locator('canvas').waitFor({ timeout: 30000 });
  // Higgsfield models (optimized derivatives) must actually load; record real measurements.
  await page.waitForFunction(() => window.__hqPerf && window.__hqPerf.modelsMs !== null, null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  const perfDesktop = await page.evaluate(() => window.__hqPerf);
  assert.equal(await page.locator('section[aria-label="Avalon HQ"]').count(), 1, 'exactly one 3D office on the page');
  assert.equal(await page.locator('canvas').count(), 1, 'one WebGL scene, no second office');
  for (const n of ['REN', 'SHIN', 'HARU', 'SORA', 'KENJI', 'Estación 6', 'Estación 10']) await page.getByRole('button', { name: new RegExp('^' + n) }).first().waitFor();
  await page.screenshot({ path: path.join(EVIDENCE, 'hq-desktop-overview.png') });
  await page.getByRole('button', { name: /^HARU/ }).click();
  await page.getByRole('heading', { name: 'HARU' }).waitFor();
  assert.match(await page.locator('aside[aria-live]').innerText(), /Completado[\s\S]*seguimiento/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(EVIDENCE, 'hq-desktop-haru.png') });
  await page.getByRole('button', { name: '← Vista general' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /^Estación 8/ }).click();
  assert.match(await page.locator('aside[aria-live]').innerText(), /Próxima incorporación — Equipo de Samuel[\s\S]*Sin cuenta, sin IA/);
  assert.equal(await page.getByRole('button', { name: 'Ejecutar su tarea ahora' }).count(), 0, 'reserved seats have no manager actions');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(EVIDENCE, 'hq-desktop-reserved.png') });
  // A real action from the HQ: run SHIN now (same-origin POST through the engine).
  await page.getByRole('button', { name: '← Vista general' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /^SHIN/ }).click();
  await page.getByRole('button', { name: 'Ejecutar su tarea ahora' }).click();
  await page.getByText(/Resultado: completed/).waitFor({ timeout: 60000 });
  // Light view keeps every station reachable without WebGL.
  // Owners appear in the same scene with their real presence; tapping one opens the directory profile drawer.
  await page.getByRole('button', { name: '← Vista general' }).click();
  await page.getByRole('button', { name: 'Dirección', exact: true }).click(); await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(EVIDENCE, 'hq-desktop-direction.png') });
  await page.locator('button[aria-label$="Abrir perfil"]').first().click();
  await page.getByRole('dialog').waitFor({ timeout: 30000 });
  await page.keyboard.press('Escape');
  // The preserved directory uses the SAME activity as HQ rather than legacy "offline" placeholders.
  await page.getByRole('button', { name: /Abrir ficha de HARU/ }).click();
  const runDrawer = await page.getByRole('dialog').innerText();
  assert.match(runDrawer, /Última ejecución completada/);
  assert.doesNotMatch(runDrawer, /no tiene un backend de ejecución conectado/i);
  await page.keyboard.press('Escape');
  await page.locator('section[aria-labelledby="exec-title"]').scrollIntoViewIfNeeded();
  await page.getByText('Completadas con evidencia').waitFor();
  await page.screenshot({ path: path.join(EVIDENCE, 'hq-desktop-executive.png'), fullPage: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Vista ligera' }).click();
  assert.equal(await page.locator('section[aria-label="Avalon HQ"] ol').first().locator('li').count(), 10);
  await page.screenshot({ path: path.join(EVIDENCE, 'hq-desktop-light.png') });

  const phone = await open({ ...devices['iPhone 13'] });
  await phone.goto(origin + '/admin/workspace/crm/office/hq');
  await phone.locator('canvas').waitFor({ timeout: 30000 });
  await phone.waitForFunction(() => window.__hqPerf && window.__hqPerf.modelsMs !== null, null, { timeout: 90000 }); await phone.waitForTimeout(2500);
  const perfPhone = await phone.evaluate(() => window.__hqPerf);
  assert.equal(perfPhone.tier, 'mobile');
  fs.writeFileSync(path.join(EVIDENCE, 'hq-perf.json'), JSON.stringify({ desktop: perfDesktop, iphone13: perfPhone, note: 'SwiftShader (software GPU) in CI: absolute times are pessimistic; draw calls/triangles are device-independent' }, null, 2));
  console.log('HQ_PERF', JSON.stringify({ desktop: perfDesktop, iphone13: perfPhone }));
  await phone.screenshot({ path: path.join(EVIDENCE, 'hq-iphone-overview.png') });
  await phone.getByRole('button', { name: /^SORA/ }).tap();
  await phone.getByRole('heading', { name: 'SORA' }).waitFor(); await phone.waitForTimeout(1200);
  await phone.screenshot({ path: path.join(EVIDENCE, 'hq-iphone-sora.png') });
  await phone.getByRole('button', { name: '← Vista general' }).tap();
  const teamCamera = phone.getByRole('button', { name: 'Equipo', exact: true });
  await teamCamera.tap();
  assert.equal(await teamCamera.getAttribute('aria-pressed'), 'true', 'camera shortcut stays selected instead of jumping back to overview');
  const tapHeights = await phone.locator('nav[aria-label="Vistas de cámara"] button').evaluateAll(
    buttons => buttons.map(b => b.getBoundingClientRect().height));
  assert.ok(tapHeights.length === 5 && tapHeights.every(h => h >= 44), 'all five iPhone camera targets are at least 44px high');
  await phone.screenshot({ path: path.join(EVIDENCE, 'hq-iphone-camera-controls.png') });
  // Synthetic context-lost event exercises React fallback, not a real device GPU fault.
  await phone.locator('canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await phone.getByText(/Vista ligera activada; las diez estaciones siguen disponibles/).waitFor();
  assert.equal(await phone.locator('canvas').count(), 0, 'iPhone falls back to light view when WebGL is lost');
  assert.equal(await phone.locator('section[aria-label="Avalon HQ"] ol').first().locator('li').count(), 10,
    'all five manager desks and five unassigned seats stay accessible');
  await phone.screenshot({ path: path.join(EVIDENCE, 'hq-iphone-context-fallback.png') });
  const reduced = await open({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
  await reduced.goto(origin + '/admin/workspace/crm/office/hq?vista=ligera');
  assert.equal(await reduced.locator('canvas').count(), 0, 'light view requested by URL');
  assert.deepEqual(errors.filter(e => !/favicon/.test(e)), [], 'no page or bridge errors');
});
