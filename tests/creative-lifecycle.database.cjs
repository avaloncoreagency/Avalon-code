const {test}=require('node:test');const assert=require('node:assert/strict');const {setup,OWNER,OTHER,OUTSIDER,MACHINE}=require('./support/creative-continuity-db.cjs');
test('persistent unassigned libraries, later CRM association, checkpoints and authorization', {timeout:120000},async t=>{
 const {db,as}=await setup(t);await as(OWNER);
 const create=async(module,name='Unassigned synthetic')=>(await db.query('select os_create_unassigned_creative_project($1,$2,$3,$4,$5) receipt',[module,'synthetic-'+module,name,'Private draft','codex'])).rows[0].receipt;
 const ids=[];for(const moduleKey of ['website','ecommerce','crm_creator']){const first=await create(moduleKey);ids.push(first.project_id);assert.equal((await create(moduleKey)).project_id,first.project_id);assert.equal((await create(moduleKey)).created,false);}
 assert.equal(Number((await db.query('select count(*) n from crm_leads')).rows[0].n),0);
 assert.equal(Number((await db.query('select count(*) n from crm_sales')).rows[0].n),0);
 const lead=(await db.query('insert into crm_leads(company,source,owner_id) values($1,$2,$3) returning id',['Synthetic Client','synthetic',OWNER])).rows[0];
 const client=(await db.query('insert into crm_clients(legal_name,source,owner_id,origin_lead_id) values($1,$2,$3,$4) returning id',['Synthetic Client','synthetic',OWNER,lead.id])).rows[0];
 const link=async id=>(await db.query('select os_link_creative_project($1,$2,$3) receipt',[id,lead.id,1])).rows[0].receipt;
 for(const id of ids){assert.equal((await link(id)).changed,true);assert.equal((await link(id)).changed,false);}
 const projects=(await db.query('select id,client_id,version,settings from os_projects')).rows;for(const p of projects){assert.equal(p.client_id,client.id);assert.equal(p.settings.operations.client_lead_id,lead.id);assert.equal(p.settings.creative.state,'reference_only');}
 const p=projects.find(p=>p.id===ids[0]),manifest={schema_version:1,project_ref:'synthetic-website',head_sha:'a'.repeat(40),assets:[{id:'hero',state:'failed'}]};
 const checkpoint=async(event,body=manifest,version=p.version)=>(await db.query('select os_save_creative_checkpoint($1,$2,$3,$4) receipt',[p.id,version,event,body])).rows[0].receipt;
 assert.equal((await checkpoint('e1')).replayed,false);assert.equal((await checkpoint('e1')).replayed,true);
 await assert.rejects(()=>checkpoint('e1',{...manifest,head_sha:'b'.repeat(40)}),e=>e.code==='40001');
 await assert.rejects(()=>checkpoint('e2'),e=>e.code==='40001');
 await assert.rejects(()=>checkpoint('e2',{...manifest,project_ref:'another'},p.version+1),e=>e.code==='22023');
 await as(OTHER);const stored=(await db.query('select settings from os_projects where id=$1',[p.id])).rows[0];assert.equal(stored.settings.creative_continuity.head_sha,manifest.head_sha);assert.equal(stored.settings.creative_continuity.assets[0].state,'failed');
 await as(OWNER);await db.exec('reset role');
 const sale=(await db.query(`insert into crm_sales(sale_number,idempotency_key,correlation_id,client_id,sold_on,currency,subtotal,total,billing_mode,seller_id,created_by) values('SYN-CREATIVE',gen_random_uuid(),gen_random_uuid(),$1,current_date,'USD',10,10,'one_time',$2,$2) returning id`,[client.id,OWNER])).rows[0];
 await as(OWNER);const version=(await db.query('select version from os_projects where id=$1',[p.id])).rows[0].version;
 const sold=(await db.query('select os_link_creative_sale($1,$2,$3) receipt',[p.id,sale.id,version])).rows[0].receipt;assert.equal(sold.changed,true);
 assert.equal((await db.query('select os_link_creative_sale($1,$2,$3) receipt',[p.id,sale.id,version])).rows[0].receipt.changed,false);
 const otherClient=(await db.query(`insert into crm_clients(legal_name,source,owner_id) values('Different Synthetic','synthetic',$1) returning id`,[OWNER])).rows[0];
 await db.exec('reset role');const wrong=(await db.query(`insert into crm_sales(sale_number,idempotency_key,correlation_id,client_id,sold_on,currency,subtotal,total,billing_mode,seller_id,created_by) values('SYN-OTHER',gen_random_uuid(),gen_random_uuid(),$1,current_date,'USD',10,10,'one_time',$2,$2) returning id`,[otherClient.id,OWNER])).rows[0];await as(OWNER);
 await assert.rejects(()=>db.query('select os_link_creative_sale($1,$2,$3)',[p.id,wrong.id,version+1]),e=>e.code==='22023');
 for(const who of [OUTSIDER,MACHINE]){await as(who);assert.equal((await db.query('select id from os_projects')).rows.length,0);await assert.rejects(()=>create('website'),e=>e.code==='42501');await assert.rejects(()=>link(p.id),e=>e.code==='42501');await assert.rejects(()=>checkpoint('e3'),e=>e.code==='42501');}
});
