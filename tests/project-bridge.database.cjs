// Avalon Project Bridge (Misión 0400) on isolated PostgreSQL (PGlite) with every migration, RLS and a minimal Supabase
// Storage stub. Synthetic users and data only. Proves: immutable versions, restore as a new version, per-owner limits,
// cross-user isolation, storage path rules, deploy guards (no main project, approval for production), API token inbox.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

const STORAGE_STUB = `
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid(), unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, delete on storage.objects to anon, authenticated;`;

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(STORAGE_STUB);
  await db.exec(`insert into auth.users(id) values('${MIGUEL}'),('${SAMUEL}'),('${STRANGER}')`);
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
    if (file.startsWith('20261102053022'))
      await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${STRANGER}','operator')`);
  }
  const as = async (role, user) => db.exec(`reset role;set request.jwt.claim.role='${role}';set request.jwt.claim.sub='${user || ''}';set role ${role}`);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const fails = async (sql, p, code) => {
    await db.exec('savepoint s');
    try { await db.query(sql, p); } catch (e) { await db.exec('rollback to savepoint s'); if (code) assert.equal(e.code, code, e.message); return e; }
    await db.exec('release savepoint s');
    assert.fail('expected failure: ' + sql.slice(0, 120));
  };
  await db.exec('begin');
  return { db, as, q, one, fails };
}

/** Full owner import: archive object + import row + project + version + files + seal. */
async function importVersion(h, user = MIGUEL, { project = null, files = [['index.html', 'h1'], ['css/a.css', 'c']], deployable = 'static', key } = {}) {
  const id = crypto.randomUUID();
  const path = `incoming/${user}/${id}.zip`;
  await h.q(`insert into storage.objects(bucket_id,name) values('avalon-projects',$1)`, [path]);
  await h.q(`insert into os_project_imports(id,category,project_name,original_name,source_tool,archive_path,idempotency_key) values($1,'website','Sitio','sitio.zip','chatgpt',$2,$3)`, [id, path, key || 'key-' + id]);
  await h.q(`update os_project_imports set status='validating' where id=$1`, [id]);
  const pid = project || (await h.one(`insert into os_projects(module,name) values('website','Sitio importado') returning id`)).id;
  const v = await h.one(`insert into os_project_versions(project_id,number,kind,import_id,source_tool,framework,entry_path,deployable,file_count,total_bytes,content_digest)
    values($1,99,'import',$2,'chatgpt','static','index.html',$3,$4,10,$5) returning id, number`, [pid, id, deployable, files.length, sha(id)]);
  for (const [p, c] of files) await h.q(`insert into os_project_files(version_id,path,sha256,size,mime) values($1,$2,$3,1,'text/html')`, [v.id, p, sha(c)]);
  await h.q(`update os_project_versions set sealed=true where id=$1`, [v.id]);
  await h.q(`update os_project_imports set status='registered', project_id=$2, version_id=$3 where id=$1`, [id, pid, v.id]);
  return { importId: id, projectId: pid, versionId: v.id, number: v.number };
}

test('versions: numbered per project, immutable, restore creates a NEW sealed version with the same files', async () => {
  const h = await setup();
  await h.as('authenticated', MIGUEL);
  const a = await importVersion(h);
  assert.equal(a.number, 1, 'the number is assigned by the database, not by the client (99 ignored)');
  const b = await importVersion(h, MIGUEL, { project: a.projectId, files: [['index.html', 'h2']] });
  assert.equal(b.number, 2);
  const restored = (await h.one('select os_project_restore_version($1, $2) as id', [a.versionId, 'volver a la v1'])).id;
  const r = await h.one('select number, kind, restored_from, sealed, file_count from os_project_versions where id=$1', [restored]);
  assert.deepEqual([r.number, r.kind, r.restored_from, r.sealed, r.file_count], [3, 'restore', a.versionId, true, 2]);
  assert.deepEqual((await h.q('select path from os_project_files where version_id=$1 order by path', [restored])).map(x => x.path), ['css/a.css', 'index.html']);
  assert.equal((await h.q('select 1 from os_project_versions where project_id=$1', [a.projectId])).length, 3, 'history keeps every version');
  await h.fails(`update os_project_versions set note='x' where id=$1`, [a.versionId], '42501');
  await h.fails(`delete from os_project_versions where id=$1`, [a.versionId]);
  await h.fails(`update os_project_files set size=2 where version_id=$1`, [a.versionId]);
  await h.fails(`insert into os_project_files(version_id,path,sha256,size,mime) values($1,'x.html',$2,1,'text/html')`, [a.versionId, sha('x')], '42501');
  const actions = (await h.q('select action from os_project_events where project_id=$1 order by id', [a.projectId])).map(x => x.action);
  assert.ok(actions.includes('version_created') && actions.includes('version_restored') && actions.includes('import_registered'), actions.join());
});

