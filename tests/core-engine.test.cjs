// Core Engine request builders and error mapping (src/lib/sales/core-engine.ts). Pure functions, synthetic input.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync("src/lib/sales/core-engine.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { normalizeMoney, buildInvoiceRequest, buildCommissionRequest, coreEngineMessage } = mod.exports;
const SALE = "90000000-0000-4000-8000-000000000011";

test("money is normalized as exact decimal text, never a float", () => {
  assert.equal(normalizeMoney("1.234,50"), "1234.50");
  assert.equal(normalizeMoney("1,234.50"), "1234.50");
  assert.equal(normalizeMoney(" $1200 "), "1200");
  assert.equal(normalizeMoney("0.1"), "0.1");
  assert.equal(normalizeMoney("1.234.567,8"), "1234567.8");
  assert.equal(normalizeMoney("12,5"), "12.5");
  for (const bad of ["0", "-5", "1.234", "1,234", "abc", "", "1e3", "12.345", null, undefined]) assert.equal(normalizeMoney(bad), null, String(bad));
});

test("invoice request validation", () => {
  assert.deepEqual(buildInvoiceRequest({ sale_id: SALE, number: " F-1 ", amount: "1.200,05", issued_on: "2026-11-17" }),
    { ok: true, value: { sale_id: SALE, number: "F-1", amount: "1200.05", issued_on: "2026-11-17" } });
  assert.equal(buildInvoiceRequest({ sale_id: "x", number: "F", amount: "1" }).ok, false);
  assert.equal(buildInvoiceRequest({ sale_id: SALE, number: "", amount: "1" }).ok, false);
  assert.equal(buildInvoiceRequest({ sale_id: SALE, number: "F", amount: "-1" }).ok, false);
  assert.equal(buildInvoiceRequest({ sale_id: SALE, number: "F", amount: "1", due_on: "17/11/2026" }).ok, false);
  assert.equal(buildInvoiceRequest({ sale_id: SALE, number: "F", amount: "1", attachment_id: "nope" }).ok, false);
});

test("commission request needs a written basis, one beneficiary and one value; no default percentage", () => {
  const base = { sale_id: SALE, kind: "referral", basis: "Acuerdo escrito REF-001", beneficiary_name: "Referente" };
  assert.deepEqual(buildCommissionRequest({ ...base, rate_pct: "10" }), { ok: true, value: { sale_id: SALE, kind: "referral", basis: "Acuerdo escrito REF-001", beneficiary_name: "Referente", rate_pct: "10" } });
  assert.equal(buildCommissionRequest({ ...base }).ok, false, "neither rate nor fixed");
  assert.equal(buildCommissionRequest({ ...base, rate_pct: "10", fixed_amount: "50" }).ok, false, "both");
  assert.equal(buildCommissionRequest({ ...base, rate_pct: "150" }).ok, false);
  assert.equal(buildCommissionRequest({ ...base, basis: "corto", rate_pct: "5" }).ok, false);
  assert.equal(buildCommissionRequest({ ...base, beneficiary_id: SALE, rate_pct: "5" }).ok, false, "two beneficiaries");
  assert.equal(buildCommissionRequest({ ...base, kind: "bonus", rate_pct: "5" }).ok, false);
});

test("database errors map to owner-facing messages without SQL", () => {
  assert.match(coreEngineMessage({ message: "invoice_exceeds_sale_total" }), /superaría el valor contratado/);
  assert.match(coreEngineMessage({ message: 'duplicate key value violates unique constraint "crm_payments_sale_reference_unique"' }), /referencia de pago ya está registrada/);
  assert.match(coreEngineMessage({ code: "42501", message: "permission denied for table crm_invoices" }), /Miguel o Samuel/);
  const unknown = coreEngineMessage({ message: 'relation "x" does not exist' });
  assert.doesNotMatch(unknown, /relation|select|crm_/);
});

test('localized errors never expose raw SQL or arbitrary server messages', () => {
  for(const lang of ['es','en']) {
    const out=coreEngineMessage({message:'sensitive SQL password=never_expose',code:'XX000'},lang);
    assert.doesNotMatch(out,/SQL|password|never_expose/);
  }
  assert.match(coreEngineMessage({message:'commission_requires_verified_payment'},'en'),/verified payment/);
});

function adapter() {
  const js=ts.transpileModule(fs.readFileSync('src/lib/sales/core-engine-server.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const server={exports:{}};
  new Function('module','exports','require',js)(server,server.exports,id=>id==='server-only'?{}:id==='./core-engine'?mod.exports:{});
  return server.exports;
}
test('sale operation refuses a cross-sale record before a money mutation', async()=>{
  const calls=[];
  const db={rpc:async(name)=>{calls.push(name);return{data:{client_id:'client'},error:null};},from:table=>{
    const conditions={};const chain={select(){return this;},eq(k,v){conditions[k]=v;return this;},async maybeSingle(){
      if(table==='crm_sales')return {data:{id:SALE,client_id:'client'},error:null};
      assert.equal(conditions.sale_id,SALE); return {data:null,error:null};
    }};return chain;
  }};
  const out=await adapter().runSaleOperation(db,SALE,'reverse',{id:'payment-from-other-sale',reason:'synthetic correction'});
  assert.equal(out.ok,false);assert.deepEqual(calls,['crm_client_finance_ledger']);
});
test('old production schema reports unavailable and makes no writes',async()=>{
  const db={rpc:async()=>({data:null,error:{code:'PGRST202'}})};
  const out=await adapter().loadClientLedger(db,'synthetic');
  assert.equal(out.ok,false);assert.equal(out.unavailable,true);
});
