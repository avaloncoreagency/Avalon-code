const assert=require('node:assert/strict');
module.exports=async function inboundUI({db,context,miguel,samuel,origin,evidence}) {
  const owner=miguel.user.id;
  const inbox=page=>page.getByRole('region',{name:/^(Bandeja de solicitudes|Inquiry inbox)$/});
  const row=(page,name='Inbox Synthetic Verify')=>inbox(page).getByRole('listitem').filter({has:page.getByRole('heading',{name,exact:true})});
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
    await Promise.all([page.waitForResponse(response=>{const u=new URL(response.url());return u.pathname.endsWith('/crm/api')&&u.searchParams.get('q')==='Inbox Synthetic';}),inbox(page).getByRole('button',{name:/^(Buscar|Search)$/}).click()]);
    await inbox(page).getByText(/1 (empresas con solicitudes|businesses with inquiries)/).waitFor();
    await inbox(page).getByRole('heading',{name:'Inbox Synthetic Verify',exact:true}).waitFor();
    assert.equal(await inbox(page).getByRole('heading',{name:'Inbox Synthetic Radar',exact:true}).count(),0,'Radar discoveries excluded server-side');
  }
  await row(b).getByRole('button',{name:'Approve review',exact:true}).click();
  await row(b).getByRole('button',{name:'Convert to lead',exact:true}).waitFor();
  await row(a).getByRole('button',{name:'Aprobar revisión',exact:true}).click();
  await inbox(a).getByRole('alert').waitFor();
  assert.match(await inbox(a).getByRole('alert').innerText(),/registro cambió/,'concurrent review does not overwrite');
  assert.equal((await db.query('select status from crm_prospects where id=$1',[record.id])).rows[0].status,'approved');
  await row(b).getByRole('button',{name:'Convert to lead',exact:true}).click();
  await inbox(b).getByRole('link',{name:'Open opportunity',exact:true}).first().waitFor();
  const converted=(await db.query('select status,lead_id from crm_prospects where id=$1',[record.id])).rows[0];
  assert.equal(converted.status,'converted');assert.ok(converted.lead_id);
  const replay=await b.request.post(origin+'/admin/workspace/crm/api',{headers:{origin},data:{action:'convert',id:record.id}});
  assert.equal(replay.status(),200);assert.equal((await replay.json()).id,converted.lead_id);
  assert.equal(Number((await db.query('select count(*) n from crm_leads where id=$1',[converted.lead_id])).rows[0].n),1);
  await inbox(a).getByRole('button',{name:'Actualizar',exact:true}).click();
  await inbox(a).getByRole('link',{name:'Abrir oportunidad',exact:true}).waitFor();
  await a.screenshot({path:evidence+'/inbound-es-320.png',fullPage:true});
  assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'inbox has no document overflow at 320px');
  await a.setViewportSize({width:390,height:844});
  assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'inbox has no document overflow at 390px');
  await a.screenshot({path:evidence+'/inbound-es-390.png',fullPage:true});
  await b.screenshot({path:evidence+'/inbound-en-1440.png',fullPage:true});
  // P0.1/P0.3: every stored message is visible with its own review; spam labels are reversible and logged.
  const multi=await make('Inbox Synthetic Messages');
  for(const [msg,ago] of [['Necesito un website con reservas para mi barbería.','2 hours'],["Hey team, I wanted to reach out about growing website traffic. We offer customized SEO services. May I send you a quote & price list?",'1 hour']])
    await db.query(`insert into crm_public_inquiries(prospect_id,email_hash,services,message,message_sha256,created_at) values($1,repeat('b',64),array['website'],$2,encode(sha256(convert_to($2,'UTF8')),'hex'),now()-$3::interval)`,[multi.id,msg,ago]);
  await inbox(b).getByRole('searchbox').fill('Inbox Synthetic Messages');
  await Promise.all([b.waitForResponse(response=>{const u=new URL(response.url());return u.pathname.endsWith('/crm/api')&&u.searchParams.get('q')==='Inbox Synthetic Messages';}),inbox(b).getByRole('button',{name:'Search',exact:true}).click()]);
  const list=b.getByRole('list',{name:'Messages from Inbox Synthetic Messages'});
  await list.getByText('Necesito un website con reservas para mi barbería.').waitFor();
  const spam=list.getByRole('listitem').filter({hasText:'customized SEO services'});
  await spam.getByText(/Possible promotional inquiry/).waitFor();
  assert.equal(await list.getByRole('listitem').filter({hasText:'barbería'}).getByText(/Possible promotional inquiry/).count(),0,'the legitimate message carries no warning');
  b.once('dialog',d=>d.accept('Vendor pitch, not a client'));
  await spam.getByRole('button',{name:'Possible spam',exact:true}).click();
  await inbox(b).getByText(/Review saved/).waitFor();
  const spamRow=async()=>(await db.query("select id,review_status,review_note,version from crm_public_inquiries where prospect_id=$1 and message like '%SEO%'",[multi.id])).rows[0];
  assert.deepEqual(await spamRow().then(r=>[r.review_status,r.review_note,r.version]),['possible_spam','Vendor pitch, not a client',2]);
  await list.getByRole('listitem').filter({hasText:'customized SEO services'}).getByRole('button',{name:'Legitimate inquiry',exact:true}).click();
  await inbox(b).getByText(/Review saved/).waitFor();
  assert.equal((await spamRow()).review_status,'legitimate','a false positive is recoverable');
  const log=(await db.query('select from_status,to_status,actor_id from crm_public_inquiry_reviews where inquiry_id=$1 order by created_at',[(await spamRow()).id])).rows;
  assert.deepEqual(log.map(r=>[r.from_status,r.to_status,r.actor_id]),[['pending','possible_spam',samuel.user.id],['possible_spam','legitimate',samuel.user.id]]);
  assert.equal((await db.query("select status from crm_prospects where id=$1",[multi.id])).rows[0].status,'pending','reviewing a message never converts the prospect');
  await b.screenshot({path:evidence+'/inbound-messages-en-1440.png',fullPage:true});
  // Transport loss must preserve the row and never show an optimistic confirmation.
  await receipt((await make('Inbox Synthetic Offline')).id);
  await inbox(a).getByRole('searchbox').fill('Inbox Synthetic Offline');await Promise.all([a.waitForResponse(response=>{const u=new URL(response.url());return u.pathname.endsWith('/crm/api')&&u.searchParams.get('q')==='Inbox Synthetic Offline';}),inbox(a).getByRole('button',{name:'Buscar',exact:true}).click()]);
  await inbox(a).getByRole('heading',{name:'Inbox Synthetic Offline',exact:true}).waitFor();
  await a.route('**/crm/api',route=>route.request().method()==='POST'?route.abort():route.continue());
  await row(a,'Inbox Synthetic Offline').getByRole('button',{name:'Aprobar revisión',exact:true}).click();await inbox(a).getByRole('alert').waitFor();
  assert.match(await inbox(a).getByRole('alert').innerText(),/No se recibió confirmación/);
  assert.equal(await row(a,'Inbox Synthetic Offline').getByRole('button',{name:'Convertir a lead',exact:true}).count(),0);
  assert.equal((await db.query("select status from crm_prospects where company='Inbox Synthetic Offline'")).rows[0].status,'pending');
  await a.context().close();await b.context().close();
};