test('a version cannot be sealed while files are missing, and bad file paths are refused', async () => {
  const h = await setup();
  await h.as('authenticated', MIGUEL);
  const pid = (await h.one(`insert into os_projects(module,name) values('website','P') returning id`)).id;
  const id = crypto.randomUUID();
  await h.q(`insert into os_project_imports(id,category,original_name,source_tool,archive_path,idempotency_key) values($1,'website','a.zip','manual',$2,'idem-0001')`, [id, `incoming/${MIGUEL}/${id}.zip`]);
  const v = (await h.one(`insert into os_project_versions(project_id,number,kind,import_id,source_tool,framework,deployable,file_count,total_bytes,content_digest) values($1,1,'import',$2,'manual','static','static',2,1,$3) returning id`, [pid, id, sha('d')])).id;
  await h.q(`insert into os_project_files(version_id,path,sha256,size,mime) values($1,'index.html',$2,1,'text/html')`, [v, sha('a')]);
  await h.fails(`update os_project_versions set sealed=true where id=$1`, [v], '23514');
  for (const bad of ['../x.html', '/abs.html', 'a//b.html', 'a\\b.html', './x.html'])
    await h.fails(`insert into os_project_files(version_id,path,sha256,size,mime) values($1,$2,$3,1,'text/html')`, [v, bad, sha(bad)], '23514');
});

test('imports: path must be the owner own incoming folder; state machine; per-owner concurrency limit', async () => {
  const h = await setup();
  await h.as('authenticated', MIGUEL);
  const id = crypto.randomUUID();
  await h.fails(`insert into os_project_imports(id,category,original_name,source_tool,archive_path,idempotency_key) values($1,'website','a.zip','manual',$2,'idem-1111')`, [id, `incoming/${SAMUEL}/${id}.zip`], '42501');
  await h.q(`insert into os_project_imports(id,category,original_name,source_tool,archive_path,idempotency_key) values($1,'website','a.zip','manual',$2,'idem-1111')`, [id, `incoming/${MIGUEL}/${id}.zip`]);
  await h.fails(`update os_project_imports set status='registered' where id=$1`, [id], '23514');
  const dupId = crypto.randomUUID();
  await h.fails(`insert into os_project_imports(id,category,original_name,source_tool,archive_path,idempotency_key) values($1,'website','a.zip','manual',$2,'idem-1111')`, [dupId, `incoming/${MIGUEL}/${dupId}.zip`], '23505');
  await h.fails(`update os_project_imports set idempotency_key='changed-key' where id=$1`, [id]);
  const id2 = crypto.randomUUID();
  await h.q(`insert into os_project_imports(id,category,original_name,source_tool,archive_path,idempotency_key) values($1,'website','b.zip','manual',$2,'idem-2222')`, [id2, `incoming/${MIGUEL}/${id2}.zip`]);
  const id3 = crypto.randomUUID();
  await h.fails(`insert into os_project_imports(id,category,original_name,source_tool,archive_path,idempotency_key) values($1,'website','c.zip','manual',$2,'idem-3333')`, [id3, `incoming/${MIGUEL}/${id3}.zip`], '54000');
  // failed → retry is bounded; rejected is final.
  await h.q(`update os_project_imports set status='validating' where id=$1`, [id]);
  await h.q(`update os_project_imports set status='failed', error_code='storage_timeout' where id=$1`, [id]);
  await h.q(`update os_project_imports set status='validating' where id=$1`, [id]);
  assert.equal((await h.one('select attempts from os_project_imports where id=$1', [id])).attempts, 1);
  await h.q(`update os_project_imports set status='rejected', error_code='path_traversal' where id=$1`, [id]);
  await h.fails(`update os_project_imports set status='validating' where id=$1`, [id], '42501');
});

