// KENJI #98: executable financial-summary regression for PR #78.
// Synthetic client: 101 paid sales at USD 100 each + 201 expenses at USD 10 each.
// True collected-minus-expenses = USD 8,090.00, never USD 8,000.00.
// No connected Supabase, secrets, HTTP, user accounts, or production writes.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const PAGE = "src/app/admin/workspace/crm/clients/[id]/page.tsx";
const WORKSPACE = "src/components/sales/client-workspace.tsx";
const FINANCE = "src/lib/sales/client-finance.ts";
const pageSource = fs.readFileSync(PAGE, "utf8");
const workspaceSource = fs.readFileSync(WORKSPACE, "utf8");
const financeSource = fs.existsSync(FINANCE) ? fs.readFileSync(FINANCE, "utf8") : null;
const clientId = "00000000-0000-4000-8000-0000000000aa";

const fixtures = {
  sales: Array.from({ length: 101 }, (_, index) => ({
    id: "sale-" + String(index + 1),
    sale_number: "SYN-" + String(index + 1),
    currency: "USD",
    total: "100.00",
    recurring_monthly: "0.00",
    crm_payments: [{ amount: "100.00" }],
  })),
  costs: Array.from({ length: 201 }, (_, index) => ({
    id: "cost-" + String(index + 1),
    amount: "10.00",
    currency: "USD",
    category: "QA",
    memo: "synthetic expense",
    incurred_on: "2026-11-03",
    created_at: "2026-11-03T12:00:00Z",
  })),
};

// Read the actual parent query contract instead of assuming the parent always
// passes a complete set. PR #78 uses .limit(100) on crm_sales.
function parentSaleLimit() {
  const query = pageSource.match(/from\(["']crm_sales["']\)[\s\S]{0,600}?\.limit\((\d+)\)/);
  return query ? Number(query[1]) : Number.POSITIVE_INFINITY;
}

function table(rows, readError = null) {
  let first = 0;
  let lastExclusive = Number.POSITIVE_INFINITY;
  const query = {
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    order() { return this; },
    limit(number) {
      lastExclusive = Math.min(lastExclusive, first + number);
      return this;
    },
    range(start, end) {
      first = start;
      lastExclusive = end + 1;
      return this;
    },
    maybeSingle() {
      return Promise.resolve({ data: rows[first] ?? null, error: null, count: rows.length });
    },
    then(resolve, reject) {
      const selected = rows.slice(first, lastExclusive);
      return Promise.resolve({ data: readError ? null : selected, error: readError, count: readError ? null : rows.length }).then(resolve, reject);
    },
  };
  return query;
}

// Supabase query simulation respects limit/range; it DOES NOT conveniently
// return the hidden 201st expense when the component requests only 200.
function syntheticDb(costRows, denyCosts = false) {
  const records = {
    crm_client_workspace: [{
      client_id: clientId, package_name: "", development_stage: "",
      next_step: "", version: 1,
    }],
    crm_client_journal: [],
    crm_client_costs: costRows,
    crm_client_journal_revisions: [],
    crm_client_workspace_revisions: [],
    crm_sale_lines: [],
  };
  return { from(name) {
    assert.ok(Object.hasOwn(records, name), "Unexpected financial query: " + name);
    return table(records[name], denyCosts && name === "crm_client_costs"
      ? { code: "42501", message: "permission denied" } : null);
  } };
}

// Consume the REAL helper once HARU integrates #110, not a synthetic implementation.
// Until then this same test exercises the unfixed #78 behavior and must stay red.
function loadFinanceHelper() {
  if (financeSource === null) return null;
  const compiled = ts.transpileModule(financeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: FINANCE,
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod, exports: mod.exports, Number, String, Array, Set, Map, Math,
  }, { filename: FINANCE });
  assert.equal(typeof mod.exports.loadAllRows, "function", "HARU helper must paginate real source rows");
  assert.equal(typeof mod.exports.summarizeClientFinance, "function", "HARU helper must summarize loaded rows");
  return mod.exports;
}
const financeLib = loadFinanceHelper();

// Runtime-import the actual TSX module. UI helpers are local stubs, but finance
// arithmetic and pagination come from production code, not a test fake.
function loadWorkspace() {
  const output = ts.transpileModule(workspaceSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: WORKSPACE,
  }).outputText;
  const mod = { exports: {} };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const styles = new Proxy({}, { get: (_target, name) => String(name) });
  const actions = {
    saveClientWorkspace() {},
    createClientJournalEntry() {},
    reviseClientJournalEntry() {},
    appendClientCost() {},
  };
  const mocks = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: Symbol.for("react.fragment") },
    "next/link": { __esModule: true, default: function Link() {} },
    "@/lib/os/data": { run: async (query) => await query },
    ...(financeLib ? { "@/lib/sales/client-finance": financeLib } : {}),
    "@/lib/i18n": { pick: (_lang, es) => es, formatDate: () => "2026-11-03" },
    "@/lib/sales/domain": {
      money: (_lang, amount, currency) =>
        currency + " " + Number(amount).toFixed(2),
    },
    "@/app/admin/workspace/crm/clients/workspace-actions": actions,
    "./sales.module.css": { __esModule: true, default: styles },
  };
  vm.runInNewContext(output, {
    module: mod,
    exports: mod.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), "Unexpected component dependency: " + name);
      return mocks[name];
    },
  }, { filename: WORKSPACE });
  assert.equal(typeof mod.exports.ClientWorkspace, "function");
  return mod.exports.ClientWorkspace;
}

