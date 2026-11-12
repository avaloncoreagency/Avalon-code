// Project Bridge end to end on isolated PostgreSQL: the REAL import service (src/lib/project-bridge/service.ts) runs
// against the REAL migration chain (RLS + guards) through a PGlite repository, with an in-memory blob store standing in
// for Supabase Storage (that part is a test double and is labelled as such). Synthetic archives and users only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const load = require('../scripts/creative-bridge/continuity-loader.cjs');
const { buildZip, staticSite } = require('./support/zip-builder.cjs');

const { processImport, STALE_MS } = load('src/lib/project-bridge/service.ts');
const { buildPreview, PREVIEW_CSP } = load('src/lib/project-bridge/preview.ts');
const { deploymentBody } = load('src/lib/project-bridge/vercel.ts');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id) values('${MIGUEL}'),('${STRANGER}')`);
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
    if (file.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${STRANGER}','operator')`);
  }
  const as = user => db.exec(`reset role;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${user}';set role authenticated`);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const blobs = new Map(); // test double for Supabase Storage
  const store = { get: async p => blobs.get(p) ?? null, put: async (p, b) => { if (!blobs.has(p)) blobs.set(p, b); }, blobs };
  const repo = {
    getImport: id => one('select id,project_id,category,project_name,original_name,source_tool,archive_path,status,attempts,updated_at::text,version_id from os_project_imports where id=$1', [id]),
    async updateImport(id, patch) {
      const keys = Object.keys(patch);
      await q(`update os_project_imports set ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} where id=$1`, [id, ...keys.map(k => k === 'problems' ? JSON.stringify(patch[k]) : patch[k])]);
    },
    createProject: async (module, name, settings) => (await one('insert into os_projects(module,name,settings) values($1,$2,$3) returning id', [module, name, JSON.stringify(settings)])).id,
    latestSealedVersion: async pid => (await one('select id,number,content_digest from os_project_versions where project_id=$1 and sealed order by number desc limit 1', [pid])) ?? null,
    insertVersion: v => one(`insert into os_project_versions(project_id,number,kind,import_id,source_tool,framework,entry_path,deployable,file_count,total_bytes,content_digest,summary)
      values($1,1,'import',$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id,number`, [v.project_id, v.import_id, v.source_tool, v.framework, v.entry_path, v.deployable, v.file_count, v.total_bytes, v.content_digest, JSON.stringify(v.summary)]),
    async insertFiles(vid, files) { for (const f of files) await q('insert into os_project_files(version_id,path,sha256,size,mime) values($1,$2,$3,$4,$5)', [vid, f.path, f.sha256, f.size, f.mime]); },
    sealVersion: vid => q('update os_project_versions set sealed=true where id=$1', [vid]),
  };
  /** What the upload route does: register the import for an archive the owner uploaded to incoming/<uid>/<id>.zip. */
  const upload = async (bytes, { name = 'sitio.zip', project = null, category = 'website', user = MIGUEL } = {}) => {
    const id = crypto.randomUUID();
    const path = `incoming/${user}/${id}.zip`;
    blobs.set(path, bytes);
    await q(`insert into os_project_imports(id,project_id,category,project_name,original_name,source_tool,archive_path,idempotency_key) values($1,$2,$3,'Sitio Demo',$4,'chatgpt',$5,$6)`,
      [id, project, category, name, path, 'ui-' + id]);
    return id;
  };
  return { db, as, q, one, repo, store, upload };
}