test('isolation: a non-owner reads nothing and cannot write projects, versions, storage objects or tokens', async () => {
  const h = await setup();
  await h.as('authenticated', MIGUEL);
  const a = await importVersion(h);
  await h.as('authenticated', STRANGER);
  for (const t of ['os_project_imports', 'os_project_versions', 'os_project_files', 'os_project_events', 'os_project_deployments', 'os_project_api_tokens'])
    assert.equal((await h.q(`select 1 from ${t}`)).length, 0, t);
  assert.equal((await h.q(`select 1 from storage.objects`)).length, 0, 'storage objects invisible');
  await h.fails(`insert into storage.objects(bucket_id,name) values('avalon-projects',$1)`, [`incoming/${STRANGER}/${crypto.randomUUID()}.zip`], '42501');
  await h.fails(`select os_project_restore_version($1)`, [a.versionId], '42501');
  await h.fails(`insert into os_project_api_tokens(name,token_sha256,prefix,scopes,expires_at) values('x',$1,'avb_abcd','{import:create}',now()+interval '1 day')`, [sha('t')], '42501');
  // anon sees nothing either.
  await h.as('anon');
  await h.fails('select 1 from os_project_versions', [], '42501');
  // Another OWNER cannot drop files into an archive path that belongs to someone else.
  await h.as('authenticated', SAMUEL);
  await h.fails(`insert into storage.objects(bucket_id,name) values('avalon-projects',$1)`, [`incoming/${MIGUEL}/${crypto.randomUUID()}.zip`], '42501');
  await h.q(`insert into storage.objects(bucket_id,name) values('avalon-projects',$1)`, ['blobs/' + sha('shared')]);
  await h.fails(`insert into storage.objects(bucket_id,name) values('avalon-projects','blobs/not-a-hash')`, [], '42501');
});

test('deployments: never the Avalon OS project; only sealed static versions; production needs a single-use owner approval', async () => {
  const h = await setup();
  await h.as('authenticated', MIGUEL);
  const a = await importVersion(h);
  const dep = (vp, target = 'preview', approval = null, version = a.versionId) => h.q(
    `insert into os_project_deployments(project_id,version_id,target,vercel_project,approval_id,idempotency_key) values($1,$2,$3,$4,$5,$6) returning id`,
    [a.projectId, version, target, vp, approval, 'dep-' + crypto.randomUUID()]);
  await h.fails(`insert into os_project_deployments(project_id,version_id,target,vercel_project,idempotency_key) values($1,$2,'preview','avalon-core-agency','dep-main-01')`, [a.projectId, a.versionId], '23514');
  const [{ id }] = await dep('avalon-client-sitio-importado');
  await h.fails(`update os_project_deployments set state='ready' where id=$1`, [id], '23514');
  await h.q(`update os_project_deployments set state='building', deployment_id='dpl_abc12345' where id=$1`, [id]);
  await h.q(`update os_project_deployments set state='ready', url='https://avalon-client-sitio-importado-x1.vercel.app' where id=$1`, [id]);
  await h.fails(`update os_project_deployments set state='building' where id=$1`, [id], '42501');
  await h.fails(`update os_project_deployments set vercel_project='avalon-client-otro' where id=$1`, [id], '42501');
  await h.fails(`update os_project_deployments set url='https://evil.example.com' where id=$1`, [id], '23514');
  // Production
  await h.fails(`insert into os_project_deployments(project_id,version_id,target,vercel_project,idempotency_key) values($1,$2,'production','avalon-client-sitio-importado','dep-prod-01')`, [a.projectId, a.versionId], '42501');
  const appr = (await h.one(`insert into os_project_publish_approvals(project_id,version_id,note) values($1,$2,'ok') returning id`, [a.projectId, a.versionId])).id;
  await dep('avalon-client-sitio-importado', 'production', appr);
  await h.fails(`insert into os_project_deployments(project_id,version_id,target,vercel_project,approval_id,idempotency_key) values($1,$2,'production','avalon-client-sitio-importado',$3,'dep-prod-02')`, [a.projectId, a.versionId, appr], '42501');
  // Dynamic projects are blocked until an isolated build environment exists.
  const n = await importVersion(h, MIGUEL, { project: a.projectId, deployable: 'needs_build' });
  await h.fails(`insert into os_project_deployments(project_id,version_id,target,vercel_project,idempotency_key) values($1,$2,'preview','avalon-client-sitio-importado','dep-next-01')`, [a.projectId, n.versionId], '0A000');
  const ev = (await h.q(`select action from os_project_events where action in ('deploy_requested','deploy_state','publish_approved')`)).map(x => x.action);
  assert.ok(ev.filter(x => x === 'deploy_requested').length === 2 && ev.includes('publish_approved') && ev.includes('deploy_state'), ev.join());
});

