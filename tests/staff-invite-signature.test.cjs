// AGENT PORTAL invitations: the e-mail is signed by the AUTHENTICATED owner (resolved by the Edge Function from
// /auth/v1/user), never by a name sent in the request. Synthetic identities only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const ownerIdentity = require("../scripts/creative-bridge/continuity-loader.cjs")("supabase/functions/_shared/owners.ts");

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const INVITED = "00000000-0000-4000-8000-0000000000c3";

function makeEdge(ownerEmail) {
  const js = ts.transpileModule(fs.readFileSync("supabase/functions/staff-invite/index.ts", "utf8"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let handler; const calls = [];
  const env = { SUPABASE_URL: "https://synthetic.supabase.co", SUPABASE_ANON_KEY: "public-test-key", SUPABASE_SERVICE_ROLE_KEY: "private-test-key", AVALON_OWNER_APP_ORIGIN: "https://avaloncoreagency.com" };
  const Deno = { env: { get: k => env[k] }, serve: fn => { handler = fn; } };
  const fetch = async (url, init) => {
    const u = new URL(url); calls.push({ path: u.pathname, body: init.body || null });
    let data, status = 200;
    if (u.pathname === "/auth/v1/user") data = { id: OWNER, email: ownerEmail, factors: [] };
    else if (u.pathname === "/rest/v1/agency_memberships" && init.method === "POST") { data = null; status = 201; }
    else if (u.pathname === "/rest/v1/staff_permission_events") { data = null; status = 201; }
    else if (u.pathname === "/rest/v1/agency_memberships" && u.searchParams.get("role") === "eq.operator") data = [];
    else if (u.pathname === "/rest/v1/agency_memberships") data = [{ role: "owner" }];
    else if (u.pathname === "/auth/v1/invite") data = { id: INVITED };
    else throw Error("Unexpected request to " + u);
    return new Response(data === null ? "" : JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  };
  new Function("Deno", "fetch", "require", "exports", js)(Deno, fetch, id => {
    assert.equal(id, "../_shared/owners.ts");
    return ownerIdentity;
  }, {});
  return { calls, handler };
}
const invite = async (ownerEmail, body) => {
  const edge = makeEdge(ownerEmail);
  const r = await edge.handler(new Request("https://synthetic.supabase.co/functions/v1/staff-invite", { method: "POST",
    headers: { authorization: "Bearer fake.user.jwt", "content-type": "application/json" },
    body: JSON.stringify({ origin: "https://avaloncoreagency.com", email: "agente@example.invalid", ...body }) }));
  assert.equal(r.status, 200);
  return JSON.parse(edge.calls.find(c => c.path === "/auth/v1/invite").body);
};

test("invitation is signed by the authenticated owner; a forged inviter in the body is ignored", async () => {
  const sent = await invite("avalonagencymh@gmail.com", { inviter_name: "Samuel Muñoz", inviter_title: "CEO", data: { inviter_name: "X" }, invitee_name: "Laura QA", role_label: "Vendedor" });
  assert.equal(sent.email, "agente@example.invalid");
  assert.deepEqual(sent.data, { inviter_name: "Miguel Hobaica", inviter_title: "Cofundador", invitee_name: "Laura QA", role_label: "Vendedor", lang: "es" });
  const en = await invite("AvalonCoreAgencySM@gmail.com", { lang: "en" });
  assert.deepEqual(en.data, { inviter_name: "Samuel Muñoz", inviter_title: "Co-founder", invitee_name: "there", role_label: "team member", lang: "en" });
});

test("non-official owner never gets a founder name; template values are single-line plain text", async () => {
  const sent = await invite("other-owner@example.invalid", { invitee_name: "Ana <b>{{ .ConfirmationURL }}</b>\r\nBcc: x", role_label: "x".repeat(200), lang: "fr" });
  assert.equal(sent.data.inviter_name, "Avalon Core Agency");
  assert.equal(sent.data.inviter_title, "Dirección");
  assert.equal(sent.data.lang, "es");
  assert.doesNotMatch(sent.data.invitee_name, /[<>{}\r\n]/);
  assert.ok(sent.data.role_label.length <= 60);
  for (const v of Object.values(sent.data)) assert.ok(String(v).trim().length > 0, "no blank template values");
});
