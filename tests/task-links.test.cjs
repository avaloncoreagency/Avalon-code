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


test('task forms include the list context and view tabs retain active filters', () => {
  const page = fs.readFileSync('src/app/admin/workspace/crm/tasks/page.tsx', 'utf8');
  assert.equal((page.match(/\{taskContextFields\}/g) || []).length, 3, 'status, comment and create forms');
  for (const name of ['view', 'page', 'client', 'work_order']) {
    assert.match(page, new RegExp('name="' + name + '"'));
  }
  assert.match(page, /href=\{taskHref\(undefined, 0, k\)\}/, 'changing task view keeps client and work order');
});

function syntheticActions({ conflict = false, order = { id: workOrder, client_id: client, sale_id: '44444444-4444-4444-8444-444444444444', project_id: '55555555-5555-4555-8555-555555555555', department_id: 'sales' }, orderError = null } = {}) {
  const actionsPath = path.resolve('src/app/admin/workspace/crm/tasks/actions.ts');
  const actionsJs = ts.transpileModule(fs.readFileSync(actionsPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const row = { data: conflict ? null : { id: task }, error: null };
  const chain = {
    eq() { return this; },
    select() { return this; },
    maybeSingle: async () => row,
    single: async () => row,
    error: null,
  };
  const inserted = [];
  const supabase = { from: table => {
    if (table === 'crm_work_orders') return {
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => ({ data: order, error: orderError }),
    };
    assert.equal(table, 'crm_tasks', 'synthetic tests only access tasks and work orders');
    return {
      insert(payload) { inserted.push(payload); return chain; },
      update: () => chain,
    };
  } };
  const readField = (form, name) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };
  const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const mocks = {
    'next/cache': { revalidatePath: () => {} },
    '@/lib/os/actions': {
      ownerForAction: async () => ({ supabase }),
      back: (destination, params) => {
        const error = new Error('redirect');
        error.destination = destination;
        error.params = params;
        throw error;
      },
      field: readField,
      uuidField: (form, name) => {
        const value = readField(form, name);
        return isUuid(value) ? value : null;
      },
    },
    '@/lib/sales/domain': {
      TASK_PRIORITIES: ['normal', 'high'],
      TASK_STATUSES: ['todo', 'done', 'blocked'],
      saleErrorCode: () => 'sale_error',
    },
  };
  const actionsModule = new Module(actionsPath, module);
  actionsModule.filename = actionsPath;
  actionsModule.require = id => {
    assert.ok(Object.hasOwn(mocks, id), 'unexpected server action import: ' + id);
    return mocks[id];
  };
  actionsModule._compile(actionsJs, actionsPath);
  return { ...actionsModule.exports, inserted };
}

function formWithContext() {
  const form = new FormData();
  form.set('view', 'assigned');
  form.set('page', '3');
  form.set('client', client);
  form.set('work_order', workOrder);
  form.set('task_id', task);
  form.set('version', '1');
  form.set('status', 'todo');
  form.set('assignee_id', client);
  form.set('return', 'detail');
  form.set('body', 'Synthetic progress note');
  form.set('title', 'Synthetic follow-up');
  form.set('priority', 'normal');
  return form;
}

function assertContext(error, overrides = {}) {
  assert.equal(error.message, 'redirect');
  assert.equal(error.destination, '/admin/workspace/crm/tasks');
  assert.deepEqual(
    { view: error.params.view, page: error.params.page, client: error.params.client, work_order: error.params.work_order },
    { view: 'assigned', page: '3', client, work_order: workOrder },
  );
  for (const [key, value] of Object.entries(overrides)) assert.equal(error.params[key], value);
  return true;
}

test('saving a task preserves filtered page and selected detail', async () => {
  const { updateTask } = syntheticActions();
  await assert.rejects(updateTask(formWithContext()), e => assertContext(e, { task, ok: 'saved' }));
});

test('version conflict preserves filters and shows an honest conflict', async () => {
  const { updateTask } = syntheticActions({ conflict: true });
  await assert.rejects(updateTask(formWithContext()), e => assertContext(e, { task, error: 'conflict' }));
});

test('commenting on a task returns to its selected detail with filters intact', async () => {
  const { commentTask } = syntheticActions();
  await assert.rejects(commentTask(formWithContext()), e => assertContext(e, { task, ok: 'saved' }));
});

test('creating a task keeps the filtered page and opens the new task detail', async () => {
  const { createTask } = syntheticActions();
  await assert.rejects(createTask(formWithContext()), e => assertContext(e, { task, ok: 'created' }));
});

test('server action rejects untrusted view, page and UUID filters', async () => {
  const form = formWithContext();
  form.set('view', '//external.example');
  form.set('page', '300000');
  form.set('client', 'not-a-uuid');
  form.set('work_order', '../other');
  const { updateTask } = syntheticActions();
  await assert.rejects(updateTask(form), error => {
    assert.equal(error.params.ok, 'saved');
    assert.equal(error.params.task, task);
    for (const name of ['view', 'page', 'client', 'work_order']) {
      assert.equal(Object.hasOwn(error.params, name), false, name + ' must be omitted');
    }
    return true;
  });
});

test('server action normalizes a leading-zero page and rejects oversized pages', async () => {
  const form = formWithContext();
  form.set('page', '0003');
  const { updateTask } = syntheticActions();
  await assert.rejects(updateTask(form), error => assertContext(error, { ok: 'saved' }));
});


test('invalid comment body keeps the selected task and filtered page visible', async () => {
  const form = formWithContext();
  form.set('body', '   ');
  const { commentTask } = syntheticActions();
  await assert.rejects(commentTask(form), e => assertContext(e, { task, error: 'sale_invalid' }));
});

test('invalid update values keep selected task and filtered page visible', async () => {
  const form = formWithContext();
  form.set('status', 'not-a-task-status');
  const { updateTask } = syntheticActions();
  await assert.rejects(updateTask(form), e => assertContext(e, { task, error: 'sale_invalid' }));
});


test('creating a manual task in a work order inherits its canonical sale, client, project and department', async () => {
  const form = formWithContext();
  form.set('sale_id', '66666666-6666-4666-8666-666666666666'); // Untrusted POST value
  form.set('project_id', '77777777-7777-4777-8777-777777777777');
  form.set('department_id', 'marketing');
  const { createTask, inserted } = syntheticActions();
  await assert.rejects(createTask(form), e => assertContext(e, { task, ok: 'created' }));
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].work_order_id, workOrder);
  assert.equal(inserted[0].client_id, client);
  assert.equal(inserted[0].sale_id, '44444444-4444-4444-8444-444444444444');
  assert.equal(inserted[0].project_id, '55555555-5555-4555-8555-555555555555');
  assert.equal(inserted[0].department_id, 'sales');
});

