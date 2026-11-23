const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = fs.readFileSync("src/lib/sales/payment-terms.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText;
const moduleShim = { exports: {} };
new Function("module", "exports", compiled)(moduleShim, moduleShim.exports);
const d = moduleShim.exports;
const base = () => ({ ...d.DEFAULT_SALE_PAYMENT_TERMS });
const code = fn => { try { fn(); return "ok"; } catch (e) { return e.message; } };

test("sale payment terms: safe defaults and every offered channel are parseable", () => {
  assert.equal(d.validateSalePaymentTerms(base()).schedule, "to_agree");
  for (const method of d.SALE_PAYMENT_METHODS) {
    const parsed = d.validateSalePaymentTerms({ ...base(), method });
    assert.equal(parsed.method, method);
    const channel = d.paymentChannelToStoredMethod(method);
    // Must be a value of the crm_payments.method DB enum (widened in 20261123150000); the channel is no longer
    // squeezed into "other" and the reference text.
    assert.ok(["transfer", "ach", "wire", "zelle", "check", "card", "cash", "paypal", "payment_link", "financing_external", "other"].includes(channel), channel);
    assert.ok(d.salePaymentMethodLabel(method, "es"));
  }
});

test("sale payment terms: specific plans require their own verifiable inputs", () => {
  assert.equal(code(() => d.validateSalePaymentTerms({ ...base(), schedule: "installments" })), "sale_invalid_payment_terms");
  assert.equal(code(() => d.validateSalePaymentTerms({ ...base(), schedule: "milestones" })), "sale_invalid_payment_terms");
  assert.equal(code(() => d.validateSalePaymentTerms({ ...base(), schedule: "external_financing" })), "sale_invalid_payment_terms");
  assert.equal(d.validateSalePaymentTerms({ ...base(), schedule: "installments", firstDue: "2026-12-05" }).installments, 3);
  assert.equal(d.validateSalePaymentTerms({ ...base(), schedule: "milestones", milestones: "50% signing / 50% delivery" }).schedule, "milestones");
  assert.equal(d.validateSalePaymentTerms({ ...base(), schedule: "external_financing", externalProvider: "Provider pending" }).schedule, "external_financing");
});

test("sale payment terms: malformed and extra fields fail closed", () => {
  const bad = [
    null, [], "oops", { ...base(), version: 2 }, { ...base(), method: "swift_bypass" },
    { ...base(), schedule: "loan", notes: "approved" }, { ...base(), installments: 1 },
    { ...base(), installments: 37 }, { ...base(), installments: Infinity },
    { ...base(), netDays: -1 }, { ...base(), netDays: 366 }, { ...base(), extra: true },
    { ...base(), firstDue: "2026-02-30" }, { ...base(), notes: "a".repeat(701) },
  ];
  for (const value of bad) assert.equal(code(() => d.validateSalePaymentTerms(value)), "sale_invalid_payment_terms");
});

test("sale payment terms: versioned internal note is round-trippable and backwards-compatible", () => {
  const terms = d.validateSalePaymentTerms({ ...base(), schedule: "installments", installments: 6, firstDue: "2026-12-10", frequency: "biweekly" });
  const stored = d.attachSalePaymentTerms("Client prefers written confirmation.", terms);
  const read = d.readSalePaymentTerms(stored);
  assert.equal(read.notes, "Client prefers written confirmation.");
  assert.deepEqual(read.terms, terms);
  assert.deepEqual(d.readSalePaymentTerms("Historical sale notes"), { notes: "Historical sale notes", terms: null });
  assert.equal(code(() => d.attachSalePaymentTerms(stored, terms)), "sale_invalid_payment_terms");
  assert.equal(code(() => d.attachSalePaymentTerms("x".repeat(3999), terms)), "sale_too_long");
});

test("sale payment terms: malformed stored suffix is visible, not silently destroyed", () => {
  const old = "old" + d.SALE_TERMS_MARKER + '{"bad":true}';
  assert.deepEqual(d.readSalePaymentTerms(old), { notes: old, terms: null });
});

test("sale payment terms: installment previews use cents and do not invent interest", () => {
  assert.deepEqual(d.installmentPreview(100, 20, 3), { remaining: 80, regular: 26.66, final: 26.68 });
  assert.deepEqual(d.installmentPreview(100, 0, 2), { remaining: 100, regular: 50, final: 50 });
  assert.equal(d.installmentPreview(100, 101, 3), null);
  assert.equal(d.installmentPreview(Number.NaN, 0, 2), null);
  assert.equal(d.installmentPreview(100, 0, 1), null);
  assert.equal(d.installmentPreview(100, 0, 37), null);
});


test("sale payment terms: monthly schedule anchors 31st, adjusts February, restores March", () => {
  const terms = { ...base(), schedule: "installments", firstDue: "2028-01-31", frequency: "monthly", installments: 4 };
  const rows = d.installmentSchedule(100, 0, terms);
  assert.deepEqual(rows.map(x => x.dueOn), ["2028-01-31", "2028-02-29", "2028-03-31", "2028-04-30"]);
  assert.deepEqual(rows.map(x => x.amount), [25, 25, 25, 25]);
});

test("sale payment terms: weekly and biweekly schedules have exact 7/14 day spacing", () => {
  const terms = { ...base(), schedule: "installments", firstDue: "2026-10-31", frequency: "weekly", installments: 3 };
  assert.deepEqual(d.installmentSchedule(100, 20, terms).map(x => x.dueOn), ["2026-10-31", "2026-11-07", "2026-11-14"]);
  terms.frequency = "biweekly";
  assert.deepEqual(d.installmentSchedule(100, 20, terms).map(x => x.dueOn), ["2026-10-31", "2026-11-14", "2026-11-28"]);
});

test("sale payment terms: schedule sums to remaining balance in cents with final adjustment", () => {
  const terms = { ...base(), schedule: "installments", firstDue: "2026-12-01", installments: 3 };
  const rows = d.installmentSchedule(100, 20, terms);
  assert.deepEqual(rows.map(x => x.amount), [26.66, 26.66, 26.68]);
  assert.equal(Math.round(rows.reduce((sum, x) => sum + x.amount, 0) * 100), 8000);
  assert.equal(d.installmentSchedule(100, 0, { ...terms, schedule: "full" }), null);
  assert.equal(d.installmentSchedule(100, 120, terms), null);
  assert.equal(d.installmentSchedule(100, 0, { ...terms, firstDue: "2026-02-30" }), null);
});
