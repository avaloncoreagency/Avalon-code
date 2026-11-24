const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = fs.readFileSync("src/lib/sales/quote-acceptance.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const moduleShim = { exports: {} };
new Function("module", "exports", compiled)(moduleShim, moduleShim.exports);
const { saleMatchesAcceptedQuote: matches } = moduleShim.exports;
const quote = [{ code: "desarrollo-web", description: "Website 5 pages", qty: 2, unitPrice: "650.00", kind: "one_time" }];
const catalog = [{ code: "desarrollo-web", billing_type: "one_time" }];
const sale = [{ service_code: "desarrollo-web", description: "Website 5 pages", quantity: "2", unit_price: "650", discount: "0" }];

test("accepted quote can be confirmed when exact lines are preserved", () => {
  assert.equal(matches(sale, quote, catalog), true);
  assert.equal(matches(sale, quote, catalog, "0.00", "0.00"), true);
});

test("tampering with accepted quote amounts, scope, taxes or discounts fails closed", () => {
  assert.equal(matches([{ ...sale[0], unit_price: "650.01" }], quote, catalog), false);
  assert.equal(matches([{ ...sale[0], unit_price: "649.99" }], quote, catalog), false);
  assert.equal(matches([{ ...sale[0], quantity: "1.99" }], quote, catalog), false);
  assert.equal(matches([{ ...sale[0], description: "Website 6 pages" }], quote, catalog), false);
  assert.equal(matches([{ ...sale[0], discount: "1" }], quote, catalog), false);
  assert.equal(matches(sale, quote, catalog, "1"), false);
  assert.equal(matches(sale, quote, catalog, "0", "7"), false);
});

test("unsupported or archived quote services cannot be sold under accepted quote link", () => {
  assert.equal(matches(sale, [{ ...quote[0], code: null }], catalog), false);
  assert.equal(matches(sale, quote, []), false);
  assert.equal(matches(sale, quote, [{ ...catalog[0], billing_type: "monthly" }]), false);
  assert.equal(matches(sale, [], catalog), false);
  assert.equal(matches([...sale, sale[0]], quote, catalog), false);
});

test("quote price matching is cent-accurate and finite", () => {
  assert.equal(matches([{ ...sale[0], unit_price: "650.0" }], quote, catalog), true);
  assert.equal(matches([{ ...sale[0], unit_price: "NaN" }], quote, catalog), false);
  assert.equal(matches([{ ...sale[0], unit_price: "1e3" }], quote, catalog), false);
  assert.equal(matches([{ ...sale[0], unit_price: "9999999999" }], quote, catalog), false);
});
