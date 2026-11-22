const assert = require('node:assert/strict');
module.exports = async function coreEngineUI({db,context,miguel,samuel,origin,evidence,clientId,attachmentClientId}) {
  await db.exec('reset role');
  // Isolated synthetic fixtures only; never grants permissions to real accounts.
  await db.exec(`insert into crm_private.finance_access(user_id) select user_id from agency_memberships where role='owner' on conflict do nothing`);
  const sale=(await db.query('select id from crm_sales where client_id=$1 order by created_at limit 1',[clientId])).rows[0].id;
  const ui=await context(miguel,{width:390,height:844},'Pacific/Auckland','en');
  await ui.goto(`${origin}/admin/workspace/crm/sales/${sale}`);
  let invoices=ui.getByRole('region',{name:'Invoices',exact:true});
  const create=invoices.getByRole('form',{name:'Record invoice',exact:true});
  await create.getByLabel('Invoice number',{exact:true}).fill('SYN-UI-001');
  await create.getByLabel('Amount',{exact:false}).fill('9999999999');
  await create.getByLabel('Issue date',{exact:true}).fill('2026-11-17');
  await create.getByRole('button',{name:'Record invoice',exact:true}).click();
  await create.getByRole('alert').waitFor();
  assert.equal(await create.getByLabel('Invoice number',{exact:true}).inputValue(),'SYN-UI-001','server rejection preserves draft');
  await create.getByLabel('Amount',{exact:false}).fill('100.01');
  await create.getByRole('button',{name:'Record invoice',exact:true}).click();
  await invoices.getByText(/SYN-UI-001 ·/).waitFor();
  await ui.reload();
  assert.equal(Number((await db.query("select count(*)::int n from crm_invoices where number='SYN-UI-001'")).rows[0].n),1);
  const invoiceRow=ui.locator('li').filter({has:ui.getByText(/SYN-UI-001 ·/)});
  await invoiceRow.getByLabel('Documented reason',{exact:true}).fill('Synthetic invoice correction');
  ui.once('dialog',d=>d.accept());
  await invoiceRow.getByRole('button',{name:'Void invoice',exact:true}).click();
  await invoiceRow.getByText(/Void ·/).waitFor();
  // Register a documented synthetic payment through the existing route, then verify/reverse through the new adapter.
  const payment=ui.locator('form').filter({has:ui.getByRole('button',{name:'Record payment',exact:true})});
  await payment.getByLabel('Amount',{exact:false}).fill('10.01');
  await payment.getByLabel('Received on',{exact:true}).fill('2026-11-17');
  await payment.getByLabel('Reference (no bank details)',{exact:true}).fill('SYN-UI-BANK-001');
  await payment.getByRole('button',{name:'Record payment',exact:true}).click();
  await ui.waitForURL(/ok=payment/);
  const reconcile=ui.getByRole('region',{name:'Payment reconciliation',exact:true});
  const payRow=reconcile.locator('li').filter({hasText:'SYN-UI-BANK-001'});
  await payRow.getByLabel('Evidence reference',{exact:true}).fill('SYN-RECEIPT-001');
  await payRow.getByRole('button',{name:'Verify payment',exact:true}).click();
  await payRow.getByText(/Verified/).waitFor();
  const commissions=ui.getByRole('region',{name:'Commissions',exact:true});
  const agree=commissions.getByRole('form',{name:'Agree commission',exact:true});
  await agree.getByLabel('External name (only when no owner selected)',{exact:true}).fill('Synthetic referrer');
  await agree.getByLabel('Fixed amount (or percentage)',{exact:true}).fill('1.01');
  await agree.getByLabel('Written agreement / reference',{exact:true}).fill('Synthetic written agreement UI');
  await agree.getByRole('button',{name:'Agree commission',exact:true}).click();
  const commission=commissions.locator('li').filter({hasText:'Synthetic referrer'});
  await commission.getByRole('button',{name:'Accrue commission',exact:true}).click();
  await commission.getByLabel('External payment reference',{exact:true}).fill('SYN-PAYOUT-001');
  ui.once('dialog',d=>d.accept());
  await commission.getByRole('button',{name:'Record commission paid',exact:true}).click();
  await commission.getByText('SYN-PAYOUT-001',{exact:true}).waitFor();
  await payRow.getByLabel('Documented reason',{exact:true}).fill('Synthetic duplicate correction');
  ui.once('dialog',d=>d.accept());
  await payRow.getByRole('button',{name:'Reverse payment',exact:true}).click();
  await payRow.getByText(/Reversed/).waitFor();
  await ui.screenshot({path:evidence+'/core-sale-390.png',fullPage:true});
  // Independent owner session, languages and device timezone must retain canonical history and ledger.
  for(const lang of ['es','en'])for(const width of [390,1440]) {
    const p=await context(samuel,{width,height:900},'America/Los_Angeles',lang);
    await p.goto(`${origin}/admin/workspace/crm/clients/${clientId}?ok=saved`);
    const ledger=p.getByRole('region',{name:lang==='es'?'Libro financiero del cliente':'Client financial ledger'});
    await ledger.waitFor();
    assert.match(await ledger.innerText(),lang==='es'?/Comisiones pagadas/:/Paid commissions/);
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
    await p.screenshot({path:evidence+`/core-ledger-${lang}-${width}.png`,fullPage:true});
    await p.context().close();
  }
  // Catalog approval and invalidated approval are enforced by the real isolated trigger.
  await ui.goto(origin+'/admin/workspace/crm/settings');
  const item=ui.locator('li').filter({has:ui.locator('code').getByText('desarrollo-web',{exact:true})});
  await item.locator('summary').filter({hasText:'Commercial offer'}).click();
  const terms=item.getByRole('form',{name:'Save commercial terms',exact:true});
  // CoreForm shows its status BEFORE router.refresh() delivers the re-rendered tree. Actions are bound to the row
  // version of the last render, so clicking Approve in that gap sends a stale version and is (correctly) rejected as
  // a conflict. Wait for the refresh's RSC response before the next action.
  const refreshed=()=>ui.waitForResponse(r=>r.request().method()==='GET'&&r.request().headers()['rsc']==='1'&&r.url().includes('/admin/workspace/crm/settings'));
  await terms.getByLabel('Monthly price',{exact:true}).fill('20');
  let refresh=refreshed();
  await terms.getByRole('button',{name:'Save commercial terms',exact:true}).click();
  await terms.getByRole('status').waitFor();
  await refresh;
  // Refresh preserves disclosure on a stable React subtree; reopen if a navigation replaces it.
  if(!await item.getByRole('button',{name:'Approve offer',exact:true}).isVisible()) await item.locator('summary').filter({hasText:'Commercial offer'}).click();
  ui.once('dialog',d=>d.accept());
  refresh=refreshed();
  await item.getByRole('button',{name:'Approve offer',exact:true}).click();
  await refresh;
  assert.equal(await item.getByRole('alert').count(),0,'approval was not rejected (no stale-version conflict)');
  // The approval's server refresh can remount the item and collapse its <details>: the status is then in the DOM but
  // hidden. Wait for the persisted state itself, then reopen the disclosure before interacting again.
  const reopen=async()=>{if(!await terms.getByLabel('Monthly price',{exact:true}).isVisible()) await item.locator('summary').filter({hasText:'Commercial offer'}).click();};
  await item.getByText(/approved · v/).waitFor({state:'attached'});
  await reopen();
  await terms.getByLabel('Monthly price',{exact:true}).fill('21');
  refresh=refreshed();
  await terms.getByRole('button',{name:'Save commercial terms',exact:true}).click();
  await refresh;
  await item.getByText(/draft · v2/).waitFor({state:'attached'});
  await reopen();
  // Attachment labels arrive from the server, not the browser's independent Intl implementation.
  await ui.addInitScript(()=>{const Original=Intl.DateTimeFormat;Intl.DateTimeFormat=function(...args){const result=new Original(...args);Object.defineProperty(result,'format',{value:()=> 'DIFFERENT CLIENT ICU'});return result;};});
  for(let i=0;i<3;i++) {
    await ui.goto(`${origin}/admin/workspace/crm/clients/${attachmentClientId}?ok=saved`);
    await ui.locator('#client-files').waitFor();
    assert.doesNotMatch(await ui.locator('#client-files').innerText(),/DIFFERENT CLIENT ICU/);
  }
  await ui.context().close();
};
