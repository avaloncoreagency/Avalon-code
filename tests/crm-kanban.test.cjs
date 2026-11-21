const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/crm/kanban.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports, require, Map, Date, Number });
const { groupPipeline, followUpState } = mod.exports;
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
  assert.match(crm, /version: lead\.version/, "every move is the versioned update (409 on a concurrent change)");
  assert.match(crm, /restoreTarget\(lead, groupId, stages, history\) : moveTarget\(lead, groupId, stages\)/);
  assert.match(crm, /loss_reason: extra\.lossReason/, "Lost carries the owner's reason to the server rule");
  assert.match(board, /moveRequirement\(group\) === "loss_reason"\) \{ place\(id, group\); setLostAsk\(lead\)/, "Lost asks for the reason before saving");
  assert.match(board, /place\(id, null\); \/\/ revert to the previous column/, "failed saves revert the optimistic card");
  assert.match(board, /if \(pending\.has\(id\) \|\| displayedGroup\(lead, pending\) === group\) return;/, "one in-flight move per card");
  assert.match(board, /Hasta 50 registros por página/);
});

test("dragging can auto-scroll to nonadjacent columns without stage-by-stage mutations", () => {
  const board = fs.readFileSync("src/components/crm/lead-board.tsx", "utf8");
  const styles = fs.readFileSync("src/components/crm/lead-board.module.css", "utf8");
  assert.match(board, /ref=\{scrollRef\}/, "scroll container has its own ref");
  assert.match(board, /window\.addEventListener\("pointermove", move\)/, "pointer coordinates tracked globally (mouse, pen, touch)");
  assert.match(board, /Window listeners are attached ONCE/, "an early pointercancel can never leave a stale gesture");
  assert.match(board, /node\.addEventListener\("touchmove", blockScroll, \{ passive: false \}\)/, "Safari touch drag does not scroll the page (listener present before touchstart)");
  assert.match(board, /frame = requestAnimationFrame\(step\)/, "edge scrolling continues as pointer pauses");
  assert.match(board, /node\.scrollLeft \+= strength \* 18/, "edge velocity scrolls the board itself");
  assert.match(board, /data-kanban-group=\{group\.id\}/, "every group can receive a drop");
  assert.match(board, /if \(lead && group && PIPELINE_GROUPS\.some\(g => g\.id === group\)\) commit\(lead, group\)/, "drop targets the chosen group directly");
  assert.match(board, /suppressClick\.current = true/, "the click after a drag never opens the record");
  assert.match(board, /document\.addEventListener\("keydown", trap, true\)/, "PF-A11Y-001: Tab is trapped inside open dialogs");
  assert.match(board, /\[data-lead-id="\$\{CSS\.escape\(id\)\}"\]`\)\?\.focus\(\)/, "focus returns to the opener card");
  assert.match(styles, /\.scroll\[data-dragging="true"\] \{ scroll-snap-type: none/, "snap does not fight auto-scroll");
});
