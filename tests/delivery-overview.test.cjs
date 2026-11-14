const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/lib/crm/delivery-overview.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', code)(require, loaded, loaded.exports);
const { summarizeDelivery } = loaded.exports;

test('delivery summary preserves existing statuses and only counts open overdue orders', () => {
  const orders = [
    { id: 'one', status: 'open', due_on: '2026-11-02' },
    { id: 'two', status: 'blocked', due_on: '2026-11-03' },
    { id: 'three', status: 'in_progress', due_on: '2026-11-04' },
    { id: 'four', status: 'delivered', due_on: '2026-10-01' },
    { id: 'five', status: 'cancelled', due_on: '2026-10-01' },
  ];
  const result = summarizeDelivery(orders, [], '2026-11-03');
  assert.deepEqual([result.active, result.blocked, result.overdue, result.delivered, result.cancelled], [3, 1, 1, 1, 1]);
  assert.deepEqual(result.overdueIds, ['one']);
});

test('task progress excludes cancelled tasks, unrelated orders and preserves zero as no work', () => {
  const result = summarizeDelivery(
    [{ id: 'one', status: 'open', due_on: null }, { id: 'two', status: 'open', due_on: null }],
    [{ work_order_id: 'one', status: 'done' }, { work_order_id: 'one', status: 'todo' },
      { work_order_id: 'one', status: 'cancelled' }, { work_order_id: 'missing', status: 'done' },
      { work_order_id: null, status: 'done' }],
    '2026-11-03',
  );
  assert.deepEqual(result.progress.one, { done: 1, total: 2 });
  assert.deepEqual(result.progress.two, { done: 0, total: 0 });
});

test('the delivery view is owner-only, read-only and links to canonical sales/tasks', () => {
  const page = fs.readFileSync('src/app/admin/workspace/crm/deliveries/page.tsx', 'utf8');
  assert.match(page, /requireOwner\(\)/);
  assert.match(page, /crm_work_orders/);
  assert.match(page, /crm_tasks/);
  assert.match(page, /crm_sales/);
  assert.match(page, /\/admin\/workspace\/crm\/sales\//);
  assert.match(page, /\/admin\/workspace\/crm\/tasks\?/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|service_role|NEXT_PUBLIC_.*SECRET/);
});
