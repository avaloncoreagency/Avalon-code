const {test}=require('node:test'),assert=require('node:assert/strict');
const d=require('../scripts/creative-bridge/continuity-loader.cjs')('src/lib/os/client-hud.ts');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const apply=(s,action,input)=>d.applyProductAction(s,'website',action,input,A,'2026-11-14T14:00:00.000Z',C);
function fixed(){let s=d.applyProductAction({},'website','request',{title:'Synthetic bug',details:'Synthetic reproduction',kind:'bug',severity:'P1',checklist:'Verify menu'},A,'2026-11-14T14:00:00.000Z',B);for(const status of ['approved','in_progress','fixed'])s=apply(s,'status',{request_id:B,status});return s;}
test('unfinished acceptance criteria cannot be marked verified',()=>{
 assert.throws(()=>apply(fixed(),'status',{request_id:B,status:'verified',verification_notes:'Synthetic test of menu at 390px passed.'}));
});
test('verified evidence and checklist cannot be changed without reopening',()=>{
 let s=apply(fixed(),'request_item_status',{request_id:B,item_id:'i0',done:'true'});
 s=apply(s,'status',{request_id:B,status:'verified',verification_notes:'Synthetic menu test at 390px passed.'});
 for(const [action,input]of [['request_edit',{title:'Different issue',details:'Different criteria',kind:'bug',severity:'P2'}],['request_item_status',{item_id:'i0',done:'false'}],['request_add_item',{item:'Unverified requirement'}]])
  assert.throws(()=>apply(s,action,{request_id:B,...input}),action);
 s=apply(s,'status',{request_id:B,status:'closed'});
 assert.throws(()=>apply(s,'request_item_status',{request_id:B,item_id:'i0',done:'false'}));
 s=apply(s,'reopen',{request_id:B});
 assert.equal(apply(s,'request_item_status',{request_id:B,item_id:'i0',done:'false'}).client_hud.requests[0].items[0].done,false);
});
test('issue filters combine saved state, owner, severity and text without modifying the records',()=>{
 const r=fixed().client_hud.requests[0], requests=[r,{...r,id:C,title:'Other',severity:'P3',status:'blocked',assignee_id:A}];
 const before=JSON.stringify(requests);
 assert.equal(d.filterRequests(requests,{issue_q:'SYNTHETIC',issue_state:'fixed',issue_severity:'P1',issue_assignee:'unassigned'}).requests.length,1);
 assert.equal(d.filterRequests(requests,{issue_assignee:A}).requests[0].id,C);
 assert.equal(d.filterRequests(requests,{issue_state:'constructor',issue_severity:['P1'],issue_assignee:'invalid'}).requests.length,2);
 assert.equal(JSON.stringify(requests),before);
});
