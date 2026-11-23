// Sales Pro schedule helpers (pure): exact cents, proposals from the agreed plan, validation, coverage and status.
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
const terms = load("src/lib/sales/payment-terms.ts");
const s = load("src/lib/sales/schedule.ts", { "./payment-terms": terms });
const plan = patch => ({ ...terms.DEFAULT_SALE_PAYMENT_TERMS, ...patch });
const sum = items => items.reduce((a, i) => a + s.toCents(i.amount), 0);

test("cents: strict money only — no NaN, Infinity, exponents, signs or third decimals", () => {
  assert.equal(s.toCents("1000.01"), 100001);
  assert.equal(s.toCents("0.1"), 10);
  for (const bad of ["NaN", "Infinity", "1e3", "-5", "1.005", "", " ", "1,000.00"]) assert.equal(s.toCents(bad), null, bad);
  assert.equal(s.toCents(Number.NaN), null);
  assert.equal(s.fromCents(100001), "1000.01");
  assert.equal(s.fromCents(5), "0.05");
});

test("proposals from the agreed plan always sum exactly to the contracted total", () => {
  const base = { total: "1000.00", upfront: "100.00", soldOn: "2026-11-23" };
  const inst = s.proposeSchedule({ ...base, terms: plan({ schedule: "installments", installments: 3, firstDue: "2026-12-31", frequency: "monthly" }) });
  assert.deepEqual(inst.map(i => [i.kind, i.due_on, i.amount]), [
    ["deposit", "2026-11-23", "100.00"], ["installment", "2026-12-31", "300.00"], ["installment", "2027-01-31", "300.00"], ["installment", "2027-02-28", "300.00"]]);
  // 1000 − 0.01 over 7 → cents rebalanced on the last installment.
  const odd = s.proposeSchedule({ total: "999.99", upfront: "0", soldOn: "2026-11-23", terms: plan({ schedule: "installments", installments: 7, firstDue: "2026-12-01", frequency: "weekly" }) });
  assert.equal(sum(odd), 99999);
  assert.equal(odd.length, 7);
  const dep = s.proposeSchedule({ ...base, terms: plan({ schedule: "deposit_balance", netDays: 15 }) });
  assert.deepEqual(dep.map(i => [i.kind, i.due_on, i.amount]), [["deposit", "2026-11-23", "100.00"], ["balance", "2026-12-08", "900.00"]]);
  assert.deepEqual(s.proposeSchedule({ ...base, terms: plan({ schedule: "full", netDays: 0 }) }).map(i => i.amount), ["1000.00"]);
  assert.deepEqual(s.proposeSchedule({ ...base, terms: plan({ schedule: "to_agree" }) }), [], "a human decides");
  assert.deepEqual(s.proposeSchedule({ ...base, terms: null }), []);
  assert.deepEqual(s.proposeSchedule({ ...base, upfront: "2000.00", terms: plan({ schedule: "full" }) }), [], "deposit above total is invalid input");
});

test("validation mirrors the database: exact total, dates not before the sale, finite positive amounts", () => {
  const ok = [{ kind: "deposit", due_on: "2026-11-23", amount: "400.00", label: "" }, { kind: "balance", due_on: "2026-12-23", amount: "600.00", label: "" }];
  assert.equal(s.validateSchedule(ok, 100000, "2026-11-23"), null);
  assert.equal(s.validateSchedule(ok.slice(0, 1), 100000, "2026-11-23"), "schedule_total_mismatch");
  assert.equal(s.validateSchedule(ok.slice(1), 100000, "2026-11-23", 40000), null, "funded installments kept count");
  assert.equal(s.validateSchedule([{ ...ok[0], due_on: "2026-11-22" }, ok[1]], 100000, "2026-11-23"), "schedule_invalid_date");
  assert.equal(s.validateSchedule([{ ...ok[0], due_on: "2026-02-30" }, ok[1]], 100000, "2026-11-23"), "schedule_invalid_date");
  assert.equal(s.validateSchedule([{ ...ok[0], amount: "NaN" }, ok[1]], 100000, "2026-11-23"), "schedule_invalid_amount");
  assert.equal(s.validateSchedule([{ ...ok[0], amount: "0" }, ok[1]], 100000, "2026-11-23"), "schedule_invalid_amount");
  assert.equal(s.validateSchedule([{ ...ok[0], kind: "loan" }, ok[1]], 100000, "2026-11-23"), "schedule_invalid");
  assert.equal(s.validateSchedule([], 100000, "2026-11-23"), "schedule_empty");
});

test("coverage: allocations first, then unallocated receipts by due date; reversed receipts never count", () => {
  const rows = [
    { id: "a", seq: 1, kind: "deposit", label: "", due_on: "2026-08-25", amount: "200.00", status: "scheduled" },
    { id: "b", seq: 2, kind: "installment", label: "", due_on: "2026-09-24", amount: "200.00", status: "scheduled" },
    { id: "c", seq: 3, kind: "installment", label: "", due_on: "2026-10-24", amount: "200.00", status: "scheduled" },
    { id: "d", seq: 4, kind: "installment", label: "", due_on: "2026-11-28", amount: "200.00", status: "scheduled" },
    { id: "x", seq: 5, kind: "balance", label: "", due_on: "2026-12-01", amount: "999.00", status: "cancelled" },
  ];
  const pays = [
    { id: "p1", amount: "200.00", status: "verified", installment_id: "a", received_on: "2026-08-25" },
    { id: "p2", amount: "250.00", status: "recorded", installment_id: null, received_on: "2026-10-01" },
    { id: "p3", amount: "999.00", status: "reversed", installment_id: null, received_on: "2026-10-02" },
  ];
  const st = s.installmentStates(rows, pays, "2026-11-23");
  assert.deepEqual(st.map(r => [r.id, r.state, r.remainingCents]), [["a", "paid", 0], ["b", "paid", 0], ["c", "overdue", 15000], ["d", "due", 20000], ["x", "cancelled", 0]]);
  assert.equal(st.find(r => r.id === "a").funded, true, "funded rows are locked when rescheduling");
});

test("one payment status per sale: disputes and refunds are never hidden behind 'paid'", () => {
  const r = (patch) => ({ recorded: "0", refunded: "0", net_collected: "0", balance: "1000.00", overdue: "0", open_chargebacks: 0, ...patch });
  assert.equal(s.paymentStatus(r({})), "unpaid");
  assert.equal(s.paymentStatus(r({ recorded: "400.00", net_collected: "400.00", balance: "600.00" })), "partially_paid");
  assert.equal(s.paymentStatus(r({ recorded: "400.00", net_collected: "400.00", balance: "600.00", overdue: "150.00" })), "overdue");
  assert.equal(s.paymentStatus(r({ recorded: "1000.00", net_collected: "1000.00", balance: "0.00" })), "paid");
  assert.equal(s.paymentStatus(r({ recorded: "1000.00", refunded: "1000.00", net_collected: "0.00", balance: "1000.00" })), "refunded");
  assert.equal(s.paymentStatus(r({ recorded: "1000.00", refunded: "500.00", net_collected: "500.00", balance: "500.00", open_chargebacks: 1 })), "disputed");
});
