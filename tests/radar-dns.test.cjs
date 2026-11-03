const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("src/lib/crm/radar-website-safety.ts", "utf8");
const transpiled = ts.transpileModule(source, {
  fileName: "radar-website-safety.ts",
  reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const errors = (transpiled.diagnostics || [])
  .filter(d => d.category === ts.DiagnosticCategory.Error)
  .map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
assert.deepEqual(errors, []);
const moduleObj = { exports: {} };
new Function("require", "module", "exports", transpiled.outputText)(
  require, moduleObj, moduleObj.exports
);
const { pinnedDnsLookup, isPublicAddress, robotsAllows } = moduleObj.exports;

test("Node autoSelectFamily all:true lookup returns only the vetted IPv4 array", () => {
  const lookup = pinnedDnsLookup("1.1.1.1");
  lookup("example.org", { all: true }, (err, addresses, family) => {
    assert.equal(err, null);
    assert.deepEqual(addresses, [{ address: "1.1.1.1", family: 4 }]);
    assert.equal(family, undefined);
  });
});

test("legacy all:false lookup still returns a pinned IPv4 and correct family", () => {
  pinnedDnsLookup("8.8.8.8")("example.org", { all: false }, (err, address, family) => {
    assert.equal(err, null);
    assert.equal(address, "8.8.8.8");
    assert.equal(family, 4);
  });
});

test("pinned address cannot come from a private or reserved DNS result", () => {
  for (const addr of ["127.0.0.1", "10.0.0.9", "192.168.1.8", "169.254.169.254", "203.0.113.15"])
    assert.equal(isPublicAddress(addr), false, addr);
  assert.match(source, /records\.some\(r => !isPublicAddress\(r\.address\)\)/);
  assert.match(source, /lookup: pinnedDnsLookup\(address\)/);
});

test("robots allow/disallow rules remain enforced", () => {
  const rules = "User-agent: *\nDisallow: /private\nAllow: /private/press";
  assert.equal(robotsAllows(rules, "/private/patients"), false);
  assert.equal(robotsAllows(rules, "/private/press"), true);
  assert.match(source, /No pudimos comprobar robots\.txt/);
});
