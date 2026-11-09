#!/usr/bin/env node
// Avalon OS against an ISOLATED Supabase project, in a real browser (Playwright Chromium — NOT Safari):
// real sign-in through the app's login form, the library page and project page rendered from real data, the isolated
// preview, and a non-owner who is refused. The app must already be running (next start) with the isolated env.
//   node scripts/project-bridge/e2e-app-isolated.cjs <dir with creds.json> <base-url> [screenshot-dir]
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');

const [dir, base, shots = dir] = process.argv.slice(2);
const creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
const steps = [];
const step = (name, ok, detail = {}) => { steps.push({ name, ok, ...detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(detail)); };

async function login(page, who) {
  await page.goto(base + '/admin/login');
  await page.fill('input[name="email"]', creds[who].email);
  await page.fill('input[name="password"]', creds[who].password);
  await Promise.all([page.waitForURL(u => !/\/admin\/login$/.test(u.pathname) || /error=/.test(u.search), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
}

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  try {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    await login(page, 'owner');
    step('owner signs in through the real login form (Supabase Auth) and reaches the admin area', /\/admin\/dashboard/.test(page.url()), { url: new URL(page.url()).pathname });

    await page.goto(base + '/admin/workspace/library');
    const card = page.locator('a[href^="/admin/workspace/library/"]', { hasText: 'Bridge E2E demo' }).first();
    const cardText = (await card.textContent().catch(() => '')) ?? '';
    step('library lists the imported project with its stored versions (real data from Supabase)', /Bridge E2E demo/.test(cardText) && /3 versiones/.test(cardText), { card: cardText.replace(/\s+/g, ' ').slice(0, 160) });
    await page.screenshot({ path: path.join(shots, 'library-iphone.png'), fullPage: true });

    await card.click();
    await page.waitForURL(/\/admin\/workspace\/library\/[0-9a-f-]{36}/);
    const history = await page.locator('#vh').locator('..').innerText();
    step('project page shows versions v1, v2 and v3 (restored from v1)', /v1/.test(history) && /v2/.test(history) && /v3/.test(history) && /restaurada de v1|restored from v1/.test(history));
    const files = await page.locator('#fl').locator('..').innerText();
    step('project page lists the stored files of the selected version', /index\.html/.test(files) && /css\/s\.css/.test(files) && /img\/logo\.png/.test(files));
    const frame = page.frameLocator('iframe[title="Vista previa aislada"], iframe[title="Isolated preview"]');
    await frame.locator('h1').waitFor({ timeout: 20000 });
    const h1 = await frame.locator('h1').innerText();
    step('isolated preview renders the selected version inside the sandboxed iframe', /versión 1/.test(h1), { h1 });
    const sandbox = await page.locator('iframe[sandbox]').first().getAttribute('sandbox');
    step('preview iframe is sandboxed without allow-same-origin', !!sandbox && !/allow-same-origin/.test(sandbox), { sandbox });
    const widths = {};
    for (const u of ['/admin/workspace/library', '/admin/workspace/library/tokens', new URL(page.url()).pathname]) {
      const p3 = await ctx.newPage(); await p3.goto(base + u); await p3.waitForLoadState('networkidle');
      widths[u.replace(/[0-9a-f-]{36}$/, '<id>')] = await p3.evaluate(() => document.documentElement.scrollWidth); await p3.close();
    }
    step('no horizontal overflow at iPhone width on the library, project and token pages', Object.values(widths).every(w => w <= 390), widths);
    await page.screenshot({ path: path.join(shots, 'project-iphone.png'), fullPage: true });

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await login(page2, 'stranger');
    step('non-owner sign-in is refused by the app (valid password, no owner membership)', /error=unauthorized/.test(page2.url()) || /\/admin\/login/.test(page2.url()), { url: new URL(page2.url()).pathname + new URL(page2.url()).search });
    await page2.goto(base + '/admin/workspace/library');
    step('non-owner cannot open the library (redirected to login)', /\/admin\/login/.test(page2.url()), { url: new URL(page2.url()).pathname });
    // Redirects are NOT followed: a followed redirect would show the login page with 200 and hide the real answer.
    const api = await page2.request.post(base + '/admin/workspace/library/uploads', { data: { name: 'x.zip', size: 10, category: 'website', idempotencyKey: 'stranger-0001' }, headers: { origin: base }, maxRedirects: 0 });
    const loc = api.headers()['location'] ?? '';
    step('non-owner cannot request an upload ticket from the API (401/403, or redirect to login)', [401, 403].includes(api.status()) || ([302, 303, 307, 308].includes(api.status()) && /\/admin\/login/.test(loc)), { status: api.status(), location: loc.replace(/^https?:\/\/[^/]+/, '') });
  } finally { await browser.close(); }
  const failed = steps.filter(s => !s.ok).length;
  fs.writeFileSync(path.join(dir, 'evidence-app.json'), JSON.stringify({ base, steps, browser: 'Chromium (Playwright) with iPhone 13 profile — not Safari', result: failed ? 'FAILED' : 'PASSED', at: new Date().toISOString() }, null, 2));
  console.log('RESULT', failed ? 'FAILED' : 'PASSED', `${steps.length - failed}/${steps.length}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
