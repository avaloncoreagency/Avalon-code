const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');
const modules = [
  ['website-designer', 'website'],
  ['ecommerce-designer', 'ecommerce'],
  ['crm-creator', 'crm_creator'],
  ['ai-receptionist', 'receptionist'],
  ['marketing-hub', 'marketing'],
  ['ai-chatbots', 'chatbots'],
];

test('six modules expose protected Library and Builder pages', () => {
  const menu = read('src/components/suite/modules.ts');
  const tabs = read('src/components/os/module-sections.tsx');
  assert.match(tabs, /active: "library" \| "builder"/);
  for (const [slug, key] of modules) {
    assert.ok(menu.includes(`slug: "${slug}", key: "${key}"`), slug);
    const base = `src/app/admin/workspace/${slug}`;
    const library = read(`${base}/page.tsx`);
    const builder = read(`${base}/builder/page.tsx`);
    assert.match(library, /requireOwner\(\)/, `${slug} library auth`);
    assert.match(library, /<ModuleSectionTabs/, `${slug} library tabs`);
    assert.match(builder, /requireOwner\(\)/, `${slug} builder auth`);
    assert.match(builder, /<ModuleBuilderLanding/, `${slug} builder component`);
  }
});

test('chatbot projects have a database migration and owner-only detail page', () => {
  const domain = read('src/lib/os/domain.ts');
  const sql = read('supabase/migrations/20261107090000_ai_chatbots_module.sql');
  const detail = read('src/app/admin/workspace/ai-chatbots/[id]/page.tsx');
  const actions = read('src/app/admin/workspace/project-actions.ts');
  const hud = read('src/lib/os/client-hud.ts');
  assert.match(domain, /"chatbots"/);
  assert.match(sql, /check \(module in .*'chatbots'\)/);
  assert.match(actions, /chatbots: "\/admin\/workspace\/ai-chatbots"/);
  assert.match(detail, /requireOwner\(\)/);
  assert.match(detail, /getProject\(supabase, "chatbots", id\)/);
  assert.match(hud, /chatbots: \{ name: 'AI Chatbots'/);
  assert.doesNotMatch(detail, /GROQ_API_KEY|CLOUDFLARE_API_TOKEN|SERVICE_ROLE/);
});
