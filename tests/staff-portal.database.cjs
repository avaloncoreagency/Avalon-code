// Isolated PGlite integration: no network, production identities or real customers.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const MIGUEL="00000000-0000-4000-8000-0000000000a1";
const SAMUEL="00000000-0000-4000-8000-0000000000b2";
const EMP1="00000000-0000-4000-8000-0000000000c3";
const EMP2="00000000-0000-4000-8000-0000000000d4";
const OUT="00000000-0000-4000-8000-0000000000e5";

test("commercial history returns the active agent's sales and commissions only, with pagination and MFA", {timeout:120000}, async t=>{
 const db = new PGlite();
 t.after(()=>db.close());
 await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql","utf8"));
 await db.query("insert into auth.users(id) values ($1),($2),($3)", [MIGUEL, EMP1, EMP2]);
 for (const file of fs.readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort()) {
   await db.exec(fs.readFileSync("supabase/migrations/"+file,"utf8"));
 }
 const as = async (id, aal='aal1')=>{
   await db.exec("reset role");
   await db.query("select set_config('request.jwt.claims', $1, false)",[JSON.stringify({sub:id,aal})]);
   await db.exec("set role authenticated");
 };
 await db.query("insert into agency_memberships(user_id,role) values ($1,'owner'),($2,'operator'),($3,'operator')", [MIGUEL, EMP1, EMP2]);
 await as(MIGUEL);
 await db.query("insert into staff_portal_access(user_id,active) values ($1,true),($2,true)", [EMP1, EMP2]);
 await db.exec("reset role");
 const client = (await db.query("insert into crm_clients(legal_name,source,owner_id,created_by) values('Cliente sintético','QA',$1,$1) returning id", [MIGUEL])).rows[0].id;
 const sales = (await db.query(`
   insert into crm_sales(sale_number,idempotency_key,correlation_id,client_id,sold_on,currency,subtotal,total,billing_mode,seller_id,created_by)
   select 'QA-' || n,gen_random_uuid(),gen_random_uuid(),$1,date '2026-11-16','USD',9999,9999,'one_time',
     case when n <= 30 then $2::uuid else $3::uuid end,$4
   from generate_series(1,31) n returning id,seller_id,sale_number`, [client, EMP1, EMP2, MIGUEL])).rows;
 const ownSale = sales.find(s=>s.seller_id===EMP1);
 const otherSale = sales.find(s=>s.seller_id===EMP2);
 await db.query(`
   insert into crm_commissions(sale_id,client_id,kind,beneficiary_id,basis,fixed_amount,currency,amount,agreed_by)
   values ($1,$3,'sale',$4,'Synthetic agreement',18.45,'USD',18.45,$6),
     ($2,$3,'referral',$4,'Synthetic referral',2.22,'USD',2.22,$6),
     ($2,$3,'sale',$5,'Synthetic other agreement',67.89,'USD',67.89,$6)`,
   [ownSale.id, otherSale.id, client, EMP1, EMP2, MIGUEL]);
 const read = async (page=0)=>(await db.query("select * from public.staff_own_commercial_history($1)",[page])).rows;
 await as(EMP1);
 const first = await read(), second = await read(1);
 assert.equal(first.length,26);
 assert.equal(second.length,7);
 assert.equal(first[25].record_id,second[0].record_id);
 assert.deepEqual(await read(-1),first);
 const own = [...first.slice(0,25),...second];
 assert.equal(new Set(own.map(r=>r.record_id)).size,32);
 assert.equal(own.filter(r=>r.record_kind==='sale').length,30);
 assert.ok(own.filter(r=>r.record_kind==='sale').every(r=>r.amount===null && r.currency===null));
 assert.deepEqual(own.filter(r=>r.has_commission_agreement).map(r=>r.record_id),[ownSale.id]);
 assert.deepEqual(own.filter(r=>r.record_kind==='commission').map(r=>r.amount).sort(), ['18.45','2.22']);
 assert.equal(own.find(r=>r.amount==='2.22').sale_number,null);
 assert.ok(own.every(r=>r.sale_number!==otherSale.sale_number));
 assert.equal((await db.query("select * from public.crm_commissions")).rows.length,0);
 assert.equal((await db.query("select * from public.crm_sales")).rows.length,0);
 await as(EMP2);
 assert.deepEqual((await read()).map(r=>r.amount).sort(),['67.89',null]);
 await as(MIGUEL);
 assert.deepEqual(await read(),[]);
 await db.exec("reset role");
 await db.query("insert into auth.mfa_factors(user_id,status) values ($1,'verified')", [EMP1]);
 await as(EMP1);
 assert.deepEqual(await read(),[]);
 await as(EMP1,'aal2');
 assert.equal((await read()).length,26);
 await as(MIGUEL);
 await db.query("update staff_portal_access set active=false where user_id=$1",[EMP1]);
 await as(EMP1,'aal2');
 assert.deepEqual(await read(),[], "suspension takes effect for the same AAL2 session");
 await db.exec("reset role; set role anon;");
 await assert.rejects(read(),/permission denied/);
});

