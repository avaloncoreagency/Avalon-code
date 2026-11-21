const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = path => fs.readFileSync(path, "utf8");

test("Client 360 finance fallback describes its measured balance, not net profitability", () => {
  const ui = read("src/components/sales/client-workspace.tsx");
  assert.match(ui, /Saldo cobrado menos gastos registrados/);
  assert.match(ui, /Collections less recorded expenses/);
  assert.match(ui, /no equivale a beneficio neto ni a flujo de caja/);
  assert.match(ui, /not net profit or cash flow/);
  assert.doesNotMatch(ui, /Rentabilidad registrada|Recorded profitability/);
  assert.match(ui, /finance && notice &&/);
  assert.match(ui, /f\.profitCents !== null/);
  assert.match(ui, /Subtotal parcial \(datos incompletos\)/);
  assert.match(ui, /!sourceFailed/);
});

test("Contracted recurring amounts are never mislabeled active MRR", () => {
  const ui = read("src/components/sales/client-workspace.tsx");
  assert.match(ui, /Recurrente contratado\/mes \(no MRR activo\)/);
  assert.match(ui, /Contracted recurring\/mo \(not active MRR\)/);
  assert.match(ui, /recurrente contratado no verifica suscripciones activas/);
  assert.match(ui, /Contracted recurring amounts do not verify active subscriptions/);
  assert.doesNotMatch(ui, / · MRR \{money\(lang,unit\(f\.recurringCents\)/);
});

test("FIN-002 does not replace source finance access or fabricate revenue", () => {
  const page = read("src/app/admin/workspace/crm/clients/[id]/page.tsx");
  const server = read("src/lib/sales/client-finance-server.ts");
  const finance = read("src/lib/sales/client-finance.ts");
  assert.match(page, /getCrmCapabilities\(supabase\)/);
  assert.match(page, /loadClientFinance\(supabase, id, caps\)/);
  assert.match(server, /crm_client_finance_summary/);
  assert.match(server, /!capabilities\.financeView/);
  assert.match(finance, /v\.subtotalProfitCents = v\.collectedCents - v\.expensesCents/);
  assert.match(finance, /v\.profitCents = complete \? v\.subtotalProfitCents : null/);
});
