// Product Control upload replay regression: real route, mocked owner/Storage, no external writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const IMPORT = '11111111-1111-4111-8111-111111111111';
const payload = {
  name: 'demo.zip', size: 1024, category: 'website', sourceTool: 'manual',
  projectId: null, projectName: null, idempotencyKey: 'upload-replay-0001'
};
const record = {
  id: IMPORT, status: 'received', archive_path: 'incoming/' + OWNER + '/' + IMPORT + '.zip',
  category: payload.category, original_name: payload.name, archive_bytes: payload.size,
  project_id: null, source_tool: payload.sourceTool, project_name: null
};
function loadRoute({ existing = record, dbError = null, owner = true } = {}) {
  const counters = { signed: 0, writes: 0, path: '' };
  const db = {
    from(table) {
      assert.equal(table, 'os_project_imports');
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        async maybeSingle() { return { data: existing, error: dbError }; },
        insert() { counters.writes++; throw new Error('Unexpected new import on replay'); },
      };
      return chain;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'avalon-projects');
        return {
          async createSignedUploadUrl(blobPath) {
            counters.signed++;
            counters.path = blobPath;
            return { error: null, data: { signedUrl: 'https://staging.example.test/upload?token=short-lived' } };
          }
        };
      }
    }
  };
  const mocks = {
    '@/lib/auth/session': { getOwnerSession: async () => owner ? { user: { id: OWNER }, supabase: db } : null },
    '@/lib/project-bridge/http': {
      sameOrigin: () => true,
      UUID: /^[0-9a-f-]{36}$/i,
      str: (x, max) => typeof x === 'string' && x.length <= max ? x : null,
      readJson: (req) => req.json(),
      reply: (data, status = 200) => new Response(JSON.stringify(data), {
        status, headers: { 'content-type': 'application/json' }
      })
    },
    '@/lib/project-bridge/policy': {
      BRIDGE_BUCKET: 'avalon-projects', BRIDGE_LIMITS: { archiveBytes: 25 * 1024 * 1024 },
      CATEGORIES: ['website', 'ecommerce', 'crm_creator', 'apps', 'receptionist', 'chatbots', 'marketing'],
      SOURCE_TOOLS: ['manual', 'claude_code', 'codex', 'higgsfield', 'chatgpt', 'api', 'other'],
      bridgeCategoryEnabled: (cat, enabled) => ['website', 'ecommerce', 'crm_creator', 'apps'].includes(cat)
        || (enabled && ['receptionist', 'chatbots', 'marketing'].includes(cat))
    }
  };
  const filename = path.resolve('src/app/admin/workspace/library/uploads/route.ts');
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const originalRequire = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : originalRequire(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename);
  return { POST: mod.exports.POST, counters };
}
const post = (POST, body = payload) => POST(new Request('https://avalon.example.test/admin/workspace/library/uploads', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
}));

test('a lost first upload response reissues a signed URL on the SAME private import, without creating another row', async () => {
  const { POST, counters } = loadRoute();
  const res = await post(POST);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual({ id: data.importId, replayed: data.replayed }, { id: IMPORT, replayed: true });
  assert.equal(data.upload.method, 'PUT');
  assert.equal(data.upload.contentType, 'application/zip');
  assert.equal(counters.path, record.archive_path);
  assert.equal(counters.signed, 1);
  assert.equal(counters.writes, 0);
});

test('replay refuses changed file, category and project metadata', async () => {
  const { POST, counters } = loadRoute();
  for (const changed of [{ name: 'other.zip' }, { size: 999 },
    { category: 'ecommerce' }, { projectName: 'different' }, { sourceTool: 'codex' }]) {
    const res = await post(POST, { ...payload, ...changed });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'idempotency_key_in_use');
  }
  assert.equal(counters.signed, 0);
  assert.equal(counters.writes, 0);
});

test('completed replay returns status without offering to overwrite sealed content', async () => {
  const { POST, counters } = loadRoute({ existing: { ...record, status: 'registered' } });
  const res = await post(POST);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'registered');
  assert.equal(data.upload, undefined);
  assert.equal(counters.signed, 0);
});

test('missing owner or disabled ZIP category fails closed before Storage access', async () => {
  const a = loadRoute({ owner: false });
  assert.equal((await post(a.POST)).status, 401);
  const b = loadRoute();
  const resp = await post(b.POST, { ...payload, category: 'chatbots' });
  assert.equal(resp.status, 409);
  assert.equal((await resp.json()).error, 'category_not_enabled');
  assert.equal(b.counters.signed, 0);
});
