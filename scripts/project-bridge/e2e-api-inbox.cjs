#!/usr/bin/env node
// Avalon Direct Bridge — REAL test of the tool/agent delivery channel (Codex, Claude, managers) on an ISOLATED project.
//   NODE_USE_ENV_PROXY=1 node scripts/project-bridge/e2e-api-inbox.cjs <dir with env.json + creds.json>
// Owner creates a scoped token → a tool (anonymous, token only) opens an import and uploads to inbox/ → the tool
// confirms → the OWNER processes it under their own session. Revoked tokens stop working. No admin credential is used.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const load = require('../creative-bridge/continuity-loader.cjs');
const { buildZip } = require('../../tests/support/zip-builder.cjs');
const { processImport } = load(path.join(__dirname, '../../src/lib/project-bridge/service.ts'));
const { supabaseRepo, supabaseStore } = load(path.join(__dirname, '../../src/lib/project-bridge/supabase.ts'));

const dir = process.argv[2];
const env = JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8'));
const creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
if (/ltbwzcrxeuczdhhtbqgm/.test(env.url)) throw new Error('Refusing to run against production');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const steps = [];
const step = (name, ok, detail = {}) => { steps.push({ name, ok, ...detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(detail)); };

(async () => {
  const owner = createClient(env.url, env.key, { auth: { persistSession: false } });
  const si = await owner.auth.signInWithPassword({ email: creds.owner.email, password: creds.owner.password });
  if (si.error) throw new Error(si.error.message);
  const token = 'avb_' + crypto.randomBytes(24).toString('base64url');
  const t = await owner.from('os_project_api_tokens').insert({ name: 'Codex delivery (E2E)', token_sha256: sha(token), prefix: token.slice(0, 8), scopes: ['import:create', 'import:read'], expires_at: new Date(Date.now() + 86400e3).toISOString(), created_by: si.data.user.id });
  step('owner creates a scoped, expiring API token (only its sha256 is stored)', !t.error, { error: t.error?.message });

  const tool = createClient(env.url, env.key, { auth: { persistSession: false } }); // anonymous: the tool has ONLY the token
  const key = 'codex-delivery-' + crypto.randomBytes(4).toString('hex');
  const open = await tool.rpc('os_bridge_api_open_import', { p_token_sha256: sha(token), p_category: 'apps', p_project_name: 'Codex delivery E2E', p_original_name: 'delivery.zip', p_source_tool: 'codex', p_idempotency_key: key });
  step('tool opens an import with the token → awaiting_upload in inbox/', !open.error && open.data?.status === 'awaiting_upload', { status: open.data?.status, path: open.data?.upload_path });
  const replay = await tool.rpc('os_bridge_api_open_import', { p_token_sha256: sha(token), p_category: 'apps', p_project_name: 'x', p_original_name: 'delivery.zip', p_source_tool: 'codex', p_idempotency_key: key });
  step('same idempotency key replays the same import (no duplicate)', replay.data?.import_id === open.data?.import_id && replay.data?.replayed === true);

  const pkg = buildZip([
    { name: 'delivery/DELIVERY.json', data: JSON.stringify({ id: 'synthetic-e2e', author: 'codex', module: 'nova-ui', base_commit: '0000000', delivery_commit: '1111111', version: '0.0.1-e2e' }) },
    { name: 'delivery/README.md', data: '# Synthetic delivery for the bridge E2E (no real code)' },
    { name: 'delivery/index.html', data: '<!doctype html><title>delivery</title><h1>ok</h1>' },
  ]);
  const wrong = await tool.storage.from('avalon-projects').upload(`inbox/${crypto.randomUUID()}.zip`, pkg, { contentType: 'application/zip' });
  step('the tool cannot upload to an inbox path it was not given', !!wrong.error, { error: wrong.error?.message?.slice(0, 60) });
  const up = await tool.storage.from('avalon-projects').upload(open.data.upload_path, pkg, { contentType: 'application/zip' });
  step('the tool uploads the package to its exact inbox path (anonymous, token-gated)', !up.error, { error: up.error?.message });
  const again = await tool.storage.from('avalon-projects').upload(open.data.upload_path, pkg, { contentType: 'application/zip', upsert: true });
  step('the uploaded package cannot be overwritten', !!again.error, { error: again.error?.message?.slice(0, 60) });
  const done = await tool.rpc('os_bridge_api_import_status', { p_token_sha256: sha(token), p_import: open.data.import_id, p_mark_uploaded: true });
  step('the tool confirms the upload → received (waits for owner review)', done.data?.status === 'received', { status: done.data?.status });
  const toolRead = await tool.from('os_project_imports').select('id').limit(1);
  step('the token cannot read the library', !!toolRead.error || (toolRead.data ?? []).length === 0, { error: toolRead.error?.code });

  const res = await processImport(supabaseRepo(owner), supabaseStore(owner), open.data.import_id);
  step('the OWNER processes the delivery under their own session → registered version', res.status === 'registered', { status: res.status, reason: res.reason, number: res.number });
  const st = await tool.rpc('os_bridge_api_import_status', { p_token_sha256: sha(token), p_import: open.data.import_id });
  step('the tool can read only the status of its own delivery', st.data?.status === 'registered' && st.data?.version?.number === 1, { status: st.data?.status, version: st.data?.version });

  const rv = await owner.from('os_project_api_tokens').update({ revoked_at: new Date().toISOString() }).eq('prefix', token.slice(0, 8));
  const after = await tool.rpc('os_bridge_api_open_import', { p_token_sha256: sha(token), p_category: 'apps', p_project_name: 'x', p_original_name: 'x.zip', p_source_tool: 'codex', p_idempotency_key: key + '-2' });
  step('revoked token stops working immediately', !rv.error && after.error?.code === '28000', { error: after.error?.code });

  const failed = steps.filter(s => !s.ok).length;
  fs.writeFileSync(path.join(dir, 'evidence-api-inbox.json'), JSON.stringify({ target: env.url, steps, result: failed ? 'FAILED' : 'PASSED', at: new Date().toISOString() }, null, 2));
  console.log('RESULT', failed ? 'FAILED' : 'PASSED', `${steps.length - failed}/${steps.length}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
