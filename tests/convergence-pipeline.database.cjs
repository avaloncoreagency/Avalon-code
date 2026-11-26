const {test}=require('node:test');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
test('complete migration chain executes the canonical 13-stage SQL acceptance fixture',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(fs.readFileSync('tests/sql/crm_pipeline.test.sql','utf8'));
});
