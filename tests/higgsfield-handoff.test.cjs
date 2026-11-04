const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load() {
  const source = fs.readFileSync("src/lib/os/creative-company.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", js)(name => {
    if (name === "server-only") return {};
    throw Error("Unexpected import: " + name);
  }, exports);
  return exports;
}
const d = load();

function db({ rows = [], error = null, insertedId = "new-synthetic-lead" } = {}) {
  const calls = [];
  const q = {
    select: () => q,
    eq: (...args) => { calls.push(["eq", ...args]); return q; },
    ilike: (...args) => { calls.push(["ilike", ...args]); return q; },
    limit: async () => ({ data: rows, error }),
  };
  return {
    calls,
    from: table => {
      assert.equal(table, "crm_leads");
      return {
        select: q.select,
        insert: payload => {
          calls.push(["insert", payload]);
          return { select: () => ({ single: async () => ({ data: { id: insertedId }, error: null }) }) };
        },
      };
    },
  };
}
test("creative reference is a bounded source identity, not an arbitrary URL or executable markup", () => {
  assert.equal(d.parseCreativeRef("website_42-abc"), "website_42-abc");
  assert.equal(d.parseCreativeRef(""), "");
  assert.throws(() => d.parseCreativeRef("https://example.org/?token=secret"));
  assert.throws(() => d.parseCreativeRef("<script>alert(1)</script>"));
  assert.throws(() => d.parseCreativeRef("z".repeat(121)));
  assert.equal(d.exactCompanyName("  Demo   Dental  "), "Demo Dental");
  assert.throws(() => d.exactCompanyName("Invalid\nCompany"));
  assert.equal(d.exactMatches([{id:"a",company:"Demo Dental"},{id:"b",company:"Different"}],"demo dental").length,1);
});
test("existing exact company reuses the CRM lead without creating another or changing sales", async () => {
  const mock = db({ rows: [{ id:"existing-id", company:"Demo Dental" }] });
  const resolved = await d.resolveOrCreateProductLead(mock, "synthetic-owner", "Demo Dental");
  assert.deepEqual(resolved, {ok:true,id:"existing-id",created:false});
  assert.equal(mock.calls.filter(c => c[0] === "insert").length,0);
});
test("one new company produces only a new-stage CRM lead with no fabricated contact or sale", async () => {
  const mock = db();
  const resolved = await d.resolveOrCreateProductLead(mock, "synthetic-owner", "Demo Dental");
  assert.deepEqual(resolved, {ok:true,id:"new-synthetic-lead",created:true});
  const payload = mock.calls.find(c => c[0] === "insert")?.[1];
  assert.equal(payload.company, "Demo Dental");
  assert.equal(payload.stage_id,"new");
  assert.equal(payload.owner_id,"synthetic-owner");
  assert.equal(payload.email,null);
  assert.equal(payload.contact,"");
  assert.equal(payload.value,0);
  assert.equal(payload.probability,0);
  assert.equal(mock.calls.filter(c => c[0] === "insert").length,1);
});
test("ambiguous matching or database errors fail closed without writes", async () => {
  const duplicates=db({rows:[{id:"a",company:"Same Co"},{id:"b",company:"same co"}]});
  assert.deepEqual(await d.resolveOrCreateProductLead(duplicates,"owner","Same Co"),{ok:false,error:"ambiguous"});
  assert.equal(duplicates.calls.some(c=>c[0]==="insert"),false);
  const failed=db({error:{code:"42501"}});
  assert.deepEqual(await d.resolveOrCreateProductLead(failed,"owner","Demo Dental"),{ok:false,error:"unavailable"});
  assert.equal(failed.calls.some(c=>c[0]==="insert"),false);
});
test("generated product registration stays owner-only and uses existing project libraries and company links", () => {
  const action=fs.readFileSync("src/app/admin/workspace/project-actions.ts","utf8");
  const form=fs.readFileSync("src/components/os/projects.tsx","utf8");
  const company=fs.readFileSync("src/app/admin/workspace/clients/[id]/page.tsx","utf8");
  const pipeline=fs.readFileSync("src/components/crm/lead-board.tsx","utf8");
  assert.match(action, /ownerForAction\(\)/);
  assert.match(action, /resolveOrCreateProductLead\(/);
  assert.match(action, /settings->creative->>external_ref/);
  assert.match(action, /state: "reference_only"/);
  assert.match(form, /name="company_name"/);
  assert.match(form, /name="higgsfield_ref"/);
  assert.match(company, /settings->operations->>client_lead_id/);
  assert.match(pipeline, /\/admin\/workspace\/clients\/\$\{String\(lead.id\)\}/);
  assert.doesNotMatch(action, /service_role|SERVICE_ROLE/);
});
