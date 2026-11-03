const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const load = path => {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: mod.exports, module: mod, require, Buffer, TextDecoder, Object });
  return mod.exports;
};
const { attachmentMime, decodeBytea, ATTACHMENT_MAX_BYTES } = load("src/lib/crm/attachments.ts");

test("attachments: extension and content signature must agree", () => {
  assert.equal(ATTACHMENT_MAX_BYTES, 5242880);
  assert.equal(attachmentMime("Propuesta.PDF", Buffer.from("%PDF-1.7")), "application/pdf");
  assert.equal(attachmentMime("foto.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 1])), "image/png");
  assert.equal(attachmentMime("fake.pdf", Buffer.from("<html><script>")), null, "HTML renamed as PDF");
  assert.equal(attachmentMime("page.html", Buffer.from("<html>")), null, "HTML not allowed");
  assert.equal(attachmentMime("notas.txt", Buffer.from("hola ñ")), "text/plain");
  assert.equal(attachmentMime("bin.txt", Buffer.from([0x68, 0, 0x69])), null, "binary as text");
  assert.equal(attachmentMime("bad.csv", Buffer.from([0xff, 0xfe, 0x41])), null, "invalid UTF-8");
  assert.equal(attachmentMime("sin-extension", Buffer.from("x")), null);
  assert.equal(attachmentMime("hoja.xlsx", Buffer.from([0x50, 0x4b, 3, 4])), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
});

test("attachments: PostgREST bytea hex decodes to the original bytes", () => {
  assert.equal(decodeBytea("\\x255044462d").toString(), "%PDF-");
  assert.equal(decodeBytea({ 0: 104, 1: 105 }).toString(), "hi");
  assert.equal(decodeBytea(null).length, 0);
});

test("pipeline routes: owner session, same-origin writes, safe download headers", () => {
  for (const f of ["src/app/admin/workspace/crm/pipeline/route.ts", "src/app/admin/workspace/crm/pipeline/files/route.ts", "src/app/admin/workspace/crm/pipeline/files/[id]/route.ts"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.match(src, /getOwnerSession\(\)/, f);
    assert.doesNotMatch(src, /service_role|SERVICE_ROLE/, f);
  }
  const dl = fs.readFileSync("src/app/admin/workspace/crm/pipeline/files/[id]/route.ts", "utf8");
  assert.match(dl, /Content-Disposition": `attachment;/);
  assert.match(dl, /nosniff/);
  assert.match(dl, /sandbox/);
  const up = fs.readFileSync("src/app/admin/workspace/crm/pipeline/files/route.ts", "utf8");
  assert.match(up, /attachmentMime\(filename, bytes\)/);
  assert.match(up, /origin !== request\.nextUrl\.origin/);
});
