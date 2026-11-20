const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function load(file,deps={},env={}){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports','process','fetch',code)(id=>{if(id in deps)return deps[id];if(id==='server-only')return{};if(id==='node:crypto')return require(id);throw Error(id);},mod,mod.exports,{env},()=>{throw Error('EXTERNAL REQUEST FORBIDDEN');});return mod.exports;}
test('administrative external Radar switch fails closed for unset and malformed values',()=>{const {radarExternalEnabled}=load('src/lib/crm/radar-control.ts');for(const value of [undefined,'false','TRUE','1','yes',''])assert.equal(radarExternalEnabled({AVALON_RADAR_EXTERNAL_ENABLED:value}),false);assert.equal(radarExternalEnabled({AVALON_RADAR_EXTERNAL_ENABLED:'true'}),true);});
test('paused search makes zero provider requests, database reads, writes or retries',async()=>{const policy=load('src/lib/crm/radar-control.ts');const search=load('src/lib/crm/radar-search.ts',{'./radar-control':policy,'./radar':{},'./radar-geoapify':{},'./radar-quota':{}});let reads=0;const db={from(){reads++;throw Error('no reads expected');},rpc(){throw Error('no writes expected');}};for(let i=0;i<3;i++){const out=await search.searchAndIngest(db,{},'test-paused');assert.equal(out.ok,false);assert.equal(out.status,423);assert.equal(out.error,'Radar pausado por decisión administrativa');}assert.equal(reads,0);assert.match(search.radarEndpoint().error,/pausado/);});
test('paused researcher does not inspect DNS, robots, pages or providers',async()=>{const policy=load('src/lib/crm/radar-control.ts');class Blocked extends Error{constructor(_code,message){super(message);}};const research=load('src/lib/crm/radar-research.ts',{'./radar-control':policy,'./radar-website-safety':{ResearchBlocked:Blocked}});await assert.rejects(research.investigateOfficialWebsite('https://synthetic.example.invalid','Synthetic'),/pausado/);});

test('owner HTTP entrypoints block geocoding, searches and campaign reactivation with no provider calls',async()=>{
 const policy=load('src/lib/crm/radar-control.ts');const deps={'@/lib/crm/radar-control':policy,'@/lib/auth/session':{getOwnerSession:async()=>({userId:'owner',supabase:{from(){throw Error('unexpected DB access');}}})},'next/server':{NextResponse:{json:(body,init)=>({body,status:init?.status??200})}},'@/lib/crm/radar-geocode':{},'@/lib/crm/radar-geoapify':{},'@/lib/crm/radar':{},'@/lib/crm/radar-search':{radarEndpoint:()=>({error:policy.RADAR_PAUSED_MESSAGE})}};
 const req={nextUrl:new URL('https://synthetic.example.invalid/admin?q=Miami'),headers:new Headers()};
 assert.equal((await load('src/app/admin/workspace/crm/radar/geocode/route.ts',deps).GET(req)).status,423);
 assert.equal((await load('src/app/admin/workspace/crm/radar/area/route.ts',deps).GET(req)).body.error,policy.RADAR_PAUSED_MESSAGE);
 const campaigns=load('src/app/admin/workspace/crm/radar/campaigns/route.ts',deps);
 for(const op of [{op:'run'},{op:'status',status:'active'}])assert.equal((await campaigns.POST({...req,json:async()=>({...op,id:'00000000-0000-4000-8000-000000000001'})})).status,423);
});

test('scheduled Edge worker pause precedes probes, crawl, lease writes and batch work',async()=>{
 const crypto=require('node:crypto');const token='synthetic-only-worker-token-'.repeat(3),digest=crypto.createHash('sha256').update(token).digest('hex');let serve;
 const db={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{enabled:true,token_sha256:digest},error:null})})};
 const env={SUPABASE_URL:'https://synthetic.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only-key'};
 const raw=ts.transpileModule(fs.readFileSync('supabase/functions/avalon-radar-worker/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports','Deno','crypto',raw)(id=>id==='@supabase/supabase-js'?{createClient:()=>db}:{}, {},{env:{get:k=>env[k]},serve:fn=>serve=fn},crypto.webcrypto);
 const out=await serve(new Request('https://synthetic.example.invalid/worker',{method:'POST',headers:{'x-avalon-radar-job':token,'Content-Type':'application/json'},body:JSON.stringify({network_probe:true})}));
 assert.equal(out.status,200);assert.equal((await out.json()).paused,true);
});
