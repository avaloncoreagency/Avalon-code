const {test}=require('node:test');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
test('13-stage pipeline, client profile and recorded conversion on isolated PostgreSQL',{timeout:90000},async t=>{
 const db=new PGlite();t.after(()=>db.close());
 for(const file of ['tests/sql/00_supabase_stub.sql',...fs.readdirSync('supabase/migrations').sort().map(f=>'supabase/migrations/'+f)])await db.exec(fs.readFileSync(file,'utf8'));
 await db.exec(fs.readFileSync('tests/sql/crm_pipeline.test.sql','utf8').replace(/^\\.*$/gm,''));
});
