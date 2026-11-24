// Sales simplification: one-click invoice numbering, several accepted payment methods, closing text (amount or %).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const cache = new Map();
function load(file) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const mod = { exports: {} }; cache.set(abs, mod);
  const out = ts.transpileModule(fs.readFileSync(abs, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const req = spec => {
    if (spec.startsWith("@/")) return load(path.join("src", spec.slice(2)) + ".ts");
    if (spec.startsWith(".")) return load(path.join(path.dirname(abs), spec) + ".ts");
    return require(spec);
  };
  new Function("module", "exports", "require", out)(mod, mod.exports, req);
  return mod.exports;
}
const inv = load("src/lib/sales/invoice.ts");
const terms = load("src/lib/sales/payment-terms.ts");

test("one-click invoice bills only what is not invoiced, numbered from the real sale", () => {
  assert.deepEqual(inv.nextSaleInvoice("V-2026-0007", "1500.00", []), { number: "FAC-V-2026-0007", amount: "1500.00" });
  // Partial invoice already issued → the balance, next number.
  assert.deepEqual(inv.nextSaleInvoice("V-2026-0007", "1500.00", [{ amount: "1000.00", status: "issued" }]), { number: "FAC-V-2026-0007-2", amount: "500.00" });
  // Fully invoiced (double click) → nothing more is created.
  assert.equal(inv.nextSaleInvoice("V-2026-0007", "1500.00", [{ amount: "1500.00", status: "issued" }]), null);
  // A void invoice does not count, but its number is never reused.
  assert.deepEqual(inv.nextSaleInvoice("V-2026-0007", "1500.00", [{ amount: "1500.00", status: "void" }]), { number: "FAC-V-2026-0007-2", amount: "1500.00" });
  // Variable-only sale (total 0) has nothing to bill until a settlement is verified.
  assert.equal(inv.nextSaleInvoice("V-2026-0008", "0.00", []), null);
  assert.equal(inv.nextSaleInvoice("V-1", "10.10", [{ amount: "0.05", status: "issued" }]).amount, "10.05", "cents, no float drift");
});

test("closing text shows the amount, the percentage, or both", () => {
  const doc = (model, pct = null, basis = null) => ({ closing: { model, pct, basis }, saleTotal: "1000.00", currency: "USD" });
  assert.match(inv.closingText(doc("fixed"), "es"), /^Cerrada por \$1,000\.00$/);
  assert.equal(inv.closingText(doc("commission", "33.00", "ingresos brutos"), "es"), "Cerrada al 33% sobre ingresos brutos");
  assert.match(inv.closingText(doc("hybrid", "10.00", "gross revenue"), "en"), /^Closed at \$1,000\.00 \+ 10% of gross revenue$/);
});

test("several accepted payment methods: validated, preferred always included, older sales unchanged", () => {
  const base = { ...terms.DEFAULT_SALE_PAYMENT_TERMS, method: "zelle" };
  assert.deepEqual(terms.validateSalePaymentTerms({ ...base, accepted: ["card", "ach"] }).accepted, ["zelle", "card", "ach"]);
  assert.equal(terms.validateSalePaymentTerms(base).accepted, undefined, "legacy terms keep their exact shape");
  assert.deepEqual(terms.acceptedSaleMethods(terms.validateSalePaymentTerms(base)), ["zelle"]);
  assert.deepEqual(terms.acceptedSaleMethods(null), []);
  for (const bad of [[], ["bitcoin"], ["card", "card"], "card", [1]])
    assert.throws(() => terms.validateSalePaymentTerms({ ...base, accepted: bad }), /sale_invalid_payment_terms/);
});

test("the invoice PDF names the person responsible and how the sale closed", () => {
  const doc = { number: "FAC-V-1", issuedOn: "2026-11-24", dueOn: null, currency: "USD", amount: "1000.00", status: "issued", voidReason: "",
    saleNumber: "V-1", soldOn: "2026-11-24", quoteRef: "Q-2026-0009 v2", issuer: { name: "Avalon Core Agency", email: "", phone: "" },
    client: { legalName: "Cliente QA", tradeName: "", code: "C-1", location: "", country: "", contactName: "", contactEmail: "" },
    lines: [{ description: "Web", quantity: "1", unitPrice: "1000.00", discount: "0", total: "1000.00", billing: "one_time" }],
    saleSubtotal: "1000.00", saleDiscount: "0", saleTaxRate: "0", saleTax: "0", saleTotal: "1000.00", payments: [], agreedMethod: null,
    seller: "Samuel QA", closing: { model: "hybrid", pct: "15.00", basis: "ingresos brutos" }, acceptedMethods: ["Zelle", "Tarjeta"] };
  const pdf = Buffer.from(inv.renderInvoicePdf(doc, "es", "2026-11-24")).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.match(pdf, /Responsable de la venta: Samuel QA/);
  assert.match(pdf, /15% sobre ingresos brutos/);
  assert.match(pdf, /todos de pago aceptados: Zelle, Tarjeta/);
});