test('API tokens: hashed and scoped; a token only opens an inbox import; revoked or expired tokens fail; owners process later', async () => {
  const h = await setup();
  await h.as('authenticated', MIGUEL);
  // Prefixes may contain '-' or '_' (base64url): one of these is forced to prove it (was a 1-in-4 failure).
  await h.q(`insert into os_project_api_tokens(name,token_sha256,prefix,scopes,expires_at) values('dash',$1,'avb_-_a9','{import:read}',now()+interval '1 day')`, [sha('dash-token')]);
  const token = 'avb_' + crypto.randomBytes(24).toString('base64url');
  const hash = sha(token);
  await h.q(`insert into os_project_api_tokens(name,token_sha256,prefix,scopes,expires_at) values('Claude Code export',$1,$2,'{import:create}',now()+interval '30 days')`, [hash, token.slice(0, 8)]);
  await h.fails(`select token_sha256 from os_project_api_tokens`, [], '42501');
  await h.fails(`insert into os_project_api_tokens(name,token_sha256,prefix,scopes,expires_at) values('x',$1,'avb_wxyz','{deploy:production}',now()+interval '1 day')`, [sha('2')], '23514');
  await h.as('anon');
  const opened = (await h.one(`select os_bridge_api_open_import($1,'website','Landing IA','landing.zip','claude_code','tool-run-0001') as r`, [hash])).r;
  assert.equal(opened.status, 'awaiting_upload');
  assert.equal(opened.upload_path, `inbox/${opened.import_id}.zip`);
  const again = (await h.one(`select os_bridge_api_open_import($1,'website','Landing IA','landing.zip','claude_code','tool-run-0001') as r`, [hash])).r;
  assert.equal(again.import_id, opened.import_id, 'idempotent replay');
  assert.equal(again.replayed, true);
  await h.fails(`select os_bridge_api_open_import($1,'website','x','x.zip','api','tool-run-0002')`, [sha('wrong')], '28000');
  await h.fails(`select os_bridge_api_import_status($1,$2,true)`, [hash, opened.import_id], '22023');
  // anon storage: only the exact inbox path of an open import; never incoming/ or blobs/; never twice.
  await h.fails(`insert into storage.objects(bucket_id,name) values('avalon-projects',$1)`, [`inbox/${crypto.randomUUID()}.zip`], '42501');
  await h.fails(`insert into storage.objects(bucket_id,name) values('avalon-projects',$1)`, ['blobs/' + sha('x')], '42501');
  await h.q(`insert into storage.objects(bucket_id,name) values('avalon-projects',$1)`, [opened.upload_path]);
  await h.fails(`insert into storage.objects(bucket_id,name) values('avalon-projects',$1)`, [opened.upload_path]);

  // A separate read-only token must be refused BEFORE any upload-state write.
  // It can execute only a read request; no token can inspect another token's imports.
  await h.fails("select os_bridge_api_import_status($1,$2,false)", [sha('dash-token'), opened.import_id], 'P0002');
  await h.fails("select os_bridge_api_import_status($1,$2,true)", [sha('dash-token'), opened.import_id], '42501');
  const st = (await h.one(`select os_bridge_api_import_status($1,$2,true) as r`, [hash, opened.import_id])).r;
  assert.equal(st.status, 'received', 'uploaded; waits for an owner to process it');
  await h.fails(`select 1 from os_project_imports`, [], '42501');
  // Revocation is immediate.
  await h.as('authenticated', MIGUEL);
  assert.equal((await h.one('select source_kind, status, created_by from os_project_imports where id=$1', [opened.import_id])).created_by, MIGUEL);
  await h.q(`update os_project_api_tokens set revoked_at=now() where prefix=$1`, [token.slice(0, 8)]);
  await h.fails(`update os_project_api_tokens set revoked_at=null where prefix=$1`, [token.slice(0, 8)], '42501');
  await h.as('anon');
  await h.fails(`select os_bridge_api_open_import($1,'website','x','x.zip','api','tool-run-0003')`, [hash], '28000');
  await h.fails(`select os_bridge_api_import_status($1,$2)`, [hash, opened.import_id], '28000');
});
