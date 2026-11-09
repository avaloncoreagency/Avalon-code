#!/usr/bin/env node
// CRM Creator and AI Chatbots Builder (Nova UI by Codex) with REAL persistence, against an ISOLATED Supabase project,
// in Playwright Chromium with an iPhone 13 profile (NOT Safari). Proves for each: create project → edit in Nova → save →
// reload → recovered; stored in os_projects.settings (owner JWT, RLS); version conflict; non-owner refused.
//   node scripts/project-bridge/e2e-nova-studios.cjs <dir with creds.json + env.json> <base-url> [screenshot-dir]
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const [dir, base, shots = dir] = process.argv.slice(2);
const creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
const env = JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8'));
if (/ltbwzcrxeuczdhhtbqgm/.test(env.url)) { console.error('REFUSED: production Supabase project'); process.exit(3); }
const steps = [];
const step = (name, ok, detail = {}) => { steps.push({ name, ok: !!ok, ...detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(detail)); };
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const saveState = page => page.getByTestId('save-state').innerText();
const byLabel = (page, text, tag) => page.locator(`xpath=//label[normalize-space(text()[1])="${text}"]/${tag}`);
const stage1 = page => page.locator(`xpath=//label[normalize-space(.)="Etapa 1"]/input`);

async function login(page, who) {
  await page.goto(base + '/admin/login');
  await page.fill('input[name="email"]', creds[who].email);
  await page.fill('input[name="password"]', creds[who].password);
  await Promise.all([page.waitForURL(u => !/\/admin\/login$/.test(u.pathname) || /error=/.test(u.search), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
}
async function save(page) {
  await page.getByTestId('studio-save').click();
  await page.getByTestId('save-state').filter({ hasText: /Guardado|Saved|Error|Conflict|Conflicto/ }).waitFor({ timeout: 30000 });
  return saveState(page);
}
async function asUser(who) {
  const sb = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email: creds[who].email, password: creds[who].password });
  if (error) throw new Error(`${who} sign-in failed: ${error.message}`);
  return sb;
}
async function createProject(page, section, name) {
  await page.goto(`${base}/admin/workspace/${section}`);
  const form = page.locator('#new form');
  await form.locator('input[name="name"]').fill(name);
  await Promise.all([page.waitForURL(new RegExp(`/${section}/[0-9a-f-]{36}`), { timeout: 30000 }), form.locator('button[type="submit"]').first().click()]);
  return new RegExp(`/${section}/([0-9a-f-]{36})`).exec(page.url())[1];
}

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const ids = {};
  try {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    await login(page, 'owner');
    step('owner signs in through the real login form', /\/admin\/dashboard/.test(page.url()));
    const owner = await asUser('owner');

    // ── CRM Creator ──
    ids.crm = await createProject(page, 'crm-creator', `CRM Nova E2E ${stamp}`);
    await page.getByTestId('open-studio').click(); await page.waitForURL(/\/studio$/);
    await page.getByRole('button', { name: /Añadir campo|Add field/ }).click();
    const fieldLabel = `Presupuesto ${stamp}`;
    await byLabel(page, 'Etiqueta', 'input').first().fill(fieldLabel);
    await page.getByRole('button', { name: /Añadir etapa|Add stage/ }).click();
    await page.getByRole('button', { name: /Añadir etapa|Add stage/ }).click();
    await stage1(page).fill('Contacto inicial');
    await byLabel(page, 'tasks', 'input').check();
    const crmSave = await save(page);
    step('CRM: Nova design saved to Avalon', /Guardado|Saved/.test(crmSave), { state: crmSave });
    await page.reload();
    await byLabel(page, 'Etiqueta', 'input').first().waitFor({ timeout: 20000 });
    const crmRecovered = { field: await byLabel(page, 'Etiqueta', 'input').first().inputValue(), stage: await stage1(page).inputValue(), tasks: await byLabel(page, 'tasks', 'input').isChecked() };
    step('CRM: after reload field, stage and module are recovered', crmRecovered.field === fieldLabel && crmRecovered.stage === 'Contacto inicial' && crmRecovered.tasks, crmRecovered);
    const crmRow = await owner.from('os_projects').select('settings,version').eq('id', ids.crm).single();
    const bp = crmRow.data?.settings?.blueprint;
    step('CRM: stored as the project blueprint (owner JWT, RLS) — same data the classic CRM Creator and its export use',
      bp?.entities?.[0]?.fields?.[0]?.label === fieldLabel && bp?.pipelines?.[0]?.stages?.length === 2 && crmRow.data.settings.nova.modules.includes('tasks'), { version: crmRow.data?.version });
    await page.goto(`${base}/admin/workspace/crm-creator/${ids.crm}`);
    step('CRM: the classic CRM Creator page shows the field designed in Nova', (await page.content()).includes(fieldLabel));
    await page.goto(`${base}/admin/workspace/crm-creator/${ids.crm}/studio`);
    await page.screenshot({ path: path.join(shots, 'crm-studio-iphone.png'), fullPage: true });
    const w1 = await page.evaluate(() => document.documentElement.scrollWidth);

    // Conflict
    const a = await ctx.newPage(), b = await ctx.newPage();
    for (const t of [a, b]) { await t.goto(page.url()); await stage1(t).waitFor(); }
    await stage1(a).fill('Tab A'); const aS = await save(a);
    await stage1(b).fill('Tab B'); const bS = await save(b);
    const after = await owner.from('os_projects').select('settings').eq('id', ids.crm).single();
    step('CRM: stale tab gets a version conflict and cannot overwrite', /Guardado|Saved/.test(aS) && /Conflict/i.test(bS) && after.data.settings.blueprint.pipelines[0].stages[0].label === 'Tab A', { aS, bS });
    await a.close(); await b.close();

    // ── AI Chatbots (stored on an AI Receptionist project) ──
    ids.chatbot = await createProject(page, 'ai-receptionist', `Chatbot Nova E2E ${stamp}`);
    await page.getByTestId('open-studio').click(); await page.waitForURL(/\/studio$/);
    const greeting = `¡Hola! Soy el asistente sintético ${stamp}`;
    await byLabel(page, 'Bienvenida', 'textarea').fill(greeting);
    await byLabel(page, 'Instrucciones', 'textarea').fill('Responde solo con datos sintéticos de prueba.');
    await page.getByRole('button', { name: /Añadir conocimiento|Add knowledge/ }).click();
    await byLabel(page, 'Título', 'input').first().fill('Horario');
    await byLabel(page, 'Contenido', 'textarea').first().fill('Lunes a viernes, 9:00–18:00 (dato de prueba)');
    const chatSave = await save(page);
    step('Chatbot: Nova configuration saved to Avalon', /Guardado|Saved/.test(chatSave), { state: chatSave });
    await page.reload();
    await byLabel(page, 'Bienvenida', 'textarea').waitFor({ timeout: 20000 });
    const chatRecovered = { greeting: await byLabel(page, 'Bienvenida', 'textarea').inputValue(), title: await byLabel(page, 'Título', 'input').first().inputValue() };
    step('Chatbot: after reload greeting and knowledge are recovered', chatRecovered.greeting === greeting && chatRecovered.title === 'Horario', chatRecovered);
    const chatRow = await owner.from('os_projects').select('settings').eq('id', ids.chatbot).single();
    step('Chatbot: stored in the AI Receptionist project settings (owner JWT, RLS)', chatRow.data?.settings?.chatbot?.greeting === greeting && chatRow.data.settings.chatbot.knowledge.length === 1);
    step('Chatbot: the preview cannot send messages (AI replies honestly not connected)', await page.getByRole('button', { name: /Enviar · No conectado|Send · Not connected/ }).isDisabled());
    await page.screenshot({ path: path.join(shots, 'chatbot-studio-iphone.png'), fullPage: true });
    const w2 = await page.evaluate(() => document.documentElement.scrollWidth);
    step('no horizontal overflow at iPhone width in the CRM and Chatbot studios', w1 <= 390 && w2 <= 390, { crm: w1, chatbot: w2 });
    await owner.auth.signOut();

    // ── Non-owner ──
    const ctx2 = await browser.newContext();
    const s2 = await ctx2.newPage();
    await login(s2, 'stranger');
    const urls = [`/admin/workspace/crm-creator/${ids.crm}/studio`, `/admin/workspace/ai-receptionist/${ids.chatbot}/studio`];
    const landed = [];
    for (const u of urls) { await s2.goto(base + u); landed.push(new URL(s2.url()).pathname); }
    step('non-owner cannot open either studio (redirected to login)', landed.every(p => p === '/admin/login'), { landed });
    const stranger = await asUser('stranger');
    const read = await stranger.from('os_projects').select('id').in('id', [ids.crm, ids.chatbot]);
    const write = await stranger.from('os_projects').update({ settings: {} }).in('id', [ids.crm, ids.chatbot]).select('id');
    step('RLS: non-owner reads 0 projects and cannot modify settings (own JWT, no admin key)', (read.data ?? []).length === 0 && (write.data ?? []).length === 0, { read: read.data?.length ?? read.error?.code, write: write.data?.length ?? write.error?.code });
    await stranger.auth.signOut();
  } finally { await browser.close(); }
  const failed = steps.filter(s => !s.ok).length;
  fs.writeFileSync(path.join(dir, 'evidence-nova-studios.json'), JSON.stringify({ base, ids, steps, browser: 'Chromium (Playwright) with iPhone 13 profile — not Safari', result: failed ? 'FAILED' : 'PASSED', at: new Date().toISOString() }, null, 2));
  console.log('RESULT', failed ? 'FAILED' : 'PASSED', `${steps.length - failed}/${steps.length}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
