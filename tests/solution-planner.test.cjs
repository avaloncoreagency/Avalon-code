const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("src/lib/service-factory/planner.ts","utf8");
const compiled = ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const moduleLike={exports:{}};
new Function("module","exports",compiled)(moduleLike,moduleLike.exports);
const p=moduleLike.exports;
const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
const C="33333333-3333-4333-8333-333333333333";
const defaultForm={
  idempotency_key:A,
  title:"Web + Captación para cliente",
  client_id:B,
  industry:"Servicios locales",
  problem:"Leads sin seguimiento",
  objective:"Registrar cada contacto",
  assumptions:"Datos sintéticos solamente",
  hourly_rate:"50",
  contingency_percent:"10",
  line_0_service:B,
  line_0_quantity:"2",
  line_0_price:"2000",
  line_1_service:C,
  line_1_quantity:"1",
  line_1_price:"",
  line_2_service:"",
  line_2_quantity:"1",
  line_2_price:"",
  line_3_service:"",
  line_3_quantity:"1",
  line_4_service:"",
  line_4_quantity:"1",
};
const form=v=>({get:key=>(key in v?v[key]:null)});
const parse=v=>p.parseSolutionPlanForm(form({...defaultForm,...v}));
const error=v=>{try{parse(v);return null;}catch(e){return e.code??e.message;}};

test("Solution Planner parses bounded, deduplicated multi-SKU package drafts",()=>{
  let x;
  try { x=parse({}); } catch(e) {
    const regs=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    throw new Error(`debug baseline parser: ${e.code}; UUIDs valid=${[A,B,C].map(v=>regs.test(v)).join(',')}; parser=${p.parseSolutionPlanForm.toString().slice(0,700)}`);
  }
  assert.equal(x.currency,"USD");
  assert.equal(x.idempotency_key,A);
  assert.equal(x.client_id,B);
  assert.deepEqual(x.lines,[
    {service_id:B,quantity:2,unit_price:"2000"},
    {service_id:C,quantity:1,unit_price:null},
  ]);
  assert.equal(x.hourly_rate,"50");
  assert.equal(x.contingency_percent,"10");
  assert.ok(!Object.hasOwn(parse({client_id:""}),"client_id"));
});

test("Validation rejects duplicate SKUs, bad pricing, tampered ids and large inputs",()=>{
  assert.equal(error({line_1_service:B}),"duplicate");
  assert.equal(error({line_0_service:"broken"}),"invalid");
  assert.equal(error({client_id:"broken"}),"invalid");
  assert.equal(error({line_0_quantity:"0"}),"lines");
  assert.equal(error({line_0_quantity:"11"}),"lines");
  assert.equal(error({line_0_price:"1e3"}),"amount");
  assert.equal(error({line_0_price:"-10"}),"amount");
  assert.equal(error({line_0_price:"100.001"}),"amount");
  assert.equal(error({line_0_price:"100000001"}),"amount");
  assert.equal(error({hourly_rate:"100000.01"}),"amount");
  assert.equal(error({contingency_percent:"40.01"}),"amount");
  assert.equal(error({line_1_service:"",line_1_price:"100"}),"lines");
  assert.equal(error({objective:"x".repeat(2001)}),"too_long");
  assert.equal(error({title:"  "}),"missing");
  assert.equal(error({title:"yo"}),"missing");
  assert.equal(error({problem:"hola\u0000mundo"}),"too_long");
});

test("Estimate groups one-time vs monthly money; never adds billing periods",()=>{
  const lines=[
    {billing_type:"one_time",quantity:2,unit_price:"2000",direct_cost:"100",estimated_hours:"8"},
    {billing_type:"monthly",quantity:1,unit_price:"700",direct_cost:"100",estimated_hours:"3"},
  ];
  const out=p.estimateByCadence(lines,"50","10");
  assert.equal(out.length,2);
  assert.deepEqual([out[0].revenueCents,out[0].directCostCents,out[0].laborCents,
    out[0].totalCostCents,out[0].marginCents,out[0].marginPercent],
    [400000,20000,80000,110000,290000,72.5]);
  assert.deepEqual([out[1].revenueCents,out[1].totalCostCents,out[1].marginCents],
    [70000,27500,42500]);
  assert.equal(p.showUsd(42500,"en"),"$425.00");
});

test("Unknown costs or hours stay unknown instead of becoming false profits",()=>{
  const lines=[
    {billing_type:"one_time",quantity:1,unit_price:"1200",direct_cost:null,estimated_hours:"12"},
  ];
  const out=p.estimateByCadence(lines,"50","0");
  assert.equal(out[0].revenueCents,120000);
  assert.equal(out[0].directCostCents,null);
  assert.equal(out[0].totalCostCents,null);
  assert.equal(out[0].marginCents,null);
  assert.equal(out[0].marginPercent,null);
  const other=p.estimateByCadence([
    {billing_type:"annual",quantity:1,unit_price:null,direct_cost:"0",estimated_hours:"1"},
  ],null,"0");
  assert.equal(other[0].revenueCents,null);
  assert.equal(other[0].laborCents,null);
  assert.equal(other[0].marginCents,null);
  assert.equal(p.showUsd(null,"es"),"Sin datos");
});

test("Planner remains owner-only, non-public and explicitly separate from sales",()=>{
  const sql=fs.readFileSync("supabase/migrations/20261102220000_solution_planner_internal.sql","utf8");
  const actions=fs.readFileSync("src/app/admin/service-factory/planner/actions.ts","utf8");
  const index=fs.readFileSync("src/app/admin/service-factory/planner/page.tsx","utf8");
  const detail=fs.readFileSync("src/app/admin/service-factory/planner/[id]/page.tsx","utf8");
  assert.match(sql,/enable row level security/);
  assert.match(sql,/crm_private\.is_owner\(\)/);
  assert.match(sql,/unique\(plan_id,service_id\)/);
  assert.match(sql,/on conflict \(idempotency_key\) do nothing/);
  assert.doesNotMatch(sql,/create table public\.crm_clients|create table public\.crm_sales/);
  assert.match(actions,/await ownerForAction\(\)/);
  assert.match(index,/await requireOwner\(\)/);
  assert.match(detail,/await requireOwner\(\)/);
  assert.match(detail,/Open Sales \(select services manually\)/);
});