test("staff portal: owner-granted clients, isolated personal dossiers, private DMs and revocation", {timeout:120000}, async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql","utf8"));
 await db.exec(`insert into auth.users(id,email) values
 ('${MIGUEL}','miguel@example.invalid'),('${SAMUEL}','samuel@example.invalid'),
 ('${EMP1}','a@example.invalid'),('${EMP2}','b@example.invalid'),
 ('${OUT}','outsider@example.invalid')`);
 const migrations=fs.readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort();
 for(const file of migrations){
   await db.exec(fs.readFileSync("supabase/migrations/"+file,"utf8"));
   if(file.startsWith("20261102053022"))
     await db.exec(`insert into agency_memberships(user_id,role) values
       ('${MIGUEL}','owner'),('${SAMUEL}','owner'),
       ('${EMP1}','operator'),('${EMP2}','operator')`);
 }
 const as=u=>db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
 const q=(sql,params)=>db.query(sql,params).then(r=>r.rows);
 const n=async sql=>Number((await q(`select count(*) n from ${sql}`))[0].n);

 await as(EMP1);
 assert.equal(await n("staff_client_grants"),0,"not assigned anything by default");
 assert.equal(await n("staff_casefiles"),0);
 assert.equal(await n("staff_contacts"),0,"inactive worker cannot enumerate colleagues");
 await assert.rejects(db.query("insert into staff_casefiles(title) values('unapproved')"),/row-level security|permission denied|policy/i);
 await assert.rejects(db.query("insert into staff_private_messages(recipient_id,body) values($1,'hello')",[MIGUEL]),/row-level security|permission denied|policy/i);
 assert.equal(await n("crm_clients"),0,"owner-only CRM stays blocked");

 await as(MIGUEL);
 const [client]=await q("insert into crm_clients(legal_name,source,owner_id) values('Synthetic Co','Test',$1) returning id",[MIGUEL]);
 await db.query("insert into staff_portal_access(user_id,active,can_create_casefiles,can_message,granted_by) values($1,true,true,true,$2),($3,true,true,true,$2)",[EMP1,MIGUEL,EMP2]);
 await db.query("insert into staff_contacts(user_id,display_name,is_listed) values($1,'Employee A',true),($2,'Employee B',true)",[EMP1,EMP2]);
 await db.query("insert into staff_client_grants(user_id,client_id,client_name,access_level,granted_by) values($1,$2,'Synthetic Co','work',$3)",[EMP1,client.id,MIGUEL]);
 assert.equal(await n("staff_permission_events"),3,"grants are audited");
 await as(EMP1);
 assert.equal(await n("crm_clients"),0,"assigned employee cannot query owner-only CRM directly");
 assert.equal(await n("staff_client_grants"),1,"granted card only");
 assert.equal((await q("select client_name from staff_client_grants"))[0].client_name,"Synthetic Co");
 const [case1]=await q("insert into staff_casefiles(title,notes,linked_client_id) values('Private A','Secret for A',$1) returning id,user_id",[client.id]);
 assert.equal(case1.user_id,EMP1);
 const [case2]=await q("insert into staff_casefiles(title,notes) values('Personal prospect A','Unlinked private file') returning id");
 assert.ok(case2?.id, "an active employee can open an unlinked personal casefile");
 await assert.rejects(db.query("insert into staff_casefiles(user_id,title) values($1,'Spoof')",[EMP2]),/row-level security|policy|permission denied|casefile_self_only/i);
 await assert.rejects(db.query("insert into staff_casefiles(title,linked_client_id) values('No access',gen_random_uuid())"),/row-level security|foreign key|policy/i);
 const [msg]=await q("insert into staff_private_messages(sender_id,recipient_id,body) values($1,$2,'Hello B') returning id,sender_id",[MIGUEL,EMP2]);
 assert.equal(msg.sender_id,EMP1,"message sender derived from verified session");
 await as(EMP2);
 assert.equal(await n("staff_casefiles"),0,"same agency members cannot see each other's files");
 assert.equal(await n("staff_client_grants"),0,"no inferred client access");
 assert.equal(await n("staff_private_messages"),1,"recipient sees their DM");
 assert.equal((await q("update staff_private_messages set read_at=now() where id=$1 returning id",[msg.id])).length,1);
 await assert.rejects(db.query("update staff_private_messages set body='altered' where id=$1",[msg.id]),/permission denied/i);
 await as(SAMUEL);
 assert.equal(await n("staff_casefiles"),2,"either real owner can see all dossiers");
 assert.equal(await n("staff_private_messages"),0,"owner not in chat cannot read it");
 await as(MIGUEL);
 assert.equal(await n("staff_private_messages"),0,"sender spoof was blocked");
 const [toStaff]=await q("insert into staff_private_messages(recipient_id,body) values($1,'Owner to A') returning sender_id",[EMP1]);
 assert.equal(toStaff.sender_id,MIGUEL);
 await db.query("update staff_client_grants set active=false where user_id=$1 and client_id=$2",[EMP1,client.id]);
 await as(EMP1);
 assert.equal(await n("staff_client_grants"),0,"revoke takes effect at the data layer");
 assert.equal(await n("staff_casefiles"),1,"linked dossier hidden after revocation, unlinked remains private");
 await as(MIGUEL);
 // Disabling just the message permission must immediately hide existing DMs
 // and prevent new sends, even while the employee can still use casefiles.
 await db.query("update staff_portal_access set can_message=false where user_id=$1",[EMP1]);
 await as(EMP1);
 assert.equal(await n("staff_private_messages"),0,"messaging permission revoked: no message content exposed");
 assert.equal(await n("staff_casefiles"),1,"casefile permission unaffected by message revocation");
 await assert.rejects(db.query("insert into staff_private_messages(recipient_id,body) values($1,'blocked')",[EMP2]),/row-level security|policy|permission denied/i);
 await as(MIGUEL);
 await db.query("update staff_portal_access set active=false where user_id=$1",[EMP1]);
 await as(EMP1);
 assert.equal(await n("staff_casefiles"),0,"deactivated employee loses ALL case access");
 assert.equal(await n("staff_private_messages"),0,"deactivated employee loses message access");
 await assert.rejects(db.query("insert into staff_private_messages(recipient_id,body) values($1,'bypass')",[EMP2]),/row-level security|policy|permission denied/i);
 await as(OUT);
 assert.equal(await n("staff_client_grants"),0,"outsider sees nothing");
 assert.equal(await n("staff_contacts"),0);
 assert.equal(await n("staff_permission_events"),0);
 await assert.rejects(db.query("insert into staff_portal_access(user_id,active) values($1,true)",[OUT]),/row-level security|policy|permission denied/i);
});

