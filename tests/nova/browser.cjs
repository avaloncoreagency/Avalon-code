const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true}); const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.NOVA_TEST_URL || 'http://127.0.0.1:3059/nova-test');
 await page.getByRole('heading',{name:'Avalon Nova · DEMO'}).waitFor();
 for(const width of [320,375,390,768,1440]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`horizontal overflow at ${width}`);
  await page.getByRole('button',{name:'DEMO Website',exact:true}).click();
  const dialog=page.getByRole('dialog'); await dialog.waitFor();
  assert(await dialog.evaluate(e=>e.contains(document.activeElement)),'dialog focus');
  await page.keyboard.press('Tab'); assert(await dialog.evaluate(e=>e.contains(document.activeElement)),'focus trap');
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
 }
 await page.getByRole('searchbox').fill('not found'); await page.getByRole('heading',{name:'No hay resultados'}).waitFor();
 await page.getByRole('searchbox').fill(''); await page.getByLabel('Estado',{exact:true}).selectOption('completed');
 assert.equal(await page.getByRole('button',{name:'DEMO Website',exact:true}).count(),0);
 await page.getByRole('button',{name:'Reintentar'}).click(); await page.getByText('DEMO retry received').waitFor();
 await page.getByRole('button',{name:'ES / EN'}).click(); await page.getByRole('searchbox',{name:'Search projects'}).waitFor();
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('[aria-hidden="true"]').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.equal(await page.locator('progress').count(),1,'unknown progress must not appear as zero');
 assert.deepEqual(errors,[]);
 console.log('PASS: 5 viewports; overflow; dialog focus/trap/Escape; search/empty/filter; retry; EN; reduced motion; unknown progress; no client errors.');
 if(process.env.NOVA_SCREENSHOT) await page.screenshot({path:process.env.NOVA_SCREENSHOT,fullPage:true});
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
