#!/usr/bin/env node
// Direct Bridge viability — the five mandatory tests, through the REAL app UI and the ISOLATED Supabase project.
//   T1 create & save (real DB ids)   T2 sign out → new session → identical recovery (SHA-256)
//   T3 publish a Preview without GitHub (Avalon's server-side Vercel API path)   T4 second version + restore
//   T5 a non-member (own JWT) and anonymous cannot read/download/modify/version/deploy/restore
// Results: PASS / FAIL / BLOCKED (external dependency, with the exact provider answer). Never PASS for what did not run.
//   node scripts/project-bridge/e2e-five-tests.cjs <dir with creds.json + env.json> <base-url>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const [dir, base] = process.argv.slice(2);
const creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
const env = JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8'));
if (/ltbwzcrxeuczdhhtbqgm/.test(env.url)) { console.error('REFUSED: production Supabase project'); process.exit(3); }
const results = [];
const rec = (test, name, status, detail = {}) => { results.push({ test, name, status, ...detail }); console.log(`${status.padEnd(7)} ${test} ${name}`, JSON.stringify(detail).slice(0, 300)); };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const heading = p => p.locator('xpath=//label[normalize-space(text()[1])="heading"]/textarea').first();

async function signIn(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + '/admin/login');
  await page.fill('input[name="email"]', creds[who].email); await page.fill('input[name="password"]', creds[who].password);
  await Promise.all([page.waitForURL(u => !/\/admin\/login$/.test(u.pathname) || /error=/.test(u.search), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
  return { ctx, page };
}
async function jwt(who) {
  const sb = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email: creds[who].email, password: creds[who].password });
  if (error) throw new Error(error.message);
  return sb;
}
async function saveStudio(page) {
  await page.getByTestId('studio-save').click();
  await page.getByTestId('save-state').filter({ hasText: /Guardado|Saved|Error|Conflict|Conflicto/ }).waitFor({ timeout: 30000 });
  return page.getByTestId('save-state').innerText();
}
async function toLibrary(page, projectUrl) {
  await page.goto(projectUrl);
  await Promise.all([page.waitForURL(/[?&](ok|error)=/, { timeout: 60000 }), page.getByTestId('save-to-library').click()]);
  const u = new URL(page.url());
  return { ok: u.searchParams.get('ok'), error: u.searchParams.get('error'), version: u.searchParams.get('version') };
}
async function deploy(page, libUrl) {
  await page.goto(libUrl);
  const form = page.locator('form').filter({ has: page.locator('input[name="target"][value="preview"]') }).first();
  if (!(await form.count())) return { error: 'no_deploy_form' };
  await Promise.all([page.waitForURL(/[?&](ok|error)=/, { timeout: 90000 }), form.locator('button').first().click()]);
  const u = new URL(page.url());
  return { ok: u.searchParams.get('ok'), error: u.searchParams.get('error') };
}

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  let projectId, v1, v2;
  try {
    // ── TEST 1 — create and save ──
    const A = await signIn(browser, 'owner');
    await A.page.goto(base + '/admin/workspace/website-designer');
    const form = A.page.locator('#new form');
    await form.locator('input[name="name"]').fill('Bridge E2E'); // → Vercel project avalon-client-bridge-e2e (throwaway, protected)
    await Promise.all([A.page.waitForURL(/\/website-designer\/[0-9a-f-]{36}(\?|$)/, { timeout: 30000 }), form.locator('button[type="submit"]').first().click()]);
    projectId = /website-designer\/([0-9a-f-]{36})/.exec(A.page.url())[1];
    const projectUrl = `${base}/admin/workspace/website-designer/${projectId}`, libUrl = `${base}/admin/workspace/library/${projectId}`;
    await A.page.goto(projectUrl + '/studio');
    await A.page.getByRole('button', { name: /Añadir página|Add page/ }).click();
    await A.page.getByRole('button', { name: '+ hero' }).click();
    await heading(A.page).fill(`Versión 1 · ${stamp}`);
    await A.page.getByRole('button', { name: '+ text' }).click();
    await A.page.locator('xpath=//label[normalize-space(text()[1])="body"]/textarea').first().fill('Sección de prueba sintética.');
    const s1 = await saveStudio(A.page);
    const lib1 = await toLibrary(A.page, projectUrl);
    const dbA = await jwt('owner');
    const vers1 = (await dbA.from('os_project_versions').select('id,number,content_digest,deployable').eq('project_id', projectId).order('number')).data;
    v1 = vers1?.[0];
    const files1 = v1 ? (await dbA.from('os_project_files').select('path,sha256,size').eq('version_id', v1.id)).data : [];
    rec('T1', 'page created in the Website Designer, saved to the DB and as Library v1 (real ids)',
      /Guardado|Saved/.test(s1) && lib1.ok === 'library_version_saved' && v1?.number === 1 && v1.deployable === 'static' && files1.some(f => f.path === 'index.html') ? 'PASS' : 'FAIL',
      { project_id: projectId, version_id: v1?.id, version: v1?.number, files: files1.map(f => f.path), library: lib1 });

    // ── TEST 2 — recovery after sign-out ──
    await Promise.all([A.page.waitForURL(/\/admin\/login/), A.page.getByRole('button', { name: /Cerrar sesión|Sign out/ }).first().click()]);
    await A.ctx.close();
    const A2 = await signIn(browser, 'owner');
    await A2.page.goto(projectUrl + '/studio');
    await heading(A2.page).waitFor({ timeout: 20000 });
    const recovered = await heading(A2.page).inputValue();
    const blob = await dbA.storage.from('avalon-projects').download('blobs/' + files1.find(f => f.path === 'index.html').sha256);
    const bytes = blob.data ? Buffer.from(await blob.data.arrayBuffer()) : Buffer.alloc(0);
    const again = await toLibrary(A2.page, projectUrl);
    rec('T2', 'new session recovers identical content (editor + Library file SHA-256) and re-saving creates no duplicate',
      recovered === `Versión 1 · ${stamp}` && sha(bytes) === files1.find(f => f.path === 'index.html').sha256 && bytes.toString().includes(`Versión 1 · ${stamp}`)
        && again.ok === 'library_version_unchanged' ? 'PASS' : 'FAIL',
      { recovered, index_sha256: sha(bytes).slice(0, 16), resave: again.ok });

    // ── TEST 3 — Preview without GitHub (Avalon → Vercel REST API, server-side token) ──
    const d1 = await deploy(A2.page, libUrl);
    const dep1 = (await dbA.from('os_project_deployments').select('id,state,error_code,url,target,vercel_project').eq('version_id', v1.id).order('created_at', { ascending: false }).limit(1)).data?.[0];
    const blocked = /vercel_not_configured|forbidden|first_deployment_is_production|project_lookup_failed/.test(`${d1.error} ${dep1?.error_code}`);
    rec('T3', 'Library v1 published as a Vercel Preview via Avalon\'s server-side API (no GitHub)', d1.ok === 'deploy_started' && dep1?.state !== 'error' ? 'PASS' : blocked ? 'BLOCKED' : 'FAIL',
      { ui: d1, deployment: dep1 && { state: dep1.state, error: dep1.error_code, target: dep1.target, project: dep1.vercel_project, url: dep1.url } });

    // ── TEST 4 — second version, restore the first ──
    await A2.page.goto(projectUrl + '/studio'); await heading(A2.page).waitFor();
    await heading(A2.page).fill(`Versión 2 · ${stamp}`);
    const s2 = await saveStudio(A2.page);
    const lib2 = await toLibrary(A2.page, projectUrl);
    const vers2 = (await dbA.from('os_project_versions').select('id,number,content_digest').eq('project_id', projectId).order('number')).data;
    v2 = vers2.find(v => v.number === 2);
    const d2 = await deploy(A2.page, libUrl);
    await A2.page.goto(libUrl);
    const restoreForm = A2.page.locator('form').filter({ has: A2.page.locator(`input[name="version_id"][value="${v1.id}"]`) }).filter({ hasText: /Restaurar|Restore/ }).first();
    await Promise.all([A2.page.waitForURL(/[?&](ok|error)=/, { timeout: 30000 }), restoreForm.locator('button').first().click()]);
    const vers3 = (await dbA.from('os_project_versions').select('id,number,content_digest,kind,restored_from').eq('project_id', projectId).order('number')).data;
    const v3 = vers3.find(v => v.number === 3);
    const f3 = v3 ? (await dbA.from('os_project_files').select('path,sha256').eq('version_id', v3.id)).data : [];
    rec('T4', 'v2 saved; restoring v1 creates v3 with v1\'s exact content; v1 and v2 kept',
      /Guardado|Saved/.test(s2) && lib2.ok === 'library_version_saved' && v2 && v2.content_digest !== v1.content_digest && v3 && v3.content_digest === v1.content_digest
        && v3.restored_from === v1.id && f3.find(f => f.path === 'index.html')?.sha256 === files1.find(f => f.path === 'index.html').sha256 ? 'PASS' : 'FAIL',
      { versions: vers3.map(v => ({ n: v.number, kind: v.kind })), preview_v2: d2 });
    rec('T4b', 'v2 published as Preview', d2.ok === 'deploy_started' ? 'PASS' : /vercel_not_configured|forbidden|first_deployment_is_production|project_lookup_failed/.test(String(d2.error)) ? 'BLOCKED' : 'FAIL', { ui: d2 });

    // ── TEST 5 — no access for a non-member (own JWT) or anonymous ──
    const X = await signIn(browser, 'stranger');
    const pages = [];
    for (const u of [libUrl, projectUrl, projectUrl + '/studio']) { await X.page.goto(u); pages.push(new URL(X.page.url()).pathname); }
    const dbX = await jwt('stranger');
    const checks = {
      read_versions: (await dbX.from('os_project_versions').select('id').eq('project_id', projectId)).data?.length ?? 0,
      read_files: (await dbX.from('os_project_files').select('path').eq('version_id', v1.id)).data?.length ?? 0,
      download_blob: !!(await dbX.storage.from('avalon-projects').download('blobs/' + files1[0].sha256)).data,
      modify_page: (await dbX.from('os_website_pages').update({ title: 'hijack' }).eq('project_id', projectId).select('id')).data?.length ?? 0,
      create_version: !(await dbX.from('os_project_versions').insert({ project_id: projectId, number: 99, kind: 'import', source_tool: 'manual', framework: 'static', deployable: 'static', file_count: 0, total_bytes: 0, content_digest: sha('x') })).error,
      deploy: !(await dbX.from('os_project_deployments').insert({ project_id: projectId, version_id: v1.id, target: 'preview', vercel_project: 'avalon-client-bridge-e2e', idempotency_key: 'x-' + stamp })).error,
      restore: !(await dbX.rpc('os_project_restore_version', { p_version: v1.id })).error,
    };
    const anon = createClient(env.url, env.key, { auth: { persistSession: false } });
    checks.anon_read = (await anon.from('os_project_versions').select('id').eq('project_id', projectId)).data?.length ?? 0;
    checks.anon_download = !!(await anon.storage.from('avalon-projects').download('blobs/' + files1[0].sha256)).data;
    const anonCtx = await browser.newContext(); const ap = await anonCtx.newPage(); await ap.goto(libUrl); pages.push('anon:' + new URL(ap.url()).pathname);
    const denied = pages.every(p => p.endsWith('/admin/login')) && Object.values(checks).every(v => v === 0 || v === false);
    rec('T5', 'outsider (own JWT) and anonymous: no read, download, edit, new version, deploy or restore', denied ? 'PASS' : 'FAIL', { pages, checks });
    await dbA.auth.signOut(); await dbX.auth.signOut();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(dir, 'evidence-five-tests.json'), JSON.stringify({ base, projectId, results, at: new Date().toISOString() }, null, 2));
  const summary = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(k => [k, results.filter(r => r.status === k).length]));
  console.log('SUMMARY', JSON.stringify(summary));
  process.exit(summary.FAIL ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
