const assert=require('node:assert/strict');
module.exports=async function portfolioUI({db,context,miguel,samuel,origin,evidence}){
 await db.transaction(async tx=>{
  await tx.exec('reset role');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[miguel.user.id]);
  await tx.exec("insert into os_projects(module,name) select 'website','Portfolio recent '||i from generate_series(1,101) i");
  await tx.exec("insert into os_projects(module,name,updated_at) values('website','Portfolio Needle','2000-01-01'),('ecommerce','Portfolio Needle Other Module',now());insert into os_projects(module,name,status) values('website','Portfolio Archive','archived')");
 });
 for(const [session,lang,width] of [[miguel,'es',390],[samuel,'en',1440]]){
  const p=await context(session,{width,height:900},'America/New_York',lang);await p.goto(origin+'/admin/workspace/website-designer');
  assert.equal(await p.getByText('Portfolio Needle',{exact:true}).count(),0,'needle is beyond the loaded first page');
  let form=p.getByRole('search',{name:lang==='es'?'Buscar productos en todo el módulo':'Search products across this module'});
  await form.getByRole('searchbox').fill('Portfolio Needle');await form.getByRole('button',{name:lang==='es'?'Buscar':'Search',exact:true}).click();
  await p.waitForURL(/q=Portfolio\+Needle/);await p.getByRole('heading',{name:'Portfolio Needle',exact:true}).waitFor();
  assert.equal(await p.getByText('Portfolio Needle Other Module',{exact:true}).count(),0,'module scope retained');
  await p.getByText(lang==='es'?'1 productos coincidentes':'1 matching products',{exact:false}).waitFor();
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:evidence+`/portfolio-search-${lang}-${width}.png`,fullPage:true});
  form=p.getByRole('search',{name:lang==='es'?'Buscar productos en todo el módulo':'Search products across this module'});
  await form.getByRole('searchbox').fill('Portfolio Archive');await form.getByRole('combobox').selectOption('archived');await form.getByRole('button',{name:lang==='es'?'Buscar':'Search',exact:true}).click();
  await p.getByRole('heading',{name:'Portfolio Archive',exact:true}).waitFor();assert.match(p.url(),/status=archived/);
  await p.context().close();
 }
};
