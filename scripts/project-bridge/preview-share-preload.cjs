// Test helper for protected Vercel Previews (Vercel Authentication). Preload with
//   AVALON_PREVIEW_SHARE_URL='https://<preview>/?_vercel_share=…' node -r ./scripts/project-bridge/preview-share-preload.cjs <e2e script> …
// Every new Playwright browser context first opens the temporary share link, which sets Vercel's access cookie, so
// the unchanged E2E scripts can run against the Preview. The share URL is temporary (23 h) and is never written to
// evidence files by this helper.
const share = process.env.AVALON_PREVIEW_SHARE_URL;
if (share) {
  const pw = require('playwright');
  const launch = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = async (...args) => {
    const browser = await launch(...args);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...a) => {
      // Node-side requests (page.request) do not inherit the browser's proxy: give the context the sandbox proxy.
      const opts = { ...(a[0] ?? {}) };
      if (process.env.HTTPS_PROXY && !opts.proxy) opts.proxy = { server: process.env.HTTPS_PROXY };
      const ctx = await newContext(opts);
      const p = await ctx.newPage();
      await p.goto(share, { waitUntil: 'domcontentloaded' });
      await p.close();
      return ctx;
    };
    return browser;
  };
}
