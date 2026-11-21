'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('five identities, empty client, duplicate legal name and privileged ID manipulation',{timeout:180000},async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
 const ids=[1,2,3,4,5].map(i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0'));
 for(const id of ids)await db.query('insert into auth.users(id) values($1)',[id]);
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
  await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  if(f.startsWith('20261102053022'))for(let i=0;i<3;i++)await db.query('insert into agency_memberships(user_id,role) values($1,$2)',[ids[i],i<2?'owner':'operator']);
 }
 const as=id=>db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated;`);
 await db.query('insert into crm_private.finance_access(user_id) values($1)',[ids[0]]);
 await as(ids[0]);
 const a=(await db.query("insert into crm_clients(legal_name,trade_name,source,owner_id) values('QA Alpha','Shared Name','manual',$1) returning id",[ids[0]])).rows[0].id;
 const b=(await db.query("insert into crm_clients(legal_name,trade_name,source,owner_id) values('QA Beta','Shared Name','manual',$1) returning id",[ids[1]])).rows[0].id;
 for(let i=0;i<3;i++)assert.equal(Number((await db.query('select count(*) n from os_projects where client_id=$1',[b])).rows[0].n),0,'client with no products stays empty');
 await assert.rejects(db.query("insert into crm_clients(legal_name,source,owner_id) values('  qa   alpha  ','manual',$1)",[ids[0]]),e=>e.code==='23505','normalized legal-name duplicate rejected');
 const req={idempotency_key:'99999999-9999-4999-8999-999999999998',client_id:a,lines:[{service_code:'desarrollo-web',unit_price:'1000'}]};
 const sale=(await db.query('select crm_confirm_sale($1::jsonb) r',[JSON.stringify(req)])).rows[0].r;
 const inv=(await db.query('select crm_invoice_record($1::jsonb) r',[JSON.stringify({sale_id:sale.sale_id,number:'QA-ACL-001',amount:'1000'})])).rows[0].r;
 assert.ok(inv.invoice_id);
 assert.equal(Number((await db.query('select count(*) n from os_projects where client_id=$1',[b])).rows[0].n),0,'sale for A never attaches a project to B');
 for(const id of ids.slice(2)){
  await as(id);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,user_metadata:{role:'owner'},app_metadata:{role:'owner'}})]);
  for(const table of ['crm_clients','crm_sales','crm_invoices','os_projects'])assert.equal(Number((await db.query('select count(*) n from '+table)).rows[0].n),0,table+' hidden from non-owner');
  assert.equal((await db.query("update crm_clients set trade_name='forged' where id=$1 returning id",[a])).rows.length,0);
  await assert.rejects(db.query('select crm_confirm_sale($1::jsonb)',[JSON.stringify(req)]),/forbidden|permission/i);
  await assert.rejects(db.query('select crm_invoice_record($1::jsonb)',[JSON.stringify({sale_id:sale.sale_id,number:'FORGED',amount:'1'})]),/forbidden|permission/i);
  await assert.rejects(db.query('select crm_client_finance_summary($1)',[a]),/forbidden|permission/i);
 }
 await as(ids[1]);assert.equal(Number((await db.query('select count(*) n from crm_clients')).rows[0].n),2,'two internal owners intentionally share the agency');
 await assert.rejects(db.query('select crm_client_finance_summary($1)',[a]),/finance_forbidden/,'owner without explicit finance permission denied');
 await as(ids[0]);assert.equal(Number((await db.query('select count(*) n from crm_sales')).rows[0].n),1);assert.equal(Number((await db.query('select count(*) n from crm_invoices')).rows[0].n),1);assert.equal((await db.query('select trade_name from crm_clients where id=$1',[a])).rows[0].trade_name,'Shared Name');
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from crm_clients'),/permission denied/);
 // Non-member client A/B identities are denied internal data. This is not external CRM multitenancy certification.
});
