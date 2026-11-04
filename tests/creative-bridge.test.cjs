const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load() {
  const source = fs.readFileSync("src/lib/os/creative-bridge-protocol.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", js)(name => {
    if (name === "node:crypto") return require("node:crypto");
    throw Error("Unexpected import " + name);
  }, exports);
  return exports;
}
const api = load();
const now = 1793736000000;
const stamp = String(Math.floor(now / 1000));
const key = Buffer.alloc(32, 42);
const keys = JSON.stringify({ "codex-ci": { agent: "codex", secret_b64: key.toString("base64") } });
const handoff = {
  schema_version: 1, provider: "higgsfield", module: "website",
  source_ref: "synthetic-site_123", company_name: "Synthetic Dental LLC", existing_lead_id: null,
  product_name: "Synthetic website", description: "Preview only",
  project_url: "https://preview.example.com", repository_url: "",
};
const headers = (values) => ({ get: name => values[name] ?? null });
function signed(body = Buffer.from(JSON.stringify(handoff))) {
  return headers({
    "x-avalon-key-id": "codex-ci",
    "x-avalon-timestamp": stamp,
    "x-avalon-signature": api.signature(body, stamp, "codex-ci", key),
  });
}

test("signed synthetic delivery accepts only the configured agent key", () => {
  const body = Buffer.from(JSON.stringify(handoff));
  assert.deepEqual(api.authenticateCreativeDelivery(body, signed(body), keys, now),
    { agent: "codex", keyId: "codex-ci" });
  assert.equal(api.authenticateCreativeDelivery(Buffer.from(JSON.stringify({...handoff, module:"ecommerce"})),
    signed(body), keys, now), null, "tamper protection");
  assert.equal(api.authenticateCreativeDelivery(body, signed(body), keys, now + 301000), null, "expiry");
  assert.equal(api.authenticateCreativeDelivery(body, signed(body), undefined, now), null, "no credentials");
  assert.equal(api.authenticateCreativeDelivery(body, signed(body), JSON.stringify({
    "codex-ci": {agent:"codex",secret_b64:Buffer.alloc(8,7).toString("base64")}
  }), now), null, "weak key");
  const forged=headers({
    "x-avalon-key-id":"claude-ci", "x-avalon-timestamp":stamp,
    "x-avalon-signature":api.signature(body,stamp,"codex-ci",key)
  });
  assert.equal(api.authenticateCreativeDelivery(body, forged, keys, now), null, "cross-agent");
});

