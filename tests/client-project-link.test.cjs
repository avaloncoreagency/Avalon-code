const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const source = fs.readFileSync("src/lib/crm/client-project-link.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleObject = { exports: {} };
const leadId = x => {
  const found = x?.operations?.client_lead_id;
  return typeof found === "string" && /^[0-9a-f-]{36}$/i.test(found) ? found : null;
};
vm.runInNewContext(compiled, {
  module: moduleObject, exports: moduleObject.exports,
  require: spec => {
    if (spec === "@/lib/os/client-hud") return { clientId: leadId };
    throw new Error("Unexpected import " + spec);
  },
});
const { checkClientProjectLink } = moduleObject.exports;
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const sourceLead = "33333333-3333-4333-8333-333333333333";
const foreignLead = "44444444-4444-4444-8444-444444444444";
const client = { id: a, status: "active", origin_lead_id: sourceLead };
const project = { client_id: null, status: "draft", settings: {} };

test("unlinked projects can be attached to a confirmed client when references agree", () => {
  assert.equal(checkClientProjectLink(client, project), "ok");
  assert.equal(checkClientProjectLink(client, { ...project, settings: { operations: { client_lead_id: sourceLead } } }), "ok");
});

test("linking rejects stale, foreign, archived and mismatched references", () => {
  assert.equal(checkClientProjectLink(client, { ...project, client_id: b }), "another_client");
  assert.equal(checkClientProjectLink(client, { ...project, client_id: a }), "already_linked");
  assert.equal(checkClientProjectLink(client, { ...project, status: "archived" }), "archived");
  assert.equal(checkClientProjectLink({ ...client, status: "archived" }, project), "archived");
  assert.equal(checkClientProjectLink(client, { ...project, settings: { operations: { client_lead_id: foreignLead } } }), "lead_mismatch");
  assert.equal(checkClientProjectLink({ ...client, origin_lead_id: null }, { ...project, settings: { operations: { client_lead_id: sourceLead } } }), "lead_mismatch");
});

test("server action verifies owner membership, FK and transaction concurrency", () => {
  const action = fs.readFileSync("src/app/admin/workspace/crm/clients/project-actions.ts", "utf8");
  assert.match(action, /ownerForAction\(\)/);
  assert.match(action, /checkClientProjectLink/);
  assert.match(action, /crm_work_orders/);
  assert.match(action, /crm_tasks/);
  assert.match(action, /\.is\("client_id", null\)\.eq\("version", project\.data\.version\)/);
  assert.match(action, /revalidatePath\(path\)/);
});
