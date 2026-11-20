const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const crypto=require('node:crypto');
const {NextRequest,NextResponse}=require('next/server');
const attachment=require('../../scripts/creative-bridge/continuity-loader.cjs')('src/lib/crm/attachments.ts');
const id='00000000-0000-4000-8000-0000000000a1';
function route(file,session){
 const mod={exports:{}};
 const dependencies={'next/server':{NextResponse},'node:crypto':crypto,'@/lib/auth/session':{getOwnerSession:async()=>session},'@/lib/crm/attachments':attachment};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>{assert.ok(name in dependencies,name);return dependencies[name]},mod,mod.exports);return mod.exports;
}
const base='src/app/admin/workspace/crm/pipeline/';
const request=(path='',body,origin='https://qa.example.invalid')=>new NextRequest('https://qa.example.invalid/admin/workspace/crm/pipeline'+path,{method:body===undefined?'GET':'POST',headers:{origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
function session(result){return {user:{id},supabase:{from(){const chain={select(){return chain},eq(){return chain},maybeSingle:async()=>result};return chain}}}}
test('pipeline HTTP denies anonymous read/write/download before any DB access',async()=>{
 const api=route(base+'route.ts',null);assert.equal((await api.GET(request())).status,403);assert.equal((await api.POST(request('',{}))).status,403);
 assert.equal((await route(base+'files/[id]/route.ts',null).GET(request('/files/'+id),{params:Promise.resolve({id})})).status,403);
});
test('pipeline write rejects cross-origin, malformed IDs and empty comments before persistence',async()=>{
 const api=route(base+'route.ts',{supabase:{from(){throw Error('must not persist')}}});
 assert.equal((await api.POST(request('',{lead:id,body:'Hi'},'https://evil.example.invalid'))).status,403);
 assert.equal((await api.POST(request('',{lead:'not-uuid',body:'Hi'}))).status,400);
 assert.equal((await api.POST(request('',{lead:id,body:' '}))).status,400);
 assert.equal((await api.POST(request('',{lead:id,body:'x',kind:'arbitrary'}))).status,400);
});
test('download fails closed on DB errors/missing files and rejects tampered bytes',async()=>{
 const ctx={params:Promise.resolve({id})};
 const run=result=>route(base+'files/[id]/route.ts',session(result)).GET(request('/files/'+id),ctx);
 assert.equal((await run({data:null,error:{message:'synthetic connection failure'}})).status,404);
 assert.equal((await run({data:null,error:null})).status,404);
 const r=await run({data:{filename:'qa.txt',mime:'text/plain',content:'\\x6869',sha256:'0'.repeat(64),size_bytes:2},error:null});
 assert.equal(r.status,409);assert.equal(r.headers.get('cache-control'),'private, no-store');
});
test('authorized download retains bytes, hash and attachment disposition without caching',async()=>{
 const bytes=Buffer.from('Synthetic shared file');
 const api=route(base+'files/[id]/route.ts',session({data:{filename:'qa.txt',mime:'text/plain',content:'\\x'+bytes.toString('hex'),size_bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},error:null}));
 const r=await api.GET(request('/files/'+id),{params:Promise.resolve({id})});assert.equal(r.status,200);
 assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);assert.match(r.headers.get('content-disposition'),/^attachment;/);assert.equal(r.headers.get('cache-control'),'private, no-store');
});
