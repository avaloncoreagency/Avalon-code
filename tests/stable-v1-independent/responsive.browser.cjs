'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { chromium } = require('playwright');
const { fixture, OWNER } = require('./fixture.cjs');
const { startBridge } = require('../support/rest-bridge.cjs');

test('protected commercial routes fit all five requested widths with reduced motion', { timeout: 240000 }, async t => {
  assert.equal(process.env.STABLE_BROWSER, '1', 'explicit STABLE_BROWSER=1 required; never report an unexecuted browser as PASS');
  const dir = process.env.EVIDENCE_DIR;
  assert.ok(dir && path.isAbsolute(dir), 'absolute evidence directory required');
  fs.mkdirSync(dir, { recursive: true });
  const { db, client } = await fixture(t);
  await db.exec('reset role');
  const user = { id: OWNER, email: 'qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const access_token = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: OWNER, exp, role: 'authenticated', aal: 'aal1' }) + '.' + enc('synthetic');
  const session = { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  const bridge = await startBridge(db, { users: new Map([[access_token, user]]) });
  t.after(() => bridge.close());
  const socket = createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port; await new Promise(r => socket.close(r));
  const origin = 'http://localhost:' + port;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
      APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key',
      BRIDGE_PUBLIC_READ_DISABLED: 'true', AVALON_RADAR_EXTERNAL_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  t.after(() => require('../support/stop-child.cjs')(child));
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) break;
    try { ready = (await fetch(origin + '/login', { signal: AbortSignal.timeout(1000) })).status === 200; } catch {}
    if (ready) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, output);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  t.after(() => browser.close());
  const measurements = [], errors = [];
  const routes = ['/admin/workspace/crm/leads', '/admin/workspace/crm/clients/' + client,
    '/admin/workspace/crm/inbound', '/admin/workspace/crm/quotes/new', '/admin/workspace/crm/clients/' + client + '/results'];
  for (const width of [320, 375, 390, 768, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', locale: 'es-ES' });
    await ctx.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await ctx.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }, { name: 'avalon-lang', value: 'es', url: origin }]);
    const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
    try {
      for (let index = 0; index < routes.length; index++) {
        const response = await page.goto(origin + routes[index], { waitUntil: 'networkidle', timeout: 20000 });
        assert.equal(response.status(), 200);
        const measurement = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd), responseMs: Math.round(nav.responseEnd),
            resources: performance.getEntriesByType('resource').length,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
        });
        measurements.push({ width, route: routes[index].replace(/\/clients\/[0-9a-f-]+/, '/clients/<synthetic>'), ...measurement });
        fs.writeFileSync(path.join(dir, 'responsive.json'), JSON.stringify({ browser: browser.version(), physicalSafari: 'NOT_RUN', measurements, errors }, null, 2));
        await page.screenshot({ path: path.join(dir, `route-${index}-${width}.png`), fullPage: true });
        assert.equal(measurement.overflow, 0, width + 'px ' + routes[index]);
        assert.ok(measurement.reducedMotion);
      }
    } finally { await ctx.close(); }
  }
  assert.deepEqual(errors, []);
  assert.equal(measurements.length, 25);
});
