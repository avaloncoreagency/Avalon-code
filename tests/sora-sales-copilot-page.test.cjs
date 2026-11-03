const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/app/admin/workspace/crm/copilot/page.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
}}).outputText;
const ID = '11111111-1111-4111-8111-111111111111';
const row = { id: ID, company: 'Synthetic Bakery', stage_id: '22222222-2222-4222-8222-222222222222' };
function collect(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(collect).join(' ');
  if (typeof tree === 'object') return collect(tree.props?.children);
  return String(tree);
}
function harness({ owner = true, record = row, listError = null } = {}) {
  const reads = [], coreCalls = [];
  const supabase = {
    from(table) {
      const q = { table, fields: [], filters: [], methods: [] };
      reads.push(q);
      const builder = {
        select(fields) { q.fields.push(fields); return builder; },
        eq(key, value) { q.filters.push([key, value]); return builder; },
        order() { return builder; },
        limit: async () => ({ data: listError ? null : [row], error: listError }),
        maybeSingle: async () => ({ data: table === 'crm_stages' ? { label: 'New lead' } : record, error: null }),
      };
      return builder;
    },
  };
  const runtime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const fakeCore = {
    SERVICE_AREAS: ['website', 'ecommerce', 'crm', 'receptionist', 'marketing'],
    prepareOpportunityBrief: async (input, options) => {
      coreCalls.push({ input, options });
      return { status: 'unavailable', reason: 'not_connected', usage: null,
        snapshot: { companyName: input.companyName, stage: input.stage, facts: [],
          unknowns: fakeCore.SERVICE_AREAS.map(area => ({ area, reason: 'not_evaluated' })) } };
    },
  };
  const imports = {
    'next/link': { __esModule: true, default: 'Link' },
    'react/jsx-runtime': runtime,
    '@/components/suite/suite': { Suite: 'Suite' },
    '@/lib/auth/session': { requireOwner: async () => {
      if (!owner) throw new Error('redirect:/admin/login');
      return { supabase, userId: 'synthetic-owner' };
    } },
    '@/lib/i18n-server': { getLang: async () => 'es' },
    '@/lib/i18n': { pick: (_lang, es) => es },
    '@/lib/crm/domain': { uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i },
    '@/lib/ai/opportunity-brief': fakeCore,
  };
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(mod, mod.exports, id => {
    if (!Object.hasOwn(imports, id)) throw new Error("Unexpected import " + id);
    return imports[id];
  });
  return { render: mod.exports.default, reads, coreCalls };
}

test('anonymous / non-owner cannot read CRM data or invoke Copilot', async () => {
  const h = harness({ owner: false });
  await assert.rejects(h.render({ searchParams: Promise.resolve({ lead: ID }) }), /redirect:\/admin\/login/);
  assert.equal(h.reads.length, 0);
  assert.equal(h.coreCalls.length, 0);
});

test('owner sees only RLS business fields; zero fabricated facts, zero AI calls or writes', async () => {
  const h = harness();
  const tree = await h.render({ searchParams: Promise.resolve({ lead: ID }) });
  const display = collect(tree);
  assert.match(display, /IA no conectada/);
  assert.match(display, /Synthetic Bakery/);
  assert.match(display, /Ninguno: no se han cargado evidencias verificadas/);
  for (const name of ['Sitio web', 'Comercio electronico', 'CRM', 'Recepcion', 'Marketing']) assert.match(display, new RegExp(name));
  assert.equal(h.coreCalls.length, 1);
  assert.deepEqual(h.coreCalls[0].input.signals, []);
  assert.equal(h.coreCalls[0].options.adapter, null);
  assert.deepEqual(h.reads.map(q => q.table), ['crm_leads', 'crm_leads', 'crm_stages']);
  assert.ok(h.reads.every(q => q.fields.every(fields => !/email|phone|contact|notes|payments|cost/i.test(fields))));
  assert.ok(h.reads.every(q => !q.methods.some(m => /insert|update|delete|rpc/i.test(m))));
});

test('invalid and RLS-hidden lead IDs produce no Copilot draft', async () => {
  const invalid = harness();
  const invalidOutput = collect(await invalid.render({ searchParams: Promise.resolve({ lead: '../bad' }) }));
  assert.match(invalidOutput, /Identificador invalido/);
  assert.equal(invalid.coreCalls.length, 0);
  assert.equal(invalid.reads.length, 1);
  const hidden = harness({ record: null });
  const missingOutput = collect(await hidden.render({ searchParams: Promise.resolve({ lead: ID }) }));
  assert.match(missingOutput, /Lead no disponible o sin permiso de lectura/);
  assert.equal(hidden.coreCalls.length, 0);
});

test('database lookup failure does not show a made-up analysis', async () => {
  const h = harness({ listError: { code: '42501' } });
  const output = collect(await h.render({ searchParams: Promise.resolve({ lead: ID }) }));
  assert.match(output, /No se pudieron consultar los leads/);
  assert.equal(h.coreCalls.length, 0);
});
