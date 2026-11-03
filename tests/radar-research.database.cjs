const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const MIGUEL = "00000000-0000-4000-8000-0000000000a1";
const SAMUEL = "00000000-0000-4000-8000-0000000000b2";
const STRANGER = "00000000-0000-4000-8000-0000000000c3";

test("research report is append-only, owner-only and never converts unverified prospects", { timeout: 120000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec("insert into auth.users(id) values('" + MIGUEL + "'),('" + SAMUEL + "'),('" + STRANGER + "');");
  for (const file of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
    if (file.startsWith("20261102053022"))
      await db.exec("insert into agency_memberships values('" + MIGUEL + "','owner'),('" +
        SAMUEL + "','owner'),('" + STRANGER + "','operator');");
  }
  const as = async uid => db.exec("reset role;set request.jwt.claim.sub='" + uid + "';set role authenticated;");
  const count = async table => Number((await db.query("select count(*) n from " + table)).rows[0].n);
  await as(MIGUEL);
  await db.query("select crm_radar_ingest($1::jsonb, $2)", [
    JSON.stringify([{ name: "Synthetic Research Dentist", source_kind: "osm", source_ref: "osm:node/12345",
      lat: 25.75, lon: -80.20, industry: "dentist", source_label: "Geoapify", website: "https://example.org" }]),
    "research-run-0001",
  ]);
  const business = (await db.query("select id from crm_prospects where source_ref='osm:node/12345'")).rows[0];
  assert.ok(business.id);
  assert.equal(await count("crm_leads"), 0);

  const report = { status: "limited", website: "https://example.org", researched_at: new Date().toISOString(),
    pages: [{ url: "https://example.org/", status: 200 }], signals: [], suggested_needs: [],
    unverified: ["CRM interno"], identity_matched: false, warnings: [], confidence: "low" };
  await db.query("insert into crm_radar_research_reports(prospect_id,website,status,report) values($1,$2,$3,$4::jsonb)",
    [business.id, "https://example.org/", "limited", JSON.stringify(report)]);
  assert.equal(await count("crm_radar_research_reports"), 1);
  assert.equal(await count("crm_leads"), 0);
  assert.equal((await db.query("select stars from crm_prospects where id=$1", [business.id])).rows[0].stars, null);
  // The automatic scanner must not invent a need merely because a website
  // exists. One verified narrow technical improvement may justify two stars,
  // but never a 4-5 star major-opportunity label.
  await db.query(
    "insert into crm_prospect_needs(prospect_id, service, state, method, confidence, evidence_url, note) values($1,'website','verified_present','website_review','medium','https://example.org/','Web oficial verificada')",
    [business.id],
  );
  assert.equal((await db.query("select stars from crm_prospects where id=$1", [business.id])).rows[0].stars,
    null, "website merely present cannot create a sales rating");
  await db.query(
    "update crm_prospect_needs set state='opportunity_to_improve', note='Se comprobaron dos problemas técnicos visibles, no ausencia de CRM' where prospect_id=$1 and service='website'",
    [business.id],
  );
  const scored = (await db.query("select stars,confidence from crm_prospects where id=$1", [business.id])).rows[0];
  assert.equal(Number(scored.stars), 2, "one proven narrow optimization earns exactly two stars");
  assert.equal(scored.confidence, "low", "a single website is low overall confidence");
  assert.equal(await count("crm_leads"), 0, "auto research never pushes speculative cards to pipeline");

  await assert.rejects(db.query(
    "update crm_radar_research_reports set status='complete' where prospect_id=$1", [business.id]),
    /permission denied|policy|privilege/i, "research records are immutable without an owner-write endpoint");

  await as(STRANGER);
  assert.equal(await count("crm_radar_research_reports"), 0, "non-owner cannot read the report");
  await assert.rejects(db.query(
    "insert into crm_radar_research_reports(prospect_id,website,status,report) values($1,$2,$3,$4::jsonb)",
    [business.id, "https://example.org/", "complete", JSON.stringify(report)]),
    /row-level security|policy|permission denied/i, "employee without owner cannot insert research evidence");

  await as(SAMUEL);
  assert.equal(await count("crm_radar_research_reports"), 1, "both owners can access agency research");
});
