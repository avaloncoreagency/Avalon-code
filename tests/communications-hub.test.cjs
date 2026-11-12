const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');

const ROOT='src/app/admin/workspace';
const product=[
  ['ai-chatbots','chatbots'],
  ['ai-receptionist','receptionist'],
];
test('communications hub is owner gated and links two independent products',()=>{
  const hub=read(`${ROOT}/ai-communications/page.tsx`);
  assert.match(hub,/requireOwner\(\)/);
  assert.match(hub,/Suite active="ai-communications"/);
  for(const [slug] of product)assert.ok(hub.includes(`/admin/workspace/${slug}`));
  for(const section of ['Knowledge Base','Conversations','Appointments','Analytics'])assert.ok(hub.includes(section));
  assert.match(hub,/\.in\("module",\["chatbots","receptionist"\]\)/);
  assert.match(hub,/groupCompanies\(/);
  assert.match(hub,/createProject/);
  assert.match(hub,/name="client_lead_id"/);
  assert.match(hub,/name="company_name"/);
  assert.match(hub,/\.range\(offset,offset \+ PAGE_SIZE - 1\)/);
  assert.doesNotMatch(hub,/service_role|GROQ_API_KEY|NEXT_PUBLIC_.*TOKEN/i);
});
test('chatbot pages and receptionist builder are protected, linked and persistent',()=>{
  for(const path of [
    'ai-chatbots/page.tsx','ai-chatbots/builder/page.tsx',
    'ai-chatbots/[id]/page.tsx','ai-chatbots/[id]/studio/page.tsx',
    'ai-receptionist/builder/page.tsx'
  ])assert.match(read(`${ROOT}/${path}`),/requireOwner\(\)/,path);
  assert.match(read(`${ROOT}/ai-chatbots/[id]/studio/page.tsx`),/getProject\(supabase,"chatbots",id\)/);
  assert.match(read(`${ROOT}/ai-chatbots/[id]/studio/page.tsx`),/kind="chatbot_product"/);
  assert.match(read('src/app/admin/workspace/nova-studio-actions.ts'),/chatbot_product: "\/admin\/workspace\/ai-chatbots"/);
  assert.match(read('src/lib/os/nova-settings.ts'),/chatbot_product: "chatbots"/);
});
test('chatbots project identity and SQL check are isolated from receptionist',()=>{
  const domain=read('src/lib/os/domain.ts');
  const actions=read(`${ROOT}/project-actions.ts`);
  const sql=read('supabase/migrations/20261107090000_ai_chatbots_module.sql');
  assert.match(domain,/"chatbots"/);
  assert.match(actions,/chatbots: "\/admin\/workspace\/ai-chatbots"/);
  assert.match(sql,/check \(module in .*'chatbots'\)/);
  assert.doesNotMatch(sql,/drop table|drop policy|disable row level security|grant .* to anon/i);
  const nav=read('src/components/suite/modules.ts');
  assert.match(nav,/slug: "ai-chatbots", key: "chatbots"/);
  assert.match(read('src/components/suite/suite.tsx'),/href="\/admin\/workspace\/ai-communications"/);
});
test('old receptionist chatbot drafts remain accessible without pretending to be live AI',()=>{
  const legacy=read(`${ROOT}/ai-receptionist/[id]/studio/page.tsx`);
  assert.match(legacy,/getProject\(supabase, "receptionist", id\)/);
  assert.match(legacy,/kind="chatbot"/);
  const studio=read('src/components/os/nova-settings-studio.tsx');
  assert.match(studio,/chatbot_product/);
  assert.match(studio,/Legacy AI Receptionist editor/);
  const ui=read('src/components/avalon-ui/builders/chatbot-editor.tsx');
  assert.match(ui,/Provider not connected/);
  assert.match(ui,/disabled/);
});

test('all four communications operations routes are owner-only and linked from hub',()=>{
  const hub=read(`${ROOT}/ai-communications/page.tsx`);
  const sections=['knowledge','conversations','appointments','analytics'];
  for(const slug of sections){
    const page=read(`${ROOT}/ai-communications/${slug}/page.tsx`);
    assert.match(page,/requireOwner\(\)/,`missing owner check on ${slug}`);
    assert.ok(hub.includes(`/admin/workspace/ai-communications/${slug}`),`missing hub link to ${slug}`);
  }
  const knowledge=read(`${ROOT}/ai-communications/knowledge/page.tsx`);
  assert.match(knowledge,/readChatbot\(project.settings\)/);
  assert.match(knowledge,/os_receptionist_entries/);
  assert.match(knowledge,/\.limit\(300\)/);
  const analytics=read(`${ROOT}/ai-communications/analytics/page.tsx`);
  assert.match(analytics,/countRows\(supabase/);
  assert.match(analytics,/Missing data is not zero/);
  const appointments=read(`${ROOT}/ai-communications/appointments/page.tsx`);
  assert.match(appointments,/href="\/admin\/workspace\/crm\/calendar"/);
  const conversations=read(`${ROOT}/ai-communications/conversations/page.tsx`);
  assert.match(conversations,/No fabricated messages, calls or transcripts/);
});

test('single top-level Communication Hub replaces both legacy communications sidebar modules',()=>{
  const modules=read('src/components/suite/modules.ts');
  const shell=read('src/components/suite/suite.tsx');
  const dashboard=read('src/app/admin/dashboard/page.tsx');
  assert.match(modules,/slug: "ai-communications", key: "communications"/);
  assert.match(modules,/name: "COMMUNICATION HUB"/);
  assert.doesNotMatch(modules,/slug: "ai-receptionist"/);
  assert.doesNotMatch(modules,/slug: "ai-chatbots"/);
  assert.match(shell,/active === "ai-receptionist" \|\| active === "ai-chatbots"/);
  assert.match(shell,/aria-current={navActive === m.slug/);
  assert.match(dashboard,/communications: chatbotCount/);
  assert.doesNotMatch(dashboard,/receptionist: stat\(/);
  assert.match(read('src/components/suite/module-cards.tsx'),/Workspace available/);
});

test('communications company board filters and links existing agent editors',()=>{
  const page=read('src/app/admin/workspace/ai-communications/page.tsx');
  const board=read('src/components/communications/communications-portfolio.tsx');
  const css=read('src/components/communications/communications.module.css');
  assert.match(page,/requireOwner\(\)/);
  assert.match(page,/groupCompanies\(projects.data/);
  assert.match(page,/PAGE_SIZE = 60/);
  assert.match(page,/countRows\(supabase,"os_projects"/);
  assert.match(page,/action={createProject}/);
  assert.match(board,/useState<Kind>/);
  assert.match(board,/useState<Scope>/);
  assert.match(board,/g.linked/);
  assert.match(board,/\/admin\/workspace\/ai-receptionist/);
  assert.match(board,/\/admin\/workspace\/ai-chatbots/);
  assert.match(board,/\/admin\/workspace\/clients/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.doesNotMatch(board,/GROQ_API_KEY|OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE/i);
});
