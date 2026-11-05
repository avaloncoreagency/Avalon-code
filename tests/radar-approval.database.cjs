// Radar P0 (Operación 0352): automatic conversion needs a prior, verifiable owner approval. Isolated PostgreSQL (PGlite) + RLS,
// synthetic data only. Negative tests first: the worker can never approve, a forged jwt.claim.sub is not an owner session.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const MIGUEL = "00000000-0000-4000-8000-0000000000a1";
const SAMUEL = "00000000-0000-4000-8000-0000000000b2";
const STRANGER = "00000000-0000-4000-8000-0000000000c3";

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec("insert into auth.users(id) values('" + MIGUEL + "'),('" + SAMUEL + "'),('" + STRANGER + "')");
  for (const file of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
    if (file.startsWith("20261102053022"))
      await db.exec("insert into agency_memberships values('" + MIGUEL + "','owner'),('" + SAMUEL + "','owner'),('" + STRANGER + "','operator')");
  }
  const as = (role, user) => db.exec("reset role;set request.jwt.claim.role='" + role + "';set request.jwt.claim.sub='" + user + "';set role " + role);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  // Hosted Supabase grants service_role broad table privileges; reproduce them ONLY in synthetic CI.
  await db.exec([
    "grant all on all tables in schema public to service_role;", "grant usage on schema auth to service_role;",
    "grant execute on function auth.uid() to service_role;",
  ].join("\n"));
  await as("authenticated", MIGUEL);
  let n = 0;
  // A prospect that meets every Radar rule (4 stars, high confidence, 2+ strongly evidenced services).
  const qualified = async (name) => {
    n++;
    await db.query("select crm_radar_ingest($1::jsonb,$2)", [JSON.stringify([{ name, source_kind: "osm", source_ref: "osm:node/appr" + n, lat: 25.75, lon: -80.2, industry: "dentist", source_label: "Geoapify" }]), "approval-synthetic-" + n]);
    const id = (await one("select id from crm_prospects where company=$1", [name])).id;
    for (const [service, state] of [["ecommerce", "verified_missing"], ["crm", "verified_missing"], ["receptionist", "verified_present"], ["marketing", "verified_present"], ["website", "opportunity_to_improve"]]) {
      await db.query("insert into crm_prospect_needs(prospect_id,service,state,method,confidence,evidence_url,note) values($1,$2,$3,'website_review','high',$4,$5)",
        [id, service, state, "https://example.org/" + service + n, "Multiple independent verifications confirm: " + service]);
    }
    return id;
  };
  const decisions = id => q("select outcome, reasons, approval_id, approved_by from crm_radar_decisions where prospect_id=$1 order by decided_at, id", [id]);
  const convert = async id => { await as("service_role", MIGUEL); const r = (await one("select crm_radar_worker_convert_verified($1) as r", [id])).r; await as("authenticated", MIGUEL); return r; };
  const status = async id => (await one("select status from crm_prospects where id=$1", [id])).status;
  return { db, as, q, one, qualified, decisions, convert, status };
}

test("worker cannot approve: a qualified PENDING prospect is refused, stays pending and the reason is logged", { timeout: 180000 }, async t => {
  const { db, as, q, qualified, decisions, convert, status } = await setup(); t.after(() => db.close());
  const id = await qualified("Pending Qualified Dental");
  assert.equal(await convert(id), null);
  assert.equal(await status(id), "pending", "the worker did not change the status");
  assert.equal((await q("select count(*)::int n from crm_leads"))[0].n, 0);
  const d = await decisions(id);
  assert.deepEqual([d.at(-1).outcome, d.at(-1).reasons, d.at(-1).approval_id], ["pending", ["owner_approval_required"], null]);
  await convert(id); assert.equal((await decisions(id)).length, d.length, "repeated runs do not spam the log");
  // The worker itself, even when it impersonates an owner through jwt.claim.sub, cannot move a prospect to approved.
  await as("service_role", MIGUEL);
  await assert.rejects(db.query("update crm_prospects set status='approved' where id=$1", [id]), /owner_approval_required/);
  await as("service_role", SAMUEL);
  await assert.rejects(db.query("update crm_prospects set status='approved' where id=$1", [id]), /owner_approval_required/, "forged owner identity is not an owner session");
  await db.exec("reset role");
  await assert.rejects(db.query("update crm_prospects set status='approved' where id=$1", [id]), /owner_approval_required/, "even a privileged DB session needs a recorded approval");
  assert.equal(await status(id), "pending");
  assert.equal((await q("select count(*)::int n from crm_prospect_approvals"))[0].n, 0, "no approval row was fabricated");
});

