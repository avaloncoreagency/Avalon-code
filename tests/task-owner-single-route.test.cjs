const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const PATH = "/admin/workspace/crm/tasks";
const ID = "00000000-0000-4000-8000-0000000000a1";
const PERSON = "00000000-0000-4000-8000-0000000000b2";
const source = fs.readFileSync("src/app/admin/workspace/crm/tasks/actions.ts", "utf8");

function load({noRow = false, unauthorized = false} = {}) {
  const log = {table: null, patch: null, filters: [], revalidated: []};
  const query = {
    update(patch) { log.patch = patch; return this; },
    eq(k, v) { log.filters.push(["eq", k, v]); return this; },
    in(k, v) { log.filters.push(["in", k, Array.from(v)]); return this; },
    select() { return this; },
    async maybeSingle() { return {data: noRow ? null : {id: ID}, error: null}; },
  };
  const modules = {
    "next/cache": {revalidatePath: p => log.revalidated.push(p)},
    "@/lib/os/actions": {
      ownerForAction: async () => {
        if (unauthorized) throw Error("unauthorized");
        return {supabase: {from: table => { log.table = table; return query; }}};
      },
      field: (form, name) => typeof form.get(name) === "string" ? form.get(name) : "",
      uuidField: (form, name) => {
        const v = form.get(name);
        return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(v) ? v : null;
      },
      back: (path, params) => {
        const e = new Error("redirect"); e.path = path; e.params = params; throw e;
      },
    },
    "@/lib/sales/domain": {
      TASK_PRIORITIES: ["low", "normal", "high", "urgent"],
      TASK_STATUSES: ["todo", "in_progress", "blocked", "done", "cancelled"],
      saleErrorCode: () => "sale_invalid",
    },
  };
  const compiled = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  });
  const sandbox = {exports: {}, require: name => {
    if (!Object.hasOwn(modules, name)) throw Error("Unexpected import " + name);
    return modules[name];
  }};
  vm.runInNewContext(compiled.outputText, sandbox);
  return {actions: sandbox.exports, log};
}

function form(extra = {}) {
  const f = new FormData();
  const fields = {task_id: ID, version: "3", view: "mine", page: "0",
    title: "Preparar propuesta", description: "Revisar detalles",
    assignee_id: PERSON, priority: "high", due_at_iso: "2026-11-15T14:30:00.000Z", ...extra};
  Object.entries(fields).forEach(([key, value]) => f.set(key, value));
  return f;
}
async function redirected(action, expected) {
  await assert.rejects(action, e => e.message === "redirect" && e.path === PATH &&
    Object.entries(expected).every(([k, v]) => e.params[k] === v));
}

test("owner-only task details are validated and updated at exact version", async () => {
  const {actions, log} = load();
  await redirected(actions.saveTaskDetails(form()), {task: ID, ok: "saved", view: "mine"});
  assert.equal(log.table, "crm_tasks");
  assert.deepEqual(Object.keys(log.patch).sort(), ["assignee_id", "description", "due_at", "priority", "title"]);
  assert.equal(log.patch.due_at, "2026-11-15T14:30:00.000Z");
  assert.deepEqual(JSON.parse(JSON.stringify(log.filters)), [["eq", "id", ID], ["eq", "version", 3]]);
  assert.ok(log.revalidated.includes(PATH));
  assert.ok(log.revalidated.includes("/admin/workspace/crm/notifications"));
});

test("invalid timestamps and stale writes fail without DB modification or secrets", async () => {
  for (const due_at_iso of ["2026-02-30T00:00:00.000Z", "2026-11-15 00:00:00", "not-a-date"]) {
    const {actions, log} = load();
    await redirected(actions.saveTaskDetails(form({due_at_iso})), {error: "sale_invalid_date"});
    assert.equal(log.patch, null);
  }
  const {actions, log} = load({noRow: true});
  await redirected(actions.saveTaskDetails(form()), {error: "conflict"});
  assert.ok(log.filters.some(f => f[1] === "version"));
});

test("complete, archive and reopen use allowlisted status transitions with optimistic concurrency", async () => {
  for (const [operation, status, from] of [
    ["complete", "done", ["todo", "in_progress", "blocked"]],
    ["archive", "cancelled", ["todo", "in_progress", "blocked"]],
    ["reopen", "todo", ["done", "cancelled"]],
  ]) {
    const {actions, log} = load();
    await redirected(actions.transitionTask(form({operation})), {ok: "saved", view: "mine"});
    assert.equal(log.patch.status, status);
    assert.deepEqual(JSON.parse(JSON.stringify(log.filters)), [
      ["eq", "id", ID], ["eq", "version", 3], ["in", "status", from],
    ]);
  }
  const {actions, log} = load();
  await redirected(actions.transitionTask(form({operation: "delete_forever"})), {error: "sale_invalid"});
  assert.equal(log.patch, null);
});

test("unauthorized users cannot edit, complete or assign tasks", async () => {
  const {actions, log} = load({unauthorized: true});
  await assert.rejects(actions.saveTaskDetails(form()), /unauthorized/);
  await assert.rejects(actions.transitionTask(form({operation: "complete"})), /unauthorized/);
  assert.equal(log.patch, null);
});

test("canonical task route keeps history, local-time editor and single-click completion", () => {
  const page = fs.readFileSync("src/app/admin/workspace/crm/tasks/page.tsx", "utf8");
  const editor = fs.readFileSync("src/components/sales/task-edit-form.tsx", "utf8");
  assert.match(page, /view === "done"/);
  assert.match(page, /<TaskEditForm/);
  assert.match(page, /<form action=\{transitionTask\}/);
  assert.match(page, /value="complete"/);
  assert.match(page, /value="reopen"/);
  assert.match(editor, /due_at_iso/);
  assert.match(editor, /new Date\(dueLocal\)/);
  assert.doesNotMatch(page, /tasks\/manage/);
  assert.doesNotMatch(source, /\.delete\(/);
});
