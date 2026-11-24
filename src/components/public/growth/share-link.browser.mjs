import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const loadModule = createRequire(import.meta.url);
const { chromium } = loadModule("playwright");
test('shareable showroom: allowlists, language, clipboard, request, keyboard and responsive',{timeout:180000},async t=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const origin='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[loadModule.resolve('next/dist/bin/next'),'start','-p',String(port)],{env:{PATH:process.env.PATH,HOME:process.env.HOME,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
 t.after(()=>loadModule('../../../../tests/support/stop-child.cjs')(child));
 for(let i=0;;i++){try{if((await fetch(origin)).ok)break;}catch{} assert.ok(i<100);await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--disable-webgl']});t.after(()=>browser.close());
 fs.mkdirSync('/tmp/avalon-demo-evidence',{recursive:true});
 for(const width of [320,390,1440]){
 const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await ctx.newPage();const remote=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin){remote.push(u.origin);return r.abort();}return r.continue();});
 await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin});
 for(const [industry,demo] of [['barber','calendar'],['roofing','crm'],['ecommerce','shop'],['invalid','invalid']]){
 await page.goto(origin+'/?lang=es&industry='+industry+'&demo='+demo+'#demos');
 const expected=demo==='invalid'?'chat':demo;
 await page.locator('#tab-'+expected+'[aria-selected=true]').waitFor();
 assert.match(await page.locator('#industria [role=radio][aria-checked=true]').innerText(), industry==='roofing'?/Techos/:industry==='ecommerce'?/comercio|commerce|Tienda/i:/Barber/);
 await page.getByRole('button',{name:'Copiar enlace de demostración',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Enlace copiado'}).waitFor();
 const copied=await page.evaluate(()=>navigator.clipboard.readText());assert.equal(copied,origin+'/?lang=es&industry='+(industry==='invalid'?'barber':industry)+'&demo='+expected+'#demos');
 const cta=page.locator('#panel-'+expected+' a').filter({hasText:'Quiero esto'});assert.match(await cta.getAttribute('href'),/services=.+#cotizacion/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 await page.goto(origin+'/?lang=en&industry=barber&demo=chat#demos');
 await page.locator('#panel-chat button').first().click();
 await page.locator('#industria').getByRole('radio',{name:/Roofing/}).click();
 await page.waitForTimeout(1000);
 assert.doesNotMatch(await page.locator('#panel-chat').innerText(),/assistant for Northside/,'changing industry cancels old scripted replies');
 await page.getByRole('button',{name:'Run the full journey',exact:true}).click();
 await page.getByRole('button',{name:'Reset demos',exact:true}).click();
 await page.waitForTimeout(1800);
 assert.equal(await page.locator('#recorrido li[data-state=now]').count(),0,'reset cancels scheduled journey steps');
 assert.ok(await page.getByRole('button',{name:'Run the full journey',exact:true}).isEnabled());
 await page.goto(origin+'/?lang=es&industry=dental&demo=calendar#demos');await page.locator('#tab-calendar[aria-selected=true]').waitFor();
 await page.locator('a[hreflang=en]').click();await page.getByRole('button',{name:'Copy demo link',exact:true}).waitFor();await page.locator('#tab-calendar[aria-selected=true]').waitFor();
 assert.equal(await page.getByRole('radio',{name:/Dental/}).getAttribute('aria-checked'),'true');
 await page.locator('#tab-calendar').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#tab-crm').getAttribute('aria-selected'),'true');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied');}}}));
 await page.getByRole('button',{name:'Copy demo link',exact:true}).click();await page.getByLabel('Demo link',{exact:true}).waitFor();
 assert.match(await page.getByLabel('Demo link',{exact:true}).inputValue(),/industry=dental&demo=crm#demos$/);
 await page.screenshot({path:'/tmp/avalon-demo-evidence/showroom-'+width+'.png',fullPage:false});
 const request=page.locator('#panel-crm a').filter({hasText:'I want this'});const services=new URL(await request.getAttribute('href'),origin).searchParams.get('services').split(',');await request.click();await page.locator('#cotizacion').waitFor();for(const service of services) assert.ok(await page.locator('input[name=services][value=\"'+service+'\"]').isChecked());
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[],'showroom needs no external/database requests');await ctx.close();
 }
});
