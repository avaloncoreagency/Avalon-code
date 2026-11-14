// Deploy safety: merging to `main` deploys the app to production BEFORE the owner approves new migrations. This test runs
// the production build against a database that has ONLY the migrations recorded in the production ledger, and checks
// that no private page crashes (HTTP 500): new features must degrade to an honest "migration not applied" state.
// Update PRODUCTION_LEDGER when production migrations are applied. Requires `npm run build`, NODE_PATH=tests/qa/node_modules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { startBridge } = require('./support/rest-bridge.cjs');

// Reconciled with actual Supabase production migration ledger on 2026-11-14.
// Production has 38 recorded migrations, including `os_projects_module_chatbots_restore`.
// Local filenames differ from the remote ledger in timestamps; the first 38 replayed
// source files are the corresponding baseline. The later Product Control category
// extension and CRM agreement draft migration are intentionally NOT in production.
// Verify the actual remote ledger before moving this marker after future deployments.
const PRODUCTION_LAST_LOCAL_MIGRATION = '20261113160000_os_projects_module_chatbots_restore.sql';
const ROUTES = ['/admin/dashboard', '/admin/profile', '/admin/settings', '/admin/search', '/admin/security',
  '/admin/workspace/crm', '/admin/workspace/crm/desk', '/admin/workspace/crm/hunter', '/admin/workspace/crm/leads', '/admin/workspace/crm/activity',
  '/admin/workspace/crm/calendar', '/admin/workspace/crm/clients', '/admin/workspace/crm/notifications', '/admin/workspace/crm/sales', '/admin/workspace/crm/sales/new',
  '/admin/workspace/crm/settings', '/admin/workspace/crm/tasks', '/admin/workspace/library', '/admin/workspace/website-designer',
  '/admin/workspace/ecommerce-designer', '/admin/workspace/crm-creator', '/admin/workspace/ai-receptionist', '/admin/workspace/ai-communications',
  '/admin/workspace/marketing-hub', '/admin/workspace/marketing-hub/funnels', '/admin/workspace/marketing-hub/growth'];
const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const CLIENT = '00000000-0000-4000-8000-0000000000c1';

test('new code on the production schema: no private page crashes before migrations are approved', { timeout: 240000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','miguel@example.invalid');`);
  const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
  const applied = files.filter(f => f <= PRODUCTION_LAST_LOCAL_MIGRATION);
  assert.ok(files.includes(PRODUCTION_LAST_LOCAL_MIGRATION) && applied.length === 38, `production state = 38 local files (${applied.length})`);
  for (const file of applied) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file.startsWith('20261102053022')) await db.exec(`insert into agency_memberships(user_id,role) values('${MIGUEL}','owner');`);
  }
  // A client exists in production: missing new contract-draft storage must show an
  // honest unavailable state, not a 500 when an existing client is opened.
  const missingContractTable = await db.query("select to_regclass('public.crm_client_agreement_drafts') as relation");
  assert.equal(missingContractTable.rows[0].relation, null, "production does not yet have contract drafts");
  // Guarded CRM triggers require an owner auth.uid, even during synthetic fixture setup.
  // Emulate the signed-in owner for this one insert; do not disable trigger/RLS checks.
  await db.exec(`select set_config('request.jwt.claim.sub', '${MIGUEL}', false);`);
  await db.exec(`insert into public.crm_clients (id, legal_name, source, owner_id, created_by)
    values ('${CLIENT}', 'Synthetic QA Client', 'synthetic_test', '${MIGUEL}', '${MIGUEL}');`);
  await db.exec("select set_config('request.jwt.claim.sub', '', false);");
  const users = new Map();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const access_token = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: MIGUEL, exp, role: 'authenticated', aal: 'aal1' })}.${Buffer.from('synthetic-signature').toString('base64url')}`;
  const user = { id: MIGUEL, email: 'miguel@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
  users.set(access_token, user);
  const session = { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  const bridge = await startBridge(db, { users, log: () => {} });
  t.after(() => bridge.close());
  const reservation = createServer();
  await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port;
  await new Promise(r => reservation.close(r));
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', c => (output += c)); child.stderr.on('data', c => (output += c));
  t.after(async () => { child.kill(); await new Promise(r => child.once('exit', r)); });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(origin + '/login')).status < 500) break; } catch {}
    if (i === 149) assert.fail(output);
    await new Promise(r => setTimeout(r, 100));
  }
  const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const crashed = [];
  const protectedRoutes = [
    ...ROUTES,
    `/admin/workspace/crm/clients/${CLIENT}`,
    `/admin/workspace/crm/clients/${CLIENT}/contracts`,
  ];
  for (const route of protectedRoutes) {
    const res = await fetch(origin + route, { redirect: 'manual', headers: { cookie } });
    if (res.status >= 500) crashed.push(`${route} → ${res.status}`);
  }
  // Radar query is present in the real production schema: it may reject a synthetic
  // nonexistent run but must not fail as an uninstalled migration or crash.
  const places = await fetch(origin + '/admin/workspace/crm/radar/places?run=00000000-0000-4000-8000-000000000001', { headers: { cookie } });
  const body = await places.json();
  assert.ok(places.status < 500, 'Radar route should not crash: ' + places.status + ' ' + JSON.stringify(body));
  assert.notEqual(body.blocked, 'migration', 'Radar schema is already installed in production');
  const downloaded = await fetch(origin + `/admin/workspace/crm/clients/${CLIENT}/contracts/00000000-0000-4000-8000-000000000007`, { headers: { cookie } });
  assert.equal(downloaded.status, 404, 'contract PDF cannot be downloaded until the production migration exists');
  assert.deepEqual(crashed, [], 'pages that crash on the production schema:\n' + crashed.join('\n') + '\n' + output.slice(-3000));
});