function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node !== "object") return String(node);
  return textOf(node.props?.children);
}

function financialStatNodes(node, found = []) {
  if (Array.isArray(node)) {
    for (const item of node) financialStatNodes(item, found);
  } else if (node && typeof node === "object" && node.props) {
    if (node.type === "div" && node.props.className === "stat") {
      const text = textOf(node);
      if (text.includes("Rentabilidad") || text.includes("profitability") ||
          text.includes("cobrado") || text.includes("Collected")) found.push(text);
    }
    financialStatNodes(node.props.children, found);
  }
  return found;
}

async function renderFixture(saleRows, costRows, { denyCosts = false, denySales = false } = {}) {
  const sales = denySales ? [] : saleRows.slice(0, parentSaleLimit());
  const render = loadWorkspace();
  let finance;
  if (financeLib) {
    // A new helper alone is not a fix: the real parent must fetch the complete
    // ledger AND pass that finance result to ClientWorkspace. Fail closed otherwise.
    assert.match(pageSource, /loadAllRows/, "Parent must read paginated finance rows");
    assert.match(pageSource, /crm_client_costs/, "Parent must include the expense ledger");
    assert.match(pageSource, /finance=\{finance\}/, "Parent must pass the complete summary to its child");
    // Simulate a PostgREST max-rows limit smaller than the requested range.
    // 101/201 must require a second request starting at offsets 100/200;
    // returning the server count does NOT mean the first response has all rows.
    const salesOffsets = [], costOffsets = [];
    const pager = (rows, maxRows, offsets) => (from, to) => {
      offsets.push(from);
      return Promise.resolve({
        data: rows.slice(from, Math.min(to + 1, from + maxRows)),
        error: null,
        count: rows.length,
      });
    };
    finance = financeLib.summarizeClientFinance({
      sales: await financeLib.loadAllRows(denySales
        ? async () => ({ data: null, error: { code: "42501", message: "permission denied" }, count: null })
        : pager(saleRows, 100, salesOffsets)),
      costs: await financeLib.loadAllRows(denyCosts
        ? async () => ({ data: null, error: { code: "42501", message: "permission denied" }, count: null })
        : pager(costRows, 200, costOffsets)),
    });
    if (denySales) {
      assert.equal(finance.complete, false, "A denied sales source must prohibit complete profitability");
    } else {
      assert.equal(finance.salesRead, saleRows.length, "No sale may be silently skipped");
    }
    if (denyCosts) {
      assert.equal(finance.complete, false, "A denied expense source must prohibit complete profitability");
    } else {
      assert.equal(finance.costsRead, costRows.length, "No cost may be silently skipped");
    }
    if (!denySales) assert.equal(salesOffsets.includes(100), saleRows.length > 100,
      "Sales pagination must continue from 100 only when the 101st row exists");
    if (!denyCosts) assert.equal(costOffsets.includes(200), costRows.length > 200,
      "Expense pagination must continue from 200 only when the 201st row exists");
  }
  const tree = await render({
    clientId, lang: "es", sales, supabase: syntheticDb(costRows, denyCosts),
    ...(finance ? { finance, financeAllowed: true, demo: false } : {}),
  });
  return { stats: financialStatNodes(tree), all: textOf(tree), usedSales: sales.length };
}

