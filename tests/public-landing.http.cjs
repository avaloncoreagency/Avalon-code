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
    assert.match(await page.locator("h1").first().innerText(), /clientes/i);
    await noOverflow(`ES ${width}px`);
    if ([320, 390, 1440].includes(width)) {
      await page.screenshot({ path: path.join(evidenceDir, `landing-es-${width}.png`), fullPage: true, animations: "disabled", timeout: 25000 });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/?lang=en", { waitUntil: "domcontentloaded" });
  assert.match(await page.locator("h1").first().innerText(), /customers/i);
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
  await page.goto(origin + "/?lang=en#demos", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /More customers attended/i }).click();
  await page.locator('#demos a[href*="services=receptionist,chatbots"]').click();
  await page.waitForURL(/services=receptionist,chatbots/);
  assert.ok(await page.locator('input[name="services"][value="chatbots"]').isChecked());
  assert.ok(await page.locator('input[name="services"][value="receptionist"]').isChecked());
  assert.equal(await page.locator('input[name="services"]:checked').count(), 2);

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
  const sections = ["arbol", "industria", "demos", "recorrido", "soluciones", "como-funciona", "proyectos", "preguntas", "cotizacion"];
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

  // ── Avalon Ultimate 2.0 · real interactions, no force:true. Software GL only; never claims device performance. ──
  const live = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  const intro = await live.newPage(); intro.on("pageerror", e => errors.push(e.message));
  // Intro: plays on first visit, is skippable, then never blocks the page again in the session.
  await intro.goto(origin + "/?lang=en");
  await intro.locator("#avalon-intro").waitFor({ timeout: 5000 });
  await intro.getByRole("button", { name: "Skip intro" }).click();
  await intro.locator("#avalon-intro").waitFor({ state: "detached", timeout: 3000 });
  await intro.reload(); await intro.waitForTimeout(400);
  assert.equal(await intro.locator("#avalon-intro").count(), 0, "intro plays once per session");
  await intro.close();
  await live.addInitScript(() => { window.__AVALON_FORCE_GL = true; try { sessionStorage.setItem("avalon-intro-v2", "1"); } catch {} });
  const p = await live.newPage(); p.on("pageerror", e => errors.push(e.message));
  const money = async sel => Number(((await p.locator(sel).textContent()) || "0").replace(/[^0-9.]/g, ""));
  for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
    const full = width === 390 || width === 1440;
    await p.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await p.goto(origin + "/?lang=en");
    // The Growth Tree: seed → water → branches → fruit → harvest → simulated money.
    const tree = p.locator("#arbol");
    await tree.scrollIntoViewIfNeeded();
    const water = tree.getByRole("button", { name: "Water the business" });
    for (let i = 0; i < 4; i++) { await water.click(); await p.waitForTimeout(1000); }
    const branches = tree.locator("ul button");
    assert.equal(await branches.count(), 6);
    for (let i = 0; i < 6; i++) { await branches.nth(i).click(); assert.equal(await branches.nth(i).getAttribute("aria-pressed"), "true"); }
    for (let i = 0; i < 2; i++) { await water.click(); await p.waitForTimeout(1000); }
    const ripe = tree.locator('button[data-stage="3"]');
    await ripe.first().waitFor({ timeout: 15000 });
    await ripe.first().click();
    await p.waitForFunction(() => /\$[1-9]/.test(document.querySelector('#arbol [class*="bank"] b')?.textContent || ""), null, { timeout: 8000 });
    assert.ok(await tree.locator('[class*="cash"]').count() >= 1 || /\$[1-9]/.test(await tree.locator('[class*="bank"] b').textContent()), "harvest shows the money effect");
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `tree fits ${width}`);
    await p.screenshot({ path: path.join(evidenceDir, `growth-tree-${width}.png`) });
    if (!full) continue;
    // Industry selector re-seeds every demo.
    await p.locator("#industria").getByRole("radio", { name: /Roofing/ }).click();
    await p.locator("#industria").getByText("Solid Roofing · demo").waitFor();
    const demos = p.locator("#demos");
    // 1 · Chat books a real slot in the shared calendar.
    await demos.getByRole("tab", { name: /More customers attended/ }).click();
    await demos.getByRole("button", { name: /leak, can you come/ }).click();
    await demos.getByRole("button", { name: "Roof inspection" }).click();
    await demos.locator('[class*="quick"] button').first().click();
    await demos.getByText(/All set,/).waitFor({ timeout: 5000 });
    // 2 · Calendar: book a free slot, then cancel it.
    await demos.getByRole("tab", { name: /Calendar with work/ }).click();
    const booked = Number(await demos.locator("dl div:nth-child(2) dd").first().textContent());
    await demos.getByRole("button", { name: /Mon 18:00: free, book/ }).first().click();
    assert.equal(Number(await demos.locator("dl div:nth-child(2) dd").first().textContent()), booked + 1, "calendar booking");
    await demos.getByRole("button", { name: /Mon 18:00: / }).first().click();
    await demos.getByRole("button", { name: "Cancel" }).click();
    assert.equal(Number(await demos.locator("dl div:nth-child(2) dd").first().textContent()), booked, "calendar cancel");
    // 3 · CRM: move one opportunity all the way to Won.
    await demos.getByRole("tab", { name: /Opportunity CRM/ }).click();
    const first = demos.locator('section[aria-label="New"] article').first();
    const who = (await first.locator("p").first().textContent()).replace(/\$.*/, "").trim();
    for (const stage of ["Contacted", "Appointment", "Quote", "Negotiation", "Won"]) await demos.getByRole("button", { name: `Move ${who} to ${stage}` }).click();
    await demos.locator('section[aria-label="Won"]').getByText(who).waitFor();
    // 5 · Store: cart, coupon, demo checkout, order becomes a won sale.
    await demos.getByRole("tab", { name: /Online store/ }).click();
    await demos.getByRole("button", { name: "Add to cart" }).click();
    await demos.getByRole("button", { name: "Add one" }).click();
    await demos.getByLabel("Coupon").fill("AVALON10"); await demos.getByRole("button", { name: "Apply" }).click();
    await demos.getByText(/Coupon applied/).waitFor();
    await demos.getByRole("button", { name: "Go to checkout" }).click();
    await demos.getByText("Demo checkout · no payment is processed").waitFor();
    await demos.getByRole("radio", { name: "Klarna" }).click();
    await demos.getByRole("button", { name: "Place demo order" }).click();
    await demos.getByText("Demo order confirmed").waitFor();
    // 6 · Ads: levers recalculate; leads flow into the CRM.
    await demos.getByRole("tab", { name: /Ads → money/ }).click();
    const before = await money('#demos dl div:first-child dd');
    await demos.getByLabel(/Monthly budget/).evaluate(el => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "5000"); el.dispatchEvent(new Event("input", { bubbles: true })); });
    assert.ok((await money('#demos dl div:first-child dd')) > before, "revenue recalculates with budget");
    await demos.getByRole("button", { name: /Send \d leads to the CRM/ }).click();
    await demos.getByText(/ad leads are now in/).waitFor();
    // Integrated journey: ad → lead → booking → CRM → sale → fruit.
    const journey = p.locator("#recorrido");
    await journey.getByRole("button", { name: "Run the full journey" }).click();
    await journey.locator('li[data-state="now"]', { hasText: "A branch of the tree grows" }).waitFor({ timeout: 20000 });
    assert.ok((await journey.locator("ul li").count()) >= 4, "live activity feed");
    // Demo sales ripen fruit on the tree.
    await p.waitForFunction(() => document.querySelectorAll('#arbol button[data-stage="3"]').length > 0, null, { timeout: 5000 });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `demos fit ${width}`);
    await journey.screenshot({ path: path.join(evidenceDir, `growth-journey-${width}.png`) });
  }
  await live.close();
  assert.deepEqual(errors, [], "No browser exceptions after scrolling through landing sections");
});
