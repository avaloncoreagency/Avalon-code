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
  assert.match(UNIVERSE.es.hero.line1 + " " + UNIVERSE.es.hero.line2, /^Tu negocio\. Sin límites\.$/);
  assert.match(UNIVERSE.en.hero.line1 + " " + UNIVERSE.en.hero.line2, /^Your business\. Beyond limits\.$/);
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

test("every engine module opens a real solution page and carries its service into the quote form", () => {
  const stages = read("src/components/public/landing/universe/stages.tsx");
  assert.ok(stages.includes("href={`/soluciones/${m.key}${q(lang)}`}"));
  assert.ok(stages.includes("#cotizacion"));
  for (const s of SERVICES) assert.ok(read("src/app/sitemap.ts").includes(s), "sitemap lists " + s);
});

test("the WebGL scene is optional: lazy, motion-safe, paused when hidden, disposed on unmount", () => {
  const lu = read("src/components/public/landing/universe/living-universe.tsx");
  assert.match(lu, /await import\("\.\/scene"\)/, "scene is code-split");
  assert.doesNotMatch(lu, /from "three"/);
  assert.doesNotMatch(read("src/components/public/landing/universe/stages.tsx"), /from "three"|from "\.\/scene"/, "stages never pull three.js into the first load (type imports only)");
  assert.match(lu, /prefers-reduced-motion: reduce/);
  assert.match(lu, /saveData/);
  assert.match(lu, /visibilitychange/);
  assert.match(lu, /swiftshader\|llvmpipe\|software/, "no scene on software rasterizers");
  assert.match(lu, /onTooSlow/, "frame watchdog falls back to the static experience");
  assert.match(lu, /handle\?\.dispose\(\)/);
  assert.match(lu, /passive: true/, "scroll is observed, never hijacked");
  assert.doesNotMatch(lu + read("src/components/public/landing/universe/stages.tsx"), /preventDefault\(\)|overflow\s*=\s*["']hidden/, "no scroll locking");
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
test("fallback clears every projected style and hidden-button tabindex", () => {
  const { resetProjection } = load("src/components/public/landing/universe/stages.tsx");
  const removed = [], attrs = [];
  resetProjection([null,{style:{removeProperty:p=>removed.push(p)},removeAttribute:a=>attrs.push(a)}]);
  assert.deepEqual(removed,["transform","opacity","z-index","pointer-events"]);
  assert.deepEqual(attrs,["tabindex"]);
});
