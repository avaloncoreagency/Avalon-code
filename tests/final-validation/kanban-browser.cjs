'use strict';
// QA only. Real Next build -> synthetic Auth/PostgREST -> disposable PGlite/RLS.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { PGlite } = require('@electric-sql/pglite');
const { chromium } = require('playwright');
const { startBridge } = require('../support/rest-bridge.cjs');
const OWNER = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const OUT = '00000000-0000-4000-8000-0000000000c3';
const API = '/admin/workspace/crm/api';
const DIR = process.env.EVIDENCE_DIR || 'evidence/final-validation';

test('independent Kanban five-column browser/API/database acceptance', { timeout: 360000 }, async t => {
  fs.mkdirSync(DIR, { recursive: true });
  const results = [];
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  for (const id of [OWNER, OTHER, OUT]) await db.query('insert into auth.users(id,email) values($1,$2)', [id, id+'@example.invalid']);
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/'+file, 'utf8'));
    if (file.startsWith('20261102053022')) for (const id of [OWNER, OTHER]) await db.query("insert into agency_memberships(user_id,role) values($1,'owner')", [id]);
  }
  const users = new Map();
  function session(id) {
    const exp = Math.floor(Date.now()/1000)+3600;
    const user = { id, email: id+'@example.invalid', aud:'authenticated', role:'authenticated', app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:'2026-01-01T00:00:00Z' };
    const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
    const access_token = enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:id,exp,role:'authenticated',aal:'aal1'})+'.'+enc('synthetic-signature');
    users.set(access_token,user); return {access_token,refresh_token:'synthetic',token_type:'bearer',expires_in:3600,expires_at:exp,user};
  }
  const ownerSession=session(OWNER),otherSession=session(OTHER),outSession=session(OUT);
  const bridge = await startBridge(db,{users}); t.after(()=>bridge.close());
  const reservation=createServer(); await new Promise(r=>reservation.listen(0,'127.0.0.1',r));
  const port=reservation.address().port;await new Promise(r=>reservation.close(r));const origin='http://localhost:'+port;
  const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','-p',String(port)],{
    env:{...process.env,APP_ORIGIN:origin,NEXT_PUBLIC_SUPABASE_URL:bridge.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-key',AVALON_RADAR_EXTERNAL_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);t.after(()=>require('../support/stop-child.cjs')(child));
  for(let i=0;i<150;i++){try{if((await fetch(origin+'/login')).status<500)break;}catch{} if(i===149)assert.fail(output);await new Promise(r=>setTimeout(r,100));}
  const cookie=s=>'sb-127-auth-token=base64-'+Buffer.from(JSON.stringify(s)).toString('base64url');
  const request=(body,s=ownerSession,extra={})=>fetch(origin+API,{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json',...(s?{cookie:cookie(s)}:{}),...extra},body:JSON.stringify(body)});
  const one=async(sql,p=[])=>{await db.exec('reset role');return(await db.query(sql,p)).rows[0];};
  await db.exec(`reset role;set request.jwt.claim.sub='${OWNER}';set role authenticated;`);
  const lead=(await db.query("insert into crm_leads(company,contact,email,source,owner_id,stage_id) values('QA Synthetic Barber','QA Contact','kanban@example.invalid','manual',$1,'new') returning id",[OWNER])).rows[0].id;
  const client=(await db.query("insert into crm_clients(legal_name,source,owner_id,origin_lead_id) values('QA Synthetic Barber LLC','manual',$1,$2) returning id",[OWNER,lead])).rows[0].id;
  await db.exec('reset role');
  const row=()=>one('select * from crm_leads where id=$1',[lead]);
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1920,height:1080}});t.after(()=>context.close());
  await context.addCookies([{name:'sb-127-auth-token',value:cookie(ownerSession).split('=')[1],url:origin}]);
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const goto=async()=>{await page.goto(origin+'/admin/workspace/crm/leads');await page.locator('[data-kanban-group]').first().waitFor();await page.locator('article').filter({hasText:'QA Synthetic Barber'}).first().waitFor();};
  const card=()=>page.locator('article').filter({hasText:'QA Synthetic Barber'}).first();
  const column=id=>page.locator('[data-kanban-group="'+id+'"]');
  async function check(name,fn){try{const evidence=await fn();results.push({name,status:'PASS',evidence});}catch(e){results.push({name,status:'FAIL',error:e.message});await page.screenshot({path:DIR+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}}
  async function drag(stage){await card().scrollIntoViewIfNeeded();const from=await card().boundingBox(),to=await column(stage).boundingBox();const sx=from.x+from.width/2,sy=from.y+from.height/2,tx=to.x+to.width/2;await page.mouse.move(sx,sy);await page.mouse.down();for(let i=1;i<=8;i++)await page.mouse.move(sx+(tx-sx)*i/8,sy+3*Math.sin(i));await page.mouse.up();}
  async function state(stage){assert.equal((await row()).stage_id,stage);}
  const settle=()=>page.locator('[data-saving="true"]').waitFor({state:'detached'});
  await check('mouse New -> Conversation -> Proposal and persistence',async()=>{await goto();for(const [g,s]of[['conversation','contacted'],['proposal','proposal']]){const saved=page.waitForResponse(r=>r.url().endsWith(API)&&r.request().method()==='POST');await drag(g);assert.equal((await saved).status(),200);await settle();await state(s);}await page.reload();await column('proposal').locator('article[data-lead-id]').waitFor();});
  await check('Won refusal is actionable and creates no sale',async()=>{const response=page.waitForResponse(r=>r.url().endsWith(API)&&r.request().method()==='POST');await drag('won');const r=await response;assert.equal(r.status(),409);assert.equal((await r.json()).code,'won_requires_contract');await page.getByRole('alertdialog').waitFor();await state('proposal');assert.equal(Number((await one('select count(*) n from crm_sales')).n),0);assert.equal((await one('select origin_lead_id from crm_clients where id=$1',[client])).origin_lead_id,lead);});
  await check('Won modal contains keyboard focus throughout Tab navigation',async()=>{const modal=page.getByRole('alertdialog');for(let i=0;i<5;i++){await page.keyboard.press('Tab');const active=await page.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.trim().slice(0,60),label:document.activeElement?.getAttribute('aria-label')}));assert.ok(await modal.evaluate(el=>el.contains(document.activeElement)),'Tab '+(i+1)+' escaped the aria-modal dialog: '+JSON.stringify(active));}});
  await page.getByRole('alertdialog').getByRole('button',{name:'Cerrar',exact:true}).click();
  await check('Lost cancel and mandatory reason preserve history',async()=>{await drag('lost');const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await state('proposal');await drag('lost');await page.getByLabel('Motivo de pérdida (obligatorio)',{exact:true}).fill('Synthetic loss reason');const saved=page.waitForResponse(r=>r.url().endsWith(API)&&r.request().method()==='POST');await page.getByRole('button',{name:'Mover a Perdido',exact:true}).click();assert.equal((await saved).status(),200);await settle();await state('lost');});
  await check('recovery restores Proposal with contact and company intact',async()=>{const saved=page.waitForResponse(r=>r.url().endsWith(API)&&r.request().method()==='POST');await drag('proposal');assert.equal((await saved).status(),200);await settle();const r=await row();assert.equal(r.stage_id,'proposal');assert.equal(r.company,'QA Synthetic Barber');assert.equal(r.contact,'QA Contact');});
  await check('two-line compact card and keyboard movement',async()=>{assert.equal(await card().locator('a,button,select,details').count(),0);assert.equal((await card().innerText()).trim(),'QA Contact\nQA Synthetic Barber');await card().focus();const saved=page.waitForResponse(r=>r.url().endsWith(API)&&r.request().method()==='POST');await page.keyboard.press('Space');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Space');assert.equal((await saved).status(),200);await settle();await state('contacted');});
  await check('save error stays visible while board returns to server state',async()=>{let count=0;await page.route('**/admin/workspace/crm/api',route=>{if(route.request().method()==='POST'){count++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic save failure'})});}return route.continue();});try{await drag('proposal');await page.getByRole('alert').filter({hasText:'Synthetic save failure'}).waitFor();await page.waitForTimeout(400);assert.equal(count,1);await state('contacted');assert.ok(await page.getByRole('alert').filter({hasText:'Synthetic save failure'}).isVisible());}finally{await page.unroute('**/admin/workspace/crm/api');}});
  await check('outsider, missing identity and stale version cannot overwrite data',async()=>{const r=await row(),body={entity:'leads',id:lead,version:r.version,values:{...r,stage_id:'proposal'}};for(const s of[null,outSession])assert.ok([307,403].includes((await request(body,s)).status));const changed=await request({...body,values:{...r,priority:'high'}},otherSession);assert.equal(changed.status,200);assert.equal((await request(body)).status,409);await state('contacted');});
  await goto();await page.screenshot({path:DIR+'/kanban-desktop.png',fullPage:true});
  await check('390px swipe scrolls, hold-drag persists, tap opens record',async()=>{
    await page.setViewportSize({width:390,height:844});await goto();
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
    await card().evaluate(el=>el.scrollIntoView({block:'center',inline:'center'}));await page.waitForTimeout(120);
    let b=await card().boundingBox();await touch('touchStart',b.x+20,b.y+b.height/2);await touch('touchMove',b.x+60,b.y+b.height/2);await touch('touchEnd');await page.waitForTimeout(250);await state('contacted');
    await card().evaluate(el=>el.scrollIntoView({block:'center',inline:'center'}));await page.waitForTimeout(120);b=await card().boundingBox();const y=b.y+b.height/2;
    assert.ok(await page.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('article[data-lead-id]'),[b.x+b.width/2,y]),'touch start must hit actual card');
    await touch('touchStart',b.x+b.width/2,y);await page.waitForTimeout(320);for(let i=1;i<=6;i++)await touch('touchMove',b.x+b.width/2+(382-b.x-b.width/2)*i/6,y);
    assert.ok(await page.locator('[data-dragging="true"]').count()>0,'hold activates drag');let rect;
    for(let i=0;i<80;i++){rect=await column('proposal').evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right};});if(rect.left<220)break;await touch('touchMove',382,y);await page.waitForTimeout(40);}
    const x=Math.max(rect.left+24,Math.min(rect.right-24,200));for(let i=0;i<3;i++){await touch('touchMove',x,y);await page.waitForTimeout(40);}const saved=page.waitForResponse(r=>r.url().endsWith(API)&&r.request().method()==='POST');await touch('touchEnd');assert.equal((await saved).status(),200);await settle();await state('proposal');
    await card().evaluate(el=>el.scrollIntoView({block:'center',inline:'center'}));await page.waitForTimeout(120);b=await card().boundingBox();await touch('touchStart',b.x+b.width/2,b.y+b.height/2);await touch('touchEnd');await page.getByRole('dialog',{name:/Historial de/}).waitFor();await page.screenshot({path:DIR+'/kanban-touch-record.png',fullPage:false});
    await page.getByRole('button',{name:'Cerrar historial'}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));await cdp.detach();
  });
  fs.writeFileSync(DIR+'/kanban-results.json',JSON.stringify({source:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results,physicalSafari:'NOT_RUN',radar:'disabled'},null,2));
  for(const r of results)console.log(r.status+' '+r.name+(r.error?' :: '+r.error:''));
  assert.deepEqual(results.filter(r=>r.status==='FAIL').map(r=>r.name),[],'Keep independent acceptance red for uncorrected findings');
});
