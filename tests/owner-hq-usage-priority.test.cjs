const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("canonical HQ routes remain owner-only and do not mount manager-engine telemetry", () => {
  const page = fs.readFileSync("src/app/admin/workspace/crm/office/hq/page.tsx", "utf8");
  const redirect = fs.readFileSync("src/app/admin/workspace/crm/office/page.tsx", "utf8");
  assert.match(page, /await requireOwner\(\)/);
  assert.match(page, /<Office lang=\{lang\} \/>/);
  assert.doesNotMatch(page, /<ManagerExecutionStatus|<ExecutivePanel/);
  assert.match(redirect, /redirect\("\/admin\/workspace\/crm\/office\/hq"\)/);
});

test("owners are the default office focus and manager controls stay deferred, not deleted", () => {
  const office = fs.readFileSync("src/components/office/office.tsx", "utf8");
  assert.match(office, /Herramientas futuras · managers de IA/);
  assert.match(office, /<details className=\{s\.defs\}>/);
  assert.match(office, /managers\.map\(agentCard\)/);
  assert.doesNotMatch(office, /<option value="ai">/);
});

test("CRM AI usage bars show only manually reported percentages and are accessible", () => {
  const overview = fs.readFileSync("src/components/crm/overview.tsx", "utf8");
  assert.match(overview, /role="progressbar"/);
  assert.match(overview, /aria-valuenow=\{Math\.min\(100, Math\.max\(0, pct\)\)\}/);
  assert.match(overview, /pct !== null && <>/);
  assert.match(overview, /item\.mode === "manual"/);
  assert.match(overview, /Automático: no conectado/);
});
