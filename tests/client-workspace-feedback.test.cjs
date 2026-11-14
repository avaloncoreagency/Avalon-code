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

test("OkFlash safely ignores inherited URL codes and renders only explicit success codes", () => {
  const source = fs.readFileSync("src/components/sales/ui.tsx", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "ui.tsx",
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);

  const jsx = (tag, props) => ({ tag, props });
  const stubs = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": () => null,
    "@/components/crm/navigation": { CrmNavigation: () => null },
    "@/lib/i18n": { pick: (lang, es, en) => lang === "es" ? es : en },
    "@/lib/sales/domain": { label: (_, code) => code, tone: () => "ok", saleErrorText: () => "Unavailable" },
    "@/lib/crm/workspace-feedback": { workspaceFeedback },
    "./sales.module.css": { flash: "flash" },
  };
  const ui = { exports: {} };
  new Function("require", "module", "exports", compiled.outputText)(
    id => { if (Object.hasOwn(stubs, id)) return stubs[id]; throw Error("Unexpected import: " + id); },
    ui, ui.exports,
  );
  for (const code of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty", "unknown"]) {
    assert.equal(ui.exports.OkFlash({ lang: "es", code }), null, code);
  }
  assert.match(ui.exports.OkFlash({ lang: "es", code: "confirmed" }).props.children, /Venta confirmada/);
  assert.match(ui.exports.OkFlash({ lang: "en", code: "workspace_saved" }).props.children, /saved/);
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
