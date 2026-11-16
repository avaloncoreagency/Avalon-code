const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

function loadData() {
  const mod = { exports: {} };
  const javascript = ts.transpileModule(fs.readFileSync("src/lib/os/data.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(javascript, {
    exports: mod.exports, module: mod, require: value => {
      if (value === "server-only") return {};
      throw new Error("Unexpected module: " + value);
    },
  });
  return mod.exports;
}

const client = "11111111-1111-4111-8111-111111111111";
function dbStub() {
  const calls = [];
  const query = {
    select(...args) { calls.push(["select", ...args]); return this; },
    eq(...args) { calls.push(["eq", ...args]); return this; },
    neq(...args) { calls.push(["neq", ...args]); return this; },
    order(...args) { calls.push(["order", ...args]); return this; },
    limit(...args) { calls.push(["limit", ...args]); return this; },
    range(...args) { calls.push(["range", ...args]); return this; },
    then(resolve, reject) { return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject); },
  };
  return { calls, from(name) { calls.push(["from", name]); return query; } };
}

test("all six portfolios filter by the canonical client FK, not matching business names", async () => {
  const { listProjects } = loadData();
  for (const serviceModule of ["website", "ecommerce", "crm_creator", "receptionist", "chatbots", "marketing"]) {
    const db = dbStub();
    const result = await listProjects(db, serviceModule, { includeArchived: true, page: 2, clientId: client });
    assert.equal(result.error, null);
    assert.deepEqual(db.calls.filter(x => x[0] === "eq"), [["eq", "module", serviceModule], ["eq", "client_id", client]]);
    assert.ok(db.calls.some(x => x[0] === "range" && x[1] === 50 && x[2] === 99), serviceModule);
    assert.ok(!db.calls.some(x => x[0] === "neq" && x[1] === "status"), "archived included only when explicitly requested");
  }
});

test("unfiltered global portfolios stay global; archived products are hidden by default", async () => {
  const db = dbStub();
  await loadData().listProjects(db, "website", { page: 1 });
  assert.deepEqual(db.calls.filter(x => x[0] === "eq"), [["eq", "module", "website"]]);
  assert.ok(db.calls.some(x => x[0] === "neq" && x[1] === "status" && x[2] === "archived"));
});

test("deep links, pagination and selected company stay client-specific across all modules", () => {
  const routes = [
    "website-designer", "ecommerce-designer", "crm-creator", "marketing-hub", "ai-chatbots", "ai-receptionist",
  ];
  for (const route of routes) {
    const path = "src/app/admin/workspace/" + route + "/page.tsx";
    const s = fs.readFileSync(path, "utf8");
    assert.match(s, /isUuid\(clientParam\)/, path);
    assert.match(s, /clientId: scopedClientId/, path);
    assert.match(s, /prefillClientId=\{scopedClientId\}/, path);
  }
  const portfolio = fs.readFileSync("src/components/os/projects.tsx", "utf8");
  assert.match(portfolio, /params\.set\('client', scopedClientId\)/);
  assert.match(portfolio, /params\.set\('page', String\(nextPage\)\)/);
  assert.match(portfolio, /focusedClient/);
  assert.match(portfolio, /availableClients/);
  assert.match(portfolio, /Ver todos los clientes/);
});

test("Communication Hub scopes both its client roster and its agent counts and pagination", () => {
  const hub = fs.readFileSync("src/app/admin/workspace/ai-communications/page.tsx", "utf8");
  const listing = fs.readFileSync("src/components/communications/communications-portfolio.tsx", "utf8");
  assert.match(hub, /projectQuery = projectQuery\.eq\("client_id",scopedClientId\)/);
  assert.match(hub, /moduleCount/);
  assert.match(hub, /clientFilter=\{scopedClientId\}/);
  assert.match(listing, /params\.set\("client", clientFilter\)/);
  assert.match(listing, /pagerHref\(page[+-]1\)/);
});

test("Client 360 counts all linked projects without misrepresenting a 100-item list as a total", () => {
  const page = fs.readFileSync("src/app/admin/workspace/crm/clients/[id]/page.tsx", "utf8");
  const overview = fs.readFileSync("src/components/sales/client-overview.tsx", "utf8");
  assert.match(page, /select\(PROJECT_COLUMNS, \{ count: "exact" \}\)\.eq\("client_id", id\)/);
  assert.match(page, /projects\.count > \(projects\.data\?\.length \?\? 0\)/);
  assert.match(overview, /area\.href\}\$\{search/);
  assert.match(overview, /Vincular otro proyecto por ID/);
  assert.match(overview, /nextStepsUnavailable/);
  assert.match(overview, /latestUnavailable/);
  assert.match(fs.readFileSync("src/app/admin/workspace/crm/clients/project-actions.ts", "utf8"),
    /\.is\("client_id", null\)\.eq\("version", project\.data\.version\)/);
});