test('rejects a forged conflicting client instead of breaking the task-to-order relationship', async () => {
  const form = formWithContext();
  form.set('client_id', '88888888-8888-4888-8888-888888888888');
  const { createTask, inserted } = syntheticActions();
  await assert.rejects(createTask(form), e => assertContext(e, { error: 'sale_invalid' }));
  assert.equal(inserted.length, 0);
});

test('cannot create a work-order task when the order does not exist', async () => {
  const { createTask, inserted } = syntheticActions({ order: null });
  await assert.rejects(createTask(formWithContext()), e => assertContext(e, { error: 'sale_invalid' }));
  assert.equal(inserted.length, 0);
});

test('order read errors do not silently create an unlinked task', async () => {
  const { createTask, inserted } = syntheticActions({ orderError: { code: '42501' } });
  await assert.rejects(createTask(formWithContext()), e => assertContext(e, { error: 'sale_error' }));
  assert.equal(inserted.length, 0);
});

test('malformed work-order filter cannot create an unlinked task', async () => {
  const form = formWithContext();
  form.set('work_order', 'not-a-uuid');
  const { createTask, inserted } = syntheticActions();
  await assert.rejects(createTask(form), error => {
    assert.equal(error.params.error, 'sale_invalid');
    assert.equal(Object.hasOwn(error.params, 'work_order'), false);
    return true;
  });
  assert.equal(inserted.length, 0);
});

test('ordinary manual tasks are still supported without a work-order context', async () => {
  const form = formWithContext();
  form.delete('work_order');
  form.set('client_id', client);
  const { createTask, inserted } = syntheticActions();
  await assert.rejects(createTask(form), e => {
    assert.equal(e.params.ok, 'created');
    assert.equal(e.params.task, task);
    assert.equal(Object.hasOwn(e.params, 'work_order'), false);
    return true;
  });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].client_id, client);
  assert.equal(inserted[0].department_id, null);
  for (const key of ['work_order_id', 'sale_id', 'project_id']) assert.equal(Object.hasOwn(inserted[0], key), false);
});

test('work-order details are fetched under owner RLS and used in the task form', () => {
  const page = fs.readFileSync('src/app/admin/workspace/crm/tasks/page.tsx', 'utf8');
  assert.match(page, /from\("crm_work_orders"\)/);
  assert.match(page, /const activeOrder = orderContext\?\.data \?\? null/);
  assert.match(page, /defaultValue=\{activeOrder\?\.client_id/);
  assert.match(page, /defaultValue=\{activeOrder\?\.department_id/);
  assert.match(page, /disabled=\{Boolean\(workOrder && !activeOrder\) \|\| mismatchedClient\}/);
});
