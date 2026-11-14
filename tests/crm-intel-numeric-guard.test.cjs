// Regression guard: malformed numeric input must not change a client's budget or commission.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const file = path.resolve("src/lib/crm/intel/form.ts");
const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("exports", "module", js)(mod.exports, mod);
const { parseAnswer } = mod.exports;
const question = type => ({ id: "test_amount", type, label: { es: "Monto", en: "Amount" } });

test("reject ambiguous commas, misplaced currency symbols and scientific notation", () => {
  for (const input of ["1,2", "12,34", "1,,000", "1,234,56", "12$34", "1 2", "1e2", "0x10", "Infinity", "-1"]) {
    assert.equal(parseAnswer(question("money"), input).ok, false, input);
  }
  assert.equal(parseAnswer(question("percent"), "$25").ok, false);
  assert.equal(parseAnswer(question("number"), "$25").ok, false);
});

test("preserve valid budgets, commissions, quantities and amounts", () => {
  const cases = [
    ["money", "1,234.50", 1234.5],
    ["money", "$ 1,234.50", 1234.5],
    ["money", "1234.50", 1234.5],
    ["money", ".50", 0.5],
    ["money", "0", 0],
    ["percent", "12.5", 12.5],
    ["percent", "100", 100],
    ["number", "1,000", 1000],
    ["number", "2", 2],
    ["rating", "4.5", 4.5],
  ];
  for (const [type, input, expected] of cases) {
    assert.deepEqual(parseAnswer(question(type), input), { ok: true, value: expected }, `${type}: ${input}`);
  }
});

test("enforce existing numeric type ranges and integer requirements", () => {
  assert.equal(parseAnswer(question("percent"), "100.01").ok, false);
  assert.equal(parseAnswer(question("percent"), "101").ok, false);
  assert.equal(parseAnswer(question("number"), "1.5").ok, false);
  assert.equal(parseAnswer(question("rating"), "5.1").ok, false);
  assert.equal(parseAnswer(question("money"), "100,000,000.01").ok, false);
});
