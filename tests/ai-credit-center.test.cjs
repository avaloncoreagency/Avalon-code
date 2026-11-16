const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync("src/lib/ai-credits/model.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = {exports:{}};
new Function("module","exports",js)(mod,mod.exports);
const {ACCOUNTS, acceptedMetric, normalizeObservation, latestSnapshots}=mod.exports;
const sample = { account_key:"claude_miguel", seat_key:null, metric_key:"quota_used_pct",
  amount:82, quota_window:"weekly", source_label:"Claude Pro settings / Usage" };

test("four account buckets and two separated Claude Pro quotas",()=>{
  assert.deepEqual(ACCOUNTS.map(a=>a.key),["chatgpt_business","claude_miguel","claude_samuel","higgsfield_team"]);
  assert.equal(acceptedMetric("claude_miguel",null,"quota_used_pct"),true);
  assert.equal(acceptedMetric("claude_samuel",null,"quota_used_pct"),true);
  assert.equal(acceptedMetric("claude_samuel","miguel","quota_used_pct"),false);
  assert.equal(acceptedMetric("higgsfield_team","miguel","credits_available"),false);
  assert.equal(acceptedMetric("higgsfield_team",null,"credits_available"),true);
  assert.equal(acceptedMetric("chatgpt_business","miguel","quota_used_pct"),true);
  assert.equal(acceptedMetric("chatgpt_business",null,"credits_available"),true);
  assert.equal(acceptedMetric("chatgpt_business","samuel","credits_available"),false);
});
test("strict validation and units prevent mixing credits across providers",()=>{
  assert.deepEqual(normalizeObservation(sample),{
    account_key:"claude_miguel", seat_key:null, metric_key:"quota_used_pct",
    unit:"%", quota_window:"weekly", amount:82,limit_value:null,period_start:null,period_end:null,
    source_label:"Claude Pro settings / Usage"
  });
  assert.throws(()=>normalizeObservation({...sample,account_key:"higgsfield_team"}),/incompatibles/);
  assert.throws(()=>normalizeObservation({...sample,amount:120}),/100/);
  assert.throws(()=>normalizeObservation({...sample,amount:null}),/numérico/);
  assert.throws(()=>normalizeObservation({...sample, source_label:""}),/fuente/);
  assert.throws(()=>normalizeObservation({...sample,period_end:"2026-12-01T00:00:00Z"}),/periodo/);
  assert.throws(()=>normalizeObservation({...sample,period_start:"2026-12-01T00:00:00Z",period_end:"2026-11-01T00:00:00Z"}),/periodo/);
});
test("shared snapshots are counted once, latest per account/seat/metric",()=>{
  const rows=[
    {id:"1",account_key:"higgsfield_team",seat_key:null,metric_key:"credits_available",quota_window:null,observed_at:"2026-11-10T00:00:00Z"},
    {id:"2",account_key:"higgsfield_team",seat_key:null,metric_key:"credits_available",quota_window:null,observed_at:"2026-11-15T00:00:00Z"},
    {id:"3",account_key:"claude_miguel",seat_key:null,metric_key:"quota_used_pct",quota_window:"weekly",observed_at:"2026-11-15T00:00:00Z"},
    {id:"4",account_key:"claude_samuel",seat_key:null,metric_key:"quota_used_pct",quota_window:"weekly",observed_at:"2026-11-15T00:00:00Z"},
  ];
  rows.push({id:"5",account_key:"claude_miguel",seat_key:null,metric_key:"quota_used_pct",quota_window:"session",observed_at:"2026-11-15T00:00:00Z"});
  assert.deepEqual(latestSnapshots(rows).map(r=>r.id),["2","3","4","5"]);
  assert.throws(()=>normalizeObservation({...sample,quota_window:null}),/tipo de cuota/);
});
test("no provider secret is stored in the observation schema or model",()=>{
  const schema=fs.readFileSync("supabase/migrations/20261116130000_ai_credit_center_owners.sql","utf8");
  assert.match(schema,/enable row level security/);
  assert.match(schema,/crm_private\.is_owner/);
  assert.match(schema,/recorded_by := auth\.uid\(\)/);
  assert.match(schema,/grant select, insert on public\.avalon_ai_credit_snapshots/);
  assert.doesNotMatch(schema,/grant update|grant delete/i);
  assert.doesNotMatch(schema,/api_key|access_token|password/i);
});
