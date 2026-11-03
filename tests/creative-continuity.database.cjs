const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const OWNER='00000000-0000-4000-8000-0000000000a1',MACHINE='00000000-0000-4000-8000-0000000000d4';
test('three libraries keep one CRM client, independent products and replay receipts', {timeout:120000},async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
 await db.exec(`insert into auth.users(id,email) values('${OWNER}','owner@example.invalid'),('${MACHINE}','machine@example.invalid')`);
 for(const name of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort()){
  await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  if(name.startsWith('20261102053022'))await db.exec(`insert into agency_memberships(user_id,role) values('${OWNER}','owner')`);
 }
 for(const segment of fs.readFileSync('docs/sql/creative-bridge-registration.sql','utf8').split(/(?=^create or replace function (?:crm_private|os_private|public)\.)/m))await db.exec(segment);
 await db.query('insert into os_private.creative_bridge_identities(user_id,owner_id,enabled,label) values($1,$2,true,$3)',[MACHINE,OWNER,'synthetic']);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${OWNER}'`);
 const lead=(await db.query(`insert into crm_leads(company,source,owner_id) values('Synthetic Library Client','synthetic',$1) returning id`,[OWNER])).rows[0];
 const client=(await db.query(`insert into crm_clients(legal_name,source,owner_id,origin_lead_id) values('Synthetic Library Client','synthetic',$1,$2) returning id`,[OWNER,lead.id])).rows[0];
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${MACHINE}'`);
 const receipts=[];
 for(const moduleKey of ['website','ecommerce','crm_creator']){
  const args=[moduleKey,'synthetic-'+moduleKey,'Synthetic Library Client',lead.id,'Synthetic '+moduleKey,'Demo only','https://demo.example.invalid','',OWNER,moduleKey==='ecommerce'?'claude':'codex'];
  const submit=async()=> (await db.query('select public.os_receive_creative_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) receipt',args)).rows[0].receipt;
  const first=await submit(),again=await submit();assert.equal(first.project_id,again.project_id);assert.equal(again.created,false);receipts.push(first);
 }
 await db.exec('reset role');
 const projects=(await db.query('select id,module,client_id,settings from os_projects order by module')).rows;assert.equal(projects.length,3);assert.equal(new Set(receipts.map(r=>r.project_id)).size,3);
 for(const p of projects){assert.equal(p.client_id,client.id);assert.equal(p.settings.operations.client_lead_id,lead.id);assert.equal(p.settings.creative.provider,'higgsfield');}
 for(const [table,n] of [['crm_leads',1],['crm_clients',1],['crm_sales',0],['crm_payments',0]])assert.equal(Number((await db.query(`select count(*) n from ${table}`)).rows[0].n),n);
 assert.equal((await db.query('select stage_id from crm_leads')).rows[0].stage_id,'new');
});
