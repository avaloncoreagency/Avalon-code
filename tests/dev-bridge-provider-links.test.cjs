const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const code = fs.readFileSync("src/app/admin/dev-bridge/bridge-provider-link.tsx", "utf8");
const compiled = ts.transpileModule(code, {
  fileName: "bridge-provider-link.tsx",
  compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022},
});
assert.deepEqual((compiled.diagnostics || []).filter(x => x.category === ts.DiagnosticCategory.Error), []);
const jsx = (tag, props) => ({tag, props});
const mod = {exports: {}};
new Function("require", "module", "exports", compiled.outputText)(
  name => {if (name === "react/jsx-runtime") return {jsx, jsxs: jsx}; throw Error("Unexpected import " + name);},
  mod, mod.exports,
);
const {verifiedProviderHref, SafeProviderLink} = mod.exports;

test("only real GitHub and Avalon/Vercel HTTPS origins become clickable", () => {
  assert.match(verifiedProviderHref("https://github.com/avaloncoreagency/Avalon-code/pull/181", "github"), /^https:\/\/github\.com\//);
  assert.equal(verifiedProviderHref("https://github.com.evil.invalid/pull/181", "github"), null);
  assert.equal(verifiedProviderHref("https://x.github.com/pull/181", "github"), null);
  assert.equal(verifiedProviderHref("https://user:password@github.com/owner/repo", "github"), null);
  assert.equal(verifiedProviderHref("https://github.com:8443/owner/repo", "github"), null);
  assert.equal(verifiedProviderHref("javascript:alert(1)", "github"), null);
  assert.equal(verifiedProviderHref("http://github.com/owner/repo", "github"), null);
  assert.equal(verifiedProviderHref("/admin/dev-bridge", "github"), null);
  assert.equal(verifiedProviderHref(null, "github"), null);
  assert.match(verifiedProviderHref("https://avalon-core-agency-abc.vercel.app", "vercel"), /vercel\.app/);
  assert.match(verifiedProviderHref("https://avaloncoreagency.com", "vercel"), /avaloncoreagency\.com/);
  assert.equal(verifiedProviderHref("https://github.com/owner/repo", "vercel"), null);
  assert.equal(verifiedProviderHref("https://vercel.app.evil.invalid", "vercel"), null);
});

test("invalid provider URLs become plain text and cannot present as links", () => {
  const safe = SafeProviderLink({href: "https://github.com/owner/repo", source: "github", children: "PR"});
  assert.equal(safe.tag, "a");
  assert.equal(safe.props.rel, "noopener noreferrer");
  const unsafe = SafeProviderLink({href: "https://github.com.evil.invalid", source: "github", children: "PR"});
  assert.equal(unsafe.tag, "span");
  assert.match(String(unsafe.props.children[1]), /enlace no verificado/);
});

test("Dev Bridge uses validated links for all external PR, Issue, commit and deployment metadata", () => {
  const page = fs.readFileSync("src/app/admin/dev-bridge/page.tsx", "utf8");
  assert.match(page, /import \{ SafeProviderLink \}/);
  assert.match(page, /source="github"/);
  assert.match(page, /source="vercel"/);
  for (const path of ["pr.url", "issue.url", "i.url", "i.handoff.url", "p.url", "c.url", "d.url"]) {
    assert.ok(page.includes("href={" + path + "}"), "expected provider source: " + path);
  }
  assert.doesNotMatch(page, /<a href=\{(?:pr|issue|i|p|c|d)\.url\}/);
});
