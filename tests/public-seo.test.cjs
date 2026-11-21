const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const load = path => {
  const js = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, () => ({}));
  return mod.exports.default;
};

test("robots.txt: public landing allowed, private OS and APIs excluded, sitemap declared", () => {
  const robots = load("src/app/robots.ts")();
  const rule = [].concat(robots.rules)[0];
  assert.equal(rule.userAgent, "*");
  assert.equal(rule.allow, "/");
  assert.deepEqual([...rule.disallow].sort(), ["/admin", "/api"]);
  assert.equal(robots.sitemap, "https://avaloncoreagency.com/sitemap.xml");
});

test("sitemap lists the public landing and solution pages in both languages, never a private route", () => {
  const entries = load("src/app/sitemap.ts")();
  const urls = entries.map(e => e.url);
  assert.deepEqual(urls.slice(0, 2), ["https://avaloncoreagency.com/", "https://avaloncoreagency.com/?lang=en"]);
  assert.ok(urls.every(u => u === "https://avaloncoreagency.com/" || u === "https://avaloncoreagency.com/?lang=en" || /^https:\/\/avaloncoreagency\.com\/soluciones\/[a-z]+(\?lang=en)?$/.test(u)), "only public pages");
  assert.equal(urls.length, 18, "landing + 8 solution pages, ES and EN");
  for (const e of entries) assert.doesNotMatch(e.url, /admin|api|login/);
});

test("landing metadata follows the page language and never emits query-stripped canonical/hreflang", () => {
  const src = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.match(src, /export async function generateMetadata/);
  assert.match(src, /Websites, CRM & AI for Business/, "English title for ?lang=en");
  assert.match(src, /robots: \{ index: true, follow: true \}/);
  // Next.js drops "?lang=en" from alternates/canonical (verified on the production build): do not use them here.
  assert.doesNotMatch(src.slice(src.indexOf("export async function generateMetadata")), /alternates|canonical/);
  // The private shell stays out of search engines.
  assert.match(fs.readFileSync("src/app/layout.tsx", "utf8"), /robots: \{ index: false, follow: false \}/);
});

test("quote form keeps its honeypot hidden from assistive tech and has labelled, typed, bounded fields", () => {
  const form = fs.readFileSync("src/components/public/quote-form.tsx", "utf8");
  assert.match(form, /aria-hidden="true"><label>Website<input name="website_url" tabIndex=\{-1\}/);
  for (const field of ['name="company" required', 'name="name" required', 'name="email" type="email" required', 'name="message" required minLength={10}'])
    assert.ok(form.includes(field), field);
  assert.match(form, /role="alert"/);
  assert.match(form, /role="status"/);
  assert.match(form, /autoComplete="email"/);
});

test("public homepage speaks to contractors and includes an accessible bilingual FAQ", () => {
  const copy = fs.readFileSync("src/components/public/landing/copy.ts", "utf8");
  const page = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.match(copy, /Para contratistas, profesionales y empresas/);
  assert.match(copy, /For contractors, professionals and businesses/);
  assert.match(copy, /faq: \{ eyebrow: "Preguntas frecuentes"/);
  assert.match(copy, /faq: \{ eyebrow: "Frequently asked questions"/);
  assert.match(page, /id="preguntas"/);
  assert.match(page, /<details key=\{question\}/);
});

test("public inquiry supports all advertised service interests without expanding the reviewed SQL allowlist", () => {
  const services = fs.readFileSync("src/components/public/services.ts", "utf8");
  const action = fs.readFileSync("src/app/quote-actions.ts", "utf8");
  for (const name of ["chatbots", "funnels"]) {
    assert.match(services, new RegExp(name + ":"));
    assert.match(action, new RegExp(name + ":"));
  }
  assert.match(action, /Interés adicional/);
  assert.match(action, /Additional interest/);
  assert.match(action, /services: \[\.\.\.new Set\(requested\.filter\(s => SERVICES\.includes\(s\)\)\)\]/);
});

test("demos, services and solution pages carry service intent into the quote form", () => {
  const page = fs.readFileSync("src/app/page.tsx", "utf8");
  const panel = fs.readFileSync("src/components/public/growth/demos/shared.tsx", "utf8");
  const showroom = fs.readFileSync("src/components/public/landing/showroom.tsx", "utf8");
  const detail = fs.readFileSync("src/app/soluciones/[service]/page.tsx", "utf8");
  const form = fs.readFileSync("src/components/public/quote-form.tsx", "utf8");
  assert.ok(page.includes("<GrowthExperience lang={lang} />"));
  assert.ok(page.includes('initialServices={initialServices}'));
  assert.ok(page.includes('services=${k}#cotizacion'));
  assert.ok(panel.includes('services=${services}#cotizacion'));
  assert.ok(showroom.includes('services=${k}#cotizacion'));
  assert.ok(detail.includes('initialServices={[service]}'));
  // Preselected services, or the visitor's own selection echoed back after a failed submission.
  assert.ok(form.includes('const checked = (k: string) => v ? v.services.includes(k) : initialServices.includes(k as ServiceKey);'));
  assert.ok(form.includes('defaultChecked={checked(k)}'));
});
