const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = path => fs.readFileSync(path, "utf8");

test("manual lead creation is the first primary control, before Radar and the pipeline workbench", () => {
  const route = read("src/app/admin/workspace/crm/[section]/page.tsx");
  const crm = read("src/components/crm/crm.tsx");
  const summary = read("src/components/crm/command-summary.tsx");
  assert.ok(route.indexOf("<Crm section=") < route.indexOf("<LeadWorkbench"), "pipeline must be before secondary dashboard");
  assert.ok(crm.indexOf('id="crm-create-lead"') < crm.indexOf('<header className={s.head}>'), "create action must be above header");
  assert.ok(crm.indexOf('id="crm-create-lead"') < crm.indexOf("<LeadBoard"), "create lead before pipeline");
  assert.doesNotMatch(summary, /href="\/admin\/workspace\/crm\/hunter">Radar \/ Lead Hunter<\/Link>/);
});

test("client edit panel updates canonical client and existing contacts via owner-gated versioned actions", () => {
  const page = read("src/app/admin/workspace/crm/clients/[id]/page.tsx");
  const panel = read("src/components/sales/client-edit-panel.tsx");
  const actions = read("src/app/admin/workspace/crm/clients/actions.ts");
  assert.match(page, /<ClientEditPanel /);
  assert.match(page, /edit=1#client-edit/);
  assert.match(page, /select\("id,version,full_name,email,phone,role,is_primary"\)/);
  assert.match(panel, /action=\{updateClient\}/);
  assert.match(panel, /action=\{updateContact\}/);
  assert.match(panel, /action=\{addContact\}/);
  assert.match(actions, /export async function updateContact/);
  assert.match(actions, /ownerForAction\(\)/);
  assert.match(actions, /\.eq\("client_id", clientId\)\.eq\("version", version\)/);
  assert.match(actions, /row\.notes = text\(form, "notes", 4000\)/);
});

test("full lead profile has a visible edit action with validated business, email and location fields", () => {
  const page = read("src/app/admin/workspace/crm/lead/[id]/page.tsx");
  const actions = read("src/app/admin/workspace/crm/lead/actions.ts");
  const board = read("src/components/crm/lead-timeline.tsx"); // edit link lives in the record, not on the card
  assert.match(page, /edit=1#lead-edit/);
  assert.match(page, /name="company"/);
  assert.match(page, /name="email" type="email"/);
  assert.match(page, /name="industry_key"/);
  assert.match(page, /name="zip"/);
  assert.match(actions, /if \(form\.has\("email"\)\)/);
  assert.match(actions, /if \(form\.has\("industry_key"\)\)/);
  assert.match(actions, /\.eq\("id", lead\)\.eq\("version", version\)/);
  assert.match(board, /edit=1#lead-edit/);
});