test("non-owners cannot approve; approvals table is owner-read only and not writable by clients", { timeout: 180000 }, async t => {
  const { db, as, q, qualified, status } = await setup(); t.after(() => db.close());
  const id = await qualified("Stranger Cannot Approve");
  await as("authenticated", STRANGER);
  const upd = await db.query("update crm_prospects set status='approved' where id=$1 returning id", [id]).catch(e => e);
  assert.ok(upd instanceof Error || upd.rows.length === 0, "operator update is blocked by RLS or the guard");
  await assert.rejects(db.query("select crm_prospect_approve($1,'x')", [id]), /crm_forbidden/);
  await as("authenticated", MIGUEL);
  assert.equal(await status(id), "pending", "the operator's attempts changed nothing");
  await assert.rejects(db.query("insert into crm_prospect_approvals(prospect_id,approved_by,source) values($1,$2,'owner_rpc')", [id, MIGUEL]), /permission denied/, "no client can write evidence directly");
  await assert.rejects(db.query("update crm_prospect_approvals set revoked_at=now()"), /permission denied/);
  await as("authenticated", STRANGER);
  assert.equal((await q("select count(*)::int n from crm_prospect_approvals"))[0].n, 0);
  await as("anon", STRANGER);
  await assert.rejects(db.query("select count(*) from crm_prospect_approvals"), /permission denied/);
});

test("owner approval (UI path and RPC) is recorded with approver and enables ONE idempotent conversion under the approver", { timeout: 180000 }, async t => {
  const { db, as, q, one, qualified, decisions, convert, status } = await setup(); t.after(() => db.close());
  const viaUi = await qualified("Approved By Miguel Dental");
  await as("authenticated", MIGUEL);
  await db.query("update crm_prospects set status='approved' where id=$1", [viaUi]);
  const ap = await one("select approved_by, source, revoked_at from crm_prospect_approvals where prospect_id=$1", [viaUi]);
  assert.deepEqual([ap.approved_by, ap.source, ap.revoked_at], [MIGUEL, "owner_session", null], "who approved is recorded, not invented");
  const lead = await convert(viaUi);
  assert.ok(lead);
  assert.equal(await convert(viaUi), lead, "idempotent: same lead");
  assert.equal((await q("select count(*)::int n from crm_leads where prospect_id=$1", [viaUi]))[0].n, 1, "no duplicate lead");
  assert.deepEqual(await one("select owner_id, created_by from crm_leads where id=$1", [lead]), { owner_id: MIGUEL, created_by: MIGUEL });
  const d = (await decisions(viaUi)).at(-1);
  assert.deepEqual([d.outcome, d.reasons, d.approved_by], ["promoted", ["meets_active_rules", "owner_approved"], MIGUEL]);
  assert.ok(d.approval_id);
  assert.equal(await status(viaUi), "converted");

  const viaRpc = await qualified("Approved By Samuel Dental");
  await as("authenticated", SAMUEL);
  const id = (await one("select crm_prospect_approve($1,'Revisado con evidencia en la ficha') as id", [viaRpc])).id;
  assert.ok(id);
  assert.equal((await one("select crm_prospect_approve($1,'otra vez') as id", [viaRpc])).id, id, "approving twice returns the same approval");
  assert.deepEqual(await one("select approved_by, source, note from crm_prospect_approvals where id=$1", [id]), { approved_by: SAMUEL, source: "owner_rpc", note: "Revisado con evidencia en la ficha" });
  const lead2 = await convert(viaRpc);
  assert.deepEqual(await one("select owner_id from crm_leads where id=$1", [lead2]), { owner_id: SAMUEL }, "the lead belongs to the approving owner");
  assert.equal((await q("select count(*)::int n from crm_leads"))[0].n, 2);
});

