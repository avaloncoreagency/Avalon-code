const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('review-only restore ACL repair removes anonymous exposure and keeps authenticated permission, idempotently',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
 for(const f of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 const permissions=async()=>(await db.query("select has_function_privilege('anon','public.os_project_restore_version(uuid,text)','EXECUTE') as anon,has_function_privilege('authenticated','public.os_project_restore_version(uuid,text)','EXECUTE') as authenticated")).rows[0];
 await db.exec('grant execute on function public.os_project_restore_version(uuid,text) to anon');assert.equal((await permissions()).anon,true);
 const sql=fs.readFileSync('docs/recovery/proposals/restore-version-execute-review.sql','utf8');await db.exec(sql);await db.exec(sql);
 assert.deepEqual(await permissions(),{anon:false,authenticated:true});
 await db.exec('set role anon');await assert.rejects(db.query("select public.os_project_restore_version('11111111-1111-4111-8111-111111111111','synthetic')"),e=>e.code==='42501');
});
