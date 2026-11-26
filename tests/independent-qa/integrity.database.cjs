const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const contract=require('../helpers/verified-contract.cjs');
const approveFixtureOffers=require('../helpers/approve-fixture-offers.cjs');
const A='00000000-0000-4000-8000-0000000000a1', B='00000000-0000-4000-8000-0000000000b2', OUT='00000000-0000-4000-8000-0000000000c3';
async function setup(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
 await db.exec(`insert into auth.users(id) values('${A}'),('${B}'),('${OUT}')`);
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
  await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  if(file.startsWith('20261102053022'))await db.exec(`insert into agency_memberships values('${A}','owner'),('${B}','owner'),('${OUT}','operator')`);
 }
 return {db,as:async id=>db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated`),one:async(sql,p)=>(await db.query(sql,p)).rows[0]};
}
const diagnostic=fs.readFileSync('scripts/independent-qa/commercial-integrity.sql','utf8');
async function audit(db){const results=await db.exec(diagnostic);return results.find(r=>r.rows?.[0]?.commercial_integrity)?.rows[0].commercial_integrity;}
test('read-only diagnostics distinguish empty coverage, valid records and injected cross-client corruption', {timeout:180000}, async t=>{
 const {db,as,one}=await setup(t);
 const empty=await audit(db);assert.equal(empty.coverage.sales,0);assert.ok(empty.checks.every(c=>c.count===0));
 await approveFixtureOffers(db,A,[['desarrollo-web',100]]);
 await as(A);
 const lead=(await one("insert into crm_leads(company,source,owner_id) values('Synthetic QA','manual',$1) returning id",[A])).id;
 await contract(db,lead);
 const sale=(await one('select crm_confirm_sale($1::jsonb) r',[JSON.stringify({lead_id:lead,idempotency_key:crypto.randomUUID(),new_client:{legal_name:'Synthetic QA'},seller_id:A,lines:[{service_code:'desarrollo-web',unit_price:'100'}]})])).r;
 const inv=(await one('select crm_invoice_record($1::jsonb) r',[JSON.stringify({sale_id:sale.sale_id,number:'QA-001',amount:'100'})])).r;
 const other=(await one("insert into crm_clients(legal_name,source,owner_id) values('Other synthetic company','manual',$1) returning id",[A])).id;
 await db.exec('reset role');
 const valid=await audit(db);assert.equal(valid.coverage.invoices,1);assert.equal(valid.checks.find(c=>c.code==='invoice_sale_client_mismatch').count,0);
 // Deliberate corruption ONLY inside disposable in-memory PostgreSQL; never an executable remote repair.
 await db.query('update crm_invoices set client_id=$1 where id=$2',[other,inv.invoice_id]);
 const before=await one('select client_id from crm_invoices where id=$1',[inv.invoice_id]);
 const broken=await audit(db);assert.equal(broken.checks.find(c=>c.code==='invoice_sale_client_mismatch').count,1);
 assert.deepEqual(await one('select client_id from crm_invoices where id=$1',[inv.invoice_id]),before,'audit never repairs rows');
});
test('pipeline collaboration: owner attribution, cross-owner file download, outsider denial and immutable stage history', {timeout:180000},async t=>{
 const {db,as,one}=await setup(t);await as(A);
 const lead=(await one("insert into crm_leads(company,source,owner_id) values('Synthetic card','manual',$1) returning id",[A])).id;
 await as(B);
 const note=await one("insert into crm_activities(lead_id,kind,body,status,created_by) values($1,'note','Synthetic message','completed',$2) returning id,created_by",[lead,A]);
 assert.equal(note.created_by,B,'server must attribute actual actor, not supplied creator');
 const bytes=Buffer.from('Synthetic attachment');const digest=crypto.createHash('sha256').update(bytes).digest('hex');
 const file=await one("insert into crm_attachments(lead_id,filename,mime,size_bytes,sha256,content,created_by) values($1,'qa.txt','text/plain',$2,$3,$4,$5) returning id,created_by",[lead,bytes.length,digest,bytes,A]);
 assert.equal(file.created_by,B);
 await db.query("update crm_leads set stage_id='contacted' where id=$1",[lead]);
 const history=await one("select actor_id from crm_lead_stage_history where lead_id=$1 and to_stage='contacted'",[lead]);assert.equal(history.actor_id,B);
 await as(A);const downloaded=await one('select content,sha256 from crm_attachments where id=$1',[file.id]);assert.deepEqual(Buffer.from(downloaded.content),bytes);assert.equal(downloaded.sha256,digest);
 await assert.rejects(db.query('update crm_lead_stage_history set actor_id=$1 where lead_id=$2',[A,lead]),/permission denied/);
 await as(OUT);for(const table of ['crm_activities','crm_attachments','crm_lead_stage_history'])assert.equal((await one(`select count(*)::int n from ${table} where lead_id=$1`,[lead])).n,0,table);
 await assert.rejects(db.query("insert into crm_activities(lead_id,body) values($1,'outsider')",[lead]),{code:'42501'});
});
