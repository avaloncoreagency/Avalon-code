// Exercise the exact browser fixture after an anonymous request, without changing application authorization.
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const OWNER='00000000-0000-4000-8000-0000000000a1';
test('inbound synthetic seed supplies the approved audit actor after anonymous identity restoration',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
 await db.query('insert into auth.users(id) values($1)',[OWNER]);
 for(const p of fs.readdirSync('supabase/migrations').filter(p=>p.endsWith('.sql')).sort()){
  await db.exec(fs.readFileSync('supabase/migrations/'+p,'utf8'));
  if(p.startsWith('20261102053022'))await db.query("insert into agency_memberships(user_id,role) values($1,'owner')",[OWNER]);
 }
 await db.exec("set request.jwt.claim.sub='';set role anon;");
 const user={user:{id:OWNER}};
 await assert.rejects(require('./support/inbound-ui.cjs')({db,miguel:user,samuel:user,context:async()=>{throw Error('SEED_COMPLETE');}}),/SEED_COMPLETE/);
 await db.exec('reset role');
 const rows=(await db.query('select company,created_by,source_kind from crm_prospects order by company')).rows;
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.created_by===OWNER&&r.source_kind==='licensed'));
 const receipts=(await db.query('select count(*)::int n from crm_public_inquiries')).rows[0].n;
 assert.equal(receipts,1,'receipt membership separates voluntary inquiry from undisclosed Radar-only discovery');
});
