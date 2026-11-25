const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const ownerIdentity = require("../scripts/creative-bridge/continuity-loader.cjs")("supabase/functions/_shared/owners.ts");

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const INVITED = "00000000-0000-4000-8000-0000000000c3";
const SOURCE = "supabase/functions/staff-invite/index.ts";

function makeEdge({role="owner",missingOrigin=false,roster=0,inviteFails=false,enrolledMfa=false}={}) {
  const src = fs.readFileSync(SOURCE,"utf8");
  const js = ts.transpileModule(src,{compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
  }}).outputText;
  let handler;
  const calls=[];
  const env={
    SUPABASE_URL:"https://synthetic.supabase.co",
    SUPABASE_ANON_KEY:"public-test-key",
    SUPABASE_SERVICE_ROLE_KEY:"private-test-key",
    AVALON_OWNER_APP_ORIGIN:missingOrigin?undefined:"https://avaloncoreagency.com",
  };
  const Deno={env:{get:k=>env[k]},serve:fn=>{handler=fn;}};
  const fetch=async(url,init)=>{
    const u=new URL(url);
    calls.push({path:u.pathname,url:u.toString(),method:init.method||"GET",body:init.body||null,headers:init.headers||{}});
    let data;let status=200;
    if(u.pathname==="/auth/v1/user") data={id:OWNER,factors:enrolledMfa?[{status:"verified",factor_type:"totp"}]:[]};
    else if(u.pathname==="/rest/v1/agency_memberships"&&init.method==="POST") {
      data=null; status=201;
    } else if(u.pathname==="/rest/v1/staff_permission_events"&&init.method==="POST") {
      data=null; status=201;
    } else if(u.pathname==="/rest/v1/agency_memberships"&&u.searchParams.get("role")==="eq.operator") {
      data=Array.from({length:roster},(_,i)=>({user_id:String(i)}));
    } else if(u.pathname==="/rest/v1/agency_memberships") data=[{role}];
    else if(u.pathname==="/auth/v1/invite") {
      status=inviteFails?409:200;data=inviteFails?{error:"existing"}:{id:INVITED};
    } else throw Error("Unexpected request to "+u.toString());
    return new Response(data===null?"":JSON.stringify(data),{
      status,headers:{"content-type":"application/json"},
    });
  };
  new Function("Deno","fetch","require","exports",js)(Deno,fetch,id=>{
    assert.equal(id,"../_shared/owners.ts");
    return ownerIdentity;
  },{});
  assert.equal(typeof handler,"function");
  return {calls,handler};
}
function request(body,token="fake.user.jwt") {
  return new Request("https://synthetic.supabase.co/functions/v1/staff-invite",{
    method:"POST",headers:{"authorization":"Bearer "+token,"content-type":"application/json"},
    body:JSON.stringify({origin:"https://avaloncoreagency.com",...body}),
  });
}
test("pending operator invite is strictly owner-verified and never activated",async()=>{
  const edge=makeEdge();
  const resp=await edge.handler(request({email:" NEW.Employee@Example.invalid "}));
  assert.equal(resp.status,200);
  assert.deepEqual(await resp.json(),{invited:true,requires_owner_activation:true,audited:true});
  assert.deepEqual(edge.calls.map(x=>x.path),[
    "/auth/v1/user","/rest/v1/agency_memberships",
    "/rest/v1/agency_memberships","/auth/v1/invite",
    "/rest/v1/agency_memberships","/rest/v1/staff_permission_events",
  ]);
  // Retry-safe enrollment that can never overwrite an existing (owner) membership.
  assert.equal(new URL(edge.calls[4].url).searchParams.get("on_conflict"),"user_id");
  assert.match(edge.calls[4].headers.Prefer,/resolution=ignore-duplicates/);
  assert.doesNotMatch(edge.calls[4].headers.Prefer,/merge-duplicates/);
  assert.deepEqual(JSON.parse(edge.calls[5].body),{actor_id:OWNER,user_id:INVITED,action:"invitation_sent"},"audited without email or token");
  const sent=JSON.parse(edge.calls[3].body);
  assert.equal(sent.email,"new.employee@example.invalid");
  assert.equal(new URL(edge.calls[3].url).searchParams.get("redirect_to"),"https://avaloncoreagency.com/admin/signup");
  const added=JSON.parse(edge.calls[4].body);
  assert.deepEqual(added,{user_id:INVITED,role:"operator"});
  assert.ok(edge.calls.every(x=>!x.path.includes("staff_portal_access")),"no activation created");
  assert.equal(edge.calls[0].headers.Authorization,"Bearer fake.user.jwt");
  assert.ok(!srcContainsAdminSecret(edge.calls),"no service key included in the user-facing invite request");
});
function srcContainsAdminSecret(calls) {
  return String(calls.find(x=>x.path==="/auth/v1/invite")?.body).includes("private-test-key");
}
test("outsiders cannot invite or enumerate staff",async()=>{
  const edge=makeEdge({role:"operator"});
  const res=await edge.handler(request({email:"new@example.invalid"}));
  assert.equal(res.status,403);
  assert.equal(edge.calls.some(x=>x.path==="/auth/v1/invite"),false);
});
test("MFA-enrolled owners must present a verified AAL2 session",async()=>{
  const edge=makeEdge({enrolledMfa:true});
  const makeJwt=aal=>"header."+Buffer.from(JSON.stringify({sub:OWNER,aal})).toString("base64url")+".sig";
  const denied=await edge.handler(request({email:"x@example.invalid"},makeJwt("aal1")));
  assert.equal(denied.status,403);
  assert.deepEqual(await denied.json(),{error:"mfa_required"});
  assert.equal(edge.calls.some(x=>x.path==="/auth/v1/invite"),false);
  const passed=await edge.handler(request({email:"x@example.invalid"},makeJwt("aal2")));
  assert.equal(passed.status,200);
});
test("missing or invalid login authorization never reaches admin invite endpoint",async()=>{
  const edge=makeEdge();
  const result=await edge.handler(new Request("https://synthetic.supabase.co/functions/v1/staff-invite",{method:"POST"}));
  assert.equal(result.status,401);
  assert.equal(edge.calls.length,0);
});
test("failed invitation and missing app-origin configuration both fail closed",async()=>{
  const missing=makeEdge({missingOrigin:true});
  assert.equal((await missing.handler(request({email:"x@example.invalid"}))).status,503);
  assert.equal(missing.calls.length,0);
  const failed=makeEdge({inviteFails:true});
  assert.equal((await failed.handler(request({email:"x@example.invalid"}))).status,409);
  assert.equal(failed.calls.some(x=>x.method==="POST"&&x.path==="/rest/v1/agency_memberships"),false);
});
test("invitation rejects redirects outside project-owned application origins",async()=>{
  const edge=makeEdge();
  const denied=await edge.handler(request({email:"staff@example.invalid",origin:"https://attacker.invalid"}));
  assert.equal(denied.status,400);
  assert.equal(edge.calls.some(x=>x.path==="/auth/v1/invite"),false);
});
test("owner invite enforces strict input and maximum roster",async()=>{
  const invalid=makeEdge();
  assert.equal((await invalid.handler(request({email:"not-an-email"}))).status,400);
  assert.equal(invalid.calls.some(x=>x.path==="/auth/v1/invite"),false);
  const full=makeEdge({roster:50});
  assert.equal((await full.handler(request({email:"x@example.invalid"}))).status,429);
  assert.equal(full.calls.some(x=>x.path==="/auth/v1/invite"),false);
});
