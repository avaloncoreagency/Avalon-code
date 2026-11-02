const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const filename = path.resolve('src/lib/crm/task-links.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = new Module(filename, module);
mod.filename = filename;
mod._compile(compiled, filename);
const { taskLink } = mod.exports;
const client = '11111111-1111-4111-8111-111111111111';
const workOrder = '22222222-2222-4222-8222-222222222222';
const task = '33333333-3333-4333-8333-333333333333';
const context = { view: 'assigned', page: 3, client, workOrder };

function params(href) {
  const url = new URL(href, 'https://test.example');
  assert.equal(url.pathname, '/admin/workspace/crm/tasks');
  return url.searchParams;
}

test('opening a task retains all active filters and page', () => {
  const p = params(taskLink({ ...context, task }));
  assert.equal(p.get('view'), 'assigned');
  assert.equal(p.get('page'), '3');
  assert.equal(p.get('client'), client);
  assert.equal(p.get('work_order'), workOrder);
  assert.equal(p.get('task'), task);
});

test('closing detail returns to the same filtered page', () => {
  const p = params(taskLink(context));
  assert.equal(p.get('view'), 'assigned');
  assert.equal(p.get('page'), '3');
  assert.equal(p.get('client'), client);
  assert.equal(p.get('work_order'), workOrder);
  assert.equal(p.has('task'), false);
});

test('pagination retains filters without adding a task ID', () => {
  const p = params(taskLink({ ...context, page: 4 }));
  assert.equal(p.get('page'), '4');
  assert.equal(p.get('client'), client);
  assert.equal(p.get('work_order'), workOrder);
  assert.equal(p.has('task'), false);
});

test('defaults do not leak empty parameters or a zero page', () => {
  const p = params(taskLink({ view: 'mine', page: 0 }));
  assert.equal(p.toString(), 'view=mine');
});

test('Tasks page uses the filtered link for open, close and paging', () => {
  const page = fs.readFileSync('src/app/admin/workspace/crm/tasks/page.tsx', 'utf8');
  assert.match(page, /href=\{taskHref\(t\.id\)\}/);
  assert.match(page, /href=\{taskHref\(\)\}/);
  assert.match(page, /href=\{taskHref\(undefined, page - 1\)\}/);
  assert.match(page, /href=\{taskHref\(undefined, page \+ 1\)\}/);
});
