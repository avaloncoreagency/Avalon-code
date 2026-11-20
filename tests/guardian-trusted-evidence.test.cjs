const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const load=require('../scripts/creative-bridge/continuity-loader.cjs');
const {preflightSignedRecovery}=load('src/lib/guardian/trusted-evidence.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const first=id(1),second=id(2),clientId=id(3),projectId=id(4),targetId=id(5), incidentId=id(6);
const context={clientId,projectId,now:'2026-11-20T13:10:00Z'};
const keyA=Buffer.alloc(32,3), keyB=Buffer.alloc(32,6); // Synthetic TEST keys only.
const monitors=()=>new Map([
 [first,{id:first,clientId,projectId,targetId,keyVersion:1,active:true,signingKey:keyA}],
 [second,{id:second,clientId,projectId,targetId,keyVersion:1,active:true,signingKey:keyB}]
]);
const obs=(n,code,observerId)=>({id:id(n),clientId,projectId,observerId,code,observedAt:`2026-11-20T13:09:${String(n).padStart(2,'0')}Z`});
const incident=()=>({id:incidentId,clientId,projectId,runbook:'availability',observations:[obs(10,'http_5xx',first),obs(12,'timeout',first)]});
function signed(o,{target=targetId,incident=incidentId,keyVersion=1,key= o.observerId===first?keyA:keyB}={}){
 const r={incidentId:incident,targetId:target,keyVersion,observation:o};
 const message=JSON.stringify(['avalon-guardian-receipt-v1',r.incidentId,r.targetId,r.keyVersion,o.id,o.clientId,o.projectId,o.code,o.observedAt,o.observerId]);
 return {...r,signature:createHmac('sha256',key).update(message).digest('hex')};
}
const base=()=>{const i=incident();return {i,old:i.observations.map(o=>signed(o)),next:[signed(obs(14,'healthy',second)),signed(obs(16,'healthy',second))]};};
const evaluate=(o,source=monitors())=>preflightSignedRecovery(o.i,o.old,o.next,context,targetId,source);
test('signed receipts are only candidates for owner review, not closure or replay clearance',()=>{
 const r=evaluate(base());assert.equal(r.status,'SIGNED_EVIDENCE_CANDIDATE');assert.equal(r.closeAuthorized,false);assert.equal(r.replayLedgerVerified,false);
});
test('unsigned, broken or altered receipts are denied',()=>{
 for(const mutate of [o=>{o.next[0].signature='';},o=>{o.next[0].signature='a'.repeat(64);},o=>{o.next[1].observation.code='timeout';},o=>{o.old[0].observation.code='healthy';},o=>{o.old[0].observation.observedAt='2026-11-20T13:09:01Z';}]){
   const o=base();mutate(o);assert.equal(evaluate(o).status,'UNVERIFIED');
 }
});
test('cannot transfer receipts between tenant, project, incident or target even with valid HMAC for other scope',()=>{
 let o=base();o.next[0]=signed(o.next[0].observation,{target:id(20)});assert.equal(evaluate(o).status,'UNVERIFIED');
 o=base();o.next[0]=signed(o.next[0].observation,{incident:id(21)});assert.equal(evaluate(o).status,'UNVERIFIED');
 o=base();o.next[0].observation.clientId=id(21);assert.equal(evaluate(o).status,'UNVERIFIED');
 o=base();o.next[0].observation.projectId=id(21);assert.equal(evaluate(o).status,'UNVERIFIED');
});
test('unregistered, inactive, rotated or too-short source keys fail closed',()=>{
 for(const change of [m=>m.delete(second),m=>m.get(second).active=false,m=>m.get(second).keyVersion=2,m=>m.get(second).signingKey=Buffer.alloc(8)]){
   const src=monitors();change(src);assert.equal(evaluate(base(),src).status,'UNVERIFIED');
 }
});
test('replayed receipts in same batch, missing originals or changed original incident data fail closed',()=>{
 let o=base();o.next[1]=o.next[0];assert.equal(evaluate(o).status,'UNVERIFIED');
 o=base();o.old.pop();assert.equal(evaluate(o).status,'UNVERIFIED');
 o=base();o.i.observations[0].code='permission_alert';assert.equal(evaluate(o).status,'UNVERIFIED');
});
test('same monitoring origin cannot verify own failure; a single incident failure is unverified',()=>{
 let o=base();o.next=[signed(obs(14,'healthy',first)),signed(obs(16,'healthy',first))];assert.equal(evaluate(o).status,'UNVERIFIED');
 o=base();o.i.observations.pop();o.old.pop();assert.equal(evaluate(o).status,'UNVERIFIED');
});
test('non-availability runbooks stay unverified even with authentic signed HTTP evidence',()=>{
 for(const runbook of ['authentication','rollback','contact_form','deployment','recurring_error']){
  const o=base();o.i.runbook=runbook;assert.equal(evaluate(o).status,'UNVERIFIED',runbook);
 }
});
test('synthetic keys or source registry are never exported in preflight response',()=>{
 const r=evaluate(base());assert.doesNotMatch(JSON.stringify(r),/signingKey|keyVersion|signature|00000000/);
});

test('malformed incident and context inputs fail closed',()=>{
 const b=base();
 assert.equal(preflightSignedRecovery(null,b.old,b.next,context,targetId,monitors()).status,'UNVERIFIED');
 assert.equal(preflightSignedRecovery({...b.i,observations:null},b.old,b.next,context,targetId,monitors()).status,'UNVERIFIED');
 assert.equal(preflightSignedRecovery(b.i,b.old,b.next,null,targetId,monitors()).status,'UNVERIFIED');
});
