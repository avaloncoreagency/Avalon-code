#!/usr/bin/env node
// Export → import round trip without GitHub or Vercel, against the ISOLATED Supabase project, through the real app:
// Owner A exports a sealed version, the ZIP is imported as a NEW project with the normal Library importer, and every
// file hash must match; Owner B (separate account) can export the shared project; outsider and anonymous cannot.
//   node scripts/project-bridge/e2e-export-roundtrip.cjs <dir with creds.json + env.json> <base-url> <library-project-id>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const [dir, base, projectId] = process.argv.slice(2);
const creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
const env = JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8'));
if (/ltbwzcrxeuczdhhtbqgm/.test(env.url)) { console.error('REFUSED: production Supabase project'); process.exit(3); }
const load = require(path.resolve(__dirname, '../creative-bridge/continuity-loader.cjs'));
const { readZip } = load(path.resolve(__dirname, '../../src/lib/project-bridge/zip.ts'));
const { BRIDGE_LIMITS } = load(path.resolve(__dirname, '../../src/lib/project-bridge/policy.ts'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const steps = [];
const step = (name, ok, detail = {}) => { steps.push({ name, ...detail, result: ok ? 'PASS' : 'FAIL' }); console.log((ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(detail).slice(0, 300)); };
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);

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

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  let importedId = null;
  try {
    const dbA = await jwt('owner');
    const v1 = (await dbA.from('os_project_versions').select('id,number,content_digest').eq('project_id', projectId).order('number').limit(1)).data[0];
    const files = (await dbA.from('os_project_files').select('path,sha256').eq('version_id', v1.id)).data;
    const A = await signIn(browser, 'owner');
    const exportUrl = `${base}/admin/workspace/library/${projectId}/export?version=${v1.id}`;
    const res = await A.page.request.get(exportUrl, { maxRedirects: 0 });
    const zip = Buffer.from(await res.body());
    const z = readZip(new Uint8Array(zip), BRIDGE_LIMITS);
    const manifest = z.ok ? JSON.parse(Buffer.from(z.entries.find(e => e.path === 'AVALON_EXPORT.json').bytes).toString()) : null;
    const same = z.ok && files.every(f => { const e = z.entries.find(x => x.path === f.path); return e && sha(Buffer.from(e.bytes)) === f.sha256; });
    step('Owner A exports v1 as a ZIP; every file matches the SHA-256 recorded at import; manifest included', res.status() === 200 && same && manifest?.version?.content_digest === v1.content_digest,
      { status: res.status(), files: files.length, bytes: zip.length, content_disposition: res.headers()['content-disposition'] });
    const zipPath = path.join(dir, `export-${stamp}.zip`); fs.writeFileSync(zipPath, zip);

    // Import the exported ZIP as a NEW project with the normal Library importer (real upload + processing).
    await A.page.goto(base + '/admin/workspace/library');
    await A.page.locator('input[name="file"]').setInputFiles(zipPath);
    await A.page.locator('select[name="category"]').selectOption('website');
    await A.page.locator('input[name="projectName"]').fill(`Recuperado ${stamp}`);
    await A.page.locator('select[name="sourceTool"]').selectOption('manual');
    await A.page.locator('form[aria-busy] button:not([type="button"])').first().click();
    const link = A.page.locator('a[href^="/admin/workspace/library/"]', { hasText: /Abrir|Open/ }).last();
    await link.waitFor({ timeout: 90000 });
    importedId = /library\/([0-9a-f-]{36})/.exec(await link.getAttribute('href'))[1];
    const iv = (await dbA.from('os_project_versions').select('id').eq('project_id', importedId).order('number').limit(1)).data[0];
    const ifiles = (await dbA.from('os_project_files').select('path,sha256').eq('version_id', iv.id)).data;
    const identical = files.every(f => ifiles.some(i => i.path === f.path && i.sha256 === f.sha256));
    step('the exported ZIP re-imports as a new project with byte-identical files (no GitHub, no Vercel)', importedId !== projectId && identical, { imported_project: importedId, files: ifiles.map(f => f.path) });

    // Owner B (separate account) can export the shared agency project.
    const B = await signIn(browser, 'ownerB');
    const rb = await B.page.request.get(exportUrl, { maxRedirects: 0 });
    const zb = readZip(new Uint8Array(Buffer.from(await rb.body())), BRIDGE_LIMITS);
    step('Owner B, in another session, exports the same version with the same file hashes', rb.status() === 200 && zb.ok && files.every(f => zb.entries.some(e => e.path === f.path && sha(Buffer.from(e.bytes)) === f.sha256)));

    // Outsider and anonymous.
    const X = await signIn(browser, 'stranger');
    const rx = await X.page.request.get(exportUrl, { maxRedirects: 0 });
    const anonCtx = await browser.newContext(); const ra = await anonCtx.request.get(exportUrl, { maxRedirects: 0 });
    const refused = r => [401, 403].includes(r.status()) || ([302, 303, 307, 308].includes(r.status()) && /\/admin\/login/.test(r.headers()['location'] ?? ''));
    step('outsider and anonymous cannot export (401 or redirect to login)', refused(rx) && refused(ra), { outsider: rx.status(), anonymous: ra.status() });
    // A version id from another project is refused.
    const other = await A.page.request.get(`${base}/admin/workspace/library/${importedId}/export?version=${v1.id}`, { maxRedirects: 0 });
    step('a version id that does not belong to the project is refused (404)', other.status() === 404, { status: other.status() });
    await dbA.auth.signOut();
  } finally { await browser.close(); }
  const failed = steps.filter(s => s.result !== 'PASS').length;
  fs.writeFileSync(path.join(dir, 'evidence-export-roundtrip.json'), JSON.stringify({ base, projectId, importedId, steps, result: failed ? 'FAILED' : 'PASSED', at: new Date().toISOString() }, null, 2));
  console.log('RESULT', failed ? 'FAILED' : 'PASSED', `${steps.length - failed}/${steps.length}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
