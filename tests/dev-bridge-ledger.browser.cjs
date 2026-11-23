'use strict';
// Dev Bridge 3.0 end-to-end on SYNTHETIC data: PGlite + REST bridge + production build + the real session CLI.
// Runs with DEV_BRIDGE_BROWSER=1 after `npm run build`. Chromium emulation at 1440 and 390 px, NOT physical Safari.
// Proves: identity claim, owner-only token issuance, CLI start→event→stop over the real API route, offline queue
// + flush, server-time VERIFIED session events vs SELF_REPORTED claims, bilingual page, no horizontal overflow.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn, execFile } = require('node:child_process'), { createServer } = require('node:http');

const MIGUEL = '00000000-0000-4000-8000-0000000000d1';
const SAMUEL = '00000000-0000-4000-8000-0000000000d2';
const DIR = process.env.EVIDENCE_DIR || 'evidence/dev-bridge-ledger';
const CLI = path.resolve('scripts/dev-bridge/session.cjs');

test('Dev Bridge 3.0: owner claims identity, issues own agent token, CLI session lands VERIFIED in the ledger', { timeout: 300000 }, async t => {
  if (process.env.DEV_BRIDGE_BROWSER !== '1') return t.skip('DEV_BRIDGE_BROWSER=1 required');
  const { PGlite } = require('@electric-sql/pglite'), { chromium } = require('playwright');
  const { startBridge } = require('./support/rest-bridge.cjs');
  fs.mkdirSync(DIR, { recursive: true });
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  for (const [id, mail] of [[MIGUEL, 'miguel-qa@example.invalid'], [SAMUEL, 'samuel-qa@example.invalid']]) await db.query('insert into auth.users(id,email) values($1,$2)', [id, mail]);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner'),($2,'owner')", [MIGUEL, SAMUEL]);
  }

  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + 3600;
  const login = (id, email) => {
    const user = { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
    const access_token = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: id, exp, role: 'authenticated', aal: 'aal1' }) + '.' + enc('synthetic');
    return { user, access_token, session: { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user } };
  };
  const m = login(MIGUEL, 'miguel-qa@example.invalid'), s = login(SAMUEL, 'samuel-qa@example.invalid');
  const bridge = await startBridge(db, { users: new Map([[m.access_token, m.user], [s.access_token, s.user]]) }); t.after(() => bridge.close());
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
  const cookieFor = who => ({ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(who.session)).toString('base64url'), url: origin });
  const open = async (who, lang, viewport = { width: 1440, height: 900 }, mobile = false) => {
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    await ctx.addCookies([cookieFor(who), { name: 'avalon-lang', value: lang, url: origin }]);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(20000);
    await page.goto(origin + '/admin/dev-bridge/ledger');
    return { ctx, page, errors };
  };

  // 1. Unauthenticated agent API: no token → 401; the route never reveals data.
  assert.equal((await fetch(origin + '/api/dev-bridge/v1/events', { method: 'POST', body: '{}' })).status, 401);

  // 2. Miguel claims his identity in the UI (Spanish).
  const mg = await open(m, 'es');
  await mg.page.getByRole('heading', { name: '¿Quién eres en el registro?' }).waitFor();
  await mg.page.getByRole('button', { name: 'Soy Miguel' }).click();
  await mg.page.getByRole('heading', { name: 'Conexiones de agentes' }).waitFor();
  await mg.page.waitForFunction(() => !document.body.innerText.includes('¿Quién eres en el registro?'));

  // 3. Miguel can issue only his own agents' tokens; Samuel's rows are managed by Samuel.
  const agents = mg.page.locator('section[aria-labelledby="agents"]');
  assert.equal(await agents.getByText('Lo gestiona Samuel').count(), 2, 'samuel.claude and samuel.codex are not actionable by Miguel');
  const claudeRow = agents.locator('li[data-agent="miguel.claude"]');
  await claudeRow.getByRole('button', { name: 'Emitir token' }).click();
  const token = (await claudeRow.locator('[role="status"] code').first().textContent()).trim();
  assert.match(token, /^avd_[A-Za-z0-9_-]{20,80}$/);
  const stored = await db.query("select token_sha256, token_prefix from dev_bridge_agents where id='miguel.claude'");
  assert.equal(stored.rows[0].token_sha256, require('node:crypto').createHash('sha256').update(token).digest('hex'), 'only the hash is stored');
  assert.notEqual(stored.rows[0].token_sha256, token);
  await mg.ctx.close();

  // 4. The real CLI, from a separate working dir (= the agent's environment). Offline first, then online.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-bridge-agent-')); t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  // Async on purpose: the PGlite REST bridge lives in THIS process, so a synchronous child would deadlock it.
  const run = (args, url = origin) => new Promise(resolve => execFile(process.execPath, [CLI, ...args], { cwd: work, env: { ...process.env, AVALON_BRIDGE_AGENT_TOKEN: token, AVALON_BRIDGE_URL: url }, encoding: 'utf8' },
    (e, out, err) => resolve({ code: e ? e.code : 0, out, err })));
  const dead = 'http://127.0.0.1:9';
  const r1 = await run(['start', '--title', 'Dev Bridge 3.0 QA', '--department', 'Engineering', '--issue', '303'], dead);
  assert.equal(r1.code, 0, r1.err); assert.equal(JSON.parse(r1.out).pending, 1, 'offline start is queued, not lost');
  const r2 = await run(['event', '--kind', 'test', '--title', 'synthetic npm test 818/0', '--url', 'https://github.com/avaloncoreagency/avalon-code/pull/1'], dead);
  assert.equal(JSON.parse(r2.out).pending, 2);
  const r3 = await run(['flush']);
  const f = JSON.parse(r3.out);
  assert.equal(f.pending, 0, r3.out + r3.err); assert.equal(f.sent.length, 2); assert.ok(f.sent.every(x => x.ok), JSON.stringify(f.sent));
  assert.doesNotMatch(f.current_session, /^pending:/, 'offline placeholder resolved to the server session id');
  await new Promise(r => setTimeout(r, 1100));
  assert.equal((await run(['pause'])).code, 0);
  await new Promise(r => setTimeout(r, 600));
  assert.equal((await run(['resume'])).code, 0);
  const r4 = await run(['stop', '--summary', 'E2E synthetic session', '--next', 'Owner reviews the PR']);
  assert.equal(r4.code, 0, r4.err); assert.equal(JSON.parse(r4.out).current_session, null);
  assert.equal((await run(['flush'])).code, 0, 'replaying an empty outbox is harmless');

  const rows = (await db.query("select kind, evidence, owner, tool, source, recorded_at, occurred_at from dev_bridge_events where agent_id='miguel.claude' order by recorded_at")).rows;
  const kinds = rows.map(r => r.kind);
  for (const k of ['session_start', 'test', 'session_pause', 'session_resume', 'session_stop']) assert.ok(kinds.includes(k), `${k} recorded`);
  for (const r of rows.filter(r => r.kind.startsWith('session_'))) {
    assert.equal(r.evidence, 'VERIFIED', `${r.kind}: session time is server-measured`);
    assert.equal(new Date(r.occurred_at).getTime(), new Date(r.recorded_at).getTime(), `${r.kind}: server clock, never the client clock`);
  }
  assert.equal(rows.find(r => r.kind === 'test').evidence, 'SELF_REPORTED', 'an agent claim is not verification');
  assert.ok(rows.filter(r => r.source === 'agent').every(r => r.owner === 'miguel' && r.tool === 'claude_code'));
  assert.ok(rows.some(r => r.source === 'system'), 'token issuance is itself audited');
  const sess = (await db.query("select status, ended_at, summary, next_action from dev_bridge_sessions where agent_id='miguel.claude'")).rows;
  assert.equal(sess.length, 1); assert.equal(sess[0].status, 'completed'); assert.ok(sess[0].ended_at); assert.equal(sess[0].next_action, 'Owner reviews the PR');

  // 5. A forged token is rejected and writes nothing.
  const before = (await db.query('select count(*)::int n from dev_bridge_events')).rows[0].n;
  const forged = await fetch(origin + '/api/dev-bridge/v1/events', { method: 'POST', headers: { authorization: 'Bearer avd_' + 'x'.repeat(32), 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'note', idempotency_key: 'forged-1', title: 'forged' }) });
  assert.equal(forged.status, 401);
  assert.equal((await db.query('select count(*)::int n from dev_bridge_events')).rows[0].n, before);

  // 6. Samuel (English, 390 px) sees Miguel's session in the shared ledger but cannot manage Miguel's agents.
  const sm = await open(s, 'en', { width: 390, height: 844 }, true);
  await sm.page.getByRole('heading', { name: 'Who are you in the ledger?' }).waitFor();
  assert.equal(await sm.page.getByRole('button', { name: 'I am Miguel' }).count(), 0, 'a claimed identity cannot be taken');
  await sm.page.getByRole('button', { name: 'I am Samuel' }).click();
  await sm.page.waitForFunction(() => !document.body.innerText.includes('Who are you in the ledger?'));
  const timeline = sm.page.locator('section[aria-labelledby="timeline"]');
  await timeline.getByText('synthetic npm test 818/0').first().waitFor();
  assert.ok(await timeline.locator('li[data-evidence="VERIFIED"]').count() >= 1);
  assert.ok(await timeline.locator('li[data-evidence="SELF_REPORTED"]').count() >= 1);
  await sm.page.locator('section[aria-labelledby="sessions"]').getByText('Dev Bridge 3.0 QA').first().waitFor();
  const smAgents = sm.page.locator('section[aria-labelledby="agents"]');
  assert.equal(await smAgents.locator('li[data-agent="miguel.claude"]').getByRole('button').count(), 0, 'Samuel cannot rotate/revoke Miguel\'s agent');
  assert.ok(await smAgents.locator('li[data-agent="samuel.codex"]').getByRole('button', { name: 'Issue token' }).count() === 1);
  const issueBox = await smAgents.locator('li[data-agent="samuel.codex"]').getByRole('button', { name: 'Issue token' }).boundingBox();
  assert.ok(issueBox && issueBox.x >= 0 && issueBox.x + issueBox.width <= 390 && issueBox.height >= 44, `own-agent action fully on screen with a 44px target at 390 px (${JSON.stringify(issueBox)})`);
  await timeline.getByText('Session closed').first().waitFor();
  const overflow = await sm.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `no horizontal page scroll at 390 px (overflow ${overflow}px)`);
  await sm.page.screenshot({ path: `${DIR}/samuel-en-390.png`, fullPage: true });
  assert.deepEqual(sm.errors, []);
  await sm.ctx.close();

  // 7. Private CSV export (owner session only; formulas neutralised; never cached).
  const csv = await fetch(origin + '/api/dev-bridge/export?kind=events&period=7d', { headers: { cookie: `sb-127-auth-token=${cookieFor(m).value}` } });
  assert.equal(csv.status, 200); assert.match(csv.headers.get('cache-control'), /no-store/);
  const text = await csv.text();
  assert.match(text.split('\n')[0], /occurred_at_utc/); assert.match(text, /synthetic npm test 818\/0/);
  assert.equal((await fetch(origin + '/api/dev-bridge/export?kind=events')).status, 401, 'export is never public');

  // 8. Miguel's dashboard at 1440 (Spanish) — screenshot evidence.
  const mg2 = await open(m, 'es');
  await mg2.page.locator('section[aria-labelledby="compare"]').waitFor();
  await mg2.page.screenshot({ path: `${DIR}/miguel-es-1440.png`, fullPage: true });
  assert.deepEqual(mg2.errors, []);
  await mg2.ctx.close();
});
