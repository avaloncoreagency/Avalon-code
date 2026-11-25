const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");

function loadAction(role,verified=true){
  const source=fs.readFileSync("src/app/admin/signup/actions.ts","utf8");
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const events=[];
  const supabase={
    auth:{
      getUser:async()=>({data:{user:verified?{id:"00000000-0000-4000-8000-0000000000c3"}:null},error:null}),
      signOut:async()=>{events.push("signed_out");},
    },
    from:table=>{assert.equal(table,"agency_memberships");return{
      select(){return this;},eq(){return this;},
      maybeSingle:async()=>({data:role?{role}:null,error:null}),
    };},
  };
  const redirect=url=>{events.push(url);throw Object.assign(Error("REDIRECT"),{url});};
  const mocks={
    "next/navigation":{redirect},
    "@/lib/supabase/server":{createClient:async()=>supabase},
    "@/lib/auth/email-flow":{grantPasswordFlow:async(id,type)=>events.push("flow:"+id+":"+type)},
  };
  const mod={exports:{}};
  new Function("require","module","exports",js)(name=>{
    if(!(name in mocks))throw Error("Unexpected dependency: "+name);
    return mocks[name];
  },mod,mod.exports);
  return {handler:mod.exports.completeStaffInvitation,events};
}

test("verified invited operator can prepare a one-time password flow",async()=>{
  const {handler,events}=loadAction("operator");
  await assert.rejects(handler(),e=>e.url==="/admin/signup");
  assert.deepEqual(events,["flow:00000000-0000-4000-8000-0000000000c3:invite","/admin/signup"]);
});
test("owner is not allowed into employee invitation password setup",async()=>{
  const {handler,events}=loadAction("owner");
  await assert.rejects(handler(),e=>e.url==="/admin/login?error=unauthorized");
  assert.deepEqual(events,["signed_out","/admin/login?error=unauthorized"]);
});
test("unverified user never gets a password setup cookie",async()=>{
  const {handler,events}=loadAction("operator",false);
  await assert.rejects(handler(),e=>e.url==="/admin/login?error=unauthorized");
  assert.deepEqual(events,["/admin/login?error=unauthorized"]);
});
test("non-members and unapproved membership roles cannot enroll",async()=>{
  for(const role of [null,"admin"]){
    const {handler,events}=loadAction(role);
    await assert.rejects(handler(),e=>e.url==="/admin/login?error=unauthorized");
    assert.deepEqual(events,["signed_out","/admin/login?error=unauthorized"]);
  }
});
