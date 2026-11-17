// Public website acceptance smoke: real Chromium + local Next.js + disposable SQL only.
// No production traffic, calls to a real Supabase project, live leads, emails or paid providers.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { chromium } = require("playwright");
const { startBridge } = require("./support/rest-bridge.cjs");

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SERVICES = ["website", "ecommerce", "crm", "receptionist", "chatbots", "marketing", "funnels", "automation"];

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test("PUBLIC WEB QA: ES/EN, 8 solutions, mobile/desktop, preselected quote and isolated DB", { timeout: 360000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec(`insert into auth.users(id) values('${OWNER}');`);
  for (const filename of fs.readdirSync("supabase/migrations").filter(s => s.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + filename, "utf8"));
    if (filename.startsWith("20261102053022")) {
      await db.exec(`insert into agency_memberships(user_id, role) values('${OWNER}', 'owner')`);
    }
  }
  const bridge = await startBridge(db, { users: new Map() });
  t.after(() => bridge.close());
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "-p", String(port)], {
    env: {
      ...process.env, APP_ORIGIN: origin, NEXT_TELEMETRY_DISABLED: "1",
      GH_TOKEN: "", GITHUB_TOKEN: "", BRIDGE_GITHUB_TOKEN: "",
      NEXT_PUBLIC_SUPABASE_URL: bridge.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", b => { logs = (logs + b).slice(-5000); });
  child.stderr.on("data", b => { logs = (logs + b).slice(-5000); });
  t.after(() => require("./support/stop-child.cjs")(child));
  let running = false;
  for (let i = 0; i < 120; i++) {
    try { running = (await fetch(origin + "/")).ok; } catch { /* wait */ }
    if (running) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(running, "Isolated Next.js did not start: " + logs);

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ["--enable-unsafe-swiftshader"] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const evidenceDir = path.join("evidence", "public-qa");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const noOverflow = async label => {
    const x = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
    assert.ok(x.scroll <= x.width + 1, `${label}: horizontal overflow ${JSON.stringify(x)}`);
  };

  for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor();
    assert.match(await page.locator("h1").first().innerText(), /negocio/i);
    await noOverflow(`ES ${width}px`);
    if ([320, 390, 1440].includes(width)) {
      await page.screenshot({ path: path.join(evidenceDir, `landing-es-${width}.png`), fullPage: true, animations: "disabled", timeout: 25000 });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/?lang=en", { waitUntil: "domcontentloaded" });
  assert.match(await page.locator("h1").first().innerText(), /business/i);
  // The shared root <html> is ES, while SiteChrome correctly scopes translated content with lang=en.\n  assert.equal(await page.locator('[data-landing]').getAttribute("lang"), "en");
  await noOverflow("EN 390px");
  await page.screenshot({ path: path.join(evidenceDir, "landing-en-390.png"), fullPage: true, animations: "disabled", timeout: 25000 });

  for (const service of SERVICES) {
    const response = await page.goto(`${origin}/soluciones/${service}?lang=en`, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 200, `service route: ${service}`);
    assert.ok(await page.locator("h1").first().isVisible(), `visible h1: ${service}`);
    assert.ok(await page.locator('input[name="services"]:checked').count() === 1, `service selected in quote: ${service}`);
    assert.equal(await page.locator('input[name="services"]:checked').first().getAttribute("value"), service);
    await noOverflow(`service ${service}`);
  }

  // Marketing CTA and the showcase's service preselection are real navigations, not decorative buttons.
  await page.goto(origin + "/?lang=en#showroom", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /AI chatbots/i }).click();
  await page.locator('#showroom a[href*="services=chatbots"]').click();
  await page.waitForURL(/services=chatbots/);
  assert.ok(await page.locator('input[name="services"][value="chatbots"]').isChecked());
  assert.equal(await page.locator('input[name="services"]:checked').count(), 1);

  // Visitor-selected combinations must survive navigation and remain editable.
  await page.goto(origin + "/?services=chatbots,funnels#cotizacion");
  assert.ok(await page.locator('input[name="services"][value="chatbots"]').isChecked());
  assert.ok(await page.locator('input[name="services"][value="funnels"]').isChecked());
  await page.locator('input[name="services"][value="crm"]').check();
  await page.locator('input[name="company"]').fill("Synthetic QA Contractor");
  await page.locator('input[name="name"]').fill("QA Example");
  await page.locator('input[name="email"]').fill("qa-public@avalon.example.invalid");
  await page.locator('textarea[name="message"]').fill("Necesito un chatbot, un embudo de ventas y un CRM para seguir clientes potenciales.");
  await page.getByRole("button", { name: "Solicitar cotización" }).click();
  await page.getByRole("status").getByText(/recibimos tu solicitud/i).waitFor({ timeout: 20000 });
  assert.deepEqual(errors, [], "No unhandled browser exceptions should occur");

  await db.exec("reset role");
  const prospects = (await db.query("select company,email,status,source_kind,opportunity from public.crm_prospects where email='qa-public@avalon.example.invalid'")).rows;
  assert.equal(prospects.length, 1, "Only one synthetic pending prospect");
  assert.equal(prospects[0].status, "pending");
  assert.equal(prospects[0].source_kind, "web_form");
  assert.match(prospects[0].opportunity, /Chatbots IA/);
  assert.match(prospects[0].opportunity, /Embudo de ventas/);
  assert.match(prospects[0].opportunity, /servicios: crm/);
  assert.equal(Number((await db.query("select count(*)::int n from public.crm_sales")).rows[0].n), 0, "no synthetic sales");

  // content-visibility:auto defers offscreen painting. Full-page screenshots alone can appear blank.
  // Scroll each section INTO the viewport to assert actual visibility and capture what visitors see.
  const sections = ["objetivos", "soluciones", "showroom", "como-funciona", "industrias", "proyectos", "preguntas", "cotizacion"];
  for (const [language, width] of [["es", 390], ["es", 1440], ["en", 390]]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await page.goto(origin + (language === "en" ? "/?lang=en" : "/"), { waitUntil: "domcontentloaded" });
    for (const id of sections) {
      const section = page.locator(`#${id}`);
      await section.evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" }));
      await page.waitForTimeout(120);
      assert.ok(await section.locator("h2").first().isVisible(), `${language} ${width}px: missing visible heading in #${id}`);
      await noOverflow(`${language} ${width}px scrolled to #${id}`);
      await page.screenshot({
        path: path.join(evidenceDir, `scroll-${language}-${width}-${id}.png`),
        animations: "disabled",
        timeout: 25000,
      });
    }
  }

  // Exercise the real renderer in software only for synthetic CI; never claim physical-device performance.
  const live = await browser.newContext({viewport:{width:390,height:844},reducedMotion:"no-preference"});
  await live.addInitScript(() => { window.__AVALON_FORCE_GL = true; });
  const scenePage = await live.newPage(); scenePage.on("pageerror", e=>errors.push(e.message));
  for (const width of [320,375,390,430,768,1024,1440,1920]) {
    await scenePage.setViewportSize({width,height:width<768?844:1080});
    await scenePage.goto(origin+"/?lang=en");
    await scenePage.locator('html[data-universe="live"]').waitFor({timeout:20000});
    await scenePage.evaluate(() => {const e=document.querySelector('#motor'); window.scrollTo(0,e.getBoundingClientRect().top+scrollY+innerHeight*.7);});
    await scenePage.waitForTimeout(400);
    const engine = scenePage.locator('#motor');
    const chips = engine.getByRole('button');
    assert.equal(await chips.count(),6);
    await chips.nth(2).click();
    assert.equal(await chips.nth(2).getAttribute('aria-pressed'),'true');
    await scenePage.evaluate(() => {const e=document.querySelector('#arbol');window.scrollTo(0,e.getBoundingClientRect().top+scrollY+(e.offsetHeight-innerHeight)*.85);});
    await scenePage.waitForTimeout(400);
    const apples=scenePage.locator('#arbol [role="group"] button');
    assert.equal(await apples.count(),10);
    await apples.nth(0).click();
    assert.equal(await apples.nth(0).getAttribute('aria-pressed'),'true');
    assert.ok(await scenePage.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`live scene fits ${width}`);
    await scenePage.screenshot({path:path.join(evidenceDir,`universe-live-${width}.png`)});
  }
  // User changes motion preference during the tour: no invisible projected controls remain.
  await scenePage.emulateMedia({reducedMotion:'reduce'});
  await scenePage.locator('html[data-universe="live"]').waitFor({state:'detached'});
  for (const selector of ['#motor [role="group"] button','#arbol [role="group"] button']) {
    const buttons=scenePage.locator(selector);
    for (let i=0;i<await buttons.count();i++) {
      assert.ok(await buttons.nth(i).isVisible());
      assert.equal(await buttons.nth(i).getAttribute('tabindex'),null);
      assert.equal(await buttons.nth(i).evaluate(el=>el.style.transform),'');
    }
  }
  await scenePage.locator('#motor').scrollIntoViewIfNeeded();
  await scenePage.screenshot({path:path.join(evidenceDir,'universe-motion-fallback.png')});
  await live.close();
  assert.deepEqual(errors, [], "No browser exceptions after scrolling through landing sections");
});
