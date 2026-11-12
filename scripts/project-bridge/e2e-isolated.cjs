#!/usr/bin/env node
// Avalon Direct Bridge — REAL end-to-end proof against an ISOLATED Supabase project (never production).
//
//   NODE_USE_ENV_PROXY=1 node scripts/project-bridge/e2e-isolated.cjs <dir-with env.json + creds.json> [evidence.json]
//
// env.json:  {"url":"https://<isolated-ref>.supabase.co","key":"<publishable key>"}
// creds.json: {"owner":{"email","password"},"stranger":{"email","password"}}  (synthetic users; file mode 600; never printed)
//
// Every step runs with the signed-in user's own JWT through the public REST/Storage APIs, so RLS and storage policies
// are what is being tested. No service-role or admin credential is used. It uses the SAME service and adapters as the app.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const load = require('../creative-bridge/continuity-loader.cjs');
const { buildZip, PNG } = require('../../tests/support/zip-builder.cjs');

const { processImport } = load(path.join(__dirname, '../../src/lib/project-bridge/service.ts'));
const { supabaseRepo, supabaseStore } = load(path.join(__dirname, '../../src/lib/project-bridge/supabase.ts'));

const dir = process.argv[2];
const out = process.argv[3] || path.join(dir, 'evidence.json');
const env = JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8'));
const creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
if (/ltbwzcrxeuczdhhtbqgm/.test(env.url)) throw new Error('Refusing to run against production');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const evidence = { target: env.url.replace(/^https:\/\//, ''), started_at: new Date().toISOString(), steps: [] };
const step = (name, ok, detail = {}) => { evidence.steps.push({ name, ok, ...detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(detail)); if (!ok) evidence.failed = true; };

const site = (title, extra = '') => buildZip([
  { name: 'demo/index.html', data: `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="css/s.css"></head><body><h1>${title}</h1>${extra}<img src="img/logo.png" alt=""></body></html>` },
  { name: 'demo/css/s.css', data: 'body{background:#0b0b1a;color:#fff;font-family:system-ui}' },
  { name: 'demo/img/logo.png', data: PNG, method: 0 },
]);

async function signIn(who) {
  const c = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await c.auth.signInWithPassword({ email: creds[who].email, password: creds[who].password });
  if (r.error) throw new Error(`${who} sign-in failed: ${r.error.message}`);
  return { db: c, uid: r.data.user.id };
}

/** Exactly what the app does: register the import (RLS + SQL limits), get a signed URL, PUT the bytes, process. */
async function importArchive(o, bytes, name, projectId) {
  const id = crypto.randomUUID();
  const p = `incoming/${o.uid}/${id}.zip`;
  const ins = await o.db.from('os_project_imports').insert({ id, project_id: projectId, category: 'website', project_name: 'Bridge E2E demo', original_name: name, source_tool: 'claude_code', archive_path: p, archive_bytes: bytes.length, idempotency_key: 'e2e-' + id });
  if (ins.error) throw new Error('import row: ' + ins.error.message);
  const signed = await o.db.storage.from('avalon-projects').createSignedUploadUrl(p);
  if (signed.error) throw new Error('signed url: ' + signed.error.message);
  const put = await fetch(signed.data.signedUrl, { method: 'PUT', headers: { 'content-type': 'application/zip', 'x-upsert': 'false' }, body: bytes });
  if (!put.ok) throw new Error('upload: ' + put.status + ' ' + (await put.text()).slice(0, 200));
  const result = await processImport(supabaseRepo(o.db), supabaseStore(o.db), id);
  return { id, path: p, result };
}

(async () => {
  const owner = await signIn('owner');
  const stranger = await signIn('stranger');
  step('real sign-in (Supabase Auth password grant) for owner and non-owner', true, { owner: owner.uid, stranger: stranger.uid });

  // v1
  const v1zip = site('Avalon Bridge · versión 1');
  const v1 = await importArchive(owner, v1zip, 'demo-v1.zip', null);
  step('v1: ZIP uploaded to private bucket, validated, registered', v1.result.status === 'registered' && v1.result.number === 1, { status: v1.result.status, number: v1.result.number, files: v1.result.inspection?.files });
  const projectId = v1.result.projectId;

  // Original archive download + SHA-256
  const store = supabaseStore(owner.db);
  const back = await store.get(v1.path);
  step('original ZIP downloaded back; SHA-256 identical', !!back && sha(back) === sha(v1zip), { local: sha(v1zip), downloaded: back ? sha(back) : null, bytes: v1zip.length });
  const imp = await owner.db.from('os_project_imports').select('archive_sha256,status').eq('id', v1.id).single();
  step('SHA-256 recorded in the import row matches', imp.data?.archive_sha256 === sha(v1zip), { recorded: imp.data?.archive_sha256 });

  // Every file of v1: blob download + hash
  const f1 = await owner.db.from('os_project_files').select('path,sha256,size').eq('version_id', v1.result.versionId).order('path');
  let allOk = f1.data.length === 3;
  for (const f of f1.data) { const b = await store.get('blobs/' + f.sha256); allOk = allOk && !!b && sha(b) === f.sha256 && b.length === Number(f.size); }
  step('every stored file of v1 downloaded; SHA-256 and size match the manifest', allOk, { files: f1.data.map(f => f.path) });

  // v2
  const v2zip = site('Avalon Bridge · versión 2', '<p>Cambio de la versión 2</p>');
  const v2 = await importArchive(owner, v2zip, 'demo-v2.zip', projectId);
  step('v2: second import of the same project creates version 2', v2.result.status === 'registered' && v2.result.number === 2, { status: v2.result.status, number: v2.result.number });

  // Duplicate detection
  const dup = await importArchive(owner, site('Avalon Bridge · versión 2', '<p>Cambio de la versión 2</p>'), 'demo-v2-again.zip', projectId);
  step('re-uploading identical content is detected as duplicate (no new version)', dup.result.status === 'duplicate', { status: dup.result.status });

  // Restore v1 → v3
  const rest = await owner.db.rpc('os_project_restore_version', { p_version: v1.result.versionId, p_note: 'E2E: volver a v1' });
  const vers = await owner.db.from('os_project_versions').select('id,number,kind,restored_from,content_digest').eq('project_id', projectId).order('number');
  const v3 = vers.data.find(v => v.id === rest.data);
  const v1row = vers.data.find(v => v.number === 1);
  step('restore v1 creates immutable version 3 with v1 content; history keeps 1,2,3', !rest.error && v3?.number === 3 && v3.kind === 'restore' && v3.restored_from === v1row.id && v3.content_digest === v1row.content_digest && vers.data.length === 3, { versions: vers.data.map(v => `${v.number}:${v.kind}`) });
  const f3 = await owner.db.from('os_project_files').select('path,sha256').eq('version_id', rest.data).eq('path', 'index.html').single();
  const html3 = new TextDecoder().decode(await store.get('blobs/' + f3.data.sha256));
  step('restored index.html content is version 1 (downloaded and read)', html3.includes('versión 1') && !html3.includes('versión 2'), { title: /<title>([^<]*)/.exec(html3)?.[1] });

  // Immutability through the API
  const tamper = await owner.db.from('os_project_versions').update({ note: 'tamper' }).eq('id', v1row.id).select();
  step('a version cannot be modified, even by its owner', !!tamper.error, { error: tamper.error?.code });

  // Non-owner: read nothing, write nothing
  const s = stranger.db;
  const reads = await Promise.all(['os_projects', 'os_project_imports', 'os_project_versions', 'os_project_files', 'os_project_events'].map(t => s.from(t).select('*', { count: 'exact', head: false }).limit(5)));
  step('non-owner reads 0 rows from projects, imports, versions, files, events', reads.every(r => !r.error ? (r.data ?? []).length === 0 : true), { results: reads.map(r => r.error ? 'error:' + r.error.code : (r.data ?? []).length) });
  const sBlob = await s.storage.from('avalon-projects').download('blobs/' + f1.data[0].sha256);
  step('non-owner cannot download a stored blob', !!sBlob.error, { error: sBlob.error?.message?.slice(0, 60) });
  const sOrig = await s.storage.from('avalon-projects').download(v1.path);
  step('non-owner cannot download the original ZIP', !!sOrig.error, { error: sOrig.error?.message?.slice(0, 60) });
  const sId = crypto.randomUUID();
  const sUp = await s.storage.from('avalon-projects').upload(`incoming/${stranger.uid}/${sId}.zip`, v1zip, { contentType: 'application/zip' });
  step('non-owner cannot upload into the private bucket', !!sUp.error, { error: sUp.error?.message?.slice(0, 60) });
  const sOwnerPath = await s.storage.from('avalon-projects').upload(`incoming/${owner.uid}/${sId}.zip`, v1zip, { contentType: 'application/zip' });
  step('non-owner cannot write into the owner\'s folder', !!sOwnerPath.error, { error: sOwnerPath.error?.message?.slice(0, 60) });
  const sIns = await s.from('os_project_imports').insert({ id: sId, category: 'website', original_name: 'x.zip', source_tool: 'manual', archive_path: `incoming/${stranger.uid}/${sId}.zip`, idempotency_key: 'stranger-' + sId });
  step('non-owner cannot register an import', !!sIns.error, { error: sIns.error?.code });
  const sRestore = await s.rpc('os_project_restore_version', { p_version: v1.result.versionId });
  step('non-owner cannot restore a version', !!sRestore.error, { error: sRestore.error?.code });
  const sUpd = await s.from('os_projects').update({ name: 'hijack' }).eq('id', projectId).select();
  step('non-owner cannot modify the project', !!sUpd.error || (sUpd.data ?? []).length === 0, { error: sUpd.error?.code, rows: (sUpd.data ?? []).length });

  // Anonymous API with an invalid token
  const anon = createClient(env.url, env.key, { auth: { persistSession: false } });
  const bad = await anon.rpc('os_bridge_api_open_import', { p_token_sha256: sha('not-a-token'), p_category: 'website', p_project_name: 'x', p_original_name: 'x.zip', p_source_tool: 'api', p_idempotency_key: 'anon-attempt-1' });
  step('anonymous call with an invalid API token is refused', !!bad.error && bad.error.code === '28000', { error: bad.error?.code });
  const anonRead = await anon.from('os_project_versions').select('id').limit(1);
  step('anonymous REST read of versions is refused', !!anonRead.error || (anonRead.data ?? []).length === 0, { error: anonRead.error?.code });

  // Audit log
  const ev = await owner.db.from('os_project_events').select('action,actor').eq('project_id', projectId).order('id');
  const actions = ev.data.map(e => e.action);
  step('audit log records imports, versions, duplicate and restore with the real actor', ['import_registered', 'version_created', 'import_duplicate', 'version_restored'].every(a => actions.includes(a)) && ev.data.every(e => e.actor === owner.uid || e.actor === null), { actions });

  evidence.project_id = projectId;
  evidence.finished_at = new Date().toISOString();
  evidence.result = evidence.failed ? 'FAILED' : 'PASSED';
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log('RESULT', evidence.result, `${evidence.steps.filter(s => s.ok).length}/${evidence.steps.length}`);
  process.exit(evidence.failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
