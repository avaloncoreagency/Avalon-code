// Product delivery guard on real PostgreSQL (PGlite). Synthetic data only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const OWNER = "00000000-0000-4000-8000-0000000000a1", SECOND = "00000000-0000-4000-8000-0000000000b2";

test("delivery lifecycle is enforced by the database: transitions, append-only history, actor, evidence", { timeout: 240000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec(`insert into auth.users(id,email) values ('${OWNER}','o@example.invalid'),('${SECOND}','s@example.invalid');`);
  for (const f of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + f, "utf8"));
    if (f.startsWith("20261102053022")) await db.exec(`insert into agency_memberships values ('${OWNER}','owner'),('${SECOND}','owner');`);
  }
  await db.exec(`reset role; set request.jwt.claim.sub='${OWNER}'; set role authenticated;`);
  const id = (await db.query("insert into os_projects(module,name,settings) values('website','Web Barbería QA','{}') returning id")).rows[0].id;
  const get = async () => (await db.query("select settings from os_projects where id=$1", [id])).rows[0].settings;
  const set = settings => db.query("update os_projects set settings=$2::jsonb where id=$1", [id, JSON.stringify(settings)]);
  const ev = (from, to, extra = {}) => ({ from, to, at: "2026-11-19T00:00:00Z", by: OWNER, note: "", evidence_url: "", ...extra });

  await assert.rejects(set({ delivery: { stage: "live_verified", history: [ev("draft", "live_verified")] } }), /delivery_invalid_transition/);
  await assert.rejects(set({ delivery: { stage: "in_development", history: [] } }), /delivery_history_append_only/);
  await assert.rejects(set({ delivery: { stage: "in_development", history: [ev("draft", "in_development", { by: SECOND })] } }), /delivery_actor_mismatch/);
  const h1 = [ev("draft", "in_development")];
  await set({ delivery: { stage: "in_development", history: h1 } });
  // Rewriting history is refused.
  await assert.rejects(set({ delivery: { stage: "in_review", history: [ev("draft", "in_review"), ev("in_review", "in_review")] } }), /delivery_history_append_only|delivery_invalid_transition/);
  // A writer that drops the key keeps the recorded lifecycle.
  await set({ operations: { url: "" } });
  assert.equal((await get()).delivery.stage, "in_development");

  const h2 = [...h1, ev("in_development", "in_review"), ev("in_review", "ready_to_deliver")];
  await set({ delivery: { stage: "in_review", history: h2.slice(0, 2) } });
  await set({ delivery: { stage: "ready_to_deliver", history: h2 } });
  await assert.rejects(set({ delivery: { stage: "delivered", history: [...h2, ev("ready_to_deliver", "delivered")] } }), /delivery_note_required/);
  const h3 = [...h2, ev("ready_to_deliver", "delivered", { note: "Entregado al cliente por correo" })];
  await set({ delivery: { stage: "delivered", history: h3 } });
  const live = ev("delivered", "live_verified", { note: "Revisado en su dominio" });
  await assert.rejects(set({ delivery: { stage: "live_verified", history: [...h3, live] } }), /delivery_url_required/);
  await assert.rejects(set({ operations: { url: "https://example.test" }, delivery: { stage: "live_verified", history: [...h3, live] } }), /delivery_evidence_required/);
  await set({ operations: { url: "https://example.test" }, delivery: { stage: "live_verified", history: [...h3, { ...live, evidence_url: "https://example.test/" }] } });
  assert.equal((await get()).delivery.stage, "live_verified");
  assert.equal((await get()).delivery.history.length, 5);
});
