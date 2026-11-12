#!/usr/bin/env node
// Website Designer (Nova UI by Codex) with REAL persistence, against an ISOLATED Supabase project, in a real browser
// (Playwright Chromium with an iPhone 13 profile — NOT Safari). Proves: create project → edit in Nova → save →
// reload → changes recovered; database versions; optimistic-concurrency conflict; unsafe link refused; leave warning;
// non-owner refused (app + RLS with the stranger's own JWT). Refuses to run against the production project.
//   node scripts/project-bridge/e2e-website-studio.cjs <dir with creds.json + env.json> <base-url> [screenshot-dir]
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
const field = (page, key) => page.locator(`xpath=//label[normalize-space(text()[1])="${key}"]/textarea`).first();
const saveState = page => page.getByTestId('save-state').innerText();

async function login(page, who) {
  await page.goto(base + '/admin/login');
  await page.fill('input[name="email"]', creds[who].email);
  await page.fill('input[name="password"]', creds[who].password);
  await Promise.all([page.waitForURL(u => !/\/admin\/login$/.test(u.pathname) || /error=/.test(u.search), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
}
async function waitSaved(page) {
  await page.getByTestId('save-state').filter({ hasText: /Guardado|Saved|Error|Conflict|Conflicto/ }).waitFor({ timeout: 30000 });
  return saveState(page);
}
async function asUser(who) {
  const sb = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email: creds[who].email, password: creds[who].password });
  if (error) throw new Error(`${who} sign-in failed: ${error.message}`);
  return sb;
}

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  let projectId = null, pageId = null;
  try {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    await login(page, 'owner');
    step('owner signs in through the real login form', /\/admin\/dashboard/.test(page.url()));

    // 1. Create a Website Designer project with the existing (persisted) project form.
    const name = `Studio E2E ${stamp}`;
    await page.goto(base + '/admin/workspace/website-designer');
    const form = page.locator('#new form');
    await form.locator('input[name="name"]').fill(name);
    await form.locator('textarea[name="description"]').fill('Proyecto sintético de prueba (sin datos reales).');
    await Promise.all([page.waitForURL(/\/website-designer\/[0-9a-f-]{36}/, { timeout: 30000 }), form.locator('button[type="submit"]').first().click()]);
    projectId = /website-designer\/([0-9a-f-]{36})/.exec(page.url())[1];
    step('website project created and stored', !!projectId, { projectId });

    // 2. Open the Nova editor, add a page and a hero block, edit it.
    await page.getByTestId('open-studio').click();
    await page.waitForURL(/\/studio$/);
    step('Nova Website Designer opens for the project (initially saved, no pages)', /Guardado|Saved/.test(await saveState(page)));
    await page.getByRole('button', { name: /Añadir página|Add page/ }).click();
    await page.getByRole('button', { name: '+ hero' }).click();
    const heading1 = `Hola desde Nova ${stamp}`;
    await field(page, 'heading').fill(heading1);
    await field(page, 'subheading').fill('Persistencia real en Supabase');
    step('editing marks the project as having unsaved changes', /sin guardar|Unsaved/.test(await saveState(page)), { state: await saveState(page) });

    // 3. Leaving with unsaved changes asks for confirmation.
    let warned = false;
    page.once('dialog', d => { warned = d.type() === 'beforeunload'; d.dismiss().catch(() => {}); });
    await page.close({ runBeforeUnload: true }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    step('leaving with unsaved changes triggers the browser warning (beforeunload)', warned && !page.isClosed());

    // 4. Save → reload → recovered.
    await page.getByTestId('studio-save').click();
    step('save to Avalon succeeds', /Guardado|Saved/.test(await waitSaved(page)), { state: await saveState(page) });
    await page.screenshot({ path: path.join(shots, 'studio-saved-iphone.png'), fullPage: true });
    await page.reload();
    await field(page, 'heading').waitFor({ timeout: 20000 });
    const recovered = await field(page, 'heading').inputValue();
    step('after reload the edited content is recovered from the database', recovered === heading1 && (await field(page, 'subheading').inputValue()) === 'Persistencia real en Supabase', { recovered });

    // 5. Second edit, save, reload again; check database versions with the owner's own JWT (RLS applies).
    const heading2 = `Segunda versión ${stamp}`;
    await field(page, 'heading').fill(heading2);
    await page.getByTestId('studio-save').click();
    await waitSaved(page);
    await page.reload();
    await field(page, 'heading').waitFor({ timeout: 20000 });
    step('second edit survives another reload', (await field(page, 'heading').inputValue()) === heading2);
    const owner = await asUser('owner');
    const pages = await owner.from('os_website_pages').select('id,title,blocks,version').eq('project_id', projectId);
    pageId = pages.data?.[0]?.id;
    const versions = await owner.from('os_website_page_versions').select('page_version,blocks').eq('page_id', pageId).order('page_version');
    const headings = (versions.data ?? []).map(v => v.blocks?.[0]?.heading ?? '');
    step('database holds the page (owner JWT) with its version history', pages.data?.length === 1 && pages.data[0].blocks[0].heading === heading2 && headings.includes(heading1) && headings.includes(heading2),
      { rowVersion: pages.data?.[0]?.version, versions: (versions.data ?? []).map(v => v.page_version) });

    // 6. Optimistic concurrency: two tabs, the stale one gets a conflict and does not overwrite.
    const tabA = await ctx.newPage(); const tabB = await ctx.newPage();
    for (const t of [tabA, tabB]) { await t.goto(page.url()); await field(t, 'heading').waitFor(); }
    await field(tabA, 'heading').fill(`Tab A ${stamp}`); await tabA.getByTestId('studio-save').click();
    const aState = await waitSaved(tabA);
    await field(tabB, 'heading').fill(`Tab B ${stamp}`); await tabB.getByTestId('studio-save').click();
    const bState = await waitSaved(tabB);
    const after = await owner.from('os_website_pages').select('blocks').eq('id', pageId).single();
    step('stale tab gets a version conflict and cannot overwrite newer changes', /Guardado|Saved/.test(aState) && /Conflict/i.test(bState) && after.data.blocks[0].heading === `Tab A ${stamp}`, { aState, bState });
    await tabA.close(); await tabB.close();

    // 7. Unsafe link is refused by server validation and is not stored.
    await page.reload(); await field(page, 'heading').waitFor();
    await field(page, 'buttonLabel').fill('Clic');
    await field(page, 'buttonHref').fill('javascript:alert(1)');
    await page.getByTestId('studio-save').click();
    const unsafe = await waitSaved(page);
    const stored = await owner.from('os_website_pages').select('blocks').eq('id', pageId).single();
    step('unsafe javascript: link is rejected and nothing is stored', /Error/i.test(unsafe) && stored.data.blocks[0].buttonHref === '', { state: unsafe });

    // 8. Mobile layout.
    const p3 = await ctx.newPage(); await p3.goto(page.url()); await p3.waitForLoadState('networkidle');
    const width = await p3.evaluate(() => document.documentElement.scrollWidth); await p3.screenshot({ path: path.join(shots, 'studio-iphone.png'), fullPage: true }); await p3.close();
    step('no horizontal overflow at iPhone width in the Nova studio', width <= 390, { width });
    await owner.auth.signOut();

    // 9. Non-owner: refused by the app and by RLS with their own JWT.
    const ctx2 = await browser.newContext();
    const s2 = await ctx2.newPage();
    await login(s2, 'stranger');
    await s2.goto(`${base}/admin/workspace/website-designer/${projectId}/studio`);
    step('non-owner cannot open the studio (redirected to login)', /\/admin\/login/.test(s2.url()), { url: new URL(s2.url()).pathname });
    const stranger = await asUser('stranger');
    const read = await stranger.from('os_website_pages').select('id').eq('project_id', projectId);
    const write = await stranger.from('os_website_pages').update({ title: 'hijack' }).eq('id', pageId).select('id');
    step('RLS: non-owner reads 0 pages and cannot modify them (own JWT, no admin key)', (read.data ?? []).length === 0 && (write.data ?? []).length === 0, { read: read.data?.length ?? read.error?.code, write: write.data?.length ?? write.error?.code });
    await stranger.auth.signOut();
  } finally { await browser.close(); }
  const failed = steps.filter(s => !s.ok).length;
  fs.writeFileSync(path.join(dir, 'evidence-website-studio.json'), JSON.stringify({ base, projectId, pageId, steps, browser: 'Chromium (Playwright) with iPhone 13 profile — not Safari', result: failed ? 'FAILED' : 'PASSED', at: new Date().toISOString() }, null, 2));
  console.log('RESULT', failed ? 'FAILED' : 'PASSED', `${steps.length - failed}/${steps.length}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
