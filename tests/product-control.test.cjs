// Product Control: observable architecture, no production writes and no duplicated Bridge.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const route='src/app/admin/workspace/';
test('global library is absent from navigation but storage and import routes remain intact',()=>{
  const suite=read('src/components/suite/suite.tsx');
  assert.doesNotMatch(suite,/href="\/admin\/workspace\/library"/);
  for(const p of ['library/page.tsx','library/[id]/page.tsx','library/uploads/route.ts','library/imports/[importId]/process/route.ts'])
    assert.ok(fs.existsSync(route+p),p);
});
test('all five product modules have external product portfolios',()=>{
  const modules=[
    ['website-designer','Mis Websites'],
    ['ecommerce-designer','Mis Tiendas'],
    ['crm-creator','Mis CRMs'],
    ['marketing-hub','Mis Campañas y Funnels'],
  ];
  for(const [slug,title] of modules){
    const source=read(route+slug+'/page.tsx');
    assert.ok(source.includes(title),slug+' heading');
    assert.match(source,/ProjectsIndex/);
  }
  const hub=read(route+'ai-communications/page.tsx');
  assert.match(hub,/CommunicationsPortfolio/);
  assert.match(hub,/ModuleDeliveryPanel lang=\{lang\} module="receptionist"/);
  assert.match(hub,/ModuleDeliveryPanel lang=\{lang\} module="chatbots"/);
  const group=read('src/components/os/company-portfolio.tsx');
  assert.match(group,/\/admin\/workspace\/products\/\$\{p.id\}/);
});
test('registering an external product opens canonical Product Control HUD, not legacy editors',()=>{
  const actions=read(route+'project-actions.ts');
  assert.match(actions,/back\(\x60\/admin\/workspace\/products\/\$\{data\.id\}\x60, \{ ok: "created" \} \)/);
  assert.match(actions,/revalidatePath\(\x60\/admin\/workspace\/products\/\$\{data\.id\}\x60\)/);
  assert.doesNotMatch(actions,/back\(\x60\$\{base\}\/\$\{data\.id\}\x60, \{ ok: "created" \} \)/);
});
test('manual registration preserves ownership, source provenance and URL reference states',()=>{
  const code=read(route+'project-actions.ts');
  assert.match(code,/ownerForAction\(\)/);
  assert.match(code,/source_tool/);
  assert.match(code,/external_reference/);
  assert.match(code,/pending_delivery/);
  assert.match(code,/client_lead_id/);
  assert.doesNotMatch(code,/service_role/);
});
test('module ZIP import and agent API inbox are scoped and owner-approved',()=>{
  const policy=read('src/lib/project-bridge/policy.ts');
  for(const category of ['website','ecommerce','crm_creator','receptionist','chatbots','marketing','apps'])
    assert.ok(policy.includes('"'+category+'"'));
  const panel=read('src/components/os/module-delivery-panel.tsx');
  assert.match(panel,/bridgeCategoryEnabled\(/);
  assert.match(panel,/lockedCategory=\{module\}/);
  assert.match(panel,/assignPendingImport/);
  const ui=read('src/components/library/importer.tsx');
  assert.match(ui,/lockedCategory/);
  const ingress=read(route+'library/uploads/route.ts');
  assert.match(ingress,/project\.data\.module!==category/);
  assert.match(ingress,/bridgeCategoryEnabled\(/);
  assert.match(read('src/app/api/project-bridge/v1/imports/route.ts'),/bridgeCategoryEnabled\(/);
  const processing=read(route+'library/imports/[importId]/process/route.ts');
  assert.match(processing,/bridgeCategoryEnabled\(/);
  assert.match(processing,/category_not_enabled/);
  assert.match(panel,/enabled && pending\.length/);
  const action=read(route+'product-delivery-actions.ts');
  assert.match(action,/bridgeCategoryEnabled\(/);
  for(const term of ['ownerForAction()','product.data.module!==category','.is("project_id",null)'])
    assert.ok(action.includes(term),term);
});
test('issues are saved inside each product with repair brief, checklist and author tracking',()=>{
  const model=read('src/lib/os/client-hud.ts');
  for(const term of ['ISSUE_KINDS','ISSUE_SEVERITIES','request_edit','request_note','request_add_item','request_item_status','reopen','changeBrief'])
    assert.ok(model.includes(term),term);
  const hud=read('src/components/os/product-hud.tsx');
  assert.ok(hud.includes('Errores y mejoras'));
  assert.match(hud,/saveProductOperation/);
  assert.match(hud,/request_note/);
  assert.match(read(route+'products/[id]/brief/route.ts'),/getOwnerSession\(\)/);
});
test('extended ZIP schema change is forward-only, guarded and does not change canonical projects',()=>{
  const review=read('docs/sql/product-control-bridge-categories-review.sql');
  assert.match(review,/SECURITY REVIEW ONLY/);
  assert.match(review,/os_project_imports_category_check/);
  assert.match(review,/chatbots/);
  assert.match(review,/os_projects_module_check/);
  assert.doesNotMatch(review,/alter\s+table\s+public\.os_projects\b/i);
  assert.doesNotMatch(review,/drop table|drop schema/i);
  const migration=read('supabase/migrations/20261113173000_product_control_extended_import_categories.sql');
  assert.match(migration,/Historical replay caveat/);
  assert.match(migration,/Unexpected os_projects module constraint/);
  assert.match(migration,/Unexpected os_project_imports category constraint/);
  assert.match(migration,/os_project_imports_category_check/);
  assert.match(migration,/alter table public.os_projects drop constraint os_projects_module_check/);
  assert.match(migration,/alter table public.os_project_imports drop constraint os_project_imports_category_check/);
  assert.doesNotMatch(migration,/drop table|drop schema|service_role|grant |disable row level security/i);
});

// Confirmed customer FK is not inferred from company names.
test('confirmed CRM client identity is verified and linked without generating sales',()=>{
 const actions=read(route+'project-actions.ts');
 assert.match(actions,/\.from\("crm_clients"\)/);
 assert.match(actions,/origin_lead_id/);
 assert.match(actions,/client_id: confirmedClientId/);
 assert.match(actions,/metadata\.client_lead_id !== originatingLead/);
 const index=read('src/components/os/projects.tsx');
 assert.match(index,/name="client_id"/);
 assert.match(index,/confirmed\?\.data/);
 const data=read('src/lib/os/data.ts');
 assert.match(data,/client_id/);
 const group=read('src/lib/os/client-hud.ts');
 assert.match(group,/project\.client_id/);
 assert.match(group,/linkKind/);
});

test('module portfolios paginate server-side without hiding products after the first hundred',()=>{
 const source=read('src/lib/os/data.ts');
 assert.match(source,/page\?: number/);
 assert.match(source,/\.range\(\(safePage!/);
 assert.match(source,/count: "exact"/);
 const modules=['website-designer','ecommerce-designer','crm-creator','marketing-hub'];
 for(const slug of modules) {
   const page=read(route+slug+'/page.tsx');
   assert.match(page,/page=Number\.isSafeInteger/);
   assert.match(page,/page=\{page\}/);
 }
 const index=read('src/components/os/projects.tsx');
 assert.match(index,/Siguiente/);
 assert.match(index,/Anterior/);
});

test('product record distinguishes external source and canonical CRM client from mere URL registration',()=>{
 const hud=read('src/components/os/product-hud.tsx');
 assert.match(hud,/productMeta\.source_tool/);
 assert.match(hud,/productMeta\.mode/);
 assert.match(hud,/\/admin\/workspace\/crm\/clients\/\$\{confirmedClient\}/);
 const crm=read(route+'crm-creator/page.tsx');
 assert.doesNotMatch(crm,/Plantilla inicial|Starting template/);
 assert.match(crm,/Mis CRMs/);
});

test('Communication Hub can link a registered external agent to canonical Client 360 without a new sale',()=>{
 const hub=read(route+'ai-communications/page.tsx');
 assert.match(hub,/name="client_id"/);
 assert.match(hub,/crmClients\.data/);
 assert.match(hub,/Client 360/);
 assert.match(hub,/module="chatbots"/);
 assert.match(hub,/module="receptionist"/);
});
