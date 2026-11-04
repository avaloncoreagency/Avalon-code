// Real production Next.js POST handler over HTTP, backed ONLY by synthetic
// in-process Supabase Auth/RPC responses. No real Supabase, Higgsfield, clients,
// production credentials or external network needed. Database SQL is exercised
// independently in creative-bridge.database.cjs.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createServer}=require("node:http");
const {spawn}=require("node:child_process");
const {createHash,createHmac}=require("node:crypto");

const MACHINE_ID="00000000-0000-4000-8000-0000000000d4";
const OWNER_ID="00000000-0000-4000-8000-0000000000a1";
const LEAD_ID="00000000-0000-4000-8000-0000000000b1";
const PROJECT_ID="00000000-0000-4000-8000-0000000000c1";
const SECRET=Buffer.alloc(32,77);
const KEY_ID="codex-ci";
const payload={
  schema_version:1,provider:"higgsfield",module:"website",
  source_ref:"synthetic-http-higgsfield-2026",company_name:"Synthetic Dental LLC",
  existing_lead_id:null,product_name:"Synthetic site",
  description:"No generated media; HTTP integration fixture.",
  project_url:"https://preview.example.invalid",repository_url:"",
};
const encode=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
const accessToken=[encode({alg:"HS256",typ:"JWT"}),encode({
  sub:MACHINE_ID,role:"authenticated",aud:"authenticated",
  exp:Math.floor(Date.now()/1000)+3600,
}),"synthetic-signature"].join(".");
const json=(res,code,data)=>{
  res.writeHead(code,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(data));
};
async function readJson(req){
  let raw="";for await(const chunk of req)raw+=chunk;
  return JSON.parse(raw);
}
const reserve=async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
};
function command(executable,args,env,timeout=130000){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{env,stdio:["ignore","pipe","pipe"]});
  let output="";
  const append=chunk=>{output=(output+chunk.toString()).slice(-12000);};
  child.stdout.on("data",append);child.stderr.on("data",append);
  const timer=setTimeout(()=>{child.kill("SIGKILL");reject(Error("Timed out building isolated Next.js HTTP fixture: "+output));},timeout);
  child.once("error",error=>{clearTimeout(timer);reject(error);});
  child.once("exit",code=>{
   clearTimeout(timer);
   if(code===0)resolve(output);
   else reject(Error("Isolated Next.js build failed (exit "+code+"): "+output));
  });
 });
}
function sign(raw,key=SECRET){
 const timestamp=String(Math.floor(Date.now()/1000));
 const digest=createHash("sha256").update(raw).digest("hex");
 const sig="v1="+createHmac("sha256",key).update(`v1\n${timestamp}\n${KEY_ID}\n${digest}`).digest("hex");
 return {
  "content-type":"application/json",
  "x-avalon-key-id":KEY_ID,
  "x-avalon-timestamp":timestamp,
  "x-avalon-signature":sig,
 };
}

