const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function route(owner=true) {
  const log=[];
  const db={from(table){const chain={select(...v){log.push([table,'select',...v]);return this;},order(...v){log.push([table,'order',...v]);return this;},eq(...v){log.push([table,'eq',...v]);return this;},or(){return this;},ilike(){return this;},range(...v){log.push([table,'range',...v]);return this;},then(resolve){resolve({data:[],error:null,count:0});}};return chain;}};
  const exports={};
  const js=ts.transpileModule(fs.readFileSync('src/app/admin/workspace/crm/api/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require',js)(exports,id=>{
    if(id==='next/server')return {NextResponse:{json:(data,options)=>({data,status:options.status,headers:options.headers})}};
    if(id==='@/lib/auth/session')return {getOwnerSession:async()=>owner?{supabase:db,userId:'owner'}:null};
    if(id==='@/lib/supabase/server')return {createClient:async()=>db};
    if(id==='@/lib/crm/domain')return {tables:{prospects:'crm_prospects'},uuid:/^[a-f0-9-]{36}$/i};
    return {};
  });
  return {log,get:query=>exports.GET({nextUrl:new URL('https://avalon.example.invalid/admin/workspace/crm/api?entity=prospects&'+query)})};
}
test('inbound inbox API denies an unauthenticated or non-owner session before reads',async()=>{
  const r=route(false);assert.equal((await r.get('source_kind=web_form')).status,403);assert.deepEqual(r.log,[]);
});
test('inbound inbox filters voluntary requests on server with exact count and bounded stable pages',async()=>{
  const r=route();const out=await r.get('inbound=true&status=pending&page=2');
  assert.equal(out.status,200);assert.equal(out.headers['Cache-Control'],'private, no-store');
  for(const wanted of [['crm_prospects','eq','status','pending'],['crm_prospects','range',100,149],['crm_prospects','order','id']])assert.ok(r.log.some(x=>JSON.stringify(x)===JSON.stringify(wanted)),JSON.stringify(wanted));
  assert.deepEqual(r.log.find(x=>x[0]==='crm_prospects'&&x[1]==='select').slice(2),['*,crm_public_inquiries!inner(id,created_at,services,language)',{count:'exact'}]);
});
test('inbound filtering rejects arbitrary sources and statuses without fetching prospect rows',async()=>{
  for(const query of ['source_kind=web_form,osm','status=won','source_kind=__proto__']){
    const r=route();assert.equal((await r.get(query)).status,400);
    assert.ok(!r.log.some(x=>x[1]==='range'));
  }
});
test('historical prospect callers retain their mixed-source list when no new filter is supplied',async()=>{
 const r=route();assert.equal((await r.get('')).status,200);assert.ok(!r.log.some(x=>x[1]==='eq'&&['source_kind','status'].includes(x[2])));
});
