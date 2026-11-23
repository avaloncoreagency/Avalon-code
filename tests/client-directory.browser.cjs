'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const stopChild = require('./support/stop-child.cjs');

const DIRECTORY = '/admin/workspace/crm/clients';
const OWNER = '00000000-0000-4000-8000-000000000001';

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

test('client directory retains search and archive scope across pages', { timeout: 120000 }, async t => {
  if (process.env.CRM_BROWSER !== '1') return t.skip('CRM_BROWSER=1 required');
  const { chromium } = require('playwright');
  const user = { id: OWNER, email: 'directory@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = [encode({ alg: 'HS256', typ: 'JWT' }), encode({ sub: OWNER, exp, role: 'authenticated', aal: 'aal1' }), encode('synthetic')].join('.');
  const session = { access_token: accessToken, refresh_token: 'synthetic', expires_in: 3600, expires_at: exp, token_type: 'bearer', user };
  const archiveId = '20000000-0000-4000-8000-000000000030';
  const fixtures = Array.from({ length: 32 }, (_, index) => ({
    id: '20000000-0000-4000-8000-' + String(index).padStart(12, '0'),
    client_code: 'QA-' + index, legal_name: index === 31 ? 'Unrelated Company' : 'Directory QA ' + index,
    trade_name: index === 0 ? 'LongCompanyName'.repeat(12) : '', industry: '', location: '',
    status: index === 30 ? 'archived' : 'active', owner_id: OWNER, updated_at: '2026-01-01T00:00:00Z',
    crm_sales: [], os_projects: [],
  }));
  const queries = [];
  const remote = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const json = (data, headers = {}) => {
      response.writeHead(200, { 'content-type': 'application/json', ...headers });
      response.end(JSON.stringify(data));
    };
    if (request.headers.authorization !== 'Bearer ' + accessToken) {
      response.writeHead(401);
      return response.end();
    }
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname === '/rest/v1/agency_memberships') return json([{ role: 'owner' }]);
    if (url.pathname === '/rest/v1/rpc/crm_owner_directory') return json([{ user_id: OWNER, email: user.email }]);
    if (url.pathname === '/rest/v1/crm_clients') {
      const search = url.searchParams.get('or')?.match(/ilike\."%([^%]+)%"/)?.[1]?.toLowerCase();
      const excludeArchived = url.searchParams.get('status') === 'neq.archived';
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? fixtures.length);
      queries.push({ excludeArchived, search, offset, order: url.searchParams.get('order') });
      const results = fixtures.filter(client =>
        (!excludeArchived || client.status !== 'archived') &&
        (!search || [client.client_code, client.legal_name, client.trade_name].some(value => value.toLowerCase().includes(search))));
      const rows = results.slice(offset, offset + limit);
      const range = rows.length ? offset + '-' + (offset + rows.length - 1) : '*';
      return json(rows, { 'content-range': range + '/' + results.length });
    }
    return json([]);
  });
  const remotePort = await listen(remote);
  t.after(() => new Promise(resolve => remote.close(resolve)));
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const origin = 'http://localhost:' + port;
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    env: {
      ...process.env,
      APP_ORIGIN: origin,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:' + remotePort,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key',
      BRIDGE_PUBLIC_READ_DISABLED: 'true',
      AVALON_RADAR_EXTERNAL_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => stopChild(app));
  let log = '';
  app.stdout.on('data', chunk => { log += chunk; });
  app.stderr.on('data', chunk => { log += chunk; });
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(origin + '/login')).status < 500) break; } catch {}
    if (attempt === 149) assert.fail(log);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  t.after(() => browser.close());
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 750 }]) {
    const mobile = viewport.width < 768;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    await context.addCookies([
      { name: 'sb-127-auth-token', value: 'base64-' + encode(session), url: origin },
      { name: 'avalon-lang', value: 'es', url: origin },
    ]);
    const page = await context.newPage();
    try {
      const response = await page.goto(origin + DIRECTORY + '?q=Directory+QA&archived=1');
      assert.equal(response.status(), 200, log);
      assert.equal(new URL(page.url()).pathname, DIRECTORY, 'expected the authorized directory instead of a redirect');
      const next = page.getByRole('link', { name: 'Siguiente', exact: true });
      const nextUrl = new URL(await next.getAttribute('href', { timeout: 10000 }), origin + DIRECTORY);
      assert.equal(nextUrl.searchParams.get('q'), 'Directory QA');
      assert.equal(nextUrl.searchParams.get('archived'), '1', 'pagination must preserve archive scope');
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(hasOverflow, false, 'directory must fit at ' + viewport.width + 'px');
      await next.focus();
      await page.keyboard.press('Enter');
      const archived = page.getByRole('link', { name: /Directory QA 30/ });
      assert.equal(await archived.getAttribute('href'), DIRECTORY + '/' + archiveId);
      assert.ok(queries.some(query => query.offset === 30 && !query.excludeArchived && query.search === 'directory qa' && query.order === 'updated_at.desc,id.asc'));
      const archiveScope = page.getByRole('combobox', { name: 'Archivados', exact: true });
      assert.equal(await archiveScope.inputValue(), '1');

      await page.getByLabel('Buscar por nombre o código').fill('missing record');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await page.getByText('Ninguna empresa coincide con la búsqueda.').waitFor();
      const filteredUrl = new URL(page.url());
      assert.equal(filteredUrl.searchParams.get('archived'), '1');
      assert.equal(filteredUrl.searchParams.has('page'), false);
      await page.getByRole('link', { name: 'Limpiar filtros' }).click();
      await page.waitForURL(origin + DIRECTORY);
      await page.getByRole('link', { name: /Directory QA 0/ }).waitFor({ timeout: 10000 });
      assert.equal(await archiveScope.inputValue(), '0');
      await page.getByRole('link', { name: 'Siguiente', exact: true }).click();
      await page.getByRole('link', { name: /Unrelated Company/ }).waitFor({ timeout: 10000 });
      assert.equal(await archived.count(), 0);
      t.diagnostic(viewport.width + 'px: search, archive scope, keyboard pagination, empty state, reset and overflow');
    } finally {
      await context.close();
    }
  }
});
