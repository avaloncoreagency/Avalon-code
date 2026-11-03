// Built Next.js + synthetic Auth/PostgREST + isolated PostgreSQL. Never hosted DB.
const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {createServer}=require('node:http');const fs=require('node:fs');const {setup,OWNER,OTHER,OUTSIDER}=require('./support/creative-continuity-db.cjs');const {startBridge}=require('./support/rest-bridge.cjs');
test('creative administration uses real HTTP, SSR owner gates, SQL receipts and browser controls',{timeout:180000},async t=>{
 const {db,as}=await setup(t);const users=new Map();
 function session(id){const user={id,email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:'2026-01-01T00:00:00Z'};const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),exp=Math.floor(Date.now()/1000)+3600;const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:id,exp,role:'authenticated',aal:'aal1'})+'.'+enc('synthetic-signature');users.set(token,user);return {access_token:token,refresh_token:'synthetic',token_type:'bearer',expires_in:3600,expires_at:exp,user};}
 const owner=session(OWNER),other=session(OTHER),outsider=session(OUTSIDER);const bridge=await startBridge(db,{users});t.after(()=>bridge.close());
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const origin='http://localhost:'+port;
 const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p',String(port)],{env:{...process.env,APP_ORIGIN:origin,NEXT_PUBLIC_SUPABASE_URL:bridge.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-key'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);t.after(async()=>{child.kill();if(child.exitCode===null)await new Promise(r=>child.once('exit',r));});
 for(let n=0;n<100;n++){try{if((await fetch(origin)).ok)break;}catch{}if(n===99)assert.fail(output.slice(-1500));await new Promise(r=>setTimeout(r,100));}
 const cookie=s=>'sb-127-auth-token=base64-'+Buffer.from(JSON.stringify(s)).toString('base64url');
 const req=(path,s=owner,options={})=>fetch(origin+path,{...options,redirect:'manual',headers:{cookie:s?cookie(s):'',...options.headers}});
 const post=(body,s=owner,originHeader=origin)=>req('/api/creative-bridge/projects',s,{method:'POST',headers:{origin:originHeader,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await req('/admin/creative-bridge',null)).status,307);assert.equal((await req('/admin/creative-bridge',outsider)).status,307);assert.equal((await post({},null)).status,401);assert.equal((await post({},owner,'https://attacker.invalid')).status,403);
 const create={operation:'create',module:'website',source_ref:'synthetic-http',name:'Synthetic HTTP website',description:'No sale',agent:'codex'};
 const first=await post(create);assert.equal(first.status,200);const created=(await first.json()).receipt;
 assert.equal((await (await post(create)).json()).receipt.project_id,created.project_id);
 const ui=await req('/admin/creative-bridge');assert.equal(ui.status,200);assert.match(await ui.text(),/Synthetic HTTP website/);
 const library=await req('/admin/workspace/website-designer');assert.equal(library.status,200);assert.match(await library.text(),/Synthetic HTTP website/);
 await as(OWNER);const lead=(await db.query('insert into crm_leads(company,source,owner_id) values($1,$2,$3) returning id',['Synthetic HTTP Client','fixture',OWNER])).rows[0];
 const link=await post({operation:'link',project_id:created.project_id,lead_id:lead.id,version:1});assert.equal(link.status,200);
 const crm=await req('/admin/workspace/clients/'+lead.id);assert.equal(crm.status,200);assert.match(await crm.text(),/Synthetic HTTP website/);
 const document=JSON.parse(fs.readFileSync('tests/fixtures/creative-manifest.synthetic.json','utf8'));document.project_ref='synthetic-http';
 const save=await post({operation:'checkpoint',project_id:created.project_id,version:2,event_id:'http-checkpoint',manifest:document});assert.equal(save.status,200);assert.equal((await (await req('/admin/creative-bridge',other)).text()).includes(document.head_sha),true);
 if(process.env.CREATIVE_BROWSER==='1'){
  const {chromium}=require('playwright');const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'sb-127-auth-token',value:cookie(owner).split('=').slice(1).join('='),url:origin}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/admin/creative-bridge');await page.getByRole('heading',{name:'Avalon Creative Bridge',exact:true}).waitFor();
  await page.getByLabel('Nombre',{exact:true}).fill('Browser synthetic');await page.getByLabel('Referencia estable de tarea').fill('browser-synthetic');await page.getByRole('button',{name:'Crear borrador'}).click();await page.getByRole('status').filter({hasText:'Guardado.'}).waitFor();await page.reload();await page.getByRole('link',{name:'Browser synthetic',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));assert.deepEqual(errors,[]);
 }
});
