// Project Bridge preview isolation in a REAL browser engine (Playwright Chromium, iPhone viewport emulation).
// NOTE: Chromium with an iPhone profile is NOT Safari; real Safari/iPhone verification is still pending.
// The parent page is served with Avalon's real security headers (src/lib/security/headers.ts) via page.route
// (no local server). The preview document is built by the real buildPreview() from a synthetic ZIP.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const load = require('../scripts/creative-bridge/continuity-loader.cjs');
const { buildZip, PNG } = require('./support/zip-builder.cjs');
const { inspectUpload } = load('src/lib/project-bridge/inspect.ts');
const { buildPreview } = load('src/lib/project-bridge/preview.ts');
const { SECURITY_HEADERS } = load('src/lib/security/headers.ts');

const HOSTILE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="css/s.css"></head><body>
<h1 id="t">Sitio importado</h1><img id="logo" src="img/logo.png" alt="">
<script>
  const r = {};
  try { r.cookie = document.cookie; } catch (e) { r.cookie = 'blocked:' + e.name; }
  try { r.parentCookie = parent.document.cookie; } catch (e) { r.parentCookie = 'blocked:' + e.name; }
  try { localStorage.setItem('x', '1'); r.storage = 'allowed'; } catch (e) { r.storage = 'blocked:' + e.name; }
  r.origin = String(self.origin);
  const logo = document.getElementById('logo');
  r.logoLoaded = logo.complete && logo.naturalWidth > 0;
  logo.addEventListener('load', () => { r.logoLoaded = true; document.title = JSON.stringify(r); });
  fetch('https://avalon.test/admin/secret').then(() => { r.fetch = 'allowed'; }, () => { r.fetch = 'blocked'; }).finally(() => { document.title = JSON.stringify(r); });
  try { top.location.href = 'https://evil.example/'; r.topNav = 'attempted'; } catch (e) { r.topNav = 'blocked:' + e.name; }
  document.title = JSON.stringify(r);
</script></body></html>`;

test('imported HTML runs in an opaque, cookie-less, network-less sandbox inside Avalon pages (iPhone viewport)', { timeout: 120000 }, async () => {
  const r = inspectUpload('hostile.zip', buildZip([
    { name: 'index.html', data: HOSTILE }, { name: 'css/s.css', data: 'h1{color:rgb(224, 61, 200)}' }, { name: 'img/logo.png', data: PNG, method: 0 },
  ]));
  assert.equal(r.ok, true);
  const pv = await buildPreview(r.inspection.files, 'index.html', async sha => r.blobs.get(sha));
  const parent = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#0b0b1a">
    <iframe id="pv" sandbox="allow-scripts allow-forms" style="width:100%;height:600px;border:0"></iframe>
    <script>document.cookie = "sb-session=owner-secret; path=/"; document.getElementById('pv').srcdoc = ${JSON.stringify(pv.html).replace(/</g, "\\u003c")};</script></body></html>`;
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  try {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    const external = [];
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url === 'https://avalon.test/admin/workspace/library/demo') {
        const headers = Object.fromEntries(SECURITY_HEADERS.map(h => [h.key, h.value]));
        return route.fulfill({ status: 200, contentType: 'text/html', headers, body: parent });
      }
      external.push(url);
      return route.fulfill({ status: 200, body: 'should never be requested' });
    });
    await page.goto('https://avalon.test/admin/workspace/library/demo');
    const frame = page.frames().find(f => f !== page.mainFrame());
    await frame.waitForFunction(() => { try { const r = JSON.parse(document.title); return 'fetch' in r && r.logoLoaded; } catch { return false; } }, null, { timeout: 15000 })
      .catch(async e => { throw new Error(e.message + ' — frame title: ' + (await frame.title().catch(() => '?'))); });
    const result = JSON.parse(await frame.title());
    assert.equal(result.origin, 'null', 'opaque origin (no allow-same-origin)');
    assert.match(result.cookie, /^blocked:/, 'no cookie access inside the preview');
    assert.match(result.parentCookie, /^blocked:/, 'cannot read Avalon OS cookies through parent');
    assert.match(result.storage, /^blocked:/, 'no localStorage');
    assert.equal(result.fetch, 'blocked', 'CSP connect-src none blocks network');
    assert.equal(result.logoLoaded, true, 'inlined image renders (data: URI)');
    assert.equal(await frame.$eval('#t', el => getComputedStyle(el).color), 'rgb(224, 61, 200)', 'inlined CSS applies');
    assert.equal(page.url(), 'https://avalon.test/admin/workspace/library/demo', 'top navigation blocked (no allow-top-navigation)');
    assert.deepEqual(external, [], 'the preview made no network request at all');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= 390, 'no horizontal overflow at iPhone width: ' + width);
  } finally { await browser.close(); }
});
