const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const helper = fs.readFileSync("src/lib/crm/workspace-feedback.ts", "utf8");
const js = ts.transpileModule(helper, {
  fileName: "workspace-feedback.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
const errors = (js.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
assert.deepEqual(errors, []);
const moduleLike = { exports: {} };
new Function("module", "exports", js.outputText)(moduleLike, moduleLike.exports);
const { workspaceFeedback } = moduleLike.exports;

test("successful workspace saves show clear bilingual confirmation", () => {
  assert.match(workspaceFeedback("ok", "es", "workspace_saved"), /guardados/);
  assert.match(workspaceFeedback("ok", "en", "workspace_saved"), /saved/);
});

test("workspace errors use bounded explanations, not raw database details", () => {
  for (const key of ["workspace_invalid", "workspace_pending", "workspace_save_failed"]) {
    assert.ok(workspaceFeedback("error", "es", key));
    assert.ok(workspaceFeedback("error", "en", key));
  }
  assert.equal(workspaceFeedback("error", "es", "PGRST205 raw database information"), null);
  assert.equal(workspaceFeedback("ok", "es", "constructor"), null);
  assert.equal(workspaceFeedback("error", "en", "__proto__"), null);
  assert.equal(workspaceFeedback("ok", "es", "saved"), null, "existing sales codes retain their own messages");
});

test("CRM flash components handle workspace feedback without changing Sales errors", () => {
  const ui = fs.readFileSync("src/components/sales/ui.tsx", "utf8");
  const actions = fs.readFileSync("src/app/admin/workspace/crm/clients/workspace-actions.ts", "utf8");
  const page = fs.readFileSync("src/app/admin/workspace/crm/clients/[id]/page.tsx", "utf8");
  assert.match(ui, /workspaceFeedback\("error", lang, code\)/);
  assert.match(ui, /workspaceFeedback\("ok", lang, code\)/);
  assert.match(ui, /saleErrorText\(lang, code\)/);
  assert.match(ui, /role="status"/);
  assert.match(actions, /ok: "workspace_saved"/);
  assert.match(page, /<OkFlash/);
  assert.match(page, /<ErrorFlash/);
});
