const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ID = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://avalon.example.invalid";
const ROUTE = "src/app/admin/workspace/crm/pipeline/files/route.ts";

function uploadRoute({ owner = true, targetPresent = true } = {}) {
  const calls = [];
  let inserted = null;
  class JsonResponse extends Response {
    static json(obj, options = {}) {
      return new Response(JSON.stringify(obj), { ...options, headers: { ...options.headers, "content-type": "application/json" } });
    }
  }
  const db = {
    from(table) {
      calls.push(table);
      if (table === "crm_leads" || table === "crm_clients") {
        const chain = { select: () => chain, eq: () => chain,
          maybeSingle: async () => ({ data: targetPresent ? { id: table === "crm_clients" ? ID : LEAD } : null, error: null }) };
        return chain;
      }
      assert.equal(table, "crm_attachments");
      return { insert: row => { inserted = row; return { select: () => ({
        single: async () => ({ data: { id: ID }, error: null })
      }) }; } };
    }
  };
  const mocks = {
    "next/server": { NextResponse: JsonResponse },
    "@/lib/auth/session": { getOwnerSession: async () => owner ? { supabase: db } : null },
    "@/lib/crm/attachments": { ATTACHMENT_MAX_BYTES: 5 * 1024 * 1024, attachmentMime: () => "application/pdf" }
  };
  const filename = path.resolve(ROUTE);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = module.paths;
  const oldRequire = m.require.bind(m);
  m.require = dep => Object.hasOwn(mocks, dep) ? mocks[dep] : oldRequire(dep);
  m._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename);
  return { POST: m.exports.POST, calls, get inserted() { return inserted; } };
}

function form({ lead = "", client = "" } = {}) {
  const data = new FormData();
  if (lead) data.set("lead", lead);
  if (client) data.set("client", client);
  data.set("note", "Synthetic QA");
  data.set("file", new File(["%PDF-1.7\nQA"], "synthetic.pdf", { type: "application/pdf" }));
  return { headers: new Headers({ origin: ORIGIN }), nextUrl: new URL(ORIGIN + "/admin/workspace/crm/pipeline/files"), formData: async () => data };
}

test("authenticated owner can upload a client attachment without creating a lead", async () => {
  const api = uploadRoute();
  const response = await api.POST(form({ client: ID }));
  assert.equal(response.status, 201);
  assert.deepEqual(api.calls, ["crm_clients", "crm_attachments"]);
  assert.equal(api.inserted.client_id, ID);
  assert.equal(api.inserted.lead_id, null);
  assert.ok(/^[a-f0-9]{64}$/.test(api.inserted.sha256));
  assert.equal(api.inserted.size_bytes, Buffer.byteLength("%PDF-1.7\nQA"));
});

test("the existing lead-only attachment flow is preserved", async () => {
  const api = uploadRoute();
  const response = await api.POST(form({ lead: LEAD }));
  assert.equal(response.status, 201);
  assert.deepEqual(api.calls, ["crm_leads", "crm_attachments"]);
  assert.equal(api.inserted.lead_id, LEAD);
  assert.equal(api.inserted.client_id, null);
});

test("anonymous, ambiguous, nonexistent and cross-origin uploads fail before inserting files", async () => {
  const anonymous = uploadRoute({ owner: false });
  assert.equal((await anonymous.POST(form({ client: ID }))).status, 403);
  assert.equal(anonymous.calls.length, 0);
  const ambiguous = uploadRoute();
  assert.equal((await ambiguous.POST(form({ client: ID, lead: LEAD }))).status, 400);
  assert.equal(ambiguous.calls.length, 0);
  const missing = uploadRoute({ targetPresent: false });
  assert.equal((await missing.POST(form({ client: ID }))).status, 404);
  assert.deepEqual(missing.calls, ["crm_clients"]);
  const foreign = uploadRoute();
  const wrongOrigin = form({ client: ID });
  wrongOrigin.headers.set("origin", "https://untrusted.example.invalid");
  assert.equal((await foreign.POST(wrongOrigin)).status, 403);
  assert.equal(foreign.calls.length, 0);
});

test("client dossier, project creation and navigation use stable IDs and real owner checks", () => {
  const page = fs.readFileSync("src/app/admin/workspace/crm/clients/[id]/page.tsx", "utf8");
  const overview = fs.readFileSync("src/components/sales/client-overview.tsx", "utf8");
  const clientActions = fs.readFileSync("src/app/admin/workspace/crm/clients/project-actions.ts", "utf8");
  const create = fs.readFileSync("src/components/os/projects.tsx", "utf8");
  const sales = fs.readFileSync("src/app/admin/workspace/crm/sales/page.tsx", "utf8");
  assert.match(page, /<ClientOverview/);
  assert.match(page, /<LeadAttachments clientId=\{c\.id\}/);
  assert.match(page, /MODULE_KEYS\.map/);
  assert.match(overview, /Indica.*cliente|Indicadores por cliente/);
  assert.match(overview, /Ecosistema de herramientas/);
  assert.match(create, /prefillClientId/);
  assert.match(clientActions, /ownerForAction\(\)/);
  assert.match(clientActions, /\.is\("client_id", null\)\.eq\("version", project\.data\.version\)/);
  assert.match(sales, /clientId \? \{ client_id: clientId \} : \{\}/);
  assert.match(sales, /rpc\("crm_sales_with_receivables"[^\n]+\.match\(filters\)/);
  assert.match(sales, /from\("crm_sales"\)[^\n]+\.match\(filters\)/);
  assert.match(sales, /!clientId && \(metrics\.error/);
  assert.doesNotMatch(page + overview, /eb442ca9-8991-4dd0-b7e9-648513613d5a|DEMO · Propuesta comercial simulada/);
});
