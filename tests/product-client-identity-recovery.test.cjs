const {test}=require('node:test'),assert=require('node:assert/strict');
const {groupCompanies}=require('../scripts/creative-bridge/continuity-loader.cjs')('src/lib/os/client-hud.ts');
test('lead and canonical client with equal UUIDs retain distinct names and groups',()=>{
 const id='11111111-1111-4111-8111-111111111111',project=(pid,canonical)=>({id:pid,module:'website',name:'Synthetic',description:'',status:'draft',settings:{operations:{client_lead_id:id}},client_id:canonical?id:null,updated_at:'2026-11-14T14:00:00.000Z'});
 const groups=groupCompanies([project('a',true),project('b',false)],[{id,company:'Legacy lead',kind:'lead'},{id,company:'Canonical client',kind:'client'}]);
 assert.equal(groups.find(g=>g.linkKind==='client').name,'Canonical client');assert.equal(groups.find(g=>g.linkKind==='lead').name,'Legacy lead');assert.equal(groups.length,2);
});
