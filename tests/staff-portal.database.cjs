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
