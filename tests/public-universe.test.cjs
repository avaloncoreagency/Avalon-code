// Avalon Ultimate — static guards for the Living Universe (no browser, no network).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const read = f => fs.readFileSync(f, "utf8");
const load = file => {
  const js = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} }; new Function("module", "exports", "require", js)(mod, mod.exports, () => ({})); return mod.exports;
};
const { UNIVERSE, MODULE_FOR } = load("src/components/public/landing/universe/copy.ts");
const SERVICES = ["website", "ecommerce", "crm", "receptionist", "chatbots", "marketing", "funnels", "automation"];

test("both languages define the four universes with six modules and ten opportunities", () => {
  for (const lang of ["es", "en"]) {
    const u = UNIVERSE[lang];
    assert.equal(u.engine.modules.length, 6, lang);
    assert.equal(u.tree.apples.length, 10, lang);
    assert.equal(u.launch.stages.length, 3, lang);
    assert.equal(u.process.steps.length, 4, lang);
    for (const m of u.engine.modules) { assert.ok(SERVICES.includes(m.key), m.key); assert.equal(m.benefits.length, 3); assert.ok(m.problem.length > 20 && m.solution.length > 20); }
    for (const a of u.tree.apples) assert.ok(a.service === null || SERVICES.includes(a.service));
  }
  // Ultimate 2.0 sells results, not technology jargon.
  assert.equal(UNIVERSE.es.hero.line1 + " " + UNIVERSE.es.hero.line2, "Más clientes. Más trabajo. Más crecimiento.");
  assert.equal(UNIVERSE.en.hero.line1 + " " + UNIVERSE.en.hero.line2, "More customers. More work. More growth.");
  for (const lang of ["es", "en"]) assert.doesNotMatch(Object.values(UNIVERSE[lang].hero).join(" "), /\bIA\b|\bAI\b|inteligencia artificial|artificial intelligence|chatbot/i);
  for (const s of SERVICES) assert.ok(MODULE_FOR[s] >= 0 && MODULE_FOR[s] < 6, s);
});

