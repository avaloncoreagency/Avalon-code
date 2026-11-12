// Avalon Code Exchange (Git remote without GitHub) on isolated PostgreSQL (PGlite) with every migration.
// Synthetic users, tokens and bytes only. Proves: least-privilege token scopes (deliver / pull / integrate), hash-verified
// chunked blobs, delivery state machine, owner-only approval of sensitive changes, linear append-only mainline with green
// tests, header-injected tokens, RLS for owners, and that nothing is reachable without a valid token.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const hex40 = s => sha(s).slice(0, 40);
const MiB = 1048576;

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid(), unique (bucket_id, name));
    alter table storage.objects enable row level security;`);
  await db.exec(`insert into auth.users(id) values('${MIGUEL}'),('${STRANGER}')`);
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
    if (file.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${STRANGER}','operator')`);
  }
  // v1 ships Code Exchange disabled (20261111090000). These tests exercise the token logic as if an owner re-enabled it.
  await db.exec(fs.readFileSync('supabase/migrations/20261111090000_code_exchange_disabled.sql', 'utf8').replace(/revoke execute on (function [^;]+) from anon;/g, 'grant execute on $1 to anon;'));
  const as = async (role, user = '', headers = '') => db.exec(`reset role;set request.jwt.claim.role='${role}';set request.jwt.claim.sub='${user}';set request.headers='${headers}';set role ${role}`);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const fails = async (sql, p, code, msg) => {
    await db.exec('savepoint s');
    try { await db.query(sql, p); } catch (e) {
      await db.exec('rollback to savepoint s');
      if (code) assert.equal(e.code, code, e.message);
      if (msg) assert.match(e.message, msg);
      return e;
    }
    await db.exec('release savepoint s');
    assert.fail('expected failure: ' + sql.slice(0, 120));
  };
  await db.exec('begin');
  return { db, as, q, one, fails };
}

async function token(h, scopes, name = scopes.join('+')) {
  const raw = 'avb_' + crypto.randomBytes(24).toString('base64url');
  await h.as('authenticated', MIGUEL);
  await h.q(`insert into os_project_api_tokens(name,token_sha256,prefix,scopes,expires_at) values($1,$2,$3,$4,now()+interval '30 days')`,
    [name, sha(raw), raw.slice(0, 8), scopes]);
  return { raw, hash: sha(raw) };
}
const call = async (h, fn, args, tok) => {
  await h.as('anon');
  const ph = args.map((_, i) => `$${i + 1}`).concat(tok ? [`$${args.length + 1}`] : []).join(',');
  return (await h.one(`select public.${fn}(${ph}) as r`, tok ? [...args, tok.hash] : args)).r;
};
async function upload(h, bytes, tok) {
  const s = sha(bytes); let r;
  for (let i = 0; i * MiB < bytes.length; i++) r = await call(h, 'os_code_put_chunk', [s, bytes.length, i, bytes.subarray(i * MiB, (i + 1) * MiB).toString('base64')], tok);
  return { sha: s, r };
}