test("KENJI: a small complete dossier keeps its exact collected-minus-expenses result", async () => {
  const result = await renderFixture(fixtures.sales.slice(0, 2), fixtures.costs.slice(0, 2));
  assert.ok(result.stats.some(row => row.includes("USD 180.00")),
    "2 collected sales (USD 200) - 2 expenses (USD 20) should show USD 180");
});

test("KENJI: 101 sales + 201 expenses cannot masquerade as complete USD 8,000 profitability", async () => {
  const result = await renderFixture(fixtures.sales, fixtures.costs);
  const stats = result.stats.join(" | ");
  const claimedTotal = /Rentabilidad registrada|Recorded profitability/i.test(stats);
  // Accept either a COMPLETE correct computation or an honest incomplete state
  // that does NOT present the partial 100/200-page arithmetic as a full total.
  if (claimedTotal) {
    assert.match(stats, /USD 8090\.00/,
      "Displayed complete profitability must include the 101st sale and 201st expense. " +
      "Parent supplied " + result.usedSales + "/101 sales. Rendered: " + stats);
    assert.doesNotMatch(stats, /USD 8000\.00/,
      "Truncated pages may never be labeled as recorded total profitability.");
  } else {
    assert.match(result.all, /parcial|incomplet|partial|incomplete|no disponible|unavailable/i,
      "Without complete totals, clearly mark the financial result as incomplete.");
    assert.doesNotMatch(stats, /USD 8000\.00/,
      "An incomplete state must not present the truncated balance as a full total.");
  }
});


// Separate the two independent query caps so HARU can prove that both were
// addressed, not just that two omitted rows happened to cancel each other.
// A legitimately complete 100/200 dossier MUST still be allowed to show 8000.
test("KENJI: exactly 100 sales and 200 expenses are a complete USD 8,000 boundary", async () => {
  const result = await renderFixture(fixtures.sales.slice(0, 100), fixtures.costs.slice(0, 200));
  const stats = result.stats.join(" | ");
  assert.match(stats, /Rentabilidad registrada[^|]*USD 8000\.00/,
    "At the exact query boundaries, 100 x 100 collected - 200 x 10 expensed = USD 8000; rendered: " + stats);
});

async function assertCompleteOrMarkedPartial(saleRows, costRows, expectedAmount, truncatedAmount) {
  const result = await renderFixture(saleRows, costRows);
  const stats = result.stats.join(" | ");
  if (/Rentabilidad registrada|Recorded profitability/i.test(stats)) {
    assert.ok(stats.includes("USD " + expectedAmount),
      "Do not label truncated pages as a full profit. Expected USD " + expectedAmount +
      ", got " + stats + "; parent supplied " + result.usedSales + "/" + saleRows.length + " sales.");
    assert.ok(!stats.includes("USD " + truncatedAmount),
      "Truncated USD " + truncatedAmount + " must not be labeled as full profitability.");
  } else {
    assert.match(result.all, /parcial|incomplet|partial|incomplete|no disponible|unavailable/i,
      "If there is no reliable full profit, the UI must clearly indicate it is incomplete.");
    assert.ok(!stats.includes("USD " + truncatedAmount),
      "Even an incomplete view must not present the truncated balance as full.");
  }
}

test("KENJI: the 101st sale alone must not be silently omitted from total profit", async () => {
  // 101 paid sales x USD 100 - 200 costs x USD 10 = USD 8,100.
  // The pre-fix parent .limit(100) incorrectly renders USD 8,000.
  await assertCompleteOrMarkedPartial(fixtures.sales, fixtures.costs.slice(0, 200), "8100.00", "8000.00");
});

