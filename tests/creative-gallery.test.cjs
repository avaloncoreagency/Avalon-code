const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("src/app/admin/creative-bridge/gallery-logic.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleRef = { exports: {} };
new Function("module", "exports", "require", compiled)(moduleRef, moduleRef.exports, require);
const { isLocalMediaPath, assetState, projectState, filterGallery } = moduleRef.exports;

const SHA = "a".repeat(64);
const asset = (overrides = {}) => ({
  id: "synthetic", kind: "image", alt: "Synthetic artwork",
  state: "ready", public_path: `/creative-bridge/${SHA}.webp`,
  sha256: SHA, storage_ref: "durable://creative/synthetic",
  reduced_motion_ref: null, job_ref: "synthetic-job", ...overrides,
});
const view = (overrides = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Synthetic product", module: "website", service: "Website Designer",
  serviceHref: "/admin/workspace/website-designer", version: 1,
  updatedAt: "2026-11-05", state: "reference", clientKey: "client:synthetic",
  clientLabel: "Synthetic Client", clientHref: null, leadHref: null, saleHref: null,
  agent: "codex", sourceRef: "hf-synthetic", branch: null, headSha: null,
  ci: null, evidence: [], assets: [], approval: "Sin evidencia",
  ...overrides,
});

test("creative gallery: media import gate is content-addressed and fails closed", () => {
  assert.equal(isLocalMediaPath(asset()), true);
  assert.equal(assetState(asset(), true), "imported");
  assert.equal(assetState(asset(), false), "blocked", "a manifest without a file is NOT imported");
  assert.equal(assetState(asset({ public_path: "https://signed.example.invalid/file.webp" }), true), "blocked");
  assert.equal(assetState(asset({ public_path: "/creative-bridge/" + "b".repeat(64) + ".webp" }), true), "blocked");
  assert.equal(assetState(asset({ public_path: "/creative-bridge/" + SHA + ".html" }), true), "blocked");
  assert.equal(assetState(asset({ kind: "image", public_path: "/creative-bridge/" + SHA + ".glb" }), true), "blocked");
  assert.equal(assetState(asset({ state: "pending", public_path: null, sha256: null }), false), "pending");
  assert.equal(assetState(asset({ state: "generating" }), false), "pending");
  assert.equal(assetState(asset({ state: "failed" }), true), "blocked");
  assert.equal(assetState(asset({ state: "cancelled" }), true), "blocked");
});

test("creative gallery: GLB is a model, while video always needs an imported still", () => {
  const model = asset({ kind: "model", public_path: `/creative-bridge/${SHA}.glb` });
  assert.equal(isLocalMediaPath(model), true);
  assert.equal(assetState(model, true), "imported");
  assert.equal(assetState(model, false), "blocked");
  const video = asset({ kind: "video", public_path: `/creative-bridge/${SHA}.mp4` });
  assert.equal(assetState(video, true, false), "blocked");
  assert.equal(assetState(video, true, true), "imported");
});

test("creative gallery: project states never equate a receipt with delivered media", () => {
  assert.equal(projectState([], "reference_only", false), "reference");
  assert.equal(projectState([], "draft", false), "pending");
  assert.equal(projectState([], "reference_only", true), "blocked");
  assert.equal(projectState([{ state: "imported" }], "reference_only", false), "imported");
  assert.equal(projectState([{ state: "blocked" }], "ready", false), "blocked");
  assert.equal(projectState([{ state: "pending" }], "reference_only", false), "pending");
});

test("creative gallery: client + service + state + search filters use stable IDs", () => {
  const items = [
    view(),
    view({ id: "00000000-0000-4000-8000-000000000002", name: "Another product", module: "ecommerce",
      service: "E-commerce Designer", clientKey: "client:two", clientLabel: "Another Company",
      state: "imported", sourceRef: "hf-second" }),
  ];
  assert.equal(filterGallery(items, { search: "", client: "all", service: "all", state: "all" }).length, 2);
  assert.equal(filterGallery(items, { search: "synthetic", client: "all", service: "all", state: "all" }).length, 1);
  assert.equal(filterGallery(items, { search: "", client: "client:two", service: "all", state: "all" })[0].module, "ecommerce");
  assert.equal(filterGallery(items, { search: "", client: "all", service: "website", state: "all" }).length, 1);
  assert.equal(filterGallery(items, { search: "", client: "all", service: "all", state: "imported" }).length, 1);
  assert.equal(filterGallery(items, { search: "missing", client: "all", service: "all", state: "all" }).length, 0);
});

test("creative gallery: owner gate, real local file checks, reduced motion and no new provider/billing", () => {
  const page = fs.readFileSync("src/app/admin/creative-bridge/page.tsx", "utf8");
  const gallery = fs.readFileSync("src/app/admin/creative-bridge/gallery.tsx", "utf8");
  const media = fs.readFileSync("src/app/admin/creative-bridge/asset.tsx", "utf8");
  const model = fs.readFileSync("src/app/admin/creative-bridge/model-viewer.tsx", "utf8");
  const css = fs.readFileSync("src/app/admin/creative-bridge/media.module.css", "utf8");
  const layout = fs.readFileSync("src/app/admin/creative-bridge/layout.module.css", "utf8");
  assert.match(page, /await requireOwner\(\)/);
  assert.match(page, /lstatSync\(/);
  assert.match(page, /manifest\(raw\)/);
  assert.match(page, /supabase\.from\("os_projects"\)/);
  assert.match(page, /client_id/);
  assert.match(gallery, /filterGallery/);
  assert.match(gallery, /GALLERY_LABELS/);
  assert.match(gallery, /creative-actions/);
  assert.match(media, /CreativeModel/);
  assert.match(media, /posterPath/);
  assert.match(model, /GLTFLoader/);
  assert.match(model, /low-power/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(layout, /max-width: 730px/);
  for (const path of [
    "/admin/workspace/website-designer", "/admin/workspace/ecommerce-designer",
    "/admin/workspace/crm-creator", "/admin/workspace/marketing-hub", "/admin/workspace/crm/leads",
  ]) assert.ok(gallery.includes(path), path + " navigation is missing");
  assert.doesNotMatch(page + gallery + media + model, /generate_image\(|generate_video\(|service_role|GROQ_API_KEY|CLOUDFLARE_API_TOKEN|NEXT_PUBLIC_.*SECRET/);
});