test('code exchange: tokens, blobs, deliveries, approvals, mainline', async () => {
  const h = await setup();
  const codex = await token(h, ['code:deliver', 'code:pull'], 'Codex');
  const claude = await token(h, ['code:integrate', 'code:pull'], 'Claude integrator');
  const reader = await token(h, ['code:pull'], 'Reader');
  const importer = await token(h, ['import:create'], 'Old import token');
  await h.fails(`insert into os_project_api_tokens(name,token_sha256,prefix,scopes,expires_at) values('x',$1,'avb_abcd',array['code:admin'],now()+interval '1 day')`, [sha('x')], '23514');

  // ── Blobs: chunked, hash verified by the database, deduplicated ──
  const pkg = crypto.randomBytes(MiB + 12345);
  const up = await upload(h, pkg, codex);
  assert.equal(up.r.complete, true);
  assert.equal((await call(h, 'os_code_put_chunk', [up.sha, pkg.length, 0, pkg.subarray(0, MiB).toString('base64')], codex)).deduplicated, true);
  const bad = crypto.randomBytes(1000);
  const lie = await call(h, 'os_code_put_chunk', [sha(Buffer.from('other')), bad.length, 0, bad.toString('base64')], codex);
  assert.equal(lie.error, 'hash_mismatch', 'declared hash must match the bytes');
  await h.as('authenticated', MIGUEL);
  await h.fails(`select 1 from os_private.acx_blobs`, [], '42501');
  await h.fails(`select public.os_code_put_chunk($1,$2,0,$3,$4)`, [sha(bad), bad.length + 1, bad.toString('base64'), codex.hash], '22023');

  // ── No token / wrong token / wrong scope ──
  await h.as('anon');
  await h.fails(`select public.os_code_head()`, [], '28000');
  await h.fails(`select public.os_code_head($1)`, [sha('avb_forged')], '28000');
  await h.fails(`select public.os_code_head($1)`, [importer.hash], '28000');
  await h.fails(`select public.os_code_put_chunk($1,10,0,'AAAA',$2)`, [sha('r'), reader.hash], '28000');
  await h.fails(`select public.os_code_inbox(null,$1)`, [codex.hash], '28000');
  await h.fails(`select public.os_code_get_chunk($1,0,$2)`, [up.sha, codex.hash], 'P0002');
  await h.fails(`select public.os_code_get_chunk($1,0,$2)`, [up.sha, reader.hash], 'P0002');
  // header-injected token (proxy) works without the argument
  await h.as('anon', '', JSON.stringify({ 'x-avalon-bridge-token': claude.raw }));
  assert.ok((await h.one(`select public.os_code_head() as r`)).r.token.scopes.includes('code:integrate'));
  await h.as('anon', '', JSON.stringify({ 'x-avalon-bridge-token': 'avb_not-a-real-token-123456789' }));
  await h.fails(`select public.os_code_head()`, [], '28000');

  // ── Submit ──
  const manifest = (id, extra = {}) => ({ id, author: 'codex', module: 'nova-ui', base_commit: hex40('base'), delivery_commit: hex40(id), changes: ['src/a.ts'], ...extra });
  await h.as('anon');
  await h.fails(`select public.os_code_submit($1,$2,$3)`, [manifest('x', { author: 'mallory' }), up.sha, codex.hash], '22023');
  await h.fails(`select public.os_code_submit($1,$2,$3)`, [manifest('ok-1', { base_commit: 'main' }), up.sha, codex.hash], '22023');
  const other = await upload(h, crypto.randomBytes(500), claude);
  await h.fails(`select public.os_code_submit($1,$2,$3)`, [manifest('steal-1'), other.sha, codex.hash], '22023', /package_not_uploaded/);
  const s1 = await call(h, 'os_code_submit', [manifest('nova-ui-0001'), up.sha], codex);
  assert.equal(s1.status, 'submitted');
  assert.equal((await call(h, 'os_code_submit', [manifest('nova-ui-0001'), up.sha], codex)).replayed, true);
  const pkg2 = await upload(h, crypto.randomBytes(2000), codex);
  await h.fails(`select public.os_code_submit($1,$2,$3)`, [manifest('nova-ui-0001'), pkg2.sha, codex.hash], '23505');
  const s2 = await call(h, 'os_code_submit', [manifest('nova-ui-0002'), pkg2.sha], codex);
  assert.equal((await call(h, 'os_code_my_deliveries', [], codex)).length, 2);
  await h.fails(`select public.os_code_my_deliveries($1)`, [claude.hash], '28000');

  // ── Integrator state machine; sensitive changes need the owner ──
  const id1 = s1.delivery_id, id2 = s2.delivery_id;
  assert.equal((await call(h, 'os_code_inbox', ['submitted'], claude)).length, 2);
  const chunk = await call(h, 'os_code_get_chunk', [up.sha, 1], claude);
  assert.equal(Buffer.from(chunk.data, 'base64').equals(pkg.subarray(MiB)), true, 'integrator downloads the exact bytes');
  await h.fails(`select public.os_code_set_status($1,'approved','{}',$2)`, [id1, claude.hash], '22023', /invalid_transition/);
  await call(h, 'os_code_set_status', [id1, 'verifying', {}], claude);
  await h.fails(`select public.os_code_set_status($1,'ready_for_review','{}',$2)`, [id1, claude.hash], '22023', /sensitive_paths/);
  await call(h, 'os_code_set_status', [id1, 'ready_for_review', { verdict: 'READY_FOR_HUMAN_REVIEW', sensitive_paths: ['supabase/migrations/x.sql'] }], claude);
  await h.fails(`select public.os_code_set_status($1,'approved','{}',$2)`, [id1, claude.hash], '42501', /owner_approval_required/);
  await h.fails(`select public.os_code_review($1,'approved','')`, [id1], '42501');            // anon
  await h.as('authenticated', STRANGER);
  await h.fails(`select public.os_code_review($1,'approved','')`, [id1], '42501');            // not an owner
  await h.as('authenticated', MIGUEL);
  assert.equal((await h.one(`select public.os_code_review($1,'approved','Revisado') as r`, [id1])).r.status, 'approved');
  await call(h, 'os_code_set_status', [id2, 'verifying', {}], claude);
  await call(h, 'os_code_set_status', [id2, 'ready_for_review', { sensitive_paths: [] }], claude);
  assert.equal((await call(h, 'os_code_set_status', [id2, 'approved', {}], claude)).status, 'approved', 'integrator approves non-sensitive');
  await h.fails(`select public.os_code_set_status($1,'approved','{}',$2)`, [id2, codex.hash], '28000');

  // ── Mainline: first full, green tests, linear, approved deliveries only ──
  const full = await upload(h, crypto.randomBytes(3000), claude);
  const green = { command: 'npm test', passed: 406, failed: 0 };
  const c1 = hex40('c1'), c2 = hex40('c2');
  await h.fails(`select public.os_code_publish($1,null,$2,null,$3,'{}',$4)`, [c1, full.sha, green, claude.hash], '22023', /first_entry_must_be_full/);
  await h.fails(`select public.os_code_publish($1,null,$2,$2,$3,'{}',$4)`, [c1, full.sha, { passed: 400, failed: 2 }, claude.hash], '22023', /tests_not_green/);
  await h.fails(`select public.os_code_publish($1,null,$2,$2,$3,'{}',$4)`, [c1, full.sha, green, codex.hash], '28000');
  assert.equal((await call(h, 'os_code_publish', [c1, null, full.sha, full.sha, green, []], claude)).seq, 1);
  const inc = await upload(h, crypto.randomBytes(800), claude);
  await h.fails(`select public.os_code_publish($1,$2,$3,null,$4,'{}',$5)`, [c2, hex40('fork'), inc.sha, green, claude.hash], '40001');
  const s3 = await call(h, 'os_code_submit', [manifest('nova-ui-0003'), (await upload(h, crypto.randomBytes(100), codex)).sha], codex);
  await h.fails(`select public.os_code_publish($1,$2,$3,null,$4,$5,$6)`, [c2, c1, inc.sha, green, [s3.delivery_id], claude.hash], '22023', /delivery_not_approved/);
  assert.equal((await call(h, 'os_code_publish', [c2, c1, inc.sha, null, green, [id1, id2]], claude)).seq, 2);
  const mine = await call(h, 'os_code_my_deliveries', [], codex);
  assert.deepEqual(mine.filter(d => d.status === 'integrated').map(d => d.integrated_commit), [c2, c2]);
  const head = await call(h, 'os_code_head', [], reader);
  assert.deepEqual(head.chain.map(c => c.commit), [c1, c2]);
  assert.ok(await call(h, 'os_code_get_chunk', [inc.sha, 0], reader), 'pull token reads mainline bundles');
  await h.fails(`select public.os_code_get_chunk($1,0,$2)`, [up.sha, reader.hash], 'P0002');  // but never delivery packages
  assert.equal((await call(h, 'os_code_head', [], codex)).chain.length, 2, 'deliver token sees the base to work on');

  // ── Append-only, preview once, RLS ──
  await call(h, 'os_code_set_preview', [2, 'https://avalon-core-agency-abc123-avalon-core-agency.vercel.app'], claude);
  await h.fails(`select public.os_code_set_preview(2,'https://other-x.vercel.app',$1)`, [claude.hash], 'P0002');
  await h.fails(`select public.os_code_set_preview(1,'https://evil.example.com',$1)`, [claude.hash], '23514');
  await h.as('authenticated', MIGUEL);
  await h.fails(`update os_code_mainline set commit=$1 where seq=1`, [hex40('x')], '42501');
  await h.fails(`delete from os_code_events`, [], '42501');
  await h.fails(`update os_code_deliveries set status='approved' where id=$1`, [s3.delivery_id], '42501');
  assert.equal((await h.q(`select id from os_code_deliveries`)).length, 3);
  const actions = (await h.q(`select action from os_code_events order by id`)).map(r => r.action);
  for (const a of ['delivery_submitted', 'owner_approved', 'delivery_approved', 'mainline_published', 'preview_recorded', 'blob_rejected']) assert.ok(actions.includes(a), a);
  await h.as('authenticated', STRANGER);
  assert.equal((await h.q(`select id from os_code_deliveries`)).length, 0);
  assert.equal((await h.q(`select seq from os_code_mainline`)).length, 0);
  await h.as('anon');
  await h.fails(`select id from os_code_deliveries`, [], '42501');

  // ── Quota per token per day ──
  const big = 67108864, oneMiB = crypto.randomBytes(MiB);
  for (let i = 0; i < 3; i++) await call(h, 'os_code_put_chunk', [sha('q' + i), big, 0, oneMiB.toString('base64')], claude); // 3 x 64 MiB declared + earlier blobs
  await h.fails(`select public.os_code_put_chunk($1,$2,0,$3,$4)`, [sha('q4'), big, oneMiB.toString('base64'), claude.hash], '54000');
});
