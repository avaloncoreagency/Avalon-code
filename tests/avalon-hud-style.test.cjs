const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path,"utf8");
const root = read("src/app/globals.css");
const crm = read("src/components/crm/crm.module.css");
const kanban = read("src/components/crm/lead-board.module.css");
const ops = read("src/components/sales/sales.module.css");
const shell = read("src/components/suite/suite.module.css");

test("all CRM surfaces reuse the Avalon OS HUD cyan/violet/magenta identity", () => {
  for (const cssVar of ["--cyan:", "--violet:", "--magenta:", "--panel:", "--line-strong:"])
    assert.ok(root.includes(cssVar), "missing source token " + cssVar);
  assert.match(shell, /\.navItem\[aria-current="page"\]/);
  assert.match(crm, /\.tab\[aria-current="page"\]/);
  assert.match(crm, /background:\s*var\(--crm-active-bg\)/);
  // Spatial Luxury palette (owner request 2026-11-03): Cosmic Violet replaces the former neon violet.
  assert.match(root, /--crm-active-bg:\s*linear-gradient\(115deg,\s*rgba\(118,\s*104,\s*232/);
  assert.match(ops, /background:var\(--crm-active-bg\)/);
  assert.match(ops, /--accent:var\(--cyan\)/);
  assert.match(kanban, /\.cards \.card:hover/);
});
test("CRM no longer uses the inherited gold active-tab palette", () => {
  assert.doesNotMatch(crm, /#b99a64|#d3ae63/i);
  assert.ok(crm.includes("var(--gradient)"));
});
test("semantic states and user-assigned event colors remain distinct", () => {
  assert.match(ops, /data-tone="danger"/);
  assert.match(ops, /data-tone="warn"/);
  assert.match(kanban, /data-overdue="true"/);
  assert.ok(crm.includes("var(--gradient)"));
});
test("CRM and operations navigation retain keyboard and mobile affordances", () => {
  assert.match(crm, /:focus-visible/);
  assert.match(crm, /overflow-x:\s*auto/);
  assert.match(ops, /:focus-visible/);
  assert.match(shell, /\.mobileDock/);
});
