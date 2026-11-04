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

test("sitemap lists only the two public language versions, never a private route", () => {
  const entries = load("src/app/sitemap.ts")();
  assert.deepEqual(entries.map(e => e.url), ["https://avaloncoreagency.com/", "https://avaloncoreagency.com/?lang=en"]);
  for (const e of entries) assert.doesNotMatch(e.url, /admin|api|login/);
});

test("landing metadata follows the page language and never emits query-stripped canonical/hreflang", () => {
  const src = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.match(src, /export async function generateMetadata/);
  assert.match(src, /AI, websites, CRM and automation for businesses/, "English title for ?lang=en");
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
