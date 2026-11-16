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

test("CRM homepage embeds accessible quota meters; manual readings never masquerade as live balances", () => {
  const overview=fs.readFileSync("src/components/crm/overview.tsx","utf8");
  const panel=fs.readFileSync("src/components/ai-credits/credit-center.tsx","utf8");
  const schema=fs.readFileSync("supabase/migrations/20261116130000_ai_credit_center_owners.sql","utf8");
  assert.match(overview, /CreditCenter/);
  assert.match(panel, /role="progressbar"/);
  assert.match(panel, /aria-valuenow=/);
  assert.match(panel, /quota &&/);
  assert.match(panel, /Última lectura manual/);
  assert.match(panel, /No equivale a saldo cero/);
  assert.match(schema, /mode text not null default 'manual'/);
});
