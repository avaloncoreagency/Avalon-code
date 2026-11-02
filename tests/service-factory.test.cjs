const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("src/lib/service-factory/domain.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const d = mod.exports;

const values = {
  code: "brand-identity", name: "Identidad de marca", name_en: "Brand identity",
  department_id: "marketing", billing_type: "one_time", suggested_price: "1200.00",
  family: "brand", readiness: "draft", deliverables: "Logo + brandbook",
  requirements: "Brand interview", exclusions: "Advertising spend",
  estimated_hours: "16.50", estimated_cost: "100.25",
  qa_checklist: "Logo aprobado\nEntrega editable",
  task_template: JSON.stringify([{ title: "Kickoff", offset_days: 1, priority: "high" }]),
  template_revision: "1",
};
const form = v => ({ get: key => (key in v ? v[key] : null) });
const parse = v => d.parseServiceCatalogForm(form({ ...values, ...v }));
const error = v => { try { parse(v); return null; } catch (e) { return e.code; } };

test("Service Factory accepts a complete, reviewed offer without inventing providers", () => {
  const x = parse({});
  assert.equal(x.code, "brand-identity");
  assert.equal(x.suggested_price, "1200.00");
  assert.equal(x.estimated_hours, "16.50");
  assert.equal(x.estimated_cost, "100.25");
  assert.deepEqual(x.qa_checklist, ["Logo aprobado", "Entrega editable"]);
  assert.deepEqual(x.task_template, [{ title: "Kickoff", offset_days: 1, priority: "high" }]);
  const body = d.serviceCatalogPayload(x);
  assert.equal(body.code, undefined, "codes cannot be edited through update payload");
  assert.equal(body.readiness, "draft");
  assert.equal(body.template_revision, 1);
});

test("SKU codes, categories, amounts and revisions reject invalid input", () => {
  assert.equal(error({ code: "DROP TABLE" }), "invalid_code");
  assert.equal(error({ code: "123" }), "invalid_code");
  assert.equal(error({ family: "made-up" }), "invalid_choice");
  assert.equal(error({ readiness: "active" }), "invalid_choice");
  assert.equal(error({ suggested_price: "1e3" }), "invalid_amount");
  assert.equal(error({ suggested_price: "-3" }), "invalid_amount");
  assert.equal(error({ estimated_cost: "1.999" }), "invalid_amount");
  assert.equal(error({ estimated_hours: "10000.01" }), "invalid_amount");
  assert.equal(error({ template_revision: "0" }), "invalid_revision");
  assert.equal(error({ name: "" }), "required");
  assert.equal(error({ name: "hi\u0000" }), "invalid_text");
  assert.equal(parse({ suggested_price: "", estimated_cost: "", estimated_hours: "" }).estimated_cost, null);
});

test("Task templates require valid bounded structured data", () => {
  assert.equal(error({ task_template: "oops" }), "invalid_template");
  assert.equal(error({ task_template: "{}" }), "invalid_template");
  assert.equal(error({ task_template: '[{"title":"a","offset_days":366}]' }), "invalid_template");
  assert.equal(error({ task_template: '[{"title":"a","priority":"unknown"}]' }), "invalid_template");
  assert.equal(error({ task_template: '[{"title":""}]' }), "invalid_template");
  assert.equal(error({ task_template: JSON.stringify(Array(26).fill({ title: "x" })) }), "invalid_template");
});

test("Quality checklist and text lengths are bounded", () => {
  assert.equal(error({ qa_checklist: Array(26).fill("QA").join("\n") }), "invalid_checklist");
  assert.equal(error({ qa_checklist: "X".repeat(141) }), "invalid_checklist");
  assert.equal(error({ exclusions: "x".repeat(4001) }), "too_long");
});

test("Service Factory remains private, in agency navigation and inactive on insert", () => {
  const page = fs.readFileSync("src/app/admin/service-factory/page.tsx", "utf8");
  const actions = fs.readFileSync("src/app/admin/service-factory/actions.ts", "utf8");
  const shell = fs.readFileSync("src/components/suite/suite.tsx", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20261102210000_service_factory_catalog_v2.sql", "utf8");
  assert.match(page, /await requireOwner\(/);
  assert.match(actions, /await ownerForAction\(\)/);
  assert.match(actions, /active: false/);
  assert.match(actions, /readiness !== "sellable"/);
  assert.match(actions, /\.eq\("version", version\)/);
  assert.match(shell, /href="\/admin\/service-factory"/);
  assert.match(migration, /alter table public\.crm_service_catalog/);
  assert.doesNotMatch(migration, /drop table|truncate|delete from/i);
});
