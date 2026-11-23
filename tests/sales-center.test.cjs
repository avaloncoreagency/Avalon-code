// Sales Center (pure): "Cerrar venta" readiness mirrors crm_quote_close_sale; quote variable-agreement fields validate.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const load = (file, deps = {}) => {
  const out = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, id => deps[id] ?? require(id));
  return m.exports;
};
const model = load("src/lib/quotes/model.ts");
const close = load("src/lib/sales/quote-close.ts", { "@/lib/quotes/model": model });

const base = over => ({ schemaVersion: 1, lang: "es", currency: "USD", title: "Q", issueDate: "2026-11-23", validUntil: "2099-12-31",
  client: { company: "Barbería Sintética", contact: "", email: "", phone: "", address: "" }, issuer: { name: "Avalon", email: "", phone: "" }, seller: "",
  objectives: "", problem: "", solution: "s", scope: "", deliverables: "", exclusions: "", dependencies: "", timeline: "", support: "", terms: "", notes: "", thirdPartyCosts: "",
  model: "commission", lines: [{ code: "marketing-mensual", name: "Marketing", description: "", kind: "monthly", qty: 1, unitPrice: "0" }],
  commission: { status: "proposed", kind: "revenue_share", pct: "12.5", base: "gross_revenue", baseNote: "", trigger: "Cita cobrada", attributionWindowDays: 30, evidence: "POS",
    settlement: "monthly", exclusions: "Propinas", refunds: "", expiry: "", effectiveDate: "2026-11-01", durationMonths: 12 }, ...over });
const catalog = [{ code: "marketing-mensual", billing_type: "monthly", active: true }, { code: "desarrollo-web", billing_type: "one_time", active: true }];

test("revenue share quote: ready to close, variable component carried verbatim (no amounts invented)", () => {
  const sum = close.closeSummary(base(), { status: "accepted", contractVerified: true, catalog });
  assert.deepEqual(sum.blockers, []);
  assert.equal(sum.oneTimeCents + sum.monthlyCents, 0, "a variable sale is not a $0 fixed sale: the amount comes from settlements");
  assert.deepEqual({ kind: sum.variable.kind, pct: sum.variable.pct, base: sum.variable.base, effectiveDate: sum.variable.effectiveDate, durationMonths: sum.variable.durationMonths },
    { kind: "revenue_share", pct: "12.5", base: "gross_revenue", effectiveDate: "2026-11-01", durationMonths: 12 });
  assert.equal(close.closeSummary(base({ commission: { ...base().commission, kind: undefined } }), { status: "accepted", contractVerified: true, catalog }).variable.kind, "revenue_share", "older quotes default to revenue share");
});

test("blockers explain exactly why a quote cannot close yet", () => {
  const codes = (c, o = {}) => close.closeSummary(c, { status: "accepted", contractVerified: true, catalog, ...o }).blockers.map(b => b.code);
  assert.deepEqual(codes(base(), { status: "sent" }), ["quote_not_accepted"]);
  assert.deepEqual(codes(base(), { contractVerified: false }), ["contract_not_verified"]);
  assert.deepEqual(codes(base({ lines: [] })), ["quote_needs_service_line"]);
  assert.deepEqual(codes(base({ lines: [{ code: null, name: "A medida", description: "", kind: "one_time", qty: 1, unitPrice: "10" }] })), ["quote_line_not_in_catalog"]);
  assert.deepEqual(codes(base({ lines: [{ code: "desarrollo-web", name: "Web", description: "", kind: "monthly", qty: 1, unitPrice: "10" }] })), ["quote_line_kind_mismatch"]);
  assert.deepEqual(codes(base({ commission: { ...base().commission, status: "to_negotiate", pct: "" } })), ["quote_commission_to_negotiate"]);
  const hybrid = close.closeSummary(base({ model: "hybrid", lines: [{ code: "desarrollo-web", name: "Setup", description: "", kind: "one_time", qty: 1, unitPrice: "1200.50" }] }), { status: "accepted", contractVerified: true, catalog });
  assert.equal(hybrid.oneTimeCents, 120050);
  assert.ok(hybrid.variable, "hybrid keeps both the fixed and the variable component");
});

test("quote model accepts the new variable-agreement fields and rejects invalid ones (backward compatible)", () => {
  assert.deepEqual(model.validateQuote(base()).filter(e => e.startsWith("commission")), []);
  const bad = c => model.validateQuote(base({ commission: { ...base().commission, ...c } })).filter(e => e.startsWith("commission"));
  assert.deepEqual(bad({ kind: "loan" }), ["commission.kind"]);
  assert.deepEqual(bad({ effectiveDate: "nov 2026" }), ["commission.effectiveDate"]);
  assert.deepEqual(bad({ durationMonths: 0 }), ["commission.durationMonths"]);
  const legacy = { ...base().commission }; delete legacy.kind; delete legacy.effectiveDate; delete legacy.durationMonths;
  assert.deepEqual(model.validateQuote(base({ commission: legacy })).filter(e => e.startsWith("commission")), [], "quotes saved before V4 stay valid");
  assert.equal(model.clientSafe(base()).commission.kind, "revenue_share", "the PDF/client copy keeps the agreement type");
});
