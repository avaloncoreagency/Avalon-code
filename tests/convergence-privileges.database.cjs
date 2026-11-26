const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
test('reviewed authority RPCs reject direct anonymous/non-owner use and request table has no anon privileges',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',['anon','public.crm_quote_deletion_requests',privilege])).rows[0].allowed,false);
 for(const signature of ['crm_link_verified_quote_contract(uuid,uuid,uuid)','crm_decide_quote_deletion(uuid,text,boolean)'])assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed',['anon','public.'+signature,'EXECUTE'])).rows[0].allowed,false);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select crm_link_verified_quote_contract(null,null,null)'),/crm_forbidden/);
 await assert.rejects(db.query("select crm_decide_quote_deletion(null,'approved',true)"),/crm_forbidden/);
});
