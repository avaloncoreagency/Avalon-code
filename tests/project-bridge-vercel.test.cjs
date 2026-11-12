// Vercel bridge request logic with a FAKE fetch (labelled: these tests do not reach Vercel). The real behaviour was
// verified separately with real deployments, recorded in docs/project-bridge/PROJECT_BRIDGE.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('../scripts/creative-bridge/continuity-loader.cjs');
const V = load('src/lib/project-bridge/vercel.ts');

const files = [{ path: 'index.html', bytes: new TextEncoder().encode('<h1>x</h1>') }, { path: 'a.css', bytes: new TextEncoder().encode('b{}') }];
function fakeFetch({ project = { name: 'avalon-client-demo', targets: { production: { id: 'x' } } }, deploy = { id: 'dpl_TESTabcdef12', url: 'avalon-client-demo-abc.vercel.app', readyState: 'QUEUED' }, fail = null } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const j = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
    if (url.includes('/v9/projects/')) return project ? j(200, project) : j(404, { error: { code: 'not_found' } });
    if (url.includes('/v2/files')) return fail === 'files' ? j(403, { error: { code: 'forbidden' } }) : j(200, {});
    if (url.includes('/v13/deployments') && init.method === 'POST') return fail === 'deploy' ? j(400, { error: { code: 'bad_request' } }) : j(200, deploy);
    if (url.includes('/v13/deployments/')) return j(200, { ...deploy, readyState: 'ERROR', errorCode: 'BUILD_FAILED' });
    return j(500, {});
  };
  return { fn, calls };
}
const cfg = { token: 'test-token-not-real', teamId: 'team_lHTO3wgJm0yAyexxMDmkIFW4' };

test('configuration is server-only and fails closed', () => {
  assert.equal(V.vercelConfig({}), null);
  assert.equal(V.vercelConfig({ AVALON_VERCEL_DEPLOY_TOKEN: 't', AVALON_VERCEL_TEAM_ID: 'bad' }), null);
  assert.deepEqual(V.vercelConfig({ AVALON_VERCEL_DEPLOY_TOKEN: ' t ', AVALON_VERCEL_TEAM_ID: 'team_abcdefgh12' }), { token: 't', teamId: 'team_abcdefgh12' });
});

test('client project names are isolated from Avalon OS', () => {
  assert.equal(V.clientProjectName('Barbería Chino · Miami'), 'avalon-client-barberia-chino-miami');
  assert.equal(V.clientProjectName('!!!'), 'avalon-client-proyecto');
  for (const bad of ['avalon-core-agency', 'avalon-os', 'my-site', 'avalon-client-', 'avalon-client-UPPER']) assert.throws(() => V.assertClientProject(bad), /refused_project_name/, bad);
});

test('preview: uploads by SHA1 then creates a no-build deployment without target; token only in the Authorization header', async () => {
  const f = fakeFetch();
  const d = await V.deployStatic(f.fn, cfg, 'avalon-client-demo', files, 'preview');
  assert.deepEqual(d, { id: 'dpl_TESTabcdef12', url: 'https://avalon-client-demo-abc.vercel.app', state: 'queued', error: null });
  const uploads = f.calls.filter(c => c.url.includes('/v2/files'));
  assert.equal(uploads.length, 2);
  assert.match(uploads[0].headers['x-vercel-digest'], /^[0-9a-f]{40}$/);
  const create = f.calls.find(c => c.method === 'POST' && c.url.includes('/v13/deployments'));
  const body = JSON.parse(create.body);
  assert.equal(body.target, undefined);
  assert.equal(body.name, 'avalon-client-demo');
  assert.deepEqual(body.projectSettings, { framework: null, buildCommand: null, installCommand: null, devCommand: null, outputDirectory: null });
  assert.ok(f.calls.every(c => !c.url.includes('test-token-not-real')), 'token never in a URL');
  assert.ok(!create.body.includes('test-token-not-real'));
});

test('first deployment of a new project is refused as a preview (Vercel would publish it to production)', async () => {
  const f = fakeFetch({ project: null });
  await assert.rejects(V.deployStatic(f.fn, cfg, 'avalon-client-demo', files, 'preview'), e => e.code === 'first_deployment_is_production');
  assert.ok(!f.calls.some(c => c.url.includes('/v2/files')), 'nothing uploaded');
  const g = fakeFetch({ project: { name: 'avalon-client-demo', targets: {} } });
  await assert.rejects(V.deployStatic(g.fn, cfg, 'avalon-client-demo', files, 'preview'), e => e.code === 'first_deployment_is_production');
  const p = fakeFetch({ project: null });
  await V.deployStatic(p.fn, cfg, 'avalon-client-demo', files, 'production');
  assert.equal(JSON.parse(p.calls.find(c => c.method === 'POST' && c.url.includes('/v13/')).body).target, 'production');
});

test('provider errors are surfaced, never reported as success; a failed build reads as error', async () => {
  await assert.rejects(V.deployStatic(fakeFetch({ fail: 'files' }).fn, cfg, 'avalon-client-demo', files, 'preview'), e => e.code === 'file_upload_failed:forbidden');
  await assert.rejects(V.deployStatic(fakeFetch({ fail: 'deploy' }).fn, cfg, 'avalon-client-demo', files, 'preview'), e => e.code === 'deployment_failed:bad_request');
  await assert.rejects(V.deployStatic(fakeFetch().fn, cfg, 'avalon-client-demo', [files[1]], 'preview'), e => e.code === 'no_index_html');
  const st = await V.getDeployment(fakeFetch().fn, cfg, 'dpl_TESTabcdef12');
  assert.deepEqual([st.state, st.error], ['error', 'BUILD_FAILED']);
  assert.throws(() => V.normalizeDeployment({ id: 'x', readyState: 'READY' }), /invalid_provider_response/);
  assert.equal(V.normalizeDeployment({ id: 'dpl_abcdefgh12', url: 'evil.example.com', readyState: 'READY' }).url, null, 'only *.vercel.app URLs are recorded');
  await assert.rejects(V.getDeployment(fakeFetch().fn, cfg, '../x'), e => e.code === 'invalid_deployment_id');
});
