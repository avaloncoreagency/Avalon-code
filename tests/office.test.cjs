const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const load = path => {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: mod.exports, module: mod, require, Date, Math, Number, Set, Array });
  return mod.exports;
};
const stats = load("src/lib/office/stats.ts");
const managers = load("src/lib/office/managers.ts");
const NOW = Date.parse("2026-11-03T12:00:00Z");
const A = "a", B = "b";
const tasks = [
  { assignee_id: A, status: "todo", due_at: "2026-11-01T00:00:00Z", completed_at: null, created_at: "2026-11-01T00:00:00Z", project_id: "p1" },
  { assignee_id: A, status: "in_progress", due_at: "2026-11-09T00:00:00Z", completed_at: null, created_at: "2026-09-01T00:00:00Z", project_id: "p1" },
  { assignee_id: A, status: "done", due_at: null, completed_at: "2026-11-03T08:00:00Z", created_at: "2026-10-30T00:00:00Z", project_id: "p2" },
  { assignee_id: A, status: "done", due_at: null, completed_at: "2026-08-01T00:00:00Z", created_at: "2026-07-30T00:00:00Z", project_id: null },
  { assignee_id: B, status: "cancelled", due_at: "2026-10-01T00:00:00Z", completed_at: null, created_at: "2026-10-01T00:00:00Z", project_id: null },
];
test("office stats: counts from stored tasks with documented definitions", () => {
  assert.deepEqual({ ...stats.memberStats(tasks, A, "7", NOW) }, { assigned: 2, open: 2, overdue: 1, done: 1, projects: 2 });
  assert.deepEqual({ ...stats.memberStats(tasks, A, "all", NOW) }, { assigned: 4, open: 2, overdue: 1, done: 2, projects: 2 });
  assert.deepEqual({ ...stats.memberStats(tasks, B, "30", NOW) }, { assigned: 0, open: 0, overdue: 0, done: 0, projects: 0 }, "cancelled is not open nor overdue");
  assert.deepEqual({ ...stats.memberStats(tasks, "nobody", "all", NOW) }, { assigned: 0, open: 0, overdue: 0, done: 0, projects: 0 });
  assert.deepEqual({ ...stats.teamStats(tasks, "30", NOW) }, { active: 2, overdue: 1, done: 1 });
  assert.deepEqual([...stats.completedSeries(tasks, 3, NOW)], [0, 0, 1]);
});
test("office managers: five virtual managers, none claims an execution connection", () => {
  assert.deepEqual([...managers.MANAGERS.map(m => m.name)], ["REN", "SHIN", "HARU", "SORA", "KENJI"]);
  assert.equal(managers.MANAGER_INTEGRATION.status, "offline");
  assert.equal(managers.MANAGER_INTEGRATION.lastVerifiedRun, null);
  assert.equal(managers.MANAGER_INTEGRATION.tools.length, 0);
  assert.equal(managers.isManagerKey("ren"), true);
  assert.equal(managers.isManagerKey("jarvis"), false);
});
test("office: no fabricated AI replies or simulated stats in the UI/API source", () => {
  const sources = ["src/components/office/office.tsx", "src/app/admin/workspace/crm/office/api/route.ts"].map(f => fs.readFileSync(f, "utf8")).join("\n");
  assert.doesNotMatch(sources, /Math\.random|faker|lorem/i);
  assert.match(sources, /sin conexión de ejecución/i);
  const api = fs.readFileSync("src/app/admin/workspace/crm/office/api/route.ts", "utf8");
  assert.match(api, /getOwnerSession\(\)/);
  assert.doesNotMatch(api, /service_role|SERVICE_ROLE/);
});
