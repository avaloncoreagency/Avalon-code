const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const stopChild = require("./support/stop-child.cjs");

const widths = [320, 375, 390, 430, 768, 1440];
const motionAssets = /\/brand\/u\/launch[^/]+\.(webp|mp4)$/;

test("public navigation and launch against the local production build", { timeout: 150000 }, async t => {
  if (process.env.PUBLIC_BROWSER !== "1") return t.skip("PUBLIC_BROWSER=1 required");
  const { chromium } = require("playwright");
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = "http://127.0.0.1:" + port;
  const app = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "-p", String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => stopChild(app));
  let log = "";
  app.stdout.on("data", data => { log += data; });
  app.stderr.on("data", data => { log += data; });
  for (let i = 0; ; i++) {
    try { if ((await fetch(origin + "/")).ok) break; } catch {}
    assert.ok(i < 100, log);
    await delay(100);
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--disable-webgl"] });
  t.after(() => browser.close());

  function record(page) {
    const paths = new Set();
    page.on("request", request => {
      const pathname = new URL(request.url()).pathname;
      if (motionAssets.test(pathname)) paths.add(pathname);
    });
    return paths;
  }

  await t.test("reduced motion and returning visits request zero intro assets", async subtest => {
    const results = [];
    for (const returning of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: returning ? "no-preference" : "reduce" });
      try {
        if (returning) await page.addInitScript(() => sessionStorage.setItem("avalon-intro-v2", "1"));
        const assets = record(page);
        await page.goto(origin, { waitUntil: "load" });
        await page.locator("#avalon-intro").waitFor({ state: "hidden", timeout: 2500 });
        results.push([...assets]);
      } finally { await page.close(); }
    }
    subtest.diagnostic(JSON.stringify({ reduced: results[0], returning: results[1] }));
    assert.deepEqual(results, [[], []]);
  });

  await t.test("the homepage is immediately available without scripts", async () => {
    const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    try {
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      if (process.env.PUBLIC_EVIDENCE_DIR) {
        mkdirSync(process.env.PUBLIC_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({ path: join(process.env.PUBLIC_EVIDENCE_DIR, "public-390-no-js.png"), timeout: 3000 });
      }
      assert.equal(await page.locator("#avalon-intro").isHidden(), true, "idle intro must not cover the page");
      assert.equal(await page.getByRole("heading", { level: 1 }).isVisible(), true);
      const menu = page.locator("header details");
      await menu.locator("summary").click();
      assert.equal(await menu.getAttribute("open"), "");
      assert.ok(await menu.locator("nav a").first().isVisible());
    } finally { await page.close(); }
  });

  await t.test("a portrait first visit gets portrait media and Escape stops the film", async subtest => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const assets = record(page);
    try {
      await Promise.all([
        page.waitForRequest(request => new URL(request.url()).pathname === "/brand/u/launch-intro-m.mp4", { timeout: 6000 }),
        page.goto(origin, { waitUntil: "domcontentloaded" }),
      ]);
      const intro = page.locator("#avalon-intro");
      await intro.waitFor({ state: "visible", timeout: 2500 });
      assert.ok([...assets].some(path => path.includes("launch-m-720")), "portrait poster is requested");
      assert.deepEqual([...assets].filter(path => /launch-(1280|2400|intro\.mp4|m-1080)/.test(path)), [], "no redundant or desktop launch assets");
      await page.keyboard.press("Escape");
      assert.equal(await page.evaluate(() => document.querySelector("#avalon-intro video")?.paused ?? true), true);
      await intro.waitFor({ state: "hidden", timeout: 2000 });
      assert.equal(await page.evaluate(() => sessionStorage.getItem("avalon-intro-v2")), "1");
    } finally {
      subtest.diagnostic(JSON.stringify([...assets]));
      await page.close();
    }
  });

  await t.test("sitemap and public solution routes serve both languages", async () => {
    const robots = await (await fetch(origin + "/robots.txt")).text();
    assert.match(robots, /Disallow: \/admin/);
    assert.match(robots, /Disallow: \/api/);
    const sitemap = await (await fetch(origin + "/sitemap.xml")).text();
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]));
    assert.equal(urls.length, 18);
    for (const url of urls) {
      assert.equal(url.origin, "https://avaloncoreagency.com");
      assert.match(url.pathname, /^(\/|\/soluciones\/[a-z]+)$/);
    }
    await Promise.all(urls.map(async ({ pathname, search }) => {
      const response = await fetch(origin + pathname + search);
      assert.equal(response.status, 200, pathname + search);
      const html = await response.text();
      assert.match(html, /<h1[\s>]/, pathname + search);
    }));
  });

  await t.test("responsive ES and EN navigation closes on link or Escape", async () => {
    for (const width of widths) {
      const mobile = width < 1000;
      const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        for (const lang of ["es", "en"]) {
          const response = await page.goto(origin + (lang === "en" ? "/?lang=en" : "/"), { waitUntil: "load" });
          assert.equal(response.status(), 200);
          assert.equal(await page.locator("[data-landing]").getAttribute("lang"), lang);
          assert.match(await page.title(), lang === "en" ? /Websites, CRM/ : /Soluciones digitales/);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert.ok(overflow <= 1, width + "px " + lang + " overflow " + overflow);
          if (process.env.PUBLIC_EVIDENCE_DIR && lang === "es" && (width === 390 || width === 1440)) {
            await page.screenshot({ path: join(process.env.PUBLIC_EVIDENCE_DIR, "public-" + width + ".png"), timeout: 3000 });
          }
          const menu = page.locator("header details");
          assert.equal(await menu.isVisible(), mobile);
          if (!mobile) continue;
          const summary = menu.locator("summary");
          await summary.tap();
          assert.equal(await menu.getAttribute("open"), "");
          const link = menu.locator('a[href="#arbol"]');
          await link.focus();
          await page.keyboard.press("Escape");
          assert.equal(await menu.getAttribute("open"), null, "Escape closes the disclosure");
          assert.equal(await summary.evaluate(el => el === document.activeElement), true);
          await summary.tap();
          await link.tap();
          await page.waitForURL(/#arbol$/);
          assert.equal(await menu.getAttribute("open"), null, "fragment navigation closes the disclosure");
        }
        assert.deepEqual(errors, []);
        t.diagnostic(width + "px ES and EN");
      } finally { await page.close(); }
    }
  });
});
