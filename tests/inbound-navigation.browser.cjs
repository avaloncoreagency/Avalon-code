'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{createServer}=require('node:http');
const {setup,OWNER}=require('./support/creative-continuity-db.cjs');
const {startBridge}=require('./support/rest-bridge.cjs');
test('inquiry context survives reload/back; empty review filter and failed requests are honest',{timeout:180000},async t=>{
 assert.equal(process.env.CRM_BROWSER,'1','CRM_BROWSER=1 required: do not silently skip');
 const {chromium}=require('playwright');const {db,as}=await setup(t);await as(OWNER);
 const lead=(await db.query("insert into crm_leads(company,source,owner_id) values('Navigation QA','manual',$1) returning id",[OWNER])).rows[0].id;
 const prospect=(await db.query("insert into crm_prospects(company,contact,email,source,owner_id,industry,location,opportunity,acquired_at,source_kind,status,lead_id) values('Navigation QA','Synthetic','qa@example.invalid','Website QA',$1,'Other','Synthetic','Website needs',now(),'web_form','approved',null) returning id",[OWNER])).rows[0].id;
 await db.query("update crm_prospects set status='converted',lead_id=$2 where id=$1",[prospect,lead]);
 await db.exec('reset role');await db.query("insert into crm_public_inquiries(prospect_id,email_hash,services,message,message_sha256) values($1,repeat('a',64),array['website'],'Synthetic project request',encode(sha256(convert_to('Synthetic project request','UTF8')),'hex'))",[prospect]);
 const user={id:OWNER,email:'qa@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:'2026-01-01T00:00:00Z'};
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),exp=Math.floor(Date.now()/1000)+3600;
 const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:OWNER,exp,role:'authenticated',aal:'aal1'})+'.'+enc('synthetic');
 const session={access_token:token,refresh_token:'synthetic',token_type:'bearer',expires_in:3600,expires_at:exp,user};
 const bridge=await startBridge(db,{users:new Map([[token,user]])});t.after(()=>bridge.close());
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const origin='http://localhost:'+port;
 const app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p',String(port)],{env:{PATH:process.env.PATH,HOME:process.env.HOME,APP_ORIGIN:origin,NEXT_PUBLIC_SUPABASE_URL:bridge.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-key',BRIDGE_PUBLIC_READ_DISABLED:'true',AVALON_RADAR_EXTERNAL_ENABLED:'false'},stdio:'ignore'});t.after(()=>require('./support/stop-child.cjs')(app));
 for(let i=0;;i++){try{if((await fetch(origin+'/login')).ok)break;}catch{}assert.ok(i<100);await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});t.after(()=>browser.close());
 for(const width of [320,375,390,430,768,1440])for(const lang of ['es','en']){
 const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await ctx.addCookies([{name:'sb-127-auth-token',value:'base64-'+enc(session),url:origin},{name:'avalon-lang',value:lang,url:origin}]);const page=await ctx.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const search=lang==='es'?'Buscar negocio, contacto o correo':'Search business, contact or email';
 await page.goto(origin+'/admin/workspace/crm/inbound?q=Navigation+QA&status=converted');
 await page.getByRole('heading',{name:'Navigation QA',exact:true}).waitFor();
 assert.equal(await page.getByLabel(search).inputValue(),'Navigation QA','direct link restores search');
 await page.getByRole('link',{name:lang==='es'?'Abrir oportunidad':'Open opportunity',exact:true}).click();await page.waitForURL(/\/lead\//);await page.goBack();
 await page.getByRole('heading',{name:'Navigation QA',exact:true}).waitFor();assert.equal(await page.getByLabel(search).inputValue(),'Navigation QA','back preserves inbox query');
 await page.getByRole('button',{name:lang==='es'?/^Posible spam \(/:/^Possible spam \(/}).click();await page.getByText(lang==='es'?'No hay mensajes con este filtro en esta página.':'No messages match this filter on this page.',{exact:true}).waitFor();
 await page.reload();await page.getByText(lang==='es'?'No hay mensajes con este filtro en esta página.':'No messages match this filter on this page.',{exact:true}).waitFor();
 const fail=route=>route.fulfill({status:503,contentType:'application/json',body:'{}'});await page.route('**/crm/api?*',fail);await page.getByRole('button',{name:lang==='es'?'Actualizar':'Refresh',exact:true}).click();await page.getByRole('region',{name:lang==='es'?'Bandeja de solicitudes':'Inquiry inbox'}).getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:'Navigation QA',exact:true}).count(),0,'failed fetch shows no stale actionable cards');
 await page.unroute('**/crm/api?*',fail);await page.getByRole('button',{name:lang==='es'?'Actualizar':'Refresh',exact:true}).click();await page.getByRole('region',{name:lang==='es'?'Bandeja de solicitudes':'Inquiry inbox'}).getByRole('alert').waitFor({state:'detached'});assert.equal(await page.getByLabel(search).inputValue(),'Navigation QA');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await ctx.close();
 }
});