test("Higgsfield signed POST: real Next route and Supabase JS through synthetic HTTP, no remote writes",{
 timeout:210000,
},async t=>{
 let authRequests=0,rpcRequests=0;
 const saved=new Map();
 const fake=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,"http://127.0.0.1");
   if(req.method==="POST"&&url.pathname==="/auth/v1/token"&&
      url.searchParams.get("grant_type")==="password"){
     authRequests++;
     const body=await readJson(req);
     if(body.email!=="bridge-test@example.invalid"||
        body.password!=="isolated-no-secret-example")return json(res,400,{error:"invalid_grant"});
     return json(res,200,{
       access_token:accessToken,refresh_token:"synthetic-refresh",
       token_type:"bearer",expires_in:3600,
       user:{id:MACHINE_ID,email:"bridge-test@example.invalid",
         aud:"authenticated",role:"authenticated",app_metadata:{provider:"email"},
         created_at:"2026-01-01T00:00:00Z"},
     });
   }
   if(req.method==="POST"&&url.pathname==="/rest/v1/rpc/os_receive_creative_delivery"){
     rpcRequests++;
     assert.equal(req.headers.authorization,"Bearer "+accessToken);
     const body=await readJson(req);
     assert.equal(body.p_owner_id,OWNER_ID);
     assert.equal(body.p_agent,"codex");
     assert.equal(body.p_module,"website");
     if(body.p_company_name==="Ambiguous Company")
       return json(res,400,{code:"22023",message:"ambiguous fixture"});
     const old=saved.get(body.p_source_ref);
     const record=old||{project_id:PROJECT_ID,lead_id:LEAD_ID};
     saved.set(body.p_source_ref,record);
     return json(res,200,{...record,created:!old,lead_created:!old});
   }
   return json(res,404,{error:"isolated_fixture_route_not_found"});
  }catch(error){
   t.diagnostic("Synthetic provider rejected a request: "+String(error.message).slice(0,160));
   json(res,500,{error:"synthetic_test_failure"});
  }
 });
 await new Promise(resolve=>fake.listen(0,"127.0.0.1",resolve));
 t.after(()=>new Promise(resolve=>fake.close(resolve)));
 const fakeUrl=`http://127.0.0.1:${fake.address().port}`;
 const port=await reserve();
 const origin=`http://localhost:${port}`;
 const env={
   ...process.env,GH_TOKEN:"",GITHUB_TOKEN:"",BRIDGE_GITHUB_TOKEN:"",
   BRIDGE_VERCEL_TOKEN:"",BRIDGE_SUPABASE_TOKEN:"",
   NEXT_TELEMETRY_DISABLED:"1",VERCEL_ENV:"preview",
   NEXT_PUBLIC_SUPABASE_URL:fakeUrl,
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"synthetic-publishable-key",
   AVALON_CREATIVE_BRIDGE_ENABLED:"true",
   AVALON_CREATIVE_BRIDGE_PRODUCTION_APPROVED:"false",
   AVALON_CREATIVE_BRIDGE_MACHINE_EMAIL:"bridge-test@example.invalid",
   AVALON_CREATIVE_BRIDGE_MACHINE_PASSWORD:"isolated-no-secret-example",
   AVALON_CREATIVE_BRIDGE_OWNER_ID:OWNER_ID,
   AVALON_CREATIVE_BRIDGE_KEYS_JSON:JSON.stringify({
      [KEY_ID]:{agent:"codex",secret_b64:SECRET.toString("base64")},
   }),
 };
 // Build with EXACT same synthetic NEXT_PUBLIC_ URL that the server uses.
 // Static build in another CI job is not guaranteed to share that URL.
 await command(process.execPath,[require.resolve("next/dist/bin/next"),"build"],env);
 const next=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","-p",String(port)],{
   env,stdio:["ignore","pipe","pipe"],
 });
 let logs="";const append=x=>{logs=(logs+x.toString()).slice(-6000);};
 next.stdout.on("data",append);next.stderr.on("data",append);
 t.after(async()=>{
   if(next.exitCode===null){next.kill("SIGTERM");await new Promise(resolve=>{
     next.once("exit",resolve);setTimeout(()=>{if(next.exitCode===null)next.kill("SIGKILL");},3000).unref();
   });}
 });
 for(let attempt=0;attempt<120;attempt++){
   try{if((await fetch(origin+"/")).ok)break;}catch{}
   if(attempt===119)assert.fail("Next server unavailable in synthetic fixture: "+logs);
   await new Promise(resolve=>setTimeout(resolve,100));
 }
 const deliver=(body,headers)=>fetch(origin+"/api/creative-bridge/deliveries",{
   method:"POST",redirect:"manual",body,headers,
 });
 const raw=Buffer.from(JSON.stringify(payload));
 assert.equal((await deliver(raw,{"content-type":"application/json"})).status,401);
 assert.equal((await deliver(raw,sign(raw,Buffer.alloc(32,12)))).status,401);
 assert.equal((await deliver(raw,{...sign(raw),cookie:"session=untrusted"})).status,400);
 assert.equal((await deliver(Buffer.alloc(8200,32),{"content-type":"application/json"})).status,413);
 assert.equal(authRequests,0,"unsigned/oversized payloads must not reach Auth");
 assert.equal(rpcRequests,0,"unsigned/oversized payloads must not reach database RPC");
 const first=await deliver(raw,sign(raw));
 assert.equal(first.status,201);
 assert.deepEqual((await first.json()),{
   status:"reference_only",project_id:PROJECT_ID,lead_id:LEAD_ID,
   created:true,lead_created:true,
   product_path:"/admin/workspace/products/"+PROJECT_ID,
   company_path:"/admin/workspace/clients/"+LEAD_ID,
 });
 const second=await deliver(raw,sign(raw));
 assert.equal(second.status,200);
 assert.equal((await second.json()).created,false,"replayed signed reference is not duplicated");
 const ambiguity=Buffer.from(JSON.stringify({
   ...payload,source_ref:"synthetic-http-ambiguous",company_name:"Ambiguous Company",
 }));
 const conflict=await deliver(ambiguity,sign(ambiguity));
 assert.equal(conflict.status,409);
 assert.equal((await conflict.json()).error,"conflict_or_ambiguous_company");
 assert.equal(authRequests,3);
 assert.equal(rpcRequests,3);
 assert.equal(saved.size,1);
 assert.equal((await fetch(origin+"/api/dev-bridge/resume?issue=95&as=samuel")).status,401);
 assert.equal((await fetch(origin+"/admin/dev-bridge",{redirect:"manual"})).status,307);
 t.diagnostic("Real production Next route: 401 unsigned, 413 oversized, 201 created, 200 replay, 409 ambiguous; fake Supabase only.");
});
