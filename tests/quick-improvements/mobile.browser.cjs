'use strict';
// Five-screen synthetic smoke. No production database or external provider.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {spawn}=require('node:child_process'),{createServer}=require('node:http');
const {PGlite}=require('@electric-sql/pglite'),{chromium}=require('playwright');
const {startBridge}=require('../support/rest-bridge.cjs');
const OWNER='00000000-0000-4000-8000-0000000000a1';
const DIR=process.env.EVIDENCE_DIR||'evidence/quick-improvements';
test('five main mobile areas, records, filters, relationships and repeated actions',{timeout:240000},async t=>{
 fs.mkdirSync(DIR,{recursive:true});const db=new PGlite();t.after(()=>db.close());
 await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
 await db.query('insert into auth.users(id,email) values($1,$2)',[OWNER,'qa@example.invalid']);
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
  await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  if(f.startsWith('20261102053022'))await db.query("insert into agency_memberships(user_id,role) values($1,'owner')",[OWNER]);
 }
 await db.exec(`set request.jwt.claim.sub='${OWNER}';set role authenticated;`);
 const lead=(await db.query("insert into crm_leads(company,contact,email,source,owner_id) values('Mobile QA Studio','QA Contact','mobile@example.invalid','manual',$1) returning id",[OWNER])).rows[0].id;
 const client=(await db.query("insert into crm_clients(legal_name,trade_name,source,owner_id,origin_lead_id) values('Mobile QA Studio LLC','Mobile QA Studio','manual',$1,$2) returning id",[OWNER,lead])).rows[0].id;
 const product=(await db.query("insert into os_projects(module,name,client_id,settings) values('website','Mobile QA Website',$1,$2) returning id",[client,JSON.stringify({operations:{client_lead_id:lead}})])).rows[0].id;
 await db.exec('reset role;set role anon');
 const inquiry=JSON.stringify({company:'Inbound QA Studio',name:'QA Inquiry',email:'inbound@example.invalid',message:'Synthetic mobile request with preserved details',services:['website'],language:'es'});
 for(let i=0;i<2;i++)assert.equal((await db.query('select crm_public_inquiry($1::jsonb) r',[inquiry])).rows[0].r,'ok');
 await db.exec('reset role');
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),exp=Math.floor(Date.now()/1000)+3600;
 const user={id:OWNER,email:'qa@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:'2026-01-01T00:00:00Z'};
 const access_token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:OWNER,exp,role:'authenticated',aal:'aal1'})+'.'+enc('synthetic');
 const session={access_token,refresh_token:'synthetic',token_type:'bearer',expires_in:3600,expires_at:exp,user};
 const bridge=await startBridge(db,{users:new Map([[access_token,user]])});t.after(()=>bridge.close());
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const origin='http://localhost:'+port;
 const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','-p',String(port)],{env:{...process.env,APP_ORIGIN:origin,NEXT_PUBLIC_SUPABASE_URL:bridge.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-key',AVALON_RADAR_EXTERNAL_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);t.after(()=>require('../support/stop-child.cjs')(child));
 for(let i=0;i<150;i++){try{if((await fetch(origin+'/login')).status<500)break;}catch{}if(i===149)assert.fail(log);await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});t.after(()=>context.close());
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const routes=[['dashboard','/admin/dashboard'],['pipeline','/admin/workspace/crm/leads'],['clients','/admin/workspace/crm/clients/'+client],['inquiries','/admin/workspace/crm/inbound'],['product','/admin/workspace/website-designer/'+product]];
 const measurements=[];
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  for(const[name,path]of routes){
   const r=await page.goto(origin+path);assert.equal(r.status(),200,name);
   if(name==='pipeline')await page.locator('article').filter({hasText:'Mobile QA Studio'}).waitFor();
   if(name==='inquiries')await page.getByRole('heading',{name:'Inbound QA Studio',exact:true}).waitFor();
   if(name==='product')await page.getByRole('heading',{name:'Mobile QA Website',exact:true}).waitFor();
   const measure=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,smallTargets:[...document.querySelectorAll('main a,main button,#client-overview a')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&r.height<44}).map(e=>({text:e.textContent.trim().slice(0,65),height:Math.round(e.getBoundingClientRect().height*10)/10})).slice(0,25)}));
   measurements.push({name,width,...measure});
   assert.equal(measure.overflow,0,name+' page must fit '+width+'px');
   await page.screenshot({path:DIR+'/'+name+'-'+width+'.png',fullPage:true});
  }
 }
 await page.goto(origin+'/admin/workspace/crm/clients');
 await page.getByLabel('Buscar por nombre o código').fill('Mobile QA Studio');
 await Promise.all([page.waitForURL(/q=Mobile/),page.getByRole('button',{name:'Buscar',exact:true}).click()]);
 await page.getByRole('heading',{name:'Mobile QA Studio LLC',exact:true}).waitFor();
 await page.goto(origin+'/admin/workspace/crm/clients/'+client);
 assert.ok(await page.locator('a[href="/admin/workspace/website-designer/'+product+'"]').count()>0,'client lists its canonical product');
 const clientTargets=await page.locator('#client-overview [class*="heroActions"] a,#client-overview [class*="jump"] a').evaluateAll(es=>es.map(e=>({text:e.textContent.trim(),height:e.getBoundingClientRect().height})));
 const productTargets=await page.locator('#client-overview [class*="productActions"] a,#client-overview [class*="quickAttach"] summary').evaluateAll(es=>es.map(e=>({text:e.textContent.trim(),height:e.getBoundingClientRect().height})));
 const deadAnchors=await page.locator('#client-overview a[href^="#"]').evaluateAll(es=>es.filter(e=>!document.getElementById(e.getAttribute('href').slice(1))).map(e=>e.getAttribute('href')));
 const git=(...args)=>require('node:child_process').execFileSync('git',args,{encoding:'utf8'}).trim();
 fs.writeFileSync(DIR+'/audit.json',JSON.stringify({source:git('rev-parse','HEAD'),worktreeDirty:git('status','--porcelain')!=='',applicationBlobs:['src/components/sales/client-overview.tsx','src/components/sales/client-overview.module.css'].map(path=>({path,sha:git('hash-object',path)})),measurements,clientTargets,productTargets,deadAnchors,errors,physicalSafari:'NOT_RUN'},null,2));
 assert.deepEqual(errors,[],'no browser page exceptions');
 assert.deepEqual(deadAnchors,[],'client overview sections must exist');
 await page.goto(origin+'/admin/workspace/crm/inbound');
 await page.getByRole('heading',{name:'Inbound QA Studio',exact:true}).waitFor();
 await page.getByLabel('Buscar negocio, contacto o correo').fill('NoMatchSynthetic');
 await page.getByRole('button',{name:'Buscar',exact:true}).click();
 await page.getByText('No hay solicitudes en esta vista.',{exact:true}).waitFor();
 await db.exec('reset role');
 assert.equal(Number((await db.query('select count(*) n from crm_clients')).rows[0].n),1);
 assert.equal(Number((await db.query('select count(*) n from crm_leads')).rows[0].n),1);
 assert.equal(Number((await db.query('select count(*) n from crm_prospects')).rows[0].n),1,'identical inquiry replay creates no second prospect');
 assert.equal((await db.query('select contact from crm_leads where id=$1',[lead])).rows[0].contact,'QA Contact');
 if(process.env.QUICK_EXPECT_TOUCH_TARGETS==='1'){
  assert.ok([...clientTargets,...productTargets].every(e=>e.height>=43.9),'client/product overview controls must be at least44px (subpixel tolerance0.1px)');
  await page.goto(origin+'/admin/workspace/crm/clients/'+client);
  await page.locator('#client-overview').getByRole('link',{name:'Resumen',exact:true}).waitFor();
  await context.addCookies([{name:'avalon-lang',value:'en',url:origin}]);
  await page.reload();
  await page.locator('#client-overview').getByRole('link',{name:'Overview',exact:true}).waitFor();
 }
 console.log(JSON.stringify({screens:5,widths:[320,390],clientTargets,deadAnchors,assertions:'route200, records, client search, inquiry filter, canonical product, no duplicate on replay, lead contact retained'}));
});