test("staff v1.1: job title is not authorization; seller sees only own granted leads, redacted and live; audit", {timeout:120000}, async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql","utf8"));
 await db.exec(`insert into auth.users(id,email) values ('${MIGUEL}','m@example.invalid'),('${EMP1}','a@example.invalid'),('${EMP2}','b@example.invalid'),('${OUT}','o@example.invalid')`);
 for(const file of fs.readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort()){
   await db.exec(fs.readFileSync("supabase/migrations/"+file,"utf8"));
   if(file.startsWith("20261102053022")) await db.exec(`insert into agency_memberships(user_id,role) values ('${MIGUEL}','owner'),('${EMP1}','operator'),('${EMP2}','operator')`);
 }
 const as=u=>db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
 const q=(sql,p)=>db.query(sql,p).then(r=>r.rows);
 await as(MIGUEL);
 const [lead]=await q("insert into crm_leads(company,contact,email,phone,source,owner_id,value) values('Lead Sintético','Ana','ana@example.invalid','+10000000','Test',$1,9999) returning id",[MIGUEL]);
 const [other]=await q("insert into crm_leads(company,contact,source,owner_id) values('Otro Lead','Bo','Test',$1) returning id",[MIGUEL]);
 await q("insert into staff_portal_access(user_id,active,job_title) values($1,true,'seller'),($2,true,'operator')",[EMP1,EMP2]);
 // A job title can only be one of the defined profiles.
 await assert.rejects(q("update staff_portal_access set job_title='owner' where user_id=$1",[EMP1]),/check/i);
 await q("insert into staff_lead_grants(user_id,lead_id,access_level) values($1,$2,'view')",[EMP1,lead.id]);

 await as(EMP1);
 let mine=await q("select * from staff_my_leads()");
 assert.deepEqual(mine.map(r=>[r.company,r.email,r.phone]),[["Lead Sintético",null,null]],"view grant: no contact channels, no other leads");
 assert.ok(!("value" in mine[0]) && !("owner_id" in mine[0]),"no value/owner exposed");
 assert.equal((await q("select count(*)::int n from crm_leads"))[0].n,0,"crm_leads RLS stays owner-only");
 await assert.rejects(q("insert into staff_lead_grants(user_id,lead_id,access_level) values($1,$2,'work')",[EMP1,other.id]),/row-level security|policy/i,"no self-assignment");
 assert.equal((await db.query("update staff_portal_access set job_title='seller', active=true where user_id=$1",[EMP2])).affectedRows,0,"cannot change another worker's access");
 assert.equal((await db.query("update staff_portal_access set job_title='account_executive' where user_id=$1",[EMP1])).affectedRows,0,"cannot change own job title/capabilities");
 await as(EMP2);
 assert.equal((await q("select count(*)::int n from staff_my_leads()"))[0].n,0,"horizontal isolation");
 assert.equal((await q("select count(*)::int n from staff_lead_grants"))[0].n,0);
 await as(OUT);
 assert.equal((await q("select count(*)::int n from staff_my_leads()"))[0].n,0,"unknown user");

 await as(MIGUEL);
 await q("update staff_lead_grants set access_level='work' where user_id=$1",[EMP1]);
 await as(EMP1);
 mine=await q("select email,phone from staff_my_leads()");
 assert.deepEqual(mine,[{email:"ana@example.invalid",phone:"+10000000"}],"work grant shows contact channels");
 await as(MIGUEL);
 await q("update staff_portal_access set active=false where user_id=$1",[EMP1]);
 await as(EMP1);
 assert.equal((await q("select count(*)::int n from staff_my_leads()"))[0].n,0,"suspended account loses leads immediately");
 await as(MIGUEL);
 await q("update staff_portal_access set active=true where user_id=$1",[EMP1]);
 await q("update staff_lead_grants set active=false where user_id=$1",[EMP1]);
 await as(EMP1);
 assert.equal((await q("select count(*)::int n from staff_my_leads()"))[0].n,0,"revoked lead disappears");
 await as(MIGUEL);
 const ev=(await q("select action from staff_permission_events where lead_id is not null order by id")).map(r=>r.action);
 assert.deepEqual(ev,["lead_granted","lead_changed","lead_revoked"]);
 await as(EMP1);
 assert.equal((await q("select count(*)::int n from staff_permission_events"))[0].n,0,"audit is owner-only");
 await db.exec("reset role");
 const anon=(await q("select has_function_privilege('anon','public.staff_my_leads()','execute') x"))[0].x;
 assert.equal(anon,false,"anon cannot call staff_my_leads");
});