test("rejected, do_not_contact, revoked and legacy-approved-without-evidence are all refused with a logged reason", { timeout: 180000 }, async t => {
  const { db, as, q, qualified, decisions, convert, status } = await setup(); t.after(() => db.close());
  await as("authenticated", MIGUEL);
  const rejected = await qualified("Rejected Dental");
  await db.query("update crm_prospects set status='rejected' where id=$1", [rejected]);
  assert.equal(await convert(rejected), null);
  assert.deepEqual((await decisions(rejected)).at(-1).reasons, ["rejected_by_human"]);

  const dnc = await qualified("Do Not Contact Dental");
  await db.query("update crm_prospects set status='approved' where id=$1", [dnc]);
  await db.query("update crm_prospects set do_not_contact=true where id=$1", [dnc]);
  assert.equal(await convert(dnc), null, "an owner approval does not override do_not_contact");
  assert.deepEqual((await decisions(dnc)).at(-1).reasons, ["do_not_contact"]);

  const revoked = await qualified("Revoked Dental");
  await db.query("update crm_prospects set status='approved' where id=$1", [revoked]);
  await db.query("update crm_prospects set status='pending' where id=$1", [revoked]);
  assert.ok((await q("select revoked_at, revoked_by from crm_prospect_approvals where prospect_id=$1", [revoked]))[0].revoked_at, "leaving approved revokes the approval");
  assert.equal(await convert(revoked), null);
  assert.deepEqual((await decisions(revoked)).at(-1).reasons, ["owner_approval_required"]);

  // Legacy row: status=approved but no approval evidence (e.g. written before this migration). Never convertible.
  const legacy = await qualified("Legacy Approved Dental");
  await db.exec("reset role; alter table crm_prospects disable trigger crm_prospects_approval_guard; alter table crm_prospects disable trigger crm_prospects_approval_evidence");
  await db.query("update crm_prospects set status='approved' where id=$1", [legacy]);
  await db.exec("alter table crm_prospects enable trigger crm_prospects_approval_guard; alter table crm_prospects enable trigger crm_prospects_approval_evidence");
  assert.equal((await q("select count(*)::int n from crm_prospect_approvals where prospect_id=$1", [legacy]))[0].n, 0);
  assert.equal(await convert(legacy), null);
  assert.deepEqual((await decisions(legacy)).at(-1).reasons, ["approval_not_verifiable"]);
  assert.equal(await status(legacy), "approved");

  // An approval by someone who is no longer an owner does not count.
  const demoted = await qualified("Demoted Approver Dental");
  await as("authenticated", SAMUEL);
  await db.query("update crm_prospects set status='approved' where id=$1", [demoted]);
  await db.exec("reset role; delete from agency_memberships where user_id='" + SAMUEL + "'");
  assert.equal(await convert(demoted), null);
  assert.deepEqual((await decisions(demoted)).at(-1).reasons, ["approval_not_verifiable"]);
  assert.equal((await q("select count(*)::int n from crm_leads"))[0].n, 0, "none of the refused prospects became a lead");
});

test("approval does not bypass the Radar rules (stars/evidence) and a converted prospect stays immutable", { timeout: 180000 }, async t => {
  const { db, as, q, one, convert, decisions } = await setup(); t.after(() => db.close());
  await as("authenticated", MIGUEL);
  await db.query("select crm_radar_ingest($1::jsonb,$2)", [JSON.stringify([{ name: "Weak Evidence Dental", source_kind: "osm", source_ref: "osm:node/weak1", lat: 25.7, lon: -80.2, industry: "dentist", source_label: "Geoapify" }]), "approval-weak"]);
  const weak = (await one("select id from crm_prospects where company='Weak Evidence Dental'")).id;
  await db.query("update crm_prospects set status='approved' where id=$1", [weak]);
  assert.equal(await convert(weak), null, "owner approval alone is not enough: rules still apply");
  const d = (await decisions(weak)).at(-1);
  assert.equal(d.outcome, "pending");
  assert.ok(d.reasons.includes("stars_below_threshold") && d.reasons.includes("insufficient_evidenced_services"));
  assert.ok(d.approval_id && d.approved_by === MIGUEL, "the decision still records who approved");
  assert.equal((await q("select count(*)::int n from crm_leads"))[0].n, 0);
  // The worker function stays service_role-only.
  await assert.rejects(db.query("select crm_radar_worker_convert_verified($1)", [weak]), /service_role only|permission denied/);
});
