const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const MIGUEL = "00000000-0000-4000-8000-0000000000a1";
const SAMUEL = "00000000-0000-4000-8000-0000000000b2";
const STRANGER = "00000000-0000-4000-8000-0000000000c3";

test("radar automatically gives public listings 1-2 provisional stars, upgrades only on verified needs", { timeout: 120000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec("insert into auth.users(id) values('" + MIGUEL + "'),('" + SAMUEL + "'),('" + STRANGER + "');");
  for (const filename of fs.readdirSync("supabase/migrations").filter(x => x.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + filename, "utf8"));
    if (filename.startsWith("20261102053022")) {
      await db.exec("insert into agency_memberships values('" + MIGUEL + "','owner'),('" +
        SAMUEL + "','owner'),('" + STRANGER + "','operator');");
    }
  }
  await db.exec("reset role;set request.jwt.claim.sub='" + MIGUEL + "';set role authenticated;");
  const source = "osm:node/30001";
  const first = {
    name: "Synthetic Harbor Design Co", source_kind: "osm", source_ref: source,
    lat: 25.75, lon: -80.2, industry: "building", category: "building",
    phone: "", website: "", source_label: "Geoapify", license: "ODbL",
  };
  const ingest = async (place, key) => db.query("select crm_radar_ingest($1::jsonb,$2) as result", [JSON.stringify([place]), key]);
  await ingest(first, "profile-synthetic-first");
  const get = async () => (await db.query("select id,stars,confidence,stars_reasons,stars_override,status from crm_prospects where source_ref=$1", [source])).rows[0];
  let row = await get();
  assert.equal(Number(row.stars), 1, "source-backed public listing gets one investigative star without a website");
  assert.equal(row.confidence, "low", "directory listing never implies high commercial confidence");
  assert.ok(row.stars_reasons.some(x => x.startsWith("Precalificación automática:")));
  assert.ok(row.stars_reasons.some(x => x.includes("Sin necesidad comercial demostrada")));
  assert.equal(Number((await db.query("select count(*) n from crm_leads")).rows[0].n), 0, "no lead created by map discovery");

  await ingest({ ...first, phone: "+1 305 555 0100", website: "https://harbor.example.com" },
    "profile-synthetic-contact");
  row = await get();
  assert.equal(Number(row.stars), 2, "public website and phone are two contactability signals, not a missing CRM");
  assert.equal(row.confidence, "low");
  assert.ok(row.stars_reasons.some(x => x.startsWith("Precalificación automática:")));
  assert.ok(!row.stars_reasons.some(x => /necesidad verificada.*[1-9]/.test(x)), "no invented commercial need");

  await db.query(
    "insert into crm_prospect_needs(prospect_id,service,state,method,confidence,evidence_url,note) values($1,'website','verified_missing','call','high','https://harbor.example.com','Owner personally verified a concrete website need')",
    [row.id]
  );
  row = await get();
  assert.equal(Number(row.stars), 3, "a documented, confirmed service need supersedes preliminary contactability tier");
  assert.equal(row.confidence, "low", "one verified service is still incomplete overall evidence");
  assert.ok(!row.stars_reasons.some(x => x.startsWith("Precalificación automática:")));
  assert.equal(Number((await db.query("select count(*) n from crm_leads")).rows[0].n), 0,
    "even a 3-star verified need never auto-converts without promotion criteria");

  await db.query("update crm_prospects set website='https://harbor.example.com/contact' where id=$1", [row.id]);
  assert.equal(Number((await get()).stars), 3, "refreshing public profile never overwrites verified need-based tier");
});
