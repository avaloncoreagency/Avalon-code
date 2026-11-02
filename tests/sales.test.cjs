const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', source)(require, loaded, loaded.exports);
  return loaded.exports;
}
const d = load('src/lib/sales/domain.ts');
const KEY = '11111111-1111-4111-8111-111111111111';
const form = values => ({ get: name => (name in values ? values[name] : null) });
const base = { idempotency_key: KEY, client_mode: 'new', legal_name: '  Nova Restaurant ', line_0_service: 'desarrollo-web', line_0_price: '2000' };
const code = fn => { try { fn(); return 'ok'; } catch (e) { return e.code ?? e.message; } };

test('Nova Restaurant form builds a minimal RPC payload with three lines', () => {
  const r = d.parseSaleForm(form({ ...base, website: 'https://nova.example.invalid', contact_0_name: 'Ana', contact_0_email: 'ANA@Nova.example.invalid',
    line_1_service: 'recepcionista-ia', line_1_price: '1500', line_2_service: 'marketing-mensual', line_2_price: '700', upfront_amount: '1750', currency: 'usd' }));
  assert.equal(r.idempotency_key, KEY);
  assert.equal(r.new_client.legal_name, 'Nova Restaurant');
  assert.equal(r.client_id, undefined);
  assert.deepEqual(r.lines.map(l => [l.service_code, l.unit_price]), [['desarrollo-web', '2000'], ['recepcionista-ia', '1500'], ['marketing-mensual', '700']]);
  assert.deepEqual(r.contacts, [{ full_name: 'Ana', email: 'ana@nova.example.invalid' }]);
  assert.equal(r.currency, 'USD');
  assert.equal(r.contract_status, 'pending_signature');
  assert.ok(!('trade_name' in r.new_client), 'empty fields are omitted');
});

test('existing client mode sends only the client id', () => {
  const r = d.parseSaleForm(form({ ...base, client_mode: 'existing', client_id: '22222222-2222-4222-8222-222222222222', legal_name: 'ignored' }));
  assert.equal(r.client_id, '22222222-2222-4222-8222-222222222222');
  assert.equal(r.new_client, undefined);
});

test('invalid inputs map to explicit error codes', () => {
  const cases = [
    [{ idempotency_key: 'x' }, 'sale_invalid_key'],
    [{ client_mode: 'maybe' }, 'sale_client_required'],
    [{ legal_name: '' }, 'sale_client_required'],
    [{ client_mode: 'existing', client_id: 'nope' }, 'sale_client_missing'],
    [{ line_0_service: '', line_0_price: '' }, 'sale_invalid_lines'],
    [{ line_0_price: '1e3' }, 'sale_invalid_amount'],
    [{ line_0_price: '-5' }, 'sale_invalid_amount'],
    [{ line_0_price: '10.555' }, 'sale_invalid_amount'],
    [{ line_0_qty: '0' }, 'sale_invalid_amount'],
    [{ line_0_service: 'DROP TABLE' }, 'sale_invalid_service'],
    [{ line_1_price: '100' }, 'sale_invalid_service'],
    [{ line_0_start: '2026-02-30' }, 'sale_invalid_date'],
    [{ website: 'http://insecure.example' }, 'sale_invalid_website'],
    [{ website: 'javascript:alert(1)' }, 'sale_invalid_website'],
    [{ contact_0_email: 'a@b.co' }, 'sale_contact_name'],
    [{ contact_0_name: 'Ana', contact_0_email: 'not-an-email' }, 'sale_invalid_email'],
    [{ tax_rate: '101' }, 'sale_invalid_amount'],
    [{ currency: 'US' }, 'sale_invalid_currency'],
    [{ seller_id: 'admin' }, 'sale_invalid_member'],
    [{ legal_name: 'x'.repeat(201) }, 'sale_too_long'],
    [{ billing_mode: 'barter' }, 'sale_invalid'],
  ];
  for (const [patch, expected] of cases) assert.equal(code(() => d.parseSaleForm(form({ ...base, ...patch }))), expected, JSON.stringify(patch));
});

test('preview totals use integer cents and separate recurring revenue', () => {
  const t = d.previewTotals([{ unit_price: '2000' }, { unit_price: '1500' }, { unit_price: '700', billing: 'monthly' }]);
  assert.deepEqual(t, { subtotal: 4200, tax: 0, total: 4200, recurring: 700 });
  assert.deepEqual(d.previewTotals([{ unit_price: '0.10', quantity: '3' }], '0', '7'), { subtotal: 0.3, tax: 0.02, total: 0.32, recurring: 0 });
  assert.equal(d.previewTotals([{ unit_price: '100', discount: '10' }], '20', '10').total, 77);
});

test('database errors become known codes and never echo raw text', () => {
  assert.equal(d.saleErrorCode({ code: '23505', message: 'sale_client_exists' }), 'sale_client_exists');
  assert.equal(d.saleErrorCode({ code: 'P0001', message: 'payment_exceeds_total' }), 'payment_exceeds_total');
  assert.equal(d.saleErrorCode({ code: 'PGRST202', message: 'Could not find the function' }), 'schema_pending');
  assert.equal(d.saleErrorCode({ code: '42501', message: 'permission denied for table crm_sales' }), 'crm_forbidden');
  assert.equal(d.saleErrorCode({ code: 'XX000', message: 'internal secret path /etc' }), 'unavailable');
  assert.equal(d.saleErrorText('es', 'not_a_code'), d.SALE_ERRORS.unavailable[0]);
  assert.equal(d.readConfirmResult({ sale_id: 'x' }), null);
  assert.deepEqual(d.readConfirmResult({ sale_id: KEY, client_id: KEY, sale_number: 'AV-2026-00001', replayed: true, work_orders: 3, projects: 3, tasks: 15 }),
    { sale_id: KEY, client_id: KEY, sale_number: 'AV-2026-00001', replayed: true, work_orders: 3, projects: 3, tasks: 15 });
});

test('sales UI keeps the approved CRM order and server-side guarantees', () => {
  const domain = fs.readFileSync('src/lib/crm/domain.ts', 'utf8');
  const nav = domain.slice(domain.indexOf('export const crmNavigation'), domain.indexOf('] as const;', domain.indexOf('export const crmNavigation')));
  const order = ['Lead Hunter', 'Leads Pipeline', 'Ventas', 'Calendario', 'Tareas'].map(x => nav.indexOf(`label: "${x}"`));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), 'Lead Hunter → Leads Pipeline → Ventas → Calendario → Tareas');
  const newSale = fs.readFileSync('src/app/admin/workspace/crm/sales/new/page.tsx', 'utf8');
  assert.match(newSale, /randomUUID\(\)/, 'idempotency key issued server-side per form render');
  assert.match(newSale, /requireOwner\(\)/);
  const actions = fs.readFileSync('src/app/admin/workspace/crm/sales/actions.ts', 'utf8');
  assert.doesNotMatch(actions, /crm_sales"\)\.insert|crm_work_orders"\)\.insert|os_projects"\)\.insert/, 'sales are created only by the atomic RPC');
  const sql = fs.readFileSync('supabase/migrations/20261102170000_avalon_sales_core.sql', 'utf8');
  assert.doesNotMatch(sql, /execute\s+format\([^)]*%s/i, 'no dynamic SQL with unquoted identifiers');
  for (const fn of ['crm_confirm_sale', 'crm_record_sale_failure', 'crm_refresh_alerts', 'crm_owner_directory']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`), `${fn} revoked from anon`);
  }
  assert.equal((sql.match(/security definer/g) || []).length, (sql.match(/security definer set search_path = ''/g) || []).length, 'every definer pins search_path');
});
