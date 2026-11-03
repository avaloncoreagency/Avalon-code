// KENJI #98: synthetic negative authorization tests for the real task server actions.
// Separate from tests/sales.browser.cjs: no hosted session or production request.
// The negative checks fail if actions ever accept a non-owner before touching data.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const ACTIONS = "src/app/admin/workspace/crm/tasks/actions.ts";
const SOURCE = fs.readFileSync(ACTIONS, "utf8");
const TASK = "00000000-0000-4000-8000-000000000011";
const ASSIGNEE = "00000000-0000-4000-8000-000000000022";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadTaskActions({ authorized }) {
  const effects = { auth: 0, writes: 0, redirects: 0, revalidated: 0, inserted: null };
  const supabase = {
    from(table) {
      assert.equal(table, "crm_tasks");
      return {
        insert(record) {
          effects.writes += 1;
          effects.inserted = record;
          return { select() { return { single: async () => ({ data: { id: TASK }, error: null }) }; } };
        },
      };
    },
  };
  const mocks = {
    "next/cache": { revalidatePath: () => { effects.revalidated += 1; } },
    "@/lib/os/actions": {
      async ownerForAction() {
        effects.auth += 1;
        if (!authorized) throw new Error("OWNER_REQUIRED");
        return { supabase };
      },
      back() { effects.redirects += 1; throw new Error("NEXT_REDIRECT"); },
      field: (form, name) => String(form.get(name) ?? ""),
      uuidField: (form, name) => {
        const value = String(form.get(name) ?? "");
        return UUID.test(value) ? value : null;
      },
    },
    "@/lib/sales/domain": {
      TASK_PRIORITIES: ["low", "normal", "high", "urgent"],
      TASK_STATUSES: ["todo", "in_progress", "blocked", "done", "cancelled"],
      saleErrorCode: () => "sale_error",
    },
  };
  const code = ts.transpileModule(SOURCE, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: ACTIONS,
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports,
    require: name => {
      assert.ok(Object.hasOwn(mocks, name), "Unexpected dependency: " + name);
      return mocks[name];
    },
  }, { filename: ACTIONS });
  return { actions: loadedModule.exports, effects };
}

function formFor(operation) {
  const form = new FormData();
  form.set("title", "Tarea sintética");
  form.set("description", "No enviar a clientes");
  form.set("assignee_id", ASSIGNEE);
  form.set("priority", "normal");
  form.set("task_id", TASK);
  form.set("version", "1");
  form.set("status", "done");
  form.set("body", "Comentario sintético");
  form.set("view", "mine");
  form.set("page", "0");
  form.set("operation", operation);
  return form;
}

test("KENJI: non-owner cannot create, complete/reassign or comment on CRM tasks", async () => {
  const { actions, effects } = loadTaskActions({ authorized: false });
  for (const action of ["createTask", "updateTask", "commentTask"]) {
    assert.equal(typeof actions[action], "function", action + " must be executable");
    await assert.rejects(actions[action](formFor(action)), /OWNER_REQUIRED/, action);
  }
  assert.equal(effects.auth, 3, "Every task mutation must authorize on the server");
  assert.equal(effects.writes, 0, "No unauthenticated task mutation");
  assert.equal(effects.revalidated, 0, "No invalidation on denied requests");
  assert.equal(effects.redirects, 0, "No success redirect on denied requests");
});

test("KENJI control: verified synthetic owner can assign a task via the same action", async () => {
  const { actions, effects } = loadTaskActions({ authorized: true });
  await assert.rejects(actions.createTask(formFor("create")), /NEXT_REDIRECT/);
  assert.equal(effects.auth, 1);
  assert.equal(effects.writes, 1);
  assert.equal(effects.inserted.assignee_id, ASSIGNEE);
  assert.equal(effects.inserted.title, "Tarea sintética");
  assert.equal(effects.revalidated, 1);
  assert.equal(effects.redirects, 1);
});
