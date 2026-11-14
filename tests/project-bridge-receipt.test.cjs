const {test}=require('node:test'),assert=require('node:assert/strict');
const {processImport}=require('../scripts/creative-bridge/continuity-loader.cjs')('src/lib/project-bridge/service.ts');
function fixture({version='v1',missing=false,error=false}={}){
 const calls=[];
 const repo={getImport:async()=>({id:'delivery',status:'registered',project_id:'project',version_id:version}),sealedVersion:async(p,v)=>{calls.push([p,v]);if(error)throw Error('synthetic outage');return missing?null:{id:v,number:1}},latestSealedVersion:async()=>{throw Error('must not select latest')},updateImport:async()=>{throw Error('must not write')}};
 return {run:()=>processImport(repo,{get:async()=>{throw Error('must not download archive')},put:async()=>{throw Error('must not upload archive')}},'delivery'),calls};
}
test('replayed receipt uses its exact sealed version and never reimports',async()=>{const h=fixture();assert.deepEqual(await h.run(),{status:'registered',projectId:'project',versionId:'v1',number:1});assert.deepEqual(h.calls,[['project','v1']]);});
test('incomplete or unavailable sealed version cannot produce a false success',async()=>{for(const options of [{version:null},{missing:true}])assert.equal((await fixture(options).run()).reason,'receipt_version_missing');});
test('transient receipt lookup failure stays retryable without running the import',async()=>{const r=await fixture({error:true}).run();assert.equal(r.status,'failed');assert.equal(r.retryable,true);assert.equal(r.reason,'receipt_unavailable');});
