const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
test('all unified migrations coexist; project operations persist, archive and reject outsiders', {timeout:60000},async t=>{
 const db=new PGlite();t.after(()=>db.close());
 for(const file of ['tests/sql/00_supabase_stub.sql', ...fs.readdirSync('supabase/migrations').sort().map(f=>'supabase/migrations/'+f)])await db.exec(fs.readFileSync(file,'utf8'));
 await db.exec(fs.readFileSync('tests/sql/os_modules_rls.test.sql','utf8').replace(/^\\.*$/gm,''));
 await db.exec("reset role;set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';set role authenticated;");
 const row=(await db.query(`insert into os_projects(module,name,created_by,settings) values('website','Synthetic operations',auth.uid(),'{"operations":{"tasks":"Review deployment","url":"https://example.invalid"}}') returning id`)).rows[0];
 await db.query("update os_projects set status='archived' where id=$1",[row.id]);
 const saved=(await db.query('select settings,status from os_projects where id=$1',[row.id])).rows[0];assert.equal(saved.status,'archived');assert.equal(saved.settings.operations.tasks,'Review deployment');
 await db.exec("reset role;set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';set role authenticated;");assert.equal((await db.query('select id from os_projects where id=$1',[row.id])).rows.length,0);
});
