// Execute after npm run build. Local Next server only; no hosted identities.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const stopChild = require('./support/stop-child.cjs');

test('every private admin and staff page redirects a signed-out reader to the login', async t => {
  const publicAuth = new Set(['/admin/login', '/admin/signup', '/admin/forgot-password', '/admin/reset-password']);
  const routes = fs.readdirSync('src/app', { recursive: true })
    .filter(file => /^(admin|staff)\//.test(file) && path.basename(file) === 'page.tsx')
    .map(file => '/' + path.dirname(file))
    .filter(route => !publicAuth.has(route));
  const portReservation = net.createServer();
  await new Promise(resolve => portReservation.listen(0, '127.0.0.1', resolve));
  const port = portReservation.address().port;
  await new Promise(resolve => portReservation.close(resolve));
  const origin = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    env: { PATH: process.env.PATH, NODE_ENV: 'production', APP_ORIGIN: origin,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic' },
    stdio: 'ignore',
  });
  t.after(() => stopChild(server));
  for (let attempt = 0; ; attempt++) {
    try {
      const ready = await fetch(origin + '/admin/login');
      await ready.arrayBuffer();
      assert.equal(ready.status, 200);
      break;
    } catch (error) {
      if (server.exitCode !== null || attempt >= 50) throw error;
      await delay(200);
    }
  }
  for (const route of routes) {
    const response = await fetch(origin + route.replace(/\[[^/]+?\]/g, '11111111-1111-4111-8111-111111111111'), { redirect: 'manual' });
    assert.equal(response.status, 307, route);
    const destination = new URL(response.headers.get('location'), origin);
    assert.equal(destination.pathname, '/admin/login', route);
    assert.match(response.headers.get('cache-control'), /no-store/, route);
    await response.arrayBuffer();
  }
  t.diagnostic(routes.length + ' private page patterns; no user session');
});
