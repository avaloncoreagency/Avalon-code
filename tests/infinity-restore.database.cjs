// AVL-CODEX-INFINITY-001: synthetic file-backed PGlite recovery only; not a hosted Supabase backup.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const approveFixtureOffers=require('./helpers/approve-fixture-offers.cjs');
const verifiedContract=require('./helpers/verified-contract.cjs');
const OWNER='00000000-0000-4000-8000-0000000000a1', OUT='00000000-0000-4000-8000-0000000000c3';
test('isolated filesystem restore preserves commercial records, RLS and revoked private RPC execution', {timeout:240000}, async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'avalon-restore-'));
 const original=path.join(root,'source'), restored=path.join(root,'restored');
 let db=null;
 const as=async id=>db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated;`);
 const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
 try {
  db=new PGlite(original);
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[OWNER,'owner@example.invalid',OUT,'outside@example.invalid']);
  for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   await db.exec(fs.readFileSync(path.join('supabase/migrations',f),'utf8'));
   if(f.startsWith('20261102053022'))await db.query("insert into agency_memberships(user_id,role) values($1,'owner'),($2,'operator')",[OWNER,OUT]);
  }
  await approveFixtureOffers(db,OWNER,[['desarrollo-web',1250]]);
  await as(OWNER);
  const lead=(await one("insert into crm_leads(company,source,owner_id) values('Synthetic restore QA','manual',$1) returning id",[OWNER])).id;
  await verifiedContract(db,lead);
  const request={idempotency_key:crypto.randomUUID(),lead_id:lead,new_client:{legal_name:'Synthetic restore QA'},seller_id:OWNER,lines:[{service_code:'desarrollo-web',unit_price:'1250.00'}]};
  const sale=(await one('select crm_confirm_sale($1::jsonb) r',[JSON.stringify(request)])).r;
  const invoice=(await one('select crm_invoice_record($1::jsonb) r',[JSON.stringify({sale_id:sale.sale_id,number:'QA-RESTORE-001',amount:'1250.00'})])).r;
  const snapshot=async()=>({
   sale:await one('select id,client_id,total::text,currency,status from crm_sales where id=$1',[sale.sale_id]),
   invoice:await one('select id,sale_id,client_id,amount::text from crm_invoices where id=$1',[invoice.invoice_id]),
   lead:await one('select id,stage_id,owner_id from crm_leads where id=$1',[lead])
  });
  const before=await snapshot();
  assert.equal(before.sale.total,'1250.00');
  await db.exec('reset role');
  const rls=await one("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity");
  assert.ok(rls.n>0);
  await db.close();db=null;
  // Copy only a closed, disposable database directory. No production snapshot or connection exists.
  fs.cpSync(original,restored,{recursive:true,errorOnExist:true,force:false});
  db=new PGlite(restored);
  assert.deepEqual(await one("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity"),rls);
  await as(OWNER);
  assert.deepEqual(await snapshot(),before);
  assert.equal((await one('select crm_confirm_sale($1::jsonb) r',[JSON.stringify(request)])).r.sale_id,sale.sale_id,'idempotent after restore');
  await as(OUT);
  assert.equal((await one('select count(*)::int n from crm_sales')).n,0);
  assert.equal((await one("select has_function_privilege('authenticated','crm_private.confirm_sale_internal(jsonb)','EXECUTE') allowed")).allowed,false);
  await assert.rejects(db.query('select crm_confirm_sale($1::jsonb)',[JSON.stringify(request)]),/crm_forbidden/);
 } finally {
  try {if(db)await db.close();}finally{fs.rmSync(root,{recursive:true,force:true});}
 }
});