test('acceptance path: import ZIP → private blobs → library record → files and version → isolated preview → v2 → restore v1', async () => {
  const h = await setup();
  await h.as(MIGUEL);
  const first = await processImport(h.repo, h.store, await h.upload(staticSite('Avalon Demo v1')));
  assert.equal(first.status, 'registered', JSON.stringify(first));
  assert.equal(first.number, 1);
  assert.equal(first.inspection.deployable, 'static');
  const proj = await h.one('select module, name, settings from os_projects where id=$1', [first.projectId]);
  assert.deepEqual([proj.module, proj.name, proj.settings.bridge.framework], ['website', 'Sitio Demo', 'static']);
  const files = await h.q('select path, sha256, size from os_project_files where version_id=$1 order by path', [first.versionId]);
  assert.equal(files.length, 5);
  for (const f of files) assert.ok(h.store.blobs.has('blobs/' + f.sha256), 'every file is stored content-addressed: ' + f.path);
  assert.equal((await h.one('select status from os_project_imports where version_id=$1', [first.versionId])).status, 'registered');

  // Isolated preview of the stored version: assets inlined, CSP sandbox, other pages not navigable inside the frame.
  const pv = await buildPreview(files, 'index.html', async sha => h.store.blobs.get('blobs/' + sha) ?? null);
  assert.match(pv.html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'/);
  assert.match(pv.html, /href="data:text\/css;base64,/);
  assert.match(pv.html, /src="data:image\/png;base64,/);
  assert.match(pv.html, /src="data:text\/javascript;base64,/);
  assert.match(pv.html, /href="#" data-avalon-page="contacto.html"/);
  assert.equal(pv.stats.inlined, 3);
  assert.match(PREVIEW_CSP, /^sandbox allow-scripts allow-forms; default-src 'none';.*connect-src 'none'/);

  // Same content again → duplicate (no new version). New content → v2.
  const dup = await processImport(h.repo, h.store, await h.upload(staticSite('Avalon Demo v1', 'otra-carpeta/'), { project: first.projectId }));
  assert.equal(dup.status, 'duplicate');
  const second = await processImport(h.repo, h.store, await h.upload(staticSite('Avalon Demo v2'), { project: first.projectId }));
  assert.equal(second.status, 'registered');
  assert.equal(second.number, 2);
  const restored = (await h.one('select os_project_restore_version($1, $2) id', [first.versionId, 'volver a v1'])).id;
  assert.equal((await h.one('select number from os_project_versions where id=$1', [restored])).number, 3);
  assert.equal((await h.one('select content_digest from os_project_versions where id=$1', [restored])).content_digest,
    (await h.one('select content_digest from os_project_versions where id=$1', [first.versionId])).content_digest, 'restored content == v1');

  // The exact Vercel payload for this version (a client project, never Avalon OS; static: no build/install commands).
  const body = deploymentBody('avalon-client-sitio-demo', files.map(f => ({ path: f.path, sha: 'x'.repeat(40), size: Number(f.size) })), 'preview');
  assert.equal(body.target, undefined, 'preview is the default target');
  assert.deepEqual(body.projectSettings, { framework: null, buildCommand: null, installCommand: null, devCommand: null, outputDirectory: null });
  assert.throws(() => deploymentBody('avalon-core-agency', [], 'preview'), /refused_project_name/);

  const log = (await h.q('select action from os_project_events where project_id=$1 order by id', [first.projectId])).map(r => r.action);
  for (const a of ['import_registered', 'version_created', 'import_duplicate', 'version_restored']) assert.ok(log.includes(a), a + ' in ' + log.join());
});

test('rejections are recorded with reasons; a crashed import is recovered; a non-owner cannot process or see anything', async () => {
  const h = await setup();
  await h.as(MIGUEL);
  const bad = await processImport(h.repo, h.store, await h.upload(buildZip([{ name: '../../x.html', data: 'x' }])));
  assert.deepEqual([bad.status, bad.reason], ['rejected', 'path_traversal']);
  const evil = await processImport(h.repo, h.store, await h.upload(buildZip([{ name: 'index.html', data: 'ok' }, { name: 'run.sh', data: 'x' }])));
  assert.equal(evil.reason, 'rejected_files');
  const row = await h.one(`select status, error_code, problems from os_project_imports where error_code='rejected_files'`);
  assert.deepEqual(row.problems, [{ path: 'run.sh', reason: 'blocked_file_type:sh' }]);
  assert.equal((await h.q('select 1 from os_project_versions')).length, 0, 'nothing registered from rejected archives');

  // Crash simulation: an import stuck in validating is busy while fresh, then recovered after STALE_MS.
  const id = await h.upload(staticSite());
  await h.q(`update os_project_imports set status='validating' where id=$1`, [id]);
  assert.equal((await processImport(h.repo, h.store, id)).status, 'busy');
  const later = await processImport(h.repo, h.store, id, () => Date.now() + STALE_MS + 1000);
  assert.equal(later.status, 'registered');
  assert.equal((await h.one('select attempts from os_project_imports where id=$1', [id])).attempts, 1);
  // Missing archive → failed and retryable.
  const ghost = crypto.randomUUID();
  await h.q(`insert into os_project_imports(id,category,original_name,source_tool,archive_path,idempotency_key) values($1,'website','g.zip','manual',$2,'ghost-0001')`, [ghost, `incoming/${MIGUEL}/${ghost}.zip`]);
  assert.deepEqual(await processImport(h.repo, h.store, ghost), { status: 'failed', reason: 'archive_missing', retryable: true });

  await h.as(STRANGER);
  assert.equal((await processImport(h.repo, h.store, id)).reason, 'import_not_found', 'RLS: a non-owner cannot even see the import');
  await assert.rejects(h.q(`insert into os_project_imports(id,category,original_name,source_tool,archive_path,idempotency_key) values($1,'website','s.zip','manual',$2,'stranger-01')`, [ghost, `incoming/${STRANGER}/${ghost}.zip`]));
});
