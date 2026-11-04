// Synthetic regression for the existing Radar -> Lead -> Sale -> Client chain.
// No Supabase, network, real records or sale confirmation is invoked here.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const read = file => fs.readFileSync(file, "utf8");
const section = read("src/app/admin/workspace/crm/[section]/page.tsx");
const crm = read("src/components/crm/crm.tsx");
const radar = read("src/components/crm/titan-radar.tsx");
const board = read("src/components/crm/lead-board.tsx");
const api = read("src/app/admin/workspace/crm/api/route.ts");
const newSale = read("src/app/admin/workspace/crm/sales/new/page.tsx");
const form = read("src/components/sales/sale-form.tsx");
const actions = read("src/app/admin/workspace/crm/sales/actions.ts");

test("Radar's exact lead deep-link reaches one owner-scoped pipeline card", () => {
  assert.match(radar, /leads\?lead=\$\{createdLeadId\}/);
  assert.match(section, /uuid\.test\(query\.lead\)/, "reject invalid link ids");
  assert.match(section, /focusLeadId=\{focusLeadId\}/);
  assert.match(crm, /id: focusedLead/, "send exact ID to existing API query");
  assert.match(crm, /page: String\(currentPage\)/, "avoid losing an older lead on page N");
  assert.match(api, /if \(p\.get\("id"\)\)/);
  assert.match(api, /query = query\.eq\("id", p\.get\("id"\)\)/);
  assert.match(api, /if \(!member\) return json\(\{ error: "No autorizado" \}, 403\)/);
  assert.match(crm, /Ver todo el pipeline/, "one-click escape from focused view");
});

test("both Kanban and table move a real lead to the prelinked sale form", () => {
  assert.match(board, /sales\/new\?lead=\$\{encodeURIComponent\(String\(lead\.id\)\)\}/);
  assert.match(crm, /sales\/new\?lead=\$\{encodeURIComponent\(String\(row\.id\)\)\}/);
  assert.match(board, /Registrar venta para/, "the action is accessible by company");
  assert.match(newSale, /requireOwner\(\)/);
  assert.match(newSale, /\.eq\("id", leadId\)\.eq\("archived", false\)\.maybeSingle\(\)/);
  assert.match(newSale, /leadChoices/, "older lead beyond the 300-item selector remains selectable");
  assert.match(newSale, /requestedLeadId && !sourceLead/, "stale, invalid, or missing leads do not silently become sales");
});

test("sale from a lead prefills only its verified company and exact source UUID", () => {
  assert.match(newSale, /lead_id: sourceLead\?\.id/);
  assert.match(newSale, /legal_name: sourceLead\?\.company/);
  assert.match(form, /defaults\.lead_id \? "new"/, "never pick an unrelated customer by default");
  assert.match(form, /name="lead_id"/);
  assert.match(actions, /parseSaleForm\(form\)/);
  assert.match(actions, /supabase\.rpc\("crm_confirm_sale"/, "only explicit confirmation writes a sale");
  assert.doesNotMatch(radar, /crm_confirm_sale/, "Radar cannot confirm a sale");
});

test("one synthetic sale payload keeps the exact Radar-origin lead without side effects", () => {
  const source = ts.transpileModule(read("src/lib/sales/domain.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", source)(require, mod, mod.exports);
  const leadId = "11111111-1111-4111-8111-111111111111";
  const fields = {
    idempotency_key: "22222222-2222-4222-8222-222222222222",
    client_mode: "new", legal_name: "Empresa Sintética",
    lead_id: leadId, line_0_service: "desarrollo-web", line_0_price: "1500",
  };
  const sale = mod.exports.parseSaleForm({ get: key => fields[key] ?? null });
  assert.equal(sale.lead_id, leadId);
  assert.equal(sale.new_client.legal_name, "Empresa Sintética");
  assert.equal(sale.lines[0].service_code, "desarrollo-web");
});

test("client project library, meetings and converted prospect return to the exact CRM lead", () => {
  const library = read("src/app/admin/workspace/clients/[id]/page.tsx");
  assert.ok(library.includes('/admin/workspace/crm/leads?lead=${id}'));
  assert.ok(crm.includes('/admin/workspace/crm/leads?lead=${row.lead_id}'));
  assert.ok(!library.includes('/admin/workspace/crm?lead='));
  assert.ok(!crm.includes('/admin/workspace/crm?lead='));
  const context = read("src/components/os/project-context.tsx");
  assert.ok(context.includes('/admin/workspace/crm/clients/${client.id}'), "product library retains Client 360 link");
});
