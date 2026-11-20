const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const read = path => fs.readFileSync(path,"utf8");
const code=ts.transpileModule(read("src/lib/auth/access.ts"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const mod={exports:{}};
new Function("require","module","exports",code)(
  name => {
    if(name==="server-only")return {};
    if(name==="./policy")return {hasAllowedProvider:p=>p==="email"||p==="google",isOwner:r=>r==="owner"};
    if(name==="@/lib/supabase/server")return {createClient:async()=>{throw Error("unexpected server client");}};
    throw Error("Unexpected import: "+name);
  },mod,mod.exports,
);
const getStaffState=mod.exports.getStaffState;
function client({role="operator",active=true,create=true,message=true,provider="email",
  identity=true,denied=false,aal2=false}={}){
  const calls=[];
  return {calls,auth:{
    getUser:async()=>({data:{user:identity?{id:"employee",app_metadata:{provider},user_metadata:{role:"owner"}}:null},error:null}),
    mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:"aal1",nextLevel:aal2?"aal2":"aal1"},error:null})},
  },from(table){calls.push(table);return {
    select(){return this;},eq(){return this;},
    async maybeSingle(){return {
      data:denied?null:table==="agency_memberships"?{role}:{
        active,can_create_casefiles:create,can_message:message,
      },error:denied?Error("denied"):null};
    },
  };}};
}

test("only verified, activated operator reaches employee portal",async()=>{
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://synthetic.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="synthetic";
  const c=client();const state=await getStaffState(c);
  assert.equal(state.state,"ok");
  assert.equal(state.role,"employee");
  assert.equal(state.permissions.can_create_casefiles,true);
  assert.deepEqual(c.calls,["agency_memberships","staff_portal_access"]);
  for(const options of [
    {role:"owner"},{role:"admin"},{active:false},{identity:false},
    {provider:"facebook"},{denied:true},
  ])assert.equal((await getStaffState(client(options))).state,"none",JSON.stringify(options));
  assert.equal((await getStaffState(client({aal2:true}))).state,"mfa");
});

test("owner pages, employee screens and server actions each independently authorize",()=>{
  const ownerPage=read("src/app/admin/staff/page.tsx");
  const ownerActions=read("src/app/admin/staff/actions.ts");
  const staffPage=read("src/app/staff/page.tsx");
  const staffActions=read("src/app/staff/actions.ts");
  assert.match(ownerPage,/await requireOwner\(\)/);
  assert.match(ownerActions,/await requireOwner\(\)/);
  assert.match(staffPage,/await requireStaff\(\)/);
  assert.match(staffActions,/await requireStaff\(\)/);
  assert.match(staffActions,/await requireStaffMessenger\(\)/);
  assert.doesNotMatch(staffPage,/<Suite/,"no owner shell in employee portal");
  assert.match(staffActions,/\.eq\("user_id", session\.userId\)/);
});

test("middleware refreshes staff cookies but never grants /admin or /api access to staff",()=>{
  const mw=read("src/lib/supabase/middleware.ts");
  const config=read("src/middleware.ts");
  assert.match(config,/\/staff\/:path\*/);
  assert.match(mw,/if \(isStaffRoute\)/);
  assert.match(mw,/staff = await getStaffState\(supabase\)/);
  assert.match(mw,/if \(staff\.state === "mfa"\)/);
  assert.match(mw,/if \(staff\.state === "ok"\)/);
  assert.match(mw,/if \(owner\.state !== "ok"\)/);
  assert.match(mw,/if \(isApi\) return finish\(NextResponse\.json\(\{ error: "Unauthorized" \}/);
});

test("migration keeps owner CRM and old office_messages RLS untouched",()=>{
  const sql=read("supabase/migrations/20261117180500_staff_private_portal.sql");
  for(const table of ["staff_portal_access","staff_client_grants","staff_casefiles",
    "staff_contacts","staff_private_messages","staff_permission_events"]){
    assert.match(sql,new RegExp("alter table public\\."+table+" enable row level security"));
    assert.match(sql,new RegExp("revoke all on public\\."+table));
  }
  assert.doesNotMatch(sql,/alter table public\.(crm_clients|office_messages)\b/);
  assert.doesNotMatch(sql,/grant .* on public\.(crm_clients|office_messages)\b/);
  assert.match(sql,/user_id=\(select auth\.uid\(\)\)/);
  assert.match(sql,/sender_id=\(select auth\.uid\(\)\)/);
  assert.match(sql,/recipient_id=\(select auth\.uid\(\)\)/);
  assert.match(sql,/create trigger staff_contact_revoke/);
  assert.match(sql,/create trigger staff_access_audit/);
  assert.doesNotMatch(sql,/service_role|auth\.users\s+set/i);
});
