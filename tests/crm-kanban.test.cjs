const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/crm/kanban.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports, require, Map, Set, Date, Number });
const { groupPipeline, followUpState, pipelineFocusCounts, filterPipelineByFocus } = mod.exports;
const stages = [
  { id: "new", label: "Nuevo", kind: "open" },
  { id: "qualified", label: "Calificado", kind: "open" },
  { id: "lost", label: "Perdido", kind: "lost" },
];
test("columns preserve the actual CRM stage order and keep distinct leads", () => {
  const rows = [
    { id: "a", stage_id: "qualified", value: 250 },
    { id: "b", stage_id: "new", value: 100 },
    { id: "c", stage_id: "qualified", value: 0 },
  ];
  const columns = groupPipeline(stages, rows);
  assert.deepEqual(Array.from(columns, c => c.stage.id), ["new", "qualified", "lost"]);
  assert.deepEqual(Array.from(columns, c => c.leads.length), [1, 2, 0]);
  assert.deepEqual(Array.from(columns, c => c.estimatedValue), [100, 250, 0]);
  assert.equal(rows.length, 3, "board calculations are read-only");
});
test("unknown stage and invalid monetary values do not corrupt column totals", () => {
  const columns = groupPipeline(stages, [
    { id: "a", stage_id: "new", value: "Infinity" },
    { id: "b", stage_id: "new", value: -200 },
    { id: "c", stage_id: "missing", value: 100 },
  ]);
  assert.equal(columns[0].estimatedValue, 0);
  assert.equal(columns.reduce((sum, c) => sum + c.leads.length, 0), 2);
});
test("follow-up labels are honest, local-day based, and handle missing dates", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  assert.equal(followUpState(null, now), "missing");
  assert.equal(followUpState("not-a-date", now), "missing");
  assert.equal(followUpState("2026-10-31T12:00:00Z", now), "overdue");
  assert.equal(followUpState("2026-11-03T12:00:00Z", now), "today");
  assert.equal(followUpState("2026-11-10T12:00:00Z", now), "scheduled");
});
test("UI reuses existing owner-protected CRM mutations and manual loss reason", () => {
  const crm = fs.readFileSync("src/components/crm/crm.tsx", "utf8");
  const board = fs.readFileSync("src/components/crm/lead-board.tsx", "utf8");
  assert.match(crm, /<LeadBoard/);
  assert.match(crm, /target.kind === "lost"/);
  assert.match(crm, /version: lead.version/);
  assert.match(board, /application\/x-avalon-lead/);
  assert.match(board, /onMove\(lead, event.target.value\)/);
  assert.match(board, /hasta 50 registros por página/);
});

test("attention counts only the loaded page's non-archived open deals", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const configured = [...stages, { id: "won", label: "Ganado", kind: "won" }];
  const rows = [
    { id: "overdue", stage_id: "new", follow_up_at: "2026-11-01T12:00:00Z" },
    { id: "today", stage_id: "qualified", follow_up_at: "2026-11-03T12:00:00Z" },
    { id: "missing", stage_id: "new", follow_up_at: null },
    { id: "invalid", stage_id: "qualified", follow_up_at: "invalid-date" },
    { id: "future", stage_id: "new", follow_up_at: "2026-11-05T12:00:00Z" },
    { id: "won", stage_id: "won", follow_up_at: null },
    { id: "lost", stage_id: "lost", follow_up_at: "2026-11-01T12:00:00Z" },
    { id: "archived", stage_id: "new", archived: true, follow_up_at: null },
    { id: "unknown-stage", stage_id: "unknown", follow_up_at: null },
  ];
  const counts = JSON.parse(JSON.stringify(pipelineFocusCounts(configured, rows, now)));
  assert.deepEqual(counts, { all: 9, attention: 4, overdue: 1, today: 1, missing: 2 });
  assert.deepEqual(Array.from(filterPipelineByFocus(configured, rows, "attention", now), row => row.id), ["overdue", "today", "missing", "invalid"]);
  assert.deepEqual(Array.from(filterPipelineByFocus(configured, rows, "overdue", now), row => row.id), ["overdue"]);
  assert.deepEqual(Array.from(filterPipelineByFocus(configured, rows, "today", now), row => row.id), ["today"]);
  assert.deepEqual(Array.from(filterPipelineByFocus(configured, rows, "missing", now), row => row.id), ["missing", "invalid"]);
  const all = filterPipelineByFocus(configured, rows, "all", now);
  assert.equal(all.length, rows.length);
  assert.notStrictEqual(all, rows, "read-only filtering must not mutate CRM page records");
});

test("no false overdue alerts for closed, archived or future-dated deals", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const synthetic = [
    { id: "closed", stage_id: "lost", follow_up_at: null },
    { id: "archived", stage_id: "new", archived: true, follow_up_at: "2026-11-01T12:00:00Z" },
    { id: "future", stage_id: "new", follow_up_at: "2026-11-10T12:00:00Z" },
  ];
  assert.equal(pipelineFocusCounts(stages, synthetic, now).attention, 0);
  assert.equal(filterPipelineByFocus(stages, synthetic, "attention", now).length, 0);
  assert.equal(filterPipelineByFocus(stages, synthetic, "all", now).length, 3);
});

test("attention filter UI exposes pressed state and explicit page scope", () => {
  const ui = fs.readFileSync("src/components/crm/lead-board.tsx", "utf8");
  assert.match(ui, /aria-pressed=\{focus === option.id\}/);
  assert.match(ui, /pipelineFocusCounts\(stages, leads, now\)/);
  assert.match(ui, /filterPipelineByFocus\(stages, leads, focus, now\)/);
  assert.match(ui, /No incluye otras páginas/);
  assert.match(ui, /Para revisar = vencidos \+ hoy \+ sin fecha/);
});
