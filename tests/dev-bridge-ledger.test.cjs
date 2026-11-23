// Dev Bridge 3.0 — pure ledger math (sessions, pauses, concurrency, corrections, CSV, handoff, GitHub mapping).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const m = { exports: {} };
new Function("module", "exports", "require", ts.transpileModule(fs.readFileSync("src/lib/dev-bridge/ledger.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(m, m.exports, require);
const L = m.exports;
const at = min => new Date(Date.UTC(2026, 10, 23, 14, 0) + min * 60000).toISOString();
const ev = (session_id, kind, min, extra = {}) => ({ id: `${session_id}-${kind}-${min}`, source: "agent", agent_id: "miguel.claude", owner: "miguel", tool: "claude_code", session_id, kind, occurred_at: at(min), recorded_at: at(min), evidence: "VERIFIED", title: kind, evidence_url: null, issue_number: null, ...extra });

test("pauses are excluded; an open session counts only up to its last event, never until now", () => {
  const s = [ev("s1", "session_start", 0), ev("s1", "session_pause", 30), ev("s1", "session_resume", 50), ev("s1", "session_stop", 80)];
  const r = L.sessionIntervals(s);
  assert.equal(L.totalMs(r.intervals) / 60000, 60, "30 + 30 minutes, 20-minute pause excluded");
  assert.equal(r.open, false);
  const open = L.sessionIntervals([ev("s2", "session_start", 0), ev("s2", "session_checkpoint", 45)]);
  assert.equal(L.totalMs(open.intervals) / 60000, 45, "up to the last checkpoint");
  assert.equal(open.open, true);
  const interrupted = L.sessionIntervals([ev("s3", "session_start", 0), ev("s3", "session_interrupted", 10), ev("s3", "session_resume", 100), ev("s3", "session_completed", 110)]);
  assert.equal(L.totalMs(interrupted.intervals) / 60000, 20);
});

test("concurrent Claude + Codex sessions are not double counted in covered time; per-tool sums stay separate", () => {
  const sessions = [
    { id: "a", agent_id: "miguel.claude", owner: "miguel", tool: "claude_code", title: "A", status: "completed", started_at: at(0), ended_at: at(60), department: "", issue_number: null, summary: "", next_action: "" },
    { id: "b", agent_id: "miguel.codex", owner: "miguel", tool: "codex", title: "B", status: "completed", started_at: at(30), ended_at: at(90), department: "", issue_number: null, summary: "", next_action: "" },
  ];
  const events = [ev("a", "session_start", 0), ev("a", "session_stop", 60), ev("b", "session_start", 30, { tool: "codex" }), ev("b", "session_stop", 90, { tool: "codex" }),
    ev(null, "commit", 40, { source: "github", evidence: "UNKNOWN", owner: null }), ev(null, "test", 45, { evidence: "SELF_REPORTED" })];
  const st = L.ownerStats("miguel", { events, sessions, entries: [], commitments: [] }, 0, Date.parse(at(1000)));
  assert.equal(st.coveredSessionMs / 60000, 90, "union 0–90, not 60+60=120");
  assert.equal(st.byTool.claude_code.sessionMs / 60000, 60);
  assert.equal(st.byTool.codex.sessionMs / 60000, 60);
  assert.equal(st.activity.commit, undefined, "an unattributed commit is not counted for Miguel");
  assert.equal(st.activity.test, 1);
  assert.equal(st.evidence.SELF_REPORTED, 1);
  const samuel = L.ownerStats("samuel", { events, sessions, entries: [], commitments: [] }, 0, Date.parse(at(1000)));
  assert.equal(samuel.coveredSessionMs, 0, "no evidence → zero, not invented");
});

test("declared hours use only the latest correction; the original stays in the data", () => {
  const entries = [
    { id: "e1", owner: "samuel", work_date: "2026-11-23", minutes: 120, description: "x", supersedes: null, correction_reason: "", issue_number: null, evidence_url: null, created_at: at(0) },
    { id: "e2", owner: "samuel", work_date: "2026-11-23", minutes: 90, description: "x", supersedes: "e1", correction_reason: "Eran 90", issue_number: null, evidence_url: null, created_at: at(5) },
    { id: "e3", owner: "samuel", work_date: "2026-11-23", minutes: 30, description: "y", supersedes: null, correction_reason: "", issue_number: null, evidence_url: null, created_at: at(6) },
  ];
  assert.deepEqual(L.effectiveEntries(entries).map(e => e.id), ["e2", "e3"]);
  const st = L.ownerStats("samuel", { events: [], sessions: [], entries, commitments: [] }, 0, Date.parse("2026-12-01T00:00:00Z"));
  assert.equal(st.declaredMinutes, 120, "90 + 30, never 240");
});

test("CSV export quotes values and neutralises spreadsheet formulas", () => {
  const csv = L.toCsv([{ title: '=HYPERLINK("http://x")', note: 'a "b"', n: 3 }]);
  assert.equal(csv, 'title,note,n\n"\'=HYPERLINK(""http://x"")","a ""b""","3"\n');
});

test("department handoff from a ChatGPT project chat parses the standard fields (ES/EN)", () => {
  const h = L.parseHandoff(["Propietario: Miguel", "Departamento: Legal", "Tarea: Matriz de términos", "Decisiones: revisar cláusula 09", "Trabajo realizado: tabla de 23 cláusulas", "  continúa en línea 2", "Evidencia: https://github.com/a/b/issues/286", "Próximo paso: abogado"].join("\n"));
  assert.equal(h.department, "Legal");
  assert.equal(h.work, "tabla de 23 cláusulas\ncontinúa en línea 2");
  assert.equal(h.next, "abogado");
  assert.equal(L.parseHandoff("Department: QA\nNext action: run suite").next, "run suite");
});

test("GitHub mapping: commits are UNKNOWN; a PR is attributed only from exactly one owner-labelled Issue", () => {
  const sha = "a".repeat(40);
  const out = L.githubEvents({
    issues: [{ number: 1, owner: "miguel", title: "", url: "", updated_at: "" }, { number: 2, owner: "samuel", title: "", url: "", updated_at: "" }],
    pulls: [{ number: 10, title: "one", url: "https://github.com/x/pull/10", head_sha: sha, issues: [1], updated_at: at(0) },
      { number: 11, title: "both", url: "https://github.com/x/pull/11", head_sha: sha, issues: [1, 2], updated_at: at(0) }],
    commits: [{ sha, date: at(0), url: "https://github.com/x/commit/" + sha }],
  });
  assert.equal(out.find(e => e.kind === "commit").owner, undefined);
  assert.equal(out.find(e => e.ref === sha && e.title.includes("#10")).owner, "miguel");
  assert.equal(out.find(e => e.title.includes("#11")).owner, null, "ambiguous → UNKNOWN");
});

test("period presets are America/New_York calendar days and durations never round a positive value to zero", () => {
  const p = L.period("today", new Date("2026-11-23T03:30:00Z")); // 22:30 on Nov 22 in New York
  assert.equal(new Date(p.from).toISOString(), "2026-11-22T05:00:00.000Z");
  assert.equal(L.duration(20000), "<1 min");
  assert.equal(L.duration(60000), "1 min");
  assert.equal(L.duration(3 * 3600000 + 5 * 60000), "3 h 05 min");
});

test("session CLI: offline events stay queued in order, an offline start resolves its placeholder on flush, 4xx is reported not retried", async () => {
  const os = require("node:os"), path = require("node:path");
  const cliPath = path.resolve("scripts/dev-bridge/session.cjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-bridge-cli-"));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    delete require.cache[cliPath];
    const { flush } = require(cliPath);
    fs.mkdirSync(".dev-bridge");
    const items = [
      { event: { kind: "session_start", idempotency_key: "k1", title: "Dev Bridge 3.0" } },
      { event: { kind: "test", idempotency_key: "k2", session_id: "pending:k1", title: "npm test" } },
      { event: { kind: "session_stop", idempotency_key: "k3", session_id: "pending:k1", summary: "done" } },
    ];
    fs.writeFileSync(".dev-bridge/outbox.jsonl", items.map(i => JSON.stringify(i)).join("\n") + "\n");
    const state = { current: "pending:k1" };
    // Offline: nothing is lost and nothing is reordered.
    const offline = await flush({ token: "avd_x", base: "https://example.test", state, fetchImpl: async () => { throw new Error("ENOTFOUND"); } });
    assert.equal(offline.pending, 3);
    const seen = [];
    const online = async (_url, init) => {
      const body = JSON.parse(init.body); seen.push(body);
      if (body.kind === "test") return { status: 400, json: async () => ({ error: "invalid" }) };
      return { status: 200, json: async () => ({ eventId: "e-" + body.idempotency_key, sessionId: "real-session", replayed: false }) };
    };
    const back = await flush({ token: "avd_x", base: "https://example.test", state, fetchImpl: online });
    assert.equal(back.pending, 0);
    assert.deepEqual(seen.map(b => b.kind), ["session_start", "test", "session_stop"]);
    assert.equal(seen[1].session_id, "real-session", "placeholder replaced by the server-assigned id");
    assert.equal(seen[2].session_id, "real-session");
    assert.equal(back.sent.find(s => s.kind === "test").error, "invalid");
    assert.equal(state.current, null, "stop closes the local session");
    assert.equal(fs.readFileSync(".dev-bridge/outbox.jsonl", "utf8"), "");
  } finally { process.chdir(cwd); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("agent ingestion is the only Dev Bridge path outside the owner cookie gate, and it cannot use a cookie or service role", () => {
  const mw = fs.readFileSync("src/lib/supabase/middleware.ts", "utf8");
  const bypasses = [...mw.matchAll(/if \(path === "(\/api\/[^"]+)" && request\.method === "POST"\) return finish\(response\);/g)].map(x => x[1]);
  assert.deepEqual(bypasses.sort(), ["/api/creative-bridge/deliveries", "/api/dev-bridge/v1/events"], "every machine bypass is reviewed here");
  const route = fs.readFileSync("src/app/api/dev-bridge/v1/events/route.ts", "utf8");
  assert.match(route, /\^Bearer \(avd_/);
  assert.match(route, /readJson\(req, 16_384\)/);
  assert.match(route, /persistSession: false/);
  assert.match(route, /\.rpc\("dev_bridge_agent_event"/);
  assert.doesNotMatch(route, /service_role|SERVICE_ROLE|SUPABASE_SECRET|cookies\(|getOwnerSession/);
  // The export stays behind the owner session.
  assert.match(fs.readFileSync("src/app/api/dev-bridge/export/route.ts", "utf8"), /getOwnerSession\(\)/);
});
