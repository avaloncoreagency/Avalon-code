#!/usr/bin/env node
// Two INDEPENDENT owners (separate synthetic accounts, separate browser contexts, real sign-in/sign-out) working on
// the same Website Designer project against the ISOLATED Supabase project. No admin key: every database read uses the
// acting owner's own JWT (RLS applies). Chromium with a desktop profile (not Safari).
//   node scripts/project-bridge/e2e-two-owners.cjs <dir with creds.json {owner, ownerB, stranger} + env.json> <base-url>
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const [dir, base] = process.argv.slice(2);
const creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
const env = JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8'));
if (/ltbwzcrxeuczdhhtbqgm/.test(env.url)) { console.error('REFUSED: production Supabase project'); process.exit(3); }
if (!creds.ownerB) { console.error('creds.json needs an authorized second synthetic owner (ownerB)'); process.exit(3); }
const steps = [];
const step = (name, ok, detail = {}) => { steps.push({ name, ok: !!ok, ...detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(detail)); };
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const heading = page => page.locator('xpath=//label[normalize-space(text()[1])="heading"]/textarea').first();
const state = page => page.getByTestId('save-state').innerText();

async function signIn(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + '/admin/login');
  await page.fill('input[name="email"]', creds[who].email);
  await page.fill('input[name="password"]', creds[who].password);
  await Promise.all([page.waitForURL(u => !/\/admin\/login$/.test(u.pathname) || /error=/.test(u.search), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
  return { ctx, page };
}
async function signOut(page) {
  await Promise.all([page.waitForURL(/\/admin\/login/, { timeout: 30000 }), page.getByRole('button', { name: /Cerrar sesión|Sign out/ }).first().click()]);
}
async function save(page) {
  await page.getByTestId('studio-save').click();
  await page.getByTestId('save-state').filter({ hasText: /Guardado|Saved|Error|Conflict|Conflicto/ }).waitFor({ timeout: 30000 });
  return state(page);
}
async function jwt(who) {
  const sb = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email: creds[who].email, password: creds[who].password });
  if (error) throw new Error(`${who}: ${error.message}`);
  return sb;
}

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  let projectId, pageId, studio;
  try {
    // 1. Owner A creates a synthetic project and its first content.
    const A = await signIn(browser, 'owner');
    step('Owner A signs in with their own account', /\/admin\/dashboard/.test(A.page.url()));
    await A.page.goto(base + '/admin/workspace/website-designer');
    const form = A.page.locator('#new form');
    await form.locator('input[name="name"]').fill(`Dos owners ${stamp}`);
    await Promise.all([A.page.waitForURL(/\/website-designer\/[0-9a-f-]{36}(\?|$)/, { timeout: 30000 }), form.locator('button[type="submit"]').first().click()]);
    projectId = /website-designer\/([0-9a-f-]{36})/.exec(A.page.url())[1];
    studio = `${base}/admin/workspace/website-designer/${projectId}/studio`;
    await A.page.goto(studio);
    await A.page.getByRole('button', { name: /Añadir página|Add page/ }).click();
    await A.page.getByRole('button', { name: '+ hero' }).click();
    await heading(A.page).fill(`Versión de A ${stamp}`);
    step('Owner A creates the project and saves the first version', /Guardado|Saved/.test(await save(A.page)));

    // 2. Owner B, another account and another browser session, sees it, edits and saves.
    const B = await signIn(browser, 'ownerB');
    step('Owner B signs in with a separate account and session', /\/admin\/dashboard/.test(B.page.url()));
    await B.page.goto(studio);
    await heading(B.page).waitFor({ timeout: 20000 });
    step('Owner B sees the shared agency project and A\'s content', (await heading(B.page).inputValue()) === `Versión de A ${stamp}`);
    await heading(B.page).fill(`Versión de B ${stamp}`);
    step('Owner B edits and saves', /Guardado|Saved/.test(await save(B.page)));

    // 3. Owner A signs out completely, signs in again in a NEW session and recovers B's version.
    await signOut(A.page);
    await A.page.goto(studio);
    step('after sign-out Owner A\'s old session can no longer open the project', /\/admin\/login/.test(A.page.url()));
    await A.ctx.close();
    const A2 = await signIn(browser, 'owner');
    await A2.page.goto(studio);
    await heading(A2.page).waitFor({ timeout: 20000 });
    step('Owner A, in a brand-new session, recovers exactly the version saved by B', (await heading(A2.page).inputValue()) === `Versión de B ${stamp}`);

    // Per-user audit: who wrote each version (Owner A's own JWT; RLS).
    const dbA = await jwt('owner');
    pageId = (await dbA.from('os_website_pages').select('id').eq('project_id', projectId).single()).data.id;
    const v1 = (await dbA.from('os_website_page_versions').select('id,page_version,created_by,blocks').eq('page_id', pageId).order('page_version')).data;
    step('version history records the author of every version (A, then B)', v1.length === 2 && v1[0].created_by === creds.owner.id && v1[1].created_by === creds.ownerB.id,
      { versions: v1.map(v => ({ v: v.page_version, by: v.created_by === creds.owner.id ? 'A' : v.created_by === creds.ownerB.id ? 'B' : '?' })) });

    // 4. Owner A restores the earlier version: a NEW version, history kept.
    await A2.page.goto(`${base}/admin/workspace/website-designer/${projectId}/pages/${pageId}`);
    const firstVersionForm = A2.page.locator('form').filter({ has: A2.page.locator(`input[name="versionId"][value="${v1[0].id}"]`) });
    await Promise.all([A2.page.waitForURL(/ok=restored/, { timeout: 30000 }), firstVersionForm.locator('button').first().click()]);
    const v2 = (await dbA.from('os_website_page_versions').select('page_version,created_by,blocks').eq('page_id', pageId).order('page_version')).data;
    step('Owner A restores v1 → creates v3 (A\'s content) and keeps v1 and v2', v2.length === 3 && v2[2].blocks[0].heading === `Versión de A ${stamp}` && v2[2].created_by === creds.owner.id
      && v2[1].blocks[0].heading === `Versión de B ${stamp}`, { versions: v2.map(v => v.page_version) });

    // 5. Owner B observes the restoration.
    await B.page.reload();
    await heading(B.page).waitFor({ timeout: 20000 });
    step('Owner B sees the restored content after reloading', (await heading(B.page).inputValue()) === `Versión de A ${stamp}`);

    // 6. Simultaneous writes: both open the same version; the second save is a conflict and does not overwrite.
    await A2.page.goto(studio); await heading(A2.page).waitFor();
    await heading(A2.page).fill(`A simultáneo ${stamp}`);
    await heading(B.page).fill(`B simultáneo ${stamp}`);
    const [sa, sb] = [await save(A2.page), await save(B.page)];
    const now = (await dbA.from('os_website_pages').select('blocks').eq('id', pageId).single()).data.blocks[0].heading;
    step('concurrent saves: the first wins, the second gets a version conflict and overwrites nothing', /Guardado|Saved/.test(sa) && /Conflict/i.test(sb) && now === `A simultáneo ${stamp}`, { a: sa, b: sb });

    // 7. Duplicate retry: the first response is lost (network), the user retries → one version, confirmed result.
    await B.page.reload(); await heading(B.page).waitFor();
    const before = (await dbA.from('os_website_page_versions').select('id').eq('page_id', pageId)).data.length;
    await heading(B.page).fill(`Reintento de B ${stamp}`);
    let dropped = false;
    await B.page.route(studio, async route => {
      if (route.request().method() === 'POST' && !dropped) { dropped = true; await route.fetch(); return route.abort('failed'); }
      return route.continue();
    });
    const first = await save(B.page);
    const second = await save(B.page);
    await B.page.unroute(studio);
    const after = (await dbA.from('os_website_page_versions').select('id,blocks').eq('page_id', pageId).order('page_version')).data;
    step('retry after a lost response: confirmed as saved, exactly ONE new version (no duplicate)', dropped && /Error/i.test(first) && /Guardado|Saved/.test(second)
      && after.length === before + 1 && after.at(-1).blocks[0].heading === `Reintento de B ${stamp}`, { first, second, versions_added: after.length - before });
    await dbA.auth.signOut();

    // 8. Non-member and anonymous access.
    const X = await signIn(browser, 'stranger');
    await X.page.goto(studio);
    step('a user outside Avalon (no membership) cannot open the project', /\/admin\/login/.test(X.page.url()));
    const dbX = await jwt('stranger');
    const xr = await dbX.from('os_website_pages').select('id').eq('project_id', projectId);
    const xw = await dbX.from('os_website_pages').update({ title: 'hijack' }).eq('id', pageId).select('id');
    step('RLS: the outsider reads 0 rows and modifies nothing with their own JWT', (xr.data ?? []).length === 0 && (xw.data ?? []).length === 0);
    const anonCtx = await browser.newContext(); const anon = await anonCtx.newPage();
    await anon.goto(studio);
    const anonDb = createClient(env.url, env.key, { auth: { persistSession: false } });
    const ar = await anonDb.from('os_website_pages').select('id').eq('project_id', projectId);
    step('anonymous visitor: redirected to login; anonymous API reads nothing', /\/admin\/login/.test(anon.url()) && (ar.data ?? []).length === 0, { api: ar.error?.code ?? ar.data?.length });
  } finally { await browser.close(); }
  const failed = steps.filter(s => !s.ok).length;
  fs.writeFileSync(path.join(dir, 'evidence-two-owners.json'), JSON.stringify({ base, projectId, pageId, steps,
    identities: 'two separate synthetic owner accounts + one synthetic non-member, isolated Supabase only', browser: 'Chromium (Playwright), desktop — not Safari',
    result: failed ? 'FAILED' : 'PASSED', at: new Date().toISOString() }, null, 2));
  console.log('RESULT', failed ? 'FAILED' : 'PASSED', `${steps.length - failed}/${steps.length}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
