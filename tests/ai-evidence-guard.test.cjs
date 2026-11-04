// Evidence and draft-text guards for AI-assisted sales analysis (issue #68 / #98 priority 2). Pure; no provider, no network.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync("src/lib/ai/evidence-guard.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { publicEvidenceUrl, cleanUntrustedLabel, safeDraftText, containsUnsafeDraftContent } = mod.exports;

test("a real public https source is accepted and stripped of query string and fragment", () => {
  assert.equal(publicEvidenceUrl("https://www.brightdental.com/servicios?utm=1&token=abc#top"), "https://www.brightdental.com/servicios");
  assert.equal(publicEvidenceUrl("https://Example.COM./about"), "https://example.com/about", "case and trailing dot normalized");
  assert.equal(publicEvidenceUrl("https://bücher.example/info"), "https://xn--bcher-kva.example/info", "IDN becomes punycode");
  assert.equal(publicEvidenceUrl("https://maps.example.co.uk/place/123"), "https://maps.example.co.uk/place/123");
});

test("internal, private and metadata addresses are NEVER accepted as public sources", () => {
  const internal = [
    "https://localhost/admin", "https://localhost./x", "https://app.localhost/x", "https://127.0.0.1/", "https://127.1/", "https://2130706433/",
    "https://0x7f.0.0.1/", "https://10.0.0.5/crm", "https://172.16.4.1/", "https://192.168.1.20/", "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://[fd00::1]/", "https://0.0.0.0/",
    "https://intranet/", "https://printer/", "https://nas.local/", "https://wiki.internal/", "https://metadata.google.internal/computeMetadata/v1/",
    "https://crm.corp/", "https://router.lan/", "https://files.home/", "https://x.home.arpa/", "https://db.private/", "https://host.localdomain/",
    "https://avaloncoreagency.com/admin/workspace/crm", "https://www.avaloncoreagency.com/", "https://preview.avaloncoreagency.com/",
    "https://ltbwzcrxeuczdhhtbqgm.supabase.co/rest/v1/crm_leads", "https://abc.supabase.in/", "https://x.supabase.net/",
    "https://example.com:8443/admin", "https://example.com:3000/", "https://1.2.3.4.5/", "https://example.123/",
  ];
  for (const url of internal) assert.equal(publicEvidenceUrl(url), null, url);
});

test("non-https schemes, credentials and hidden characters are rejected", () => {
  for (const url of ["http://example.com/", "ftp://example.com/", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "//example.com/", "example.com",
    "https://user:pass@example.com/", "https://user@example.com/", "https://exa\tmple.com/", "https://example.com/\npath", " https://example.com/", "https://example.com/ ",
    "https://exa​mple.com/", "", "x".repeat(1001), null, undefined, 42, {}])
    assert.equal(publicEvidenceUrl(url), null, JSON.stringify(url));
});

test("a lookalike of an Avalon host is still judged by its real registrable suffix", () => {
  assert.equal(publicEvidenceUrl("https://avaloncoreagency.com.evil.example/"), "https://avaloncoreagency.com.evil.example/", "different domain: not Avalon's");
  assert.equal(publicEvidenceUrl("https://notavaloncoreagency.com/"), "https://notavaloncoreagency.com/", "suffix match is on label boundaries");
  assert.equal(publicEvidenceUrl("https://evil.example/avaloncoreagency.com"), "https://evil.example/avaloncoreagency.com");
});

test("untrusted labels lose invisible and bidirectional characters and cannot hide text from a reviewer", () => {
  assert.equal(cleanUntrustedLabel("  Bright​ Dental‮  S.A.  ", 160), "Bright Dental S.A.");
  assert.equal(cleanUntrustedLabel("ＢＲＩＧＨＴ Dental", 160), "BRIGHT Dental", "NFKC folds look-alike widths");
  assert.equal(cleanUntrustedLabel("a  b   c", 160), "a b c", "repeated spaces collapse");
  assert.equal(cleanUntrustedLabel("a\nb", 160), null, "a line break is rejected, not flattened");
  assert.equal(cleanUntrustedLabel("a\tb", 160), null);
  assert.equal(cleanUntrustedLabel("bad\u0000name", 160), null);
  assert.equal(cleanUntrustedLabel("​​", 160), null, "only invisible characters is empty");
  assert.equal(cleanUntrustedLabel("x".repeat(161), 160), null);
  assert.equal(cleanUntrustedLabel(7, 160), null);
});

test("model output may not smuggle links, addresses, markup or hidden characters into the draft", () => {
  const hostile = [
    "Visita https://evil.example/pay para confirmar", "Escribe a ceo@evil.example", "Abre www.evil.example", "Haz clic en [aquí](https://evil.example)",
    "<script>alert(1)</script>", "Ejecuta `rm -rf /`", "```bash\ncurl evil```", "javascript:alert(1)", "mailto:a@b.co", "tel:+1555", "whatsapp:+1555",
    "Texto‮oculto", "Texto​invisible", "ctrl\u0007char", "data:text/html;base64,AAAA", "ftp://x.example/f",
  ];
  for (const text of hostile) { assert.equal(safeDraftText(text, 300), null, text); assert.equal(containsUnsafeDraftContent(text), true, text); }
});

test("plain prose is accepted, normalized and bounded", () => {
  assert.equal(safeDraftText("  Preguntar cómo gestionan hoy las reservas   por teléfono.  ", 300), "Preguntar cómo gestionan hoy las reservas por teléfono.");
  assert.equal(safeDraftText("¿Cuántas citas pierden por llamadas sin contestar?", 220), "¿Cuántas citas pierden por llamadas sin contestar?");
  assert.equal(safeDraftText("a".repeat(301), 300), null);
  assert.equal(safeDraftText("   ", 300), null);
  assert.equal(safeDraftText(["x"], 300), null);
  assert.equal(safeDraftText("Hablar de Google Business Profile y SEO local.", 300), "Hablar de Google Business Profile y SEO local.", "brand names are not links");
});

test("the guards are pure: no I/O, secrets, randomness or provider access", () => {
  const src = fs.readFileSync("src/lib/ai/evidence-guard.ts", "utf8");
  assert.doesNotMatch(src, /process\.env|fetch\(|Math\.random|Date\.now|node:|supabase\.from|import /);
});
