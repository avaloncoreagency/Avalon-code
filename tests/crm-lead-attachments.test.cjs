const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const BASE = "src/app/admin/workspace/crm/";
const ID = "11111111-1111-4111-8111-111111111111";
const FILENAME = "Presupuesto de prueba.pdf";
const data = Buffer.from("%PDF-1.7\nsynthetic", "utf8");

function route({ owner = true, mime = "application/pdf", filename = FILENAME, content = data } = {}) {
  const calls = { queried: 0 };
  class FakeResponse extends Response {
    static json(payload, options) {
      return new Response(JSON.stringify(payload), { ...options, headers: { "content-type": "application/json" } });
    }
  }
  const db = {
    from(table) {
      calls.queried++;
      assert.equal(table, "crm_attachments");
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { filename, mime, content: "\\x" + content.toString("hex") }, error: null })
      };
      return chain;
    }
  };
  const mocks = {
    "next/server": { NextResponse: FakeResponse },
    "@/lib/auth/session": { getOwnerSession: async () => owner ? { supabase: db } : null },
    "@/lib/crm/attachments": { decodeBytea: bytes => Buffer.from(bytes.slice(2), "hex") }
  };
  const name = path.resolve(BASE + "pipeline/files/[id]/route.ts");
  const mod = new Module(name, module);
  mod.filename = name;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = dependency => Object.hasOwn(mocks, dependency) ? mocks[dependency] : original(dependency);
  mod._compile(ts.transpileModule(fs.readFileSync(name, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, name);
  return { GET: mod.exports.GET, calls };
}
const request = preview => ({ nextUrl: new URL("https://avalon.example.invalid/admin/workspace/crm/pipeline/files/" + ID + (preview ? "?preview=1" : "")) });
const params = { params: Promise.resolve({ id: ID }) };

test("lead attachment PDF previews are owner-only, sandboxed, never cached, with unchanged bytes", async () => {
  const { GET, calls } = route();
  const result = await GET(request(true), params);
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-disposition"), /^inline;/);
  assert.equal(result.headers.get("content-type"), "application/pdf");
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.match(result.headers.get("content-security-policy"), /sandbox/);
  assert.match(result.headers.get("cache-control"), /no-store/);
  assert.equal(Buffer.from(await result.arrayBuffer()).toString(), data.toString());
  assert.equal(calls.queried, 1);
});

test("download is the default; document formats never become inline preview", async () => {
  const { GET: pdf } = route();
  const saved = await pdf(request(false), params);
  assert.match(saved.headers.get("content-disposition"), /^attachment;/);
  const { GET: word } = route({ mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename: "doc.docx" });
  const preview = await word(request(true), params);
  assert.match(preview.headers.get("content-disposition"), /^attachment;/);
});

test("untrusted stored MIME is never rendered inline even when preview is requested", async () => {
  const { GET } = route({ mime: "text/html", filename: "unsafe.html" });
  const result = await GET(request(true), params);
  assert.equal(result.headers.get("content-type"), "application/octet-stream");
  assert.match(result.headers.get("content-disposition"), /^attachment;/);
});

test("anonymous and invalid IDs cannot read attachment bytes", async () => {
  const { GET, calls } = route({ owner: false });
  assert.equal((await GET(request(true), params)).status, 403);
  assert.equal(calls.queried, 0);
  const authorized = route();
  assert.equal((await authorized.GET(request(true), { params: Promise.resolve({ id: "not-uuid" }) })).status, 400);
  assert.equal(authorized.calls.queried, 0);
});

test("lead ficha has one attachments panel, note upload, accessible previews and downloads", () => {
  const page = fs.readFileSync(BASE + "lead/[id]/page.tsx", "utf8");
  const gallery = fs.readFileSync("src/components/crm/lead-attachments.tsx", "utf8");
  const form = fs.readFileSync("src/components/crm/lead-interaction-form.tsx", "utf8");
  assert.match(page, /<LeadAttachments leadId=\{id\}/);
  assert.match(page, /<LeadInteractionForm leadId=\{id\}/);
  assert.match(page, /crm_attachments/);
  assert.match(gallery, /Archivos adjuntos/);
  assert.match(gallery, /router\.refresh\(\)/);
  assert.match(gallery, /download>/);
  assert.match(gallery, /preview=1/);
  assert.match(form, /logInteraction/);
  assert.match(form, /Adjuntar PDF, foto o documento/);
  assert.match(form, /form\.requestSubmit\(\)/);
  assert.match(form, /input\.value = ""/);
  assert.doesNotMatch(page + gallery + form, /service_role|SERVICE_ROLE/);
});
