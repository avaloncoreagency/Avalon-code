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
  assert.match(page, /leadStage=\{lead\?\.data\?\.stage_id \?\? null\}/);
  assert.match(page, /<details open style=\{\{ marginTop: 12 \}\}><summary>\{pick\(lang, "Editar datos del cliente"/);
});
