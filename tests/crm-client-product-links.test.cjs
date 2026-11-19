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
  assert.match(overview, /\?edit=1#client-edit/);
  assert.match(overview, /leadStage \|\| pick\(lang, "Sin oportunidad vinculada"/);
  assert.match(page, /leadStage=\{lead\?\.data\?\.crm_stages\?\.label \?\? lead\?\.data\?\.stage_id \?\? null\}/);
  assert.match(page, /<ClientEditPanel/);
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

test("unlinked customers have honest status and remain owner-managed without unreviewed RPCs", () => {
  const page = source("src/app/admin/workspace/crm/clients/[id]/page.tsx");
  const actions = source("src/app/admin/workspace/crm/clients/actions.ts");
  assert.match(page, /!c\.origin_lead_id/);
  assert.match(page, /No linked sales opportunity/);
  assert.match(page, /<ClientEditPanel/);
  assert.doesNotMatch(actions, /crm_register_client_with_opportunity|crm_ensure_client_opportunity/);
});
