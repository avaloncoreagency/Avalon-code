// Isolated PGlite test for owner-only B2C policy persistence. Synthetic data only.
// This test intentionally does not expose anon write or delivery to contractors.
const {test}=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");
const {PGlite}=require("@electric-sql/pglite");
const MIGUEL="00000000-0000-4000-8000-0000000000a1",SAMUEL="00000000-0000-4000-8000-0000000000b2",OUTSIDER="00000000-0000-4000-8000-0000000000c3";
test("commercial B2C: isolated owner-only policies, immutable recipient, private audit and no public intake",{timeout:180000},async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql","utf8"));
 await db.exec("create schema storage; create table storage.buckets (id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects (id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,owner uuid default auth.uid(),unique(bucket_id,name));alter table storage.objects enable row level security;");
 await db.exec("insert into auth.users(id) values('"+MIGUEL+"'),('"+SAMUEL+"'),('"+OUTSIDER+"')");
 for(const file of fs.readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort()){
  await db.exec(fs.readFileSync("supabase/migrations/"+file,"utf8"));
  if(file.startsWith("20261102053022"))await db.exec("insert into agency_memberships(user_id,role) values('"+MIGUEL+"','owner'),('"+SAMUEL+"','owner'),('"+OUTSIDER+"','operator')");
 }
 const as=async(role,id="")=>db.exec("reset role;set request.jwt.claim.sub='"+id+"';set role "+role);
 const q=async(sql,params)=>(await db.query(sql,params)).rows;
 const denied=async(sql,params)=>{await db.exec("savepoint s");try{await db.query(sql,params);assert.fail("expected rejection")}catch(err){await db.exec("rollback to savepoint s");if(err.code==="ERR_ASSERTION")throw err;}};
 await db.exec("begin");
 await as("authenticated",MIGUEL);
 const contractor=(await q("insert into crm_clients(legal_name,client_code,status) values('Synthetic Contractor A','CLI-993001','active') returning id"))[0].id;
 const contractorB=(await q("insert into crm_clients(legal_name,client_code,status) values('Synthetic Contractor B','CLI-993002','active') returning id"))[0].id;
 const project=(await q("insert into os_projects(module,name,description,status,settings) values('marketing','B2C Synthetic Campaign','','draft','{}') returning id"))[0].id;
 const policy=(await q("insert into crm_b2c_target_policies(campaign_project_id,version,contractor_client_id,allowed_zips,active,signed_contract_verified,license_verified,capacity_available,consent_version,effective_from) values($1,1,$2,ARRAY['33311'],true,true,true,true,'consent-v1',now()-interval '1 minute') returning id",[project,contractor]))[0].id;
 const key="00000000-0000-4000-8000-0000000000d4";
 const request=(await q("insert into crm_b2c_requests(request_key,policy_id,campaign_project_id,policy_version,contractor_client_id,displayed_contractor_id,consented_contractor_id,consent_version,consent_at,zip) values($1,$2,$3,1,$4,$4,$4,'consent-v1',now(),'33311') returning id,contractor_client_id,status",[key,policy,project,contractor]))[0];
 assert.equal(request.contractor_client_id,contractor);
 assert.equal(request.status,"routed");
 await denied("update crm_b2c_requests set contractor_client_id=$1 where id=$2",[contractorB,request.id]);
 await denied("insert into crm_b2c_requests(request_key,policy_id,campaign_project_id,policy_version,contractor_client_id,displayed_contractor_id,consented_contractor_id,consent_version,consent_at,zip) values(gen_random_uuid(),$1,$2,1,$3,$3,$3,'consent-v1',now(),'33009')",[policy,project,contractor]);
 await denied("update crm_b2c_requests set status='won' where id=$1",[request.id]);
 await q("update crm_b2c_requests set status='acknowledged' where id=$1",[request.id]);
 const events=await q("select old_status,new_status from crm_b2c_request_events where request_id=$1 order by id",[request.id]);
 assert.deepEqual(events.map(x=>x.new_status),["routed","acknowledged"]);
 await as("authenticated",SAMUEL);
 assert.equal((await q("select id from crm_b2c_requests where id=$1",[request.id])).length,1);
 await as("authenticated",OUTSIDER);
 assert.equal((await q("select id from crm_b2c_requests")).length,0);
 await denied("insert into crm_b2c_target_policies(campaign_project_id,version,contractor_client_id,allowed_zips,consent_version,effective_from) values($1,2,$2,ARRAY['33311'],'consent-v1',now())",[project,contractor]);
 await as("anon");
 await denied("select * from crm_b2c_requests");
 await denied("select * from crm_b2c_target_policies");
 await denied("select * from crm_b2c_request_events");
 await db.exec("rollback");
});
