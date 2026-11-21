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

  await db.exec('reset role');
  for(let i=0;i<55;i++)await db.query("update crm_leads set stage_id=$1 where id=$2",[i%2?'new':'contacted',lead]);
  await db.query("update crm_leads set stage_id='new' where id=$1",[lead]);
  await db.exec("set request.jwt.claim.sub='"+OWNER+"';set role authenticated;");
  for(let i=0;i<20;i++)await db.query("insert into crm_leads(company,contact,source,owner_id,stage_id) values($1,'QA Contact','manual',$2,'new')",['QA Scroll '+i,OWNER]);
  await db.exec('reset role');
  const state=()=>page.evaluate(()=>({y:scrollY,overflow:document.documentElement.style.overflow}));
  async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});await page.screenshot({path:DIR+'/failure-'+results.length+'.png',fullPage:false});}finally{if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');}}
  for(const width of[1440,1280,390,320]){
    await page.setViewportSize({width,height:844});await goto();
    for(const position of[0,.5,1])await check(width+'px / background '+position,async()=>{
      await page.evaluate(p=>scrollTo(0,p*(document.documentElement.scrollHeight-innerHeight)),position);await page.waitForTimeout(150);
      let id=await page.locator('article[data-lead-id]').evaluateAll(es=>es.find(el=>{const r=el.getBoundingClientRect();return r.top>90&&r.bottom<innerHeight-40;})?.getAttribute('data-lead-id'));
      if(!id){await page.locator('article[data-lead-id]').last().scrollIntoViewIfNeeded();id=await page.locator('article[data-lead-id]').last().getAttribute('data-lead-id');}
      const opener=page.locator('article[data-lead-id="'+id+'"]');const before=await state();const hit=await opener.boundingBox();await page.mouse.click(hit.x+hit.width/2,hit.y+hit.height/2);
      const dialog=page.getByRole('dialog');await dialog.waitFor();await page.waitForTimeout(100);
      const geometry=await dialog.evaluate(el=>({y:el.getBoundingClientRect().y,bottom:el.getBoundingClientRect().bottom,top:el.scrollTop,height:el.clientHeight,scrollHeight:el.scrollHeight}));
      assert.ok(geometry.y>=-1&&geometry.y<40,'drawer must start in viewport: '+JSON.stringify(geometry));assert.equal(geometry.top,0,'drawer opens at scrollTop0');assert.ok(Math.abs((await state()).y-before.y)<=1,'opening must preserve background scroll: before='+before.y+' after='+(await state()).y);
      await page.screenshot({path:DIR+'/drawer-'+width+'-'+position+'.png',fullPage:false});
      if(geometry.scrollHeight>geometry.height){await dialog.hover();await page.mouse.wheel(0,550);await page.waitForTimeout(150);assert.ok(await dialog.evaluate(el=>el.scrollTop>0),'wheel scrolls drawer');assert.ok(Math.abs((await state()).y-before.y)<=1,'wheel must not scroll background');}
      for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)),'Tab remains in drawer');}
      await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.ok(Math.abs((await state()).y-before.y)<=1,'Escape must restore exact background position');
      await opener.click();await dialog.waitFor();assert.equal(await dialog.evaluate(el=>el.scrollTop),0,'same lead reopens at top');await page.getByRole('button',{name:'Cerrar historial'}).click();assert.ok(Math.abs((await state()).y-before.y)<=1,'X must restore background position');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow');
    });
  }
  fs.writeFileSync(DIR+'/drawer-results.json',JSON.stringify({source:require('child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results,physicalSafari:'NOT_RUN',touch:'NOT_RUN in this wheel-focused matrix'},null,2));
  for(const r of results)console.log(r.status+' '+r.name+(r.error?' '+r.error:''));assert.deepEqual(results.filter(r=>r.status==='FAIL'),[]);
});
