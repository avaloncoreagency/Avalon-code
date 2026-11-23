// Dev Bridge 3.0 ledger — isolated PostgreSQL (PGlite), synthetic identities only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createHash, randomBytes } = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite");

const MIGUEL = "00000000-0000-4000-8000-0000000000a1";
const SAMUEL = "00000000-0000-4000-8000-0000000000b2";
const OPERATOR = "00000000-0000-4000-8000-0000000000c3";
const sha = t => createHash("sha256").update(t).digest("hex");
const token = () => "avd_" + randomBytes(24).toString("base64url");

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec(`insert into auth.users(id,email) values ('${MIGUEL}','m@example.invalid'),('${SAMUEL}','s@example.invalid'),('${OPERATOR}','o@example.invalid');`);
  for (const f of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + f, "utf8"));
    if (f.startsWith("20261102053022")) await db.exec(`insert into agency_memberships(user_id,role) values ('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${OPERATOR}','operator');`);
  }
  const as = id => db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role authenticated;`);
  const anon = () => db.exec(`reset role; set request.jwt.claim.sub=''; set role anon;`);
  const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
  const event = (tok, ev) => one("select public.dev_bridge_agent_event($1,$2::jsonb) r", [sha(tok), JSON.stringify(ev)]).then(r => r.r);
  return { db, as, anon, one, event };
}

test("identity: each owner claims only their own label; nobody can take the other's", { timeout: 240000 }, async t => {
  const { db, as, one } = await setup(); t.after(() => db.close());
  await as(MIGUEL);
  assert.equal((await one("select public.dev_bridge_claim_owner('miguel') r")).r, "miguel");
  assert.equal((await one("select public.dev_bridge_claim_owner('miguel') r")).r, "miguel", "idempotent");
  await assert.rejects(db.query("select public.dev_bridge_claim_owner('samuel')"), /dev_bridge_identity_conflict/, "one label per account");
  await as(SAMUEL);
  await assert.rejects(db.query("select public.dev_bridge_claim_owner('miguel')"), /dev_bridge_identity_conflict/, "a claimed label cannot be taken");
  assert.equal((await one("select public.dev_bridge_claim_owner('samuel') r")).r, "samuel");
  await as(OPERATOR);
  await assert.rejects(db.query("select public.dev_bridge_claim_owner('samuel')"), /dev_bridge_forbidden/);
  assert.equal((await db.query("select * from dev_bridge_people")).rows.length, 0, "non-owners read nothing (RLS)");
});

test("agents: only the owner activates their own agents; sessions measured with server time; impersonation and replay rejected", { timeout: 240000 }, async t => {
  const { db, as, anon, one, event } = await setup(); t.after(() => db.close());
  await as(MIGUEL); await db.query("select public.dev_bridge_claim_owner('miguel')");
  await as(SAMUEL); await db.query("select public.dev_bridge_claim_owner('samuel')");
  const mTok = token(), sTok = token();
  await as(MIGUEL);
  await assert.rejects(db.query("select public.dev_bridge_agent_token('samuel.claude',$1,'avd_abcd',30)", [sha(sTok)]), /dev_bridge_not_your_agent/, "Miguel cannot activate Samuel's agent");
  await db.query("select public.dev_bridge_agent_token('miguel.claude',$1,$2,30)", [sha(mTok), mTok.slice(0, 8)]);
  await assert.rejects(db.query("select token_sha256 from dev_bridge_agents"), /permission denied/, "token hashes are not readable");
  await as(SAMUEL);
  await db.query("select public.dev_bridge_agent_token('samuel.codex',$1,$2,30)", [sha(sTok), sTok.slice(0, 8)]);

  await anon();
  await assert.rejects(event("avd_wrong-token-xxxxxxxxxxxxxxxxxxxx", { kind: "session_start", idempotency_key: "k-00000001", title: "x" }), /invalid_token/);
  const start = await event(mTok, { kind: "session_start", idempotency_key: "start-0001", title: "Dev Bridge 3.0", department: "Engineering", issue_number: 303, occurred_at: "2000-01-01T00:00:00Z" });
  assert.equal(start.replayed, false);
  const replay = await event(mTok, { kind: "session_start", idempotency_key: "start-0001", title: "Dev Bridge 3.0" });
  assert.equal(replay.replayed, true, "same key = same event, no duplicate");
  assert.equal(replay.session_id, start.session_id);
  // Samuel's Codex token cannot write into Miguel's session (impersonation).
  await assert.rejects(event(sTok, { kind: "session_pause", idempotency_key: "pause-0001", session_id: start.session_id }), /session_not_found/);
  await event(mTok, { kind: "session_pause", idempotency_key: "pause-0001", session_id: start.session_id });
  await assert.rejects(event(mTok, { kind: "session_pause", idempotency_key: "pause-0002", session_id: start.session_id }), /invalid_session_transition/, "cannot pause twice");
  await event(mTok, { kind: "session_resume", idempotency_key: "resume-001", session_id: start.session_id });
  await event(mTok, { kind: "test", idempotency_key: "test-00001", session_id: start.session_id, title: "npm test 1200/0", evidence_url: "https://github.com/avaloncoreagency/Avalon-code/actions/runs/1" });
  await event(mTok, { kind: "session_stop", idempotency_key: "stop-00001", session_id: start.session_id, summary: "Ledger + API", next_action: "QA by Codex" });
  await assert.rejects(event(mTok, { kind: "session_resume", idempotency_key: "resume-002", session_id: start.session_id }), /invalid_session_transition/, "a completed session cannot be resumed");

  await db.exec("reset role");
  const sess = await one("select owner, tool, status, summary, next_action from dev_bridge_sessions where id=$1", [start.session_id]);
  assert.deepEqual(sess, { owner: "miguel", tool: "claude_code", status: "completed", summary: "Ledger + API", next_action: "QA by Codex" });
  const evs = (await db.query("select kind, evidence, occurred_at > now() - interval '1 minute' recent from dev_bridge_events where session_id=$1 order by recorded_at", [start.session_id])).rows;
  assert.equal(evs.length, 5);
  assert.ok(evs.filter(e => e.kind.startsWith("session_")).every(e => e.evidence === "VERIFIED" && e.recent), "session events use server time, not the client's 2000-01-01");
  assert.equal(evs.find(e => e.kind === "test").evidence, "SELF_REPORTED", "a test claim from an agent is self-reported");

  // Input limits: only https evidence links, bounded titles, valid kinds.
  await anon();
  await assert.rejects(event(sTok, { kind: "note", idempotency_key: "bad-url-01", title: "x", evidence_url: "http://example.com" }), /invalid_event/, "http evidence rejected");
  await assert.rejects(event(sTok, { kind: "note", idempotency_key: "bad-url-02", title: "x", evidence_url: "javascript:alert(1)" }), /invalid_event/);
  await assert.rejects(event(sTok, { kind: "note", idempotency_key: "long-0001", title: "x".repeat(301) }), /invalid_event/, "title capped at 300");
  await assert.rejects(event(sTok, { kind: "keystrokes", idempotency_key: "kind-0001", title: "x" }), /invalid_event/, "unknown kinds rejected");
  await assert.rejects(event(sTok, { kind: "note", idempotency_key: "short", title: "x" }), /invalid_event|check/, "idempotency key 8–200 chars");
  // Rate limit: 600 events per agent per hour.
  await db.exec("reset role");
  await db.query("insert into dev_bridge_events (idempotency_key, source, agent_id, owner, tool, kind, occurred_at, evidence, title) select 'samuel.codex:bulk-' || g, 'agent', 'samuel.codex', 'samuel', 'codex', 'note', now(), 'SELF_REPORTED', 'bulk' from generate_series(1, 600) g");
  await anon();
  await assert.rejects(event(sTok, { kind: "note", idempotency_key: "over-rate-1", title: "x" }), /rate_limited/, "601st event in an hour is refused");
  // Expiry: an expired token is refused like a revoked one.
  await db.exec("reset role");
  await db.query("update dev_bridge_agents set expires_at = now() - interval '1 second' where id='samuel.codex'");
  await anon();
  await assert.rejects(event(sTok, { kind: "note", idempotency_key: "expired-01", title: "x" }), /invalid_token/, "expired token rejected");

  await as(MIGUEL);
  await db.query("select public.dev_bridge_agent_token('miguel.claude',null,null,null)");
  await anon();
  await assert.rejects(event(mTok, { kind: "note", idempotency_key: "after-revoke", title: "x" }), /invalid_token/, "revoked token rejected");
  await assert.rejects(db.query("select * from dev_bridge_events"), /permission denied/, "anon reads nothing");
});

test("declared hours, ChatGPT handoffs, GitHub import and commitments are auditable and never self-verified", { timeout: 240000 }, async t => {
  const { db, as, one } = await setup(); t.after(() => db.close());
  await as(MIGUEL); await db.query("select public.dev_bridge_claim_owner('miguel')");
  await as(SAMUEL); await db.query("select public.dev_bridge_claim_owner('samuel')");
  await as(MIGUEL);
  const h = (await one("select public.dev_bridge_declare_time(current_date, 120, 'Revisión de STABLE V1', 303, null, null, null) id")).id;
  await assert.rejects(db.query("select public.dev_bridge_declare_time(current_date, 90, 'Corrección', 303, null, $1, '')", [h]), /check|dev_bridge/, "a correction needs a reason");
  const h2 = (await one("select public.dev_bridge_declare_time(current_date, 90, 'Revisión de STABLE V1', 303, null, $1, 'Eran 90 minutos') id", [h])).id;
  assert.ok(h2);
  await assert.rejects(db.query("select public.dev_bridge_declare_time(current_date, 60, 'Otra', null, null, $1, 'segunda corrección')", [h]), /already_corrected/);
  await as(SAMUEL);
  await assert.rejects(db.query("select public.dev_bridge_declare_time(current_date, 60, 'Editar horas ajenas', null, null, $1, 'no permitido')", [h2]), /not_your_entry/, "nobody corrects the other owner's hours");
  const rows = (await db.query("select owner, minutes, supersedes is not null corrected from dev_bridge_time_entries order by created_at")).rows;
  assert.deepEqual(rows.map(r => [r.owner, r.minutes, r.corrected]), [["miguel", 120, false], ["miguel", 90, true]], "original kept, correction appended");

  // ChatGPT department handoff: owner records only their own work; without a link it is SELF_REPORTED.
  const id1 = (await one("select public.dev_bridge_record($1::jsonb) id", [JSON.stringify({ source: "chatgpt_import", idempotency_key: "pm-handoff-1", title: "PM: plan semanal", department: "Project Manager" })])).id;
  const id2 = (await one("select public.dev_bridge_record($1::jsonb) id", [JSON.stringify({ source: "chatgpt_import", idempotency_key: "pm-handoff-1", title: "duplicado" })])).id;
  assert.equal(id1, id2, "idempotent import");
  await db.query("select public.dev_bridge_record($1::jsonb)", [JSON.stringify({ source: "chatgpt_import", idempotency_key: "legal-001", title: "Legal: matriz", department: "Legal", evidence_url: "https://github.com/avaloncoreagency/Avalon-code/issues/286" })]);
  await db.exec("reset role");
  assert.deepEqual((await db.query("select owner, evidence from dev_bridge_events where source='chatgpt_import' order by title")).rows,
    [{ owner: "samuel", evidence: "IMPORTED" }, { owner: "samuel", evidence: "SELF_REPORTED" }]);

  await as(MIGUEL);
  const gh = [{ key: "commit:abc123", kind: "commit", occurred_at: "2026-11-01T10:00:00Z", title: "fix: x", url: "https://github.com/a/b/commit/abc123", ref: "abc123" },
    { key: "pr:321", kind: "pull_request", occurred_at: "2026-11-22T22:00:00Z", title: "STABLE V1", url: "https://github.com/a/b/pull/321", owner: "miguel", issue_number: 303 }];
  assert.equal((await one("select public.dev_bridge_import_github($1::jsonb) n", [JSON.stringify(gh)])).n, 2);
  assert.equal((await one("select public.dev_bridge_import_github($1::jsonb) n", [JSON.stringify(gh)])).n, 0, "re-import adds nothing");
  await db.exec("reset role");
  const imported = (await db.query("select ref, owner, evidence, occurred_at::text from dev_bridge_events where source='github' order by occurred_at")).rows;
  assert.equal(imported[0].owner, null, "commit author is not attribution");
  assert.equal(imported[0].evidence, "UNKNOWN");
  assert.equal(imported[1].evidence, "INFERRED", "owner from an Issue label is an inference");
  assert.match(imported[0].occurred_at, /^2026-11-01/, "original date preserved");

  await as(MIGUEL);
  const c = (await one("select public.dev_bridge_commitment_create('miguel','Dev Bridge 3.0','Tests verdes y PR draft',current_date,current_date+3,'',303) id")).id;
  let v = 1;
  v = (await one("select public.dev_bridge_commitment_transition($1,'in_progress','',null,null,$2) v", [c, v])).v;
  v = (await one("select public.dev_bridge_commitment_transition($1,'completed','Entregado',$3,null,$2) v", [c, v, "https://github.com/a/b/pull/400"])).v;
  await assert.rejects(db.query("select public.dev_bridge_commitment_transition($1,'verified','yo mismo',null,null,$2)", [c, v]), /needs_other_owner/, "the responsible owner cannot verify their own work");
  await assert.rejects(db.query("select public.dev_bridge_commitment_transition($1,'blocked','x',null,null,1)", [c]), /version_conflict/);
  await as(SAMUEL);
  v = (await one("select public.dev_bridge_commitment_transition($1,'verified','Revisado',null,null,$2) v", [c, v])).v;
  await db.exec("reset role");
  const done = await one("select status, accepted_by from dev_bridge_commitments where id=$1", [c]);
  assert.deepEqual(done, { status: "verified", accepted_by: SAMUEL });
  assert.equal(Number((await one("select count(*) n from dev_bridge_commitment_events where commitment_id=$1", [c])).n), 4, "every transition is in the history");
  await assert.rejects(db.exec(`set role authenticated; set request.jwt.claim.sub='${MIGUEL}'; update dev_bridge_events set title='edit'`), /permission denied/, "events are append-only");
});
