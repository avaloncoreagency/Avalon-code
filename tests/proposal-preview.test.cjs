const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const page = fs.readFileSync('src/app/admin/service-factory/planner/[id]/proposal/page.tsx', 'utf8');
const css = fs.readFileSync('src/app/admin/service-factory/planner/[id]/proposal/proposal.module.css', 'utf8');

test('proposal preview requires an owner and a reviewed internal plan', () => {
  assert.match(page, /await requireOwner\(\)/);
  assert.match(page, /status === "reviewed"/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /force-dynamic/);
  assert.match(page, /No se ha generado ninguna propuesta/);
});

test('proposal view queries only customer-facing data and does not expose internal costs', () => {
  const planQuery = page.match(/from\("crm_solution_plans"\)\s*\.select\("([^"]+)"/);
  const linesQuery = page.match(/from\("crm_solution_plan_lines"\)\s*\.select\("([^"]+)"/);
  assert.ok(planQuery && linesQuery);
  for (const selected of [planQuery[1], linesQuery[1]]) {
    for (const privateField of ['direct_cost', 'estimated_hours', 'hourly_rate', 'contingency_percent', 'margin', 'assumptions']) {
      assert.ok(!selected.includes(privateField), 'private field leaked: ' + privateField);
    }
  }
  assert.match(page, /estimateByCadence/);
  assert.match(page, /revenueCents/);
  assert.doesNotMatch(page, /marginCents|totalCostCents|laborCents|directCostCents/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|sendEmail|sendMessage|fetch\(/);
});

test('proposal preview supports printing and never mixes billing cadences', () => {
  assert.match(css, /@media print/);
  assert.match(page, /group\.billing_type/);
  assert.match(page, /\.filter\(line => line\.billing_type === group\.billing_type\)/);
  assert.match(page, /No constituye contrato, factura ni venta/);
  // Catch malformed TSX syntax even without a deployed Preview.
  const compiled = ts.transpileModule(page, {
    fileName: 'page.tsx',
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  assert.deepEqual((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
});
