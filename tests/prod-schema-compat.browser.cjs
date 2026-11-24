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

// Reconciled with the Supabase production migration ledger (read-only schema_migrations) on 2026-11-20.
// Production has 48 recorded migrations; the last three (os_product_delivery_guard 20261120130331,
// public_inquiry_services_guard 20261120130354, project_bridge_rls_initplan 20261120130358) were applied 2026-11-20 with
// owner authorization; the local files carry the same versions. Earlier local filenames differ from the remote ledger in
// timestamps; the first 45 replayed source files are the baseline. Verify the remote ledger before moving this marker.
const PRODUCTION_LAST_LOCAL_MIGRATION = '20261120130358_project_bridge_rls_initplan.sql';
const PRODUCTION_MIGRATIONS = 48;
const ROUTES = ['/admin/dashboard', '/admin/profile', '/admin/settings', '/admin/search', '/admin/security', '/admin/staff',
  '/admin/workspace/crm', '/admin/workspace/crm/desk', '/admin/workspace/crm/hunter', '/admin/workspace/crm/leads', '/admin/workspace/crm/activity',
  '/admin/workspace/crm/calendar', '/admin/workspace/crm/clients', '/admin/workspace/crm/notifications', '/admin/workspace/crm/sales', '/admin/workspace/crm/sales/new',
  '/admin/workspace/crm/settings', '/admin/workspace/crm/tasks', '/admin/workspace/crm/quotes', '/admin/workspace/crm/quotes/new', '/admin/workspace/library', '/admin/workspace/website-designer',
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
  // This is a frozen 2026-11-20 production baseline, not proof of today's schema.\n  // The Staff portal migration is dated BEFORE this marker but remains unapplied in production.\n  // Never assume a migration was deployed merely because its filename sorts before the ledger marker.\n  const UNAPPLIED_AT_BASELINE = new Set(['20261117180500_staff_private_portal.sql']);\n  const applied = files.filter(f => f <= PRODUCTION_LAST_LOCAL_MIGRATION && !UNAPPLIED_AT_BASELINE.has(f));
  assert.ok(files.includes(PRODUCTION_LAST_LOCAL_MIGRATION) && applied.length === PRODUCTION_MIGRATIONS, `production state = ${PRODUCTION_MIGRATIONS} local files (${applied.length})`);
  for (const file of applied) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file.startsWith('20261102053022')) await db.exec(`insert into agency_memberships(user_id,role) values('${MIGUEL}','owner');`);
  }
  // Production has contract drafts (2026-11-14) and the Core Engine ledger (2026-11-17).
  const schema = await db.query("select to_regclass('public.crm_client_agreement_drafts') as drafts, to_regclass('public.crm_invoices') as invoices");
  assert.equal(schema.rows[0].drafts, 'crm_client_agreement_drafts', 'production has contract drafts');
  assert.equal(schema.rows[0].invoices, 'crm_invoices', 'production has the Core Engine ledger');
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
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', c => (output += c)); child.stderr.on('data', c => (output += c));
  t.after(()=>require('./support/stop-child.cjs')(child));
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
  // Production has the run-to-prospect junction. Our synthetic REST bridge does NOT
  // implement PostgREST's !inner embedded relationship syntax, so a scoped HTTP
  // request would return its synthetic PGRST100 and falsely claim missing migration.
  // Test the actual foreign keys/policies in PostgreSQL, and test HTTP without embed.
  const runSchema = await db.query(`
    select
      (select count(*)::int from pg_constraint
       where conrelid='public.crm_radar_run_places'::regclass and contype='f') as foreign_keys,
      (select count(*)::int from pg_policies
       where schemaname='public' and tablename='crm_radar_run_places') as policies`);
  assert.equal(Number(runSchema.rows[0].foreign_keys), 2, 'Radar run-place junction has both foreign keys');
  assert.ok(Number(runSchema.rows[0].policies) >= 1, 'Radar run-place junction retains its RLS policy');
  const places = await fetch(origin + '/admin/workspace/crm/radar/places', { headers: { cookie } });
  assert.ok(places.status < 500, 'Unscoped Radar route should not crash: ' + places.status);
  const downloaded = await fetch(origin + `/admin/workspace/crm/clients/${CLIENT}/contracts/00000000-0000-4000-8000-000000000007`, { headers: { cookie } });
  assert.equal(downloaded.status, 404, 'contract PDF cannot be downloaded until the production migration exists');
  assert.deepEqual(crashed, [], 'pages that crash on the production schema:\n' + crashed.join('\n') + '\n' + output.slice(-3000));
});