test("honest copy: Communication Hub states its real availability; no guaranteed results anywhere", () => {
  for (const lang of ["es", "en"]) {
    const hub = UNIVERSE[lang].engine.modules.find(m => m.key === "receptionist");
    assert.ok(hub.availability && /preparaci|preparation/i.test(hub.availability), "availability stated");
    assert.match(UNIVERSE[lang].tree.note, /no promesas|not earnings promises/i);
  }
  assert.doesNotMatch(read("src/components/public/landing/universe/copy.ts"), /garantiza|guarantee|#1|\d+ ?% (más|more)/i);
});

test("the WebGL scene is optional: lazy, motion-safe, paused when hidden, disposed on unmount", () => {
  const lu = read("src/components/public/landing/universe/living-universe.tsx");
  assert.match(lu, /await import\("\.\/scene"\)/, "scene is code-split");
  assert.doesNotMatch(lu, /from "three"/);
  assert.match(lu, /prefers-reduced-motion: reduce/);
  assert.match(lu, /saveData/);
  assert.match(lu, /visibilitychange/);
  assert.match(lu, /swiftshader\|llvmpipe\|software/, "no scene on software rasterizers");
  assert.match(lu, /onTooSlow/, "frame watchdog falls back to the static experience");
  assert.match(lu, /handle\?\.dispose\(\)/);
  assert.match(lu, /passive: true/, "scroll is observed, never hijacked");
  assert.doesNotMatch(lu, /preventDefault\(\)|overflow\s*=\s*["']hidden/, "no scroll locking");
  const css = read("src/components/public/landing/universe/universe.module.css");
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/, "pinned stages only without reduced motion");
});

test("the public transformation does not touch the private OS", () => {
  const chrome = read("src/components/public/landing/site-chrome.tsx");
  assert.match(chrome, /<LivingUniverse variant=\{scene\} \/>/);
  assert.doesNotMatch(read("src/app/layout.tsx"), /LivingUniverse|universe/, "the admin shell never loads the scene");
});


test("detaching WebGL notifies controls to restore accessible document flow", () => {
  const { universeBus } = load("src/components/public/landing/universe/bus.ts");
  let reset = 0, listener = undefined;
  const release = universeBus.onReset(() => reset++);
  universeBus.attach({setTimeline(){},onFrame(fn){listener=fn;}});
  assert.equal(typeof listener, "function");
  universeBus.detach(); assert.equal(listener, null); assert.equal(reset, 1);
  release(); universeBus.detach(); assert.equal(reset, 1);
});

/* ── Avalon Ultimate 2.0 · Business Growth Experience ─────────────────────────────────────────────────────────── */
const GROWTH = "src/components/public/growth";
const growthFiles = () => {
  const out = [];
  const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${f.name}`; if (f.isDirectory()) walk(p); else if (/\.tsx?$/.test(f.name)) out.push(p); } };
  walk(GROWTH); return out;
};

test("demos are synthetic and isolated: no Supabase, network, server actions or payment SDKs", () => {
  for (const f of growthFiles()) {
    const src = read(f);
    assert.doesNotMatch(src, /from ["'][^"']*(supabase|@\/lib\/|stripe|klarna|paypal)/i, `${f}: no backend or payment imports`);
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|"use server"|PaymentRequest|navigator\.sendBeacon/, `${f}: no network or server actions`);
  }
  assert.doesNotMatch(read("src/app/page.tsx"), /from "@\/components\/public\/landing\/(cinema|showroom|industries)"|universe\/stages/, "film gallery, old showroom and duplicated industries are gone from the homepage");
});

test("one tree only: the WebGL tree stage is gone and the photoreal tree is a real minigame", () => {
  assert.ok(!fs.existsSync("src/components/public/landing/universe/stages.tsx"), "projected 3D tree removed");
  assert.ok(!fs.existsSync("src/components/public/landing/cinema.tsx"), "video gallery removed");
  const tree = read(`${GROWTH}/tree.tsx`);
  for (const k of ["startPour", "endPour", "activate", "harvest", "restart", "fruitQueue", "requestAnimationFrame", "setPointerCapture"]) assert.ok(tree.includes(k), k);
  const css = read(`${GROWTH}/tree.module.css`);
  assert.match(css, /container-type: size/, "the scene sizes the world to the section");
  assert.match(css, /mask-composite: intersect, add/, "the photo is feathered on every edge (no framed picture)");
  assert.doesNotMatch(css, /\.stage \{[^}]*border-radius/, "no card around the tree");
  assert.match(tree, /No vendemos herramientas\. Vendemos multiplicadores de trabajo\./);
  assert.match(tree, /plate-720\.webp/); assert.match(tree, /apple-\$\{sp\.sprite\}\.webp/);
  for (let i = 0; i < 9; i++) assert.ok(fs.existsSync(`public/brand/tree/apple-${i}.webp`), `apple sprite ${i}`);
  assert.match(tree, /No representa ganancias reales/); assert.match(tree, /does not represent real earnings/);
});

test("the ads simulator follows its visible formulas exactly", () => {
  const { funnel } = load(`${GROWTH}/demos/ads.tsx`);
  const f = funnel(1000, 2.5, 0.08, 0.45, 0.35, 100);
  assert.equal(f.clicks, 400); assert.equal(f.impressions, 16000);
  assert.ok(Math.abs(f.leads - 32) < 1e-9); assert.ok(Math.abs(f.bookings - 14.4) < 1e-9); assert.ok(Math.abs(f.sales - 5.04) < 1e-9);
  assert.ok(Math.abs(f.revenue - 504) < 1e-9); assert.ok(Math.abs(f.roas - 0.504) < 1e-9); assert.ok(Math.abs(f.net + 496) < 1e-9);
  assert.equal(funnel(0, 2.5, .1, .5, .5, 100).roas, 0, "no division by zero");
});

test("every industry speaks its own language: services, real-world needs, prompts and listing", () => {
  const { INDUSTRIES, INDUSTRY_ORDER } = load(`${GROWTH}/industries.ts`);
  assert.deepEqual(INDUSTRY_ORDER, ["barber", "roofing", "hvac", "dental", "restaurant", "ecommerce", "other"]);
  for (const k of INDUSTRY_ORDER) {
    const ind = INDUSTRIES[k];
    assert.equal(ind.services.length, 3, k); assert.equal(ind.leads.length, 4, k); assert.equal(ind.prompts.length, 3, k);
    for (const x of [...ind.services.map(s => s.name), ...ind.leads.map(l => l.need), ...ind.prompts, ind.label, ind.business]) assert.ok(x.es && x.en, k);
    assert.match(ind.business.es, /demo/, `${k} business is labelled as a demo`);
    for (const l of ind.leads) assert.doesNotMatch(l.need.en + l.name, /\bAI\b|agency/i, `${k}: customers are real-world businesses, not AI agencies`);
    assert.ok(ind.ticket > 0);
  }
});

test("demo checkout never asks for real payment data and says so", () => {
  const shop = read(`${GROWTH}/demos/shop.tsx`);
  assert.doesNotMatch(shop, /<input[^>]*(card|cvc|cvv|expiry|iban)/i, "no card inputs");
  assert.match(shop, /no se procesa ningún pago/); assert.match(shop, /no payment is processed/);
  assert.match(shop, /sin integración|not integrated/);
  for (const f of ["chat", "calendar", "crm", "local", "shop", "ads"]) assert.match(read(`${GROWTH}/demos/${f}.tsx`), /<Panel lang=\{lang\} services="[a-z,]+"/, `${f} ends in a quote CTA`);
});

test("intro: once per session, skippable, motion-safe and never a trap", () => {
  const intro = read(`${GROWTH}/intro.tsx`), css = read(`${GROWTH}/intro.module.css`), page = read("src/app/page.tsx");
  assert.match(intro, /sessionStorage/); assert.match(intro, /prefers-reduced-motion: reduce/); assert.match(intro, /saveData/);
  assert.match(intro, /Omitir intro/); assert.match(intro, /Skip intro/); assert.match(intro, /Escape/);
  assert.match(intro, /M70 12 131 112H99L70 62 40 112H9ZM70 79 91 115H49Z/, "authentic Avalon mark path");
  assert.match(css, /@keyframes failsafe/, "CSS failsafe hides the overlay even without JavaScript");
  assert.match(page, /INTRO_GUARD/);
});
