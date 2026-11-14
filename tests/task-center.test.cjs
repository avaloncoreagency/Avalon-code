const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const PATH = "/admin/workspace/crm/tasks/manage";
const SOURCE = fs.readFileSync("src/app/admin/workspace/crm/tasks/manage/actions.ts", "utf8");
const ID = "00000000-0000-4000-8000-0000000000a1";
const PERSON = "00000000-0000-4000-8000-0000000000b2";

function load({ noRow = false, unauthorized = false } = {}) {
  const log = { table: null, patch: null, filters: [], revalidated: [] };
  const query = {
    update(patch) { log.patch = patch; return this; },
    eq(column, value) { log.filters.push(["eq", column, value]); return this; },
    in(column, values) { log.filters.push(["in", column, Array.from(values)]); return this; },
    select() { return this; },
    async maybeSingle() { return { data: noRow ? null : { id: ID }, error: null }; },
  };
  const supabase = { from(table) { log.table = table; return query; } };
  const modules = {
    "next/cache": { revalidatePath: path => log.revalidated.push(path) },
    "@/lib/os/actions": {
      ownerForAction: async () => {
        if (unauthorized) throw new Error("unauthorized");
        return { supabase };
      },
      field: (form, name) => typeof form.get(name) === "string" ? form.get(name) : "",
      uuidField: (form, name) => {
        const value = form.get(name);
        return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(value) ? value : null;
      },
      back: (path, params) => {
        const redirect = new Error("redirect");
        redirect.path = path;
        redirect.params = params;
        throw redirect;
      },
    },
    "@/lib/sales/domain": { TASK_PRIORITIES: ["low", "normal", "high", "urgent"], saleErrorCode: () => "sale_invalid" },
  };
  const output = ts.transpileModule(SOURCE, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { exports: {}, require: name => {
    if (!(name in modules)) throw new Error("Unexpected import " + name);
    return modules[name];
  }};
  vm.runInNewContext(output, sandbox);
  return { actions: sandbox.exports, log };
}
function taskForm(extra = {}) {
  const form = new FormData();
  const fields = { task_id: ID, version: "3", view: "mine",
    title: "Preparar propuesta", description: "Revisar los puntos",
    assignee_id: PERSON, priority: "high", due_at_iso: "2026-11-05T14:30:00.000Z", ...extra };
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}
async function redirect(action, expected) {
  await assert.rejects(action, e => e.message === "redirect" && e.path === PATH &&
    Object.entries(expected).every(([name, value]) => e.params[name] === value));
}

test("task editing validates and sends only owner-authorized, versioned editable fields", async () => {
  const { actions, log } = load();
  await redirect(actions.saveTask(taskForm()), { view: "mine", task: ID, ok: "saved" });
  assert.equal(log.table, "crm_tasks");
  assert.equal(log.patch.title, "Preparar propuesta");
  assert.equal(log.patch.assignee_id, PERSON);
  assert.equal(log.patch.due_at, "2026-11-05T14:30:00.000Z");
  assert.deepEqual(Object.keys(log.patch).sort(), ["assignee_id", "description", "due_at", "priority", "title"]);
  assert.deepEqual(JSON.parse(JSON.stringify(log.filters)), [["eq", "id", ID], ["eq", "version", 3]]);
  assert.ok(log.revalidated.includes("/admin/workspace/crm/tasks"));
  assert.ok(log.revalidated.includes("/admin/workspace/crm/notifications"));
});

test("invalid date, missing identity and stale versions fail without bypassing concurrency", async () => {
  for (const input of [{ due_at_iso: "2026-02-30T00:00:00.000Z" }, { version: "0" }, { task_id: "broken" }]) {
    const { actions, log } = load();
    await redirect(actions.saveTask(taskForm(input)), { error: "sale_invalid" });
    assert.equal(log.patch, null, "invalid edits must not call update");
  }
  const { actions, log } = load({ noRow: true });
  await redirect(actions.saveTask(taskForm()), { error: "conflict" });
  assert.ok(log.filters.some(x => x[1] === "version" && x[2] === 3));
});

test("complete, reversible archive and reopen restrict old task states", async () => {
  const cases = [
    ["complete", "done", ["todo", "in_progress", "blocked"]],
    ["archive", "cancelled", ["todo", "in_progress", "blocked"]],
    ["reopen", "todo", ["done", "cancelled"]],
  ];
  for (const [operation, status, from] of cases) {
    const { actions, log } = load();
    await redirect(actions.transitionTask(taskForm({ operation, view: "done" })), { view: "done", ok: "saved" });
    assert.equal(log.patch.status, status);
    assert.deepEqual(JSON.parse(JSON.stringify(log.filters)), [
      ["eq", "id", ID], ["eq", "version", 3], ["in", "status", from],
    ]);
    assert.equal(log.revalidated.length, 3);
  }
  const { actions, log } = load();
  await redirect(actions.transitionTask(taskForm({ operation: "delete_forever" })), { error: "sale_invalid" });
  assert.equal(log.patch, null, "permanent deletion must not be available");
});

test("unapproved sessions cannot write or mark tasks complete", async () => {
  const { actions, log } = load({ unauthorized: true });
  await assert.rejects(actions.saveTask(taskForm()), /unauthorized/);
  await assert.rejects(actions.transitionTask(taskForm({ operation: "complete" })), /unauthorized/);
  assert.equal(log.patch, null);
});

test("completed history is separate from cancelled work and is paginated", () => {
  const page = fs.readFileSync("src/app/admin/workspace/crm/tasks/manage/page.tsx", "utf8");
  assert.match(page, /if \(view === "done"\) query = query\.eq\("status", "done"\)/);
  assert.match(page, /if \(view === "archived"\) query = query\.eq\("status", "cancelled"\)/);
  assert.match(page, /const PAGE_SIZE = 50/);
  assert.match(page, /\.range\(page \* PAGE_SIZE, page \* PAGE_SIZE \+ PAGE_SIZE - 1\)/);
  assert.match(page, /completed_at/);
  assert.match(page, /<TaskEditForm/);
  assert.match(page, /transition\(task, "complete"/);
});

test("reciprocal notifications come from existing DB task trigger, personal unread API remains owner-only", () => {
  const sql = fs.readFileSync("supabase/migrations/20261102170000_avalon_sales_core.sql", "utf8");
  const trigger = sql.slice(sql.indexOf("create function crm_private.task_events()"), sql.indexOf("create function crm_private.work_order_events()"));
  assert.match(trigger, /new\.assignee_id is distinct from actor/);
  assert.match(trigger, /crm_private\.notify\(new\.assignee_id/);
  assert.match(trigger, /'task-assigned:' \|\| new\.id/);
  const route = fs.readFileSync("src/app/admin/workspace/crm/notifications/unread/route.ts", "utf8");
  assert.match(route, /getOwnerSession\(\)/);
  assert.match(route, /if \(!session\) return reply\(\{ error: "No autorizado" \}, 403\)/);
  assert.match(route, /\.eq\("recipient_id", session\.userId\)/);
  assert.match(route, /\.eq\("category", "task"\)/);
  assert.match(route, /\.is\("read_at", null\)/);
  const badge = fs.readFileSync("src/components/sales/task-notification-indicator.tsx", "utf8");
  assert.match(badge, /30_000/);
  assert.match(badge, /visibilityState === "visible"/);
});
