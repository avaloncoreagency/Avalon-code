const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const source = (path) => readFileSync(join(__dirname, "..", path), "utf8");

test("client-scoped product creation passes immutable confirmed client ID and suppresses unrelated lead selection", () => {
  const index = source("src/components/os/projects.tsx");
  assert.match(index, /name="client_id" value=\{scopedClient\.id\}/);
  assert.match(index, /hideClientLead=\{Boolean\(scopedClient\)\}/);
  assert.match(index, /!hideClientLead\|\|key!=='client_lead_id'/);
  assert.match(index, /!scopedClient && <details/);
  const action = source("src/app/admin/workspace/project-actions.ts");
  assert.match(action, /const confirmedClientId = uuidField\(form,"client_id"\)/);
  assert.match(action, /client_id: confirmedClientId/);
  assert.match(action, /if \(confirmedClientId && metadata\.client_lead_id && metadata\.client_lead_id !== originatingLead\)/);
});

test("client overview exposes editing, linking and honest stage without implicit sale", () => {
  const overview = source("src/components/sales/client-overview.tsx");
  const page = source("src/app/admin/workspace/crm/clients/[id]/page.tsx");
  assert.match(overview, /href="#client-tools"/);
  assert.match(overview, /href="#identity"/);
  assert.match(overview, /leadStage \|\| pick\(lang, "Sin oportunidad vinculada"/);
  assert.match(page, /leadStage=\{lead\?\.data\?\.crm_stages\?\.label \?\? lead\?\.data\?\.stage_id \?\? null\}/);
  assert.match(page, /<details open style=\{\{ marginTop: 12 \}\}><summary>\{pick\(lang, "Editar datos del cliente"/);
});


test("quick product wizard uses canonical company UUID and validates HTTPS server-side", () => {
  const overview = source("src/components/sales/client-overview.tsx");
  const action = source("src/app/admin/workspace/project-actions.ts");
  assert.match(overview, /action=\{createProject\}/);
  assert.match(overview, /name="client_id" value=\{client.id\}/);
  assert.match(overview, /name="url" type="url"/);
  assert.match(overview, /name="module" required/);
  assert.match(action, /if \(confirmedClientId && metadata.url\)/);
  assert.match(action, /\.eq\("client_id", confirmedClientId\)/);
});

test("sale form and server action do not silently win another company's lead", () => {
  const sale = source("src/app/admin/workspace/crm/sales/actions.ts");
  const salePage = source("src/app/admin/workspace/crm/sales/new/page.tsx");
  assert.match(sale, /request.lead_id && request.lead_id !== canonicalLead/);
  assert.match(sale, /if \(!request.lead_id && canonicalLead\) request.lead_id = canonicalLead/);
  assert.match(salePage, /origin_lead_id/);
  assert.match(salePage, /lead_id: sourceLead\?\.id \?\? chosenLeadId/);
});

test("new client registration and older-client repair use owner-only reviewed RPCs", () => {
  const action = source("src/app/admin/workspace/crm/clients/actions.ts");
  const page = source("src/app/admin/workspace/crm/clients/[id]/page.tsx");
  const sql = source("docs/sql/crm_client_opportunity_registration_review.sql");
  assert.match(action, /crm_register_client_with_opportunity/);
  assert.match(action, /crm_ensure_client_opportunity/);
  assert.match(page, /crm_client_opportunity_capability/);
  assert.match(sql, /security definer/);
  assert.match(sql, /revoke all on function public.crm_ensure_client_opportunity/);
  assert.doesNotMatch(sql, /grant execute[^\n]+to anon/);
});
