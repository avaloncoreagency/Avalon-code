const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const MIGUEL = "00000000-0000-4000-8000-0000000000a1";
const SAMUEL = "00000000-0000-4000-8000-0000000000b2";
const STRANGER = "00000000-0000-4000-8000-0000000000c3";

test("radar rules: versioned thresholds, recorded reasons, manual rating protected, idempotent, owner-only configuration", { timeout: 120000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec("insert into auth.users(id) values('" + MIGUEL + "'),('" + SAMUEL + "'),('" + STRANGER + "')");
  for (const file of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
    if (file.startsWith("20261102053022"))
      await db.exec("insert into agency_memberships values('" + MIGUEL + "','owner'),('" +
        SAMUEL + "','owner'),('" + STRANGER + "','operator')");
  }
  const as = async (role, user) => {
    await db.exec("reset role;set request.jwt.claim.role='" + role + "';set request.jwt.claim.sub='" + user + "';set role " + role);
  };
  await as("authenticated", MIGUEL);
  await assert.rejects(
    db.query("select id,token_sha256 from crm_radar_worker_config"),
    /permission denied|policy/i,
    "even owners cannot read the server job token hash"
  );
  assert.equal((await db.query("select count(*)::int as n from crm_radar_worker_runs")).rows[0].n, 0);
  await as("authenticated", STRANGER);
  assert.equal((await db.query("select count(*)::int as n from crm_radar_worker_runs")).rows[0].n, 0);

  await as("authenticated", MIGUEL);
  const ingest = (name, ref) => db.query("select crm_radar_ingest($1::jsonb, $2)", [
    JSON.stringify([{ name, source_kind: "osm", source_ref: ref,
      lat: 25.75, lon: -80.20, industry: "dentist", source_label: "Geoapify" }]),
    "worker-synthetic-" + ref.replace(/[^a-z0-9]/gi, ""),
  ]);
  await ingest("Evidence Qualified Dental", "osm:node/worker999");
  await ingest("No Contact Synthetic", "osm:node/worker998");
  await ingest("Autonomous Website Dental", "osm:node/worker997");
  const find = name => db.query("select id from crm_prospects where company=$1", [name]).then(x => x.rows[0].id);
  const qualified = await find("Evidence Qualified Dental");
  const dnc = await find("No Contact Synthetic");
  const autoSite = await find("Autonomous Website Dental");
  const report = {
    status: "complete", identity_matched: true, warnings: [],
    suggested_needs: [{
      service: "website", state: "opportunity_to_improve", method: "website_review",
      evidence_url: "https://autonomous.example.org/", confidence: "medium",
      note: "Auditoría automática: dos omisiones técnicas observadas y comprobadas en el sitio",
    }],
  };
  await db.query(
    "insert into crm_radar_research_reports(prospect_id,website,status,report) values($1,'https://autonomous.example.org/','complete',$2::jsonb)",
    [autoSite, JSON.stringify(report)]
  );

  // Partial research cannot create a real lead.
  await db.query(
    "insert into crm_prospect_needs(prospect_id,service,state,method,confidence,evidence_url,note) values($1,'website','opportunity_to_improve','website_review','medium','https://example.org/a','Two public website defects corroborated')",
    [qualified]
  );
  assert.equal(Number((await db.query("select stars from crm_prospects where id=$1", [qualified])).rows[0].stars), 2);
  await assert.rejects(
    db.query("select crm_radar_worker_convert_verified($1)", [qualified]),
    /permission denied|service_role only/i,
    "owner's ordinary web session cannot invoke private automatic conversion"
  );

  const cases = [
    ["ecommerce", "verified_missing"],
    ["crm", "verified_missing"],
    ["receptionist", "verified_present"],
    ["marketing", "verified_present"],
  ];
  for (const [service, state] of cases) {
    await db.query(
      "insert into crm_prospect_needs(prospect_id,service,state,method,confidence,evidence_url,note) values($1,$2,$3,'website_review','high',$4,$5)",
      [qualified, service, state, "https://example.org/" + service,
        "Multiple independent verifications confirm: " + service]
    );
  }
  const score = (await db.query("select stars,confidence from crm_prospects where id=$1", [qualified])).rows[0];
  assert.equal(Number(score.stars), 4);
  assert.equal(score.confidence, "high");

  // Supabase production service_role has table privileges + bypassrls. Simulate them in CI.
  await db.exec([
    "reset role;",
    // Hosted Supabase grants service_role broad public-table privileges; the
    // PGlite fixture does not. Reproduce hosted grants ONLY in synthetic CI.
    "grant all on all tables in schema public to service_role;",
    "grant select,update on crm_prospects to service_role;",
    "grant select,insert,update on crm_leads to service_role;",
    "grant select,insert,update on crm_prospect_needs to service_role;",
    "grant select on crm_radar_research_reports to service_role;",
    "grant select on agency_memberships to service_role;",
    "grant select on crm_stages to service_role;",
    "grant usage on schema auth to service_role;",
    "grant execute on function auth.uid() to service_role;",
  ].join("\n"));
  await as("service_role", MIGUEL);
  const added = (await db.query("select crm_radar_worker_record_website_need($1) as result", [autoSite])).rows[0].result;
  assert.equal(added, true, "official-source report can create exactly one website evidence record");
  assert.equal((await db.query("select crm_radar_worker_record_website_need($1) as result", [autoSite])).rows[0].result,
    false, "worker cannot overwrite a previously verified opportunity");
  const autoScore = (await db.query("select stars,confidence from crm_prospects where id=$1", [autoSite])).rows[0];
  assert.equal(Number(autoScore.stars), 2);
  assert.equal(autoScore.confidence, "low", "one website signal never counts as high-confidence commercial proof");
  assert.equal((await db.query("select crm_radar_worker_convert_verified($1) as result", [autoSite])).rows[0].result,
    null, "two-star website optimization cannot trigger premium auto pipeline conversion");

  const decisions = async id => (await db.query("select outcome, reasons, rule_version from crm_radar_decisions where prospect_id=$1 order by decided_at, id", [id])).rows;
  // Operación 0352: without a prior owner approval a prospect is only logged as pending (even if it meets every rule).
  await as("service_role", MIGUEL);
  assert.equal((await db.query("select crm_radar_worker_convert_verified($1) as id", [qualified])).rows[0].id, null, "pending needs owner approval");
  assert.deepEqual((await decisions(qualified)).at(-1).reasons, ["owner_approval_required"]);
  await as("authenticated", MIGUEL);
  for (const id of [autoSite, qualified]) await db.query("update crm_prospects set status='approved' where id=$1", [id]);
  // Approved prospects below the rules explain themselves; repeated runs do not spam the log.
  await db.exec("reset role"); await as("service_role", MIGUEL);
  await db.query("select crm_radar_worker_convert_verified($1)", [autoSite]); await db.query("select crm_radar_worker_convert_verified($1)", [autoSite]);
  const d1 = await decisions(autoSite);
  // [0] = the earlier refusal without approval; [1] = the rules verdict after approval; the repeated runs added nothing.
  assert.equal(d1.length, 2); assert.deepEqual(d1[0].reasons, ["owner_approval_required"]); assert.equal(d1[1].outcome, "pending");
  assert.ok(d1[1].reasons.includes("stars_below_threshold") && d1[1].reasons.includes("insufficient_evidenced_services"));
  // A human-rated prospect is never auto-promoted over the human rating.
  await db.exec("reset role"); await db.query("update crm_prospects set stars_override=5, override_reason='Valoración humana de prueba' where id=$1", [qualified]); await as("service_role", MIGUEL);
  assert.equal((await db.query("select crm_radar_worker_convert_verified($1) as id", [qualified])).rows[0].id, null);
  assert.ok((await decisions(qualified)).at(-1).reasons.includes("manual_rating_requires_human"));
  await db.exec("reset role"); await db.query("update crm_prospects set stars_override=null, override_reason='' where id=$1", [qualified]); await as("service_role", MIGUEL);
  // Rules v1 promote as before (the prospect was owner-approved above) and record why.
  const lead = (await db.query("select crm_radar_worker_convert_verified($1) as id", [qualified])).rows[0].id;
  assert.ok(lead);
  assert.equal((await db.query("select crm_radar_worker_convert_verified($1) as id", [qualified])).rows[0].id, lead);
  const q = await decisions(qualified); assert.equal(q.at(-1).outcome, "promoted"); assert.equal(q.at(-1).rule_version, 1);
  assert.equal(Number((await db.query("select count(*) n from crm_leads")).rows[0].n), 1);
  // Do-not-contact is blocked with a reason.
  await db.exec("reset role"); await db.query("update crm_prospects set do_not_contact=true where id=$1", [dnc]); await as("service_role", MIGUEL);
  assert.equal((await db.query("select crm_radar_worker_convert_verified($1) as id", [dnc])).rows[0].id, null);
  assert.deepEqual((await decisions(dnc)).at(-1), { outcome: "blocked", reasons: ["do_not_contact"], rule_version: 1 });
  // Owners publish a stricter version: 5 stars required → a 4-star prospect stays pending under v2.
  await as("authenticated", MIGUEL);
  assert.equal((await db.query("select crm_radar_rules_publish(5,'high',2,12,'Más estricto') v")).rows[0].v, 2);
  await assert.rejects(db.query("select crm_radar_rules_publish(1,'low',0,1,'x')"), /radar_rules_invalid/, "cannot relax below the safety floor");
  assert.equal((await db.query("select count(*)::int n from crm_radar_rule_sets where active")).rows[0].n, 1);
  assert.deepEqual((await db.query("select version, created_by from crm_radar_rule_sets order by version")).rows.map(r => r.version), [1, 2]);
  await assert.rejects(db.query("update crm_radar_rule_sets set min_stars=3"), /permission denied/, "no direct edits to rules");
  await assert.rejects(db.query("insert into crm_radar_decisions(prospect_id,rule_version,outcome) values($1,1,'promoted')", [qualified]), /permission denied/, "decisions are written only by the worker");
  assert.ok((await db.query("select count(*)::int n from crm_radar_decisions")).rows[0].n >= 3, "owners can read the decision log");
  // Non-owners see nothing and cannot publish.
  await as("authenticated", STRANGER);
  assert.equal((await db.query("select count(*)::int n from crm_radar_decisions")).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from crm_radar_rule_sets")).rows[0].n, 0);
  await assert.rejects(db.query("select crm_radar_rules_publish(3,'medium',1,12,'x')"), /crm_forbidden/);
  await db.exec("reset role; set role anon;");
  await assert.rejects(db.query("select * from crm_radar_decisions"), /permission denied/);
});