test("KENJI: the 201st expense alone must not be silently omitted from total profit", async () => {
  // 100 paid sales x USD 100 - 201 costs x USD 10 = USD 7,990.
  // The pre-fix workspace .limit(200) incorrectly renders USD 8,000.
  await assertCompleteOrMarkedPartial(fixtures.sales.slice(0, 100), fixtures.costs, "7990.00", "8000.00");
});
// Negative contract: a PostgREST max-rows cap may return a short response even
// though additional rows exist. When an exact count is unavailable, the client
// cannot infer completeness from response length. It must either continue until
// every row is fetched or fail closed with no profitability total.
test("KENJI: missing exact count plus 100/200-row caps cannot certify truncated profit", async () => {
  assert.ok(financeLib, "HARU finance helper must be integrated before certifying the no-count path");
  const cappedWithoutCount = (rows, cap) => async (from, to) => ({
    data: rows.slice(from, Math.min(to + 1, from + cap)),
    error: null,
    count: null,
  });
  const sales = await financeLib.loadAllRows(cappedWithoutCount(fixtures.sales, 100));
  const costs = await financeLib.loadAllRows(cappedWithoutCount(fixtures.costs, 200));
  const summary = financeLib.summarizeClientFinance({ sales, costs });
  assert.equal(summary.currencies.length, 1, "Synthetic USD ledger must remain visible for QA");
  const completeRows = sales.rows.length === 101 && costs.rows.length === 201;
  if (completeRows) {
    assert.equal(summary.complete, true, "Full 101/201 ledger is eligible for complete profitability");
    assert.equal(summary.currencies[0].profitCents, 809000, "Full profit must be USD 8,090.00");
  } else {
    assert.equal(summary.complete, false,
      "An absent count with a server cap cannot prove that short pages are exhaustive");
    assert.equal(summary.currencies[0].profitCents, null,
      "Truncated ledger may display a labelled subtotal, never a total profitability");
  }
  assert.notEqual(summary.currencies[0].profitCents, 800000,
    "The old 100/200-page USD 8,000.00 subtotal must not be certified as full profit");
});

// Authorization failure is distinct from pagination: a 42501/RLS denial of
// expenses must never become a valid, nonzero profit simply because sales load.
// Legacy #78 hides stats on a failed query; HARU's post-fix helper may show an
// explicitly partial subtotal, but neither path may label USD 180 as full profit.
test("KENJI: denied expense ledger cannot appear as complete profitability", async () => {
  const result = await renderFixture(fixtures.sales.slice(0, 2), fixtures.costs.slice(0, 2),
    { denyCosts: true });
  const stats = result.stats.join(" | ");
  assert.doesNotMatch(stats, /Rentabilidad registrada|Recorded profitability/i,
    "RLS-denied expenses must not produce a complete profitability label");
  assert.doesNotMatch(stats, /USD 180\.00/,
    "A denied cost source cannot certify USD 180 as a complete net profit");
  assert.match(result.all, /No fue posible leer|No se pudieron leer los gastos|Expenses could not be read|parcial|partial|incomplet/i,
    "The owner must be told clearly why complete profitability is unavailable");
});


// Symmetric failure mode to denied expenses: if the sales ledger is denied,
// a negative costs-only subtotal is NOT certified as the client's full profit.
// A successful read of costs alone does not prove that zero sales exist.
test("KENJI: denied sales ledger cannot appear as complete profitability", async () => {
  const result = await renderFixture(fixtures.sales.slice(0, 2), fixtures.costs.slice(0, 2),
    { denySales: true });
  const stats = result.stats.join(" | ");
  assert.doesNotMatch(stats, /Rentabilidad registrada|Recorded profitability/i,
    "RLS-denied sales must not produce a complete profitability label");
  assert.doesNotMatch(stats, /USD -20\.00/,
    "A denied sales source cannot certify a costs-only subtotal as net profit");
  assert.match(result.all, /No se pudieron leer las ventas|Sales could not be read|parcial|partial|incomplet|no disponible/i,
    "The owner must know that the sales source is incomplete or unavailable");
});
