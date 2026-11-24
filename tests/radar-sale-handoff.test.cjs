// Cross-module synthetic regression: Radar's qualified lead ID is the sale's
// source lead ID. Neither this test nor the Radar action confirms a sale.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', output)(require, mod, mod.exports);
  return mod.exports;
}

const { qualifyRadarProspect } = load('src/lib/crm/radar-qualification.ts');
const { parseSaleForm } = load('src/lib/sales/domain.ts');
const PROSPECT = '00000000-0000-4000-8000-000000000011';
const LEAD = '00000000-0000-4000-8000-000000000022';
const KEY = '11111111-1111-4111-8111-111111111111';

function syntheticRadar() {
  const row = {
    id: PROSPECT, source_ref: 'osm:node/123', status: 'pending',
    do_not_contact: false, stars: 4, stars_override: null, lead_id: null,
  };
  const counts = { approvals: 0, conversions: 0, links: 0 };
  const chain = value => {
    const obj = {
      eq() { return obj; },
      select() { return obj; },
      maybeSingle: async () => value,
      then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
    };
    return obj;
  };
  const db = {
    from(table) {
      if (table === 'crm_prospects') return {
        select() { return chain({ data: row, error: null }); },
        update(patch) {
          counts.approvals++;
          Object.assign(row, patch);
          return chain({ data: { id: PROSPECT }, error: null });
        },
      };
      if (table === 'crm_leads') return {
        update(patch) {
          assert.deepEqual(patch, { prospect_id: PROSPECT });
          counts.links++;
          return chain({ data: null, error: null });
        },
      };
      throw Error('Unexpected table: ' + table);
    },
    async rpc(name, args) {
      assert.equal(name, 'crm_convert_prospect');
      assert.deepEqual(args, { prospect_id: PROSPECT });
      counts.conversions++;
      row.status = 'converted';
      row.lead_id = LEAD;
      return { data: LEAD, error: null };
    },
  };
  return { db, counts };
}

test('qualified Radar card is re-used as the source opportunity of a new sale', async () => {
  const { db, counts } = syntheticRadar();
  const first = await qualifyRadarProspect(db, PROSPECT);
  assert.equal(first.kind, 'pipeline');
  assert.equal(first.leadId, LEAD);
  assert.equal(first.created, true);

  // Returning to the same Radar business cannot create another lead.
  const again = await qualifyRadarProspect(db, PROSPECT);
  assert.equal(again.kind, 'pipeline');
  assert.equal(again.leadId, LEAD);
  assert.equal(again.created, false);
  assert.deepEqual(counts, { approvals: 1, conversions: 1, links: 1 });

  const fields = {
    idempotency_key: KEY, client_mode: 'new', legal_name: 'Cliente Sintetico',
    line_0_service: 'desarrollo-web', line_0_price: '1500',
    lead_id: first.leadId,
  };
  const sale = parseSaleForm({ get: name => fields[name] ?? null });
  assert.equal(sale.lead_id, first.leadId, 'sale keeps the exact qualified lead UUID');
  assert.equal(sale.new_client.legal_name, 'Cliente Sintetico');
  assert.equal(sale.lines[0].service_code, 'desarrollo-web');
});

test('new sale screen accepts the lead link; only the explicit sale action confirms it', () => {
  const page = fs.readFileSync('src/app/admin/workspace/crm/sales/new/page.tsx', 'utf8');
  const form = fs.readFileSync('src/components/sales/sale-form.tsx', 'utf8');
  const actions = fs.readFileSync('src/app/admin/workspace/crm/sales/actions.ts', 'utf8');
  assert.match(page, /requireOwner\(\)/);
  assert.match(page, /leadId/);
  assert.match(page, /<SaleForm/);
  assert.match(form, /name="lead_id"/);
  assert.match(actions, /parseSaleForm\(form\)/);
  assert.match(actions, /supabase\.rpc\("crm_confirm_sale"/);
  assert.doesNotMatch(fs.readFileSync('src/lib/crm/radar-qualification.ts', 'utf8'), /crm_confirm_sale/);
});