test('enrolled MFA gates direct owner/Staff RLS and lead RPC without changing opt-in policy', {timeout:120000}, async t => {
 const db = new PGlite(); t.after(()=>db.close());
 await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
 await db.query('insert into auth.users(id) values ($1),($2),($3),($4)', [MIGUEL,EMP1,EMP2,OUT]);
 for (const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())
   await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.query("insert into agency_memberships(user_id,role) values($1,'owner'),($2,'operator'),($3,'operator')", [MIGUEL,EMP1,EMP2]);
 const as = async (id,aal='aal1') => {
   await db.exec('reset role');
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,...(aal ? {aal} : {})})]);
   await db.exec('set role authenticated');
 };
 const rows = async sql => (await db.query(sql)).rows;
 const protectedStaff = ['staff_casefiles','staff_work_items','staff_private_messages'];
 const assertStaffRows = async count => { for (const table of protectedStaff) assert.equal((await rows('select * from '+table)).length,count,table); };
 await as(MIGUEL);
 await db.query("insert into staff_portal_access(user_id,active,can_create_casefiles,can_message) values($1,true,true,true),($2,true,true,true)",[EMP1,EMP2]);
 const lead = (await db.query("insert into crm_leads(company,contact,source,owner_id) values('MFA QA','Synthetic','QA',$1) returning id",[MIGUEL])).rows[0].id;
 await db.query("insert into staff_lead_grants(user_id,lead_id,access_level) values($1,$2,'work')",[EMP1,lead]);
 await db.query("insert into staff_contacts(user_id,display_name,is_listed) values($1,'Synthetic B',true)",[EMP2]);
 await db.query("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at) values(gen_random_uuid(),'task','staff_assigned',$1,'MFA QA task',now())",[EMP1]);
 await as(EMP1);
 await db.query("insert into staff_private_messages(recipient_id,body) values($1,'MFA QA message')",[EMP2]);
 await db.query("insert into staff_casefiles(title) values('MFA synthetic dossier')");
 await assertStaffRows(1);
 assert.equal((await rows('select * from staff_my_leads()')).length,1);
 // Only a verified factor changes the existing opt-in policy.
 await db.exec('reset role');
 await db.query("insert into auth.mfa_factors(user_id,status) values($1,'unverified')",[EMP1]);
 await as(EMP1);
 assert.equal((await rows('select * from staff_my_leads()')).length,1);
 await db.exec('reset role');
 await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified'),($2,'verified')",[EMP1,MIGUEL]);
 await as(MIGUEL);
 assert.equal((await rows('select * from crm_leads')).length,0,'enrolled owner AAL1 cannot read CRM directly');
 assert.equal((await rows('select os_private.is_owner() allowed'))[0].allowed,false,'OS owner gate matches CRM');
 await assert.rejects(db.query("select crm_confirm_sale('{}'::jsonb)"), /forbidden|owner|unauthorized/i, 'privileged sales RPC rejects before reading payload');
 await assert.rejects(db.query("insert into crm_leads(company,source,owner_id) values('Denied','QA',$1)",[MIGUEL]), {code:'42501'});
 for (const aal of ['aal1',null,'invalid']) {
   await as(EMP1,aal);
   assert.equal((await rows('select * from staff_my_leads()')).length,0,'lead projection checks enrolled MFA');
   await assertStaffRows(0);
   await assert.rejects(db.query("insert into staff_casefiles(title) values('Denied')"),/row-level security|permission denied/i);
 }
 await as(EMP1,'aal2');
 assert.equal((await rows('select * from staff_my_leads()')).length,1);
 await assertStaffRows(1);
 assert.equal((await rows('select * from crm_leads')).length,0,'AAL2 does not promote staff to owner');
 await as(EMP2,'aal2');
 assert.equal((await rows('select * from staff_my_leads()')).length,0,'seller B cannot read A');
 assert.equal((await rows('select * from staff_casefiles')).length,0);
 await as(OUT,'aal2');
 assert.equal((await rows('select * from crm_leads')).length,0,'AAL2 alone grants no membership');
 assert.equal((await rows('select * from staff_my_leads()')).length,0);
 await as(MIGUEL,'aal2');
 assert.equal((await rows('select * from crm_leads')).length,1,'legitimate owner retains access');
 await db.query('update staff_portal_access set active=false where user_id=$1',[EMP1]);
 await as(EMP1,'aal2');
 assert.equal((await rows('select * from staff_my_leads()')).length,0,'suspension invalidates the unchanged claims');
 await assertStaffRows(0);
 await as(MIGUEL,'aal2');
 await db.query('update staff_portal_access set active=true where user_id=$1',[EMP1]);
 await as(EMP1,'aal2');
 await assert.rejects(db.query('select * from auth.mfa_factors'),/permission denied/,'factor table remains private');
 await db.exec('reset role; set role anon');
 await assert.rejects(db.query('select * from staff_my_leads()'),/permission denied/);
 // A complete synthetic data-directory restore must retain schema, ACL and MFA.
 // This is NOT a Supabase production backup/restore certification.
 await db.exec('reset role');
 const manifestSQL = `select c.relname, c.relrowsecurity, c.relacl::text,
   (select count(*)::int from pg_policy p where p.polrelid=c.oid) policies
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' order by c.relname`;
 const manifest = (await db.query(manifestSQL)).rows;
 const snapshot = await db.dumpDataDir();
 assert.ok(snapshot.size > 0);
 const restored = new PGlite({loadDataDir:snapshot}); t.after(()=>restored.close());
 assert.deepEqual((await restored.query(manifestSQL)).rows,manifest);
 await restored.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:EMP1,aal:'aal1'})]);
 await restored.exec('set role authenticated');
 assert.deepEqual((await restored.query('select * from staff_my_leads()')).rows,[]);
 await restored.exec('reset role');
 await restored.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:EMP1,aal:'aal2'})]);
 await restored.exec('set role authenticated');
 assert.equal((await restored.query('select * from staff_my_leads()')).rows.length,1);
 await assert.rejects(restored.query('select * from auth.mfa_factors'),{code:'42501'});
});
