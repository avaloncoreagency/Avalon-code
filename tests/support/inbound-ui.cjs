const assert=require('node:assert/strict');
module.exports=async function inboundUI({db,context,miguel,samuel,origin,evidence}) {
  const owner=miguel.user.id;
  const inbox=page=>page.getByRole('region',{name:/^(Bandeja de solicitudes|Inquiry inbox)$/});
  await db.exec('reset role');
  const make=async(company,kind='web_form')=>db.transaction(async tx=>{
    await tx.exec('reset role');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
    return (await tx.query(`insert into crm_prospects(company,contact,email,source,owner_id,industry,location,opportunity,acquired_at,source_kind) values($1,'Synthetic Contact',$2,'Website QA',$3,'Other','Synthetic location','Website consultation',now(),$4) returning id,version`,[company,company.replace(/[^a-z]/gi,'').toLowerCase()+'@example.invalid',owner,kind])).rows[0];
  });
  // A voluntary inquiry may reuse a business originally found by Radar.
  const record=await make('Inbox Synthetic Verify','licensed');
  const receipt=async id=>db.query("insert into crm_public_inquiries(prospect_id,email_hash,services) values($1,repeat('a',64),array['website'])",[id]);
  await receipt(record.id);
  await make('Inbox Synthetic Radar','licensed');
  const a=await context(miguel,{width:320,height:720},'America/New_York','es');
  const b=await context(samuel,{width:1440,height:1000},'Pacific/Auckland','en');
  for(const page of [a,b]){
    await page.goto(origin+'/admin/workspace/crm/inbound');
    await inbox(page).getByRole('combobox').selectOption('');
    await inbox(page).getByRole('searchbox').fill('Inbox Synthetic');
    await inbox(page).getByRole('button',{name:/^(Buscar|Search)$/}).click();
    await inbox(page).getByRole('heading',{name:'Inbox Synthetic Verify',exact:true}).waitFor();
    assert.equal(await inbox(page).getByRole('heading',{name:'Inbox Synthetic Radar',exact:true}).count(),0,'Radar discoveries excluded server-side');
  }
  await inbox(b).getByRole('button',{name:'Approve review',exact:true}).click();
  await inbox(b).getByRole('button',{name:'Convert to lead',exact:true}).waitFor();
  await inbox(a).getByRole('button',{name:'Aprobar revisión',exact:true}).click();
  await inbox(a).getByRole('alert').waitFor();
  assert.match(await inbox(a).getByRole('alert').innerText(),/registro cambió/,'concurrent review does not overwrite');
  assert.equal((await db.query('select status from crm_prospects where id=$1',[record.id])).rows[0].status,'approved');
  await inbox(b).getByRole('button',{name:'Convert to lead',exact:true}).click();
  await inbox(b).getByRole('link',{name:'Open opportunity',exact:true}).first().waitFor();
  const converted=(await db.query('select status,lead_id from crm_prospects where id=$1',[record.id])).rows[0];
  assert.equal(converted.status,'converted');assert.ok(converted.lead_id);
  const replay=await b.request.post(origin+'/admin/workspace/crm/api',{headers:{origin},data:{action:'convert',id:record.id}});
  assert.equal(replay.status(),200);assert.equal((await replay.json()).id,converted.lead_id);
  assert.equal(Number((await db.query('select count(*) n from crm_leads where id=$1',[converted.lead_id])).rows[0].n),1);
  await inbox(a).getByRole('button',{name:'Actualizar',exact:true}).click();
  await inbox(a).getByRole('link',{name:'Abrir oportunidad',exact:true}).waitFor();
  assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await a.screenshot({path:evidence+'/inbound-es-320.png',fullPage:true});
  await b.screenshot({path:evidence+'/inbound-en-1440.png',fullPage:true});
  // Transport loss must preserve the row and never show an optimistic confirmation.
  await receipt((await make('Inbox Synthetic Offline')).id);
  await inbox(a).getByRole('searchbox').fill('Inbox Synthetic Offline');await inbox(a).getByRole('button',{name:'Buscar',exact:true}).click();
  await inbox(a).getByRole('heading',{name:'Inbox Synthetic Offline',exact:true}).waitFor();
  await a.route('**/crm/api',route=>route.request().method()==='POST'?route.abort():route.continue());
  await inbox(a).getByRole('button',{name:'Aprobar revisión',exact:true}).click();await inbox(a).getByRole('alert').waitFor();
  assert.match(await inbox(a).getByRole('alert').innerText(),/No se recibió confirmación/);
  assert.equal(await inbox(a).getByRole('button',{name:'Convertir a lead',exact:true}).count(),0);
  await a.context().close();await b.context().close();
};