test("payload strictly routes 3 product types and cannot set prices, stages or contacts", () => {
  for (const kind of ["website","ecommerce","crm_creator"]) {
    assert.equal(api.parseCreativeDelivery({...handoff, module: kind}).module, kind);
  }
  for (const kind of ["marketing","sales","admin","hacker"]) {
    assert.throws(() => api.parseCreativeDelivery({...handoff, module: kind}), /invalid/);
  }
  for (const extra of ["sale_id","stage_id","email","phone","owner_id","service_role","notes"]) {
    assert.throws(() => api.parseCreativeDelivery({...handoff, [extra]:"attack"}), /invalid/);
  }
  assert.throws(() => api.parseCreativeDelivery({...handoff, source_ref:"bad/../../token"}));
  assert.throws(() => api.parseCreativeDelivery({...handoff, company_name:"x@y.com"}));
  assert.throws(() => api.parseCreativeDelivery({...handoff, company_name:""}));
  assert.throws(() => api.parseCreativeDelivery({...handoff, project_url:""}));
  assert.throws(() => api.parseCreativeDelivery({...handoff, project_url:"http://example.com"}));
  assert.throws(() => api.parseCreativeDelivery({...handoff, project_url:"https://user:secret@example.com"}));
  assert.throws(() => api.parseCreativeDelivery({...handoff, project_url:"https://example.com/?signed=secret"}));
  assert.throws(() => api.parseCreativeDelivery({...handoff, project_url:"https://127.0.0.1"}));
  assert.throws(() => api.parseCreativeDelivery({...handoff, project_url:"https://localhost"}));
  assert.throws(() => api.parseCreativeDelivery({...handoff, product_name:"x".repeat(121)}));
  assert.throws(() => api.parseCreativeDelivery({...handoff, existing_lead_id:"admin"}));
});
test("exactly one machine route bypasses the owner cookie gate, and has independent security checks", () => {
  const middleware = fs.readFileSync("src/lib/supabase/middleware.ts", "utf8");
  const route = fs.readFileSync("src/app/api/creative-bridge/deliveries/route.ts", "utf8");
  assert.match(middleware, /path === "\/api\/creative-bridge\/deliveries" && request.method === "POST"/);
  assert.match(route, /AVALON_CREATIVE_BRIDGE_ENABLED/);
  assert.match(route, /AVALON_CREATIVE_BRIDGE_PRODUCTION_APPROVED/);
  assert.match(route, /authenticateCreativeDelivery\(/);
  assert.match(route, /MAX_DELIVERY_BYTES/);
  assert.match(route, /persistSession: false/);
  assert.match(route, /auth\.signInWithPassword\(/);
  assert.doesNotMatch(route, /service_role|SERVICE_ROLE|SUPABASE_SECRET/);
  assert.match(route, /\.rpc\("os_receive_creative_delivery"/);
  assert.doesNotMatch(route, /getOwnerSession|requireOwner|setSession/);
});
test("database proposal restricts writes to a separately allowlisted machine identity", () => {
  const sql = fs.readFileSync("docs/sql/creative-bridge-registration.sql", "utf8");
  assert.match(sql, /REVIEW-ONLY SQL PROPOSAL/);
  assert.match(sql, /create unique index if not exists os_projects_higgsfield_source_unique/);
  assert.match(sql, /security invoker set search_path = ''/);
  assert.match(sql, /create table if not exists os_private\.creative_bridge_identities/);
  assert.match(sql, /security definer set search_path =/);
  assert.match(sql, /v_machine_id := auth\.uid\(\)/);
  assert.match(sql, /v_allowed_owner is distinct from p_owner_id/);
  assert.match(sql, /create or replace function os_private.is_creative_machine/);
  assert.match(sql, /grant execute on function os_private.is_creative_machine/);
  assert.doesNotMatch(sql, /context_token|creative_bridge_token/);
  assert.match(sql, /create or replace function crm_private.stamp/);
  assert.match(sql, /create or replace function crm_private.audit/);
  assert.match(sql, /TG_OP = 'INSERT' and TG_TABLE_NAME = 'crm_leads'/);
  assert.match(sql, /TG_OP = 'INSERT' and TG_TABLE_NAME = 'crm_activities'/);
  assert.match(sql, /new\.kind = 'system'/);
  assert.match(sql, /revoke all on function public\.os_receive_creative_delivery/);
  assert.match(sql, /to authenticated/);
  assert.match(sql, /pg_advisory_xact_lock/g);
  assert.match(sql, /v_daily_count >= 30/);
  assert.match(sql, /from public\.crm_leads/);
  assert.match(sql, /from public\.crm_clients/);
  assert.match(sql, /created_by, client_id/);
  assert.match(sql, /ambiguous client identity/);
  assert.match(sql, /insert into public\.os_projects/);
  assert.doesNotMatch(sql, /insert into public\.crm_sales|insert into public\.crm_payments/);
});

test("offline creative handoff validation checks exact protocol without exposing business identity",()=>{
 const os=require("node:os"),path=require("node:path");
 const cp=require("node:child_process");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"avalon-creative-preflight-"));
 try{
  const manifest=path.join(dir,"private.json");
  fs.writeFileSync(manifest,JSON.stringify(handoff),{mode:0o600});
  const run=()=>cp.spawnSync(process.execPath,["scripts/creative-bridge/validate.cjs",manifest],{
    encoding:"utf8",timeout:15000,
  });
  let response=run();
  assert.equal(response.status,0,response.stderr);
  const result=JSON.parse(response.stdout);
  assert.equal(result.valid,true);
  assert.equal(result.registration,"NOT_PERFORMED");
  assert.equal(result.asset_imported,false);
  assert.equal(result.module,"website");
  assert.ok(!response.stdout.includes(handoff.company_name));
  assert.ok(!response.stdout.includes(handoff.project_url));
  fs.writeFileSync(manifest,JSON.stringify({...handoff,module:"pricing"}));
  response=run();
  assert.equal(response.status,2);
  assert.ok(!response.stderr.includes(handoff.company_name));
  fs.writeFileSync(manifest," ".repeat(9000));
  assert.equal(run().status,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
