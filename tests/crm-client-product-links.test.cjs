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

test("unlinked clients keep an honest status and use only approved owner-gated opportunity RPCs", () => {
  const page = source("src/app/admin/workspace/crm/clients/[id]/page.tsx");
  const actions = source("src/app/admin/workspace/crm/clients/actions.ts");
  const sql = source("supabase/migrations/20261119143838_crm_client_opportunity_registration.sql");
  assert.match(page, /!c\.origin_lead_id/);
  assert.match(page, /Esta ficha no tiene un lead vinculado/);
  assert.match(page, /<ClientEditPanel/);
  assert.match(actions, /ownerForAction\(\)/);
  assert.match(actions, /crm_register_client_with_opportunity/);
  assert.match(actions, /crm_ensure_client_opportunity/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /crm_private\.is_owner\(\)/);
  assert.match(sql, /revoke all on function public\.crm_ensure_client_opportunity\(uuid\) from public,anon,authenticated/);
});
