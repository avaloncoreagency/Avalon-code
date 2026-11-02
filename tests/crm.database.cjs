// Run with NODE_PATH pointing to an isolated QA install of @electric-sql/pglite.
// Real PostgreSQL WASM, synthetic auth schema/users, no remote connections.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  stranger = "00000000-0000-4000-8000-000000000003";
test(
  "CRM migration, persistence, RLS, constraints, conversion and audit in isolated PostgreSQL",
  { timeout: 60000 },
  async (t) => {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${owner}'),('${other}'),('${stranger}');`,
    );
    await db.exec(
      fs.readFileSync(
        "supabase/migrations/20261102053022_avalon_owner_memberships_rls.sql",
        "utf8",
      ),
    );
    await db.exec(
      `insert into agency_memberships(user_id,role) values('${owner}','owner'),('${other}','owner');`,
    );
    await db.exec(
      fs.readFileSync(
        "supabase/migrations/20261102081000_crm_core.sql",
        "utf8",
      ),
    );
    async function as(user) {
      await db.exec(
        `reset role;set request.jwt.claim.sub='${user}';set role authenticated;`,
      );
    }
    await as(owner);
    const lead = (
      await db.query(
        `insert into crm_leads(company,source,owner_id,email) values('Synthetic','manual','${owner}','test@example.invalid') returning *`,
      )
    ).rows[0];
    assert.equal(lead.version, 1);
    assert.equal(lead.created_by, owner);
    assert.equal(
      (await db.query("select count(*)::int n from crm_audit")).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query(
        `insert into crm_leads(company,source,owner_id,email) values('Other','manual','${owner}','TEST@example.invalid')`,
      ),
      /duplicate/i,
    );
    await assert.rejects(
      db.query(`update crm_leads set stage_id='lost' where id='${lead.id}'`),
      /Motivo/,
    );
    await db.query(
      `update crm_leads set stage_id='lost',loss_reason='Synthetic reason' where id='${lead.id}'`,
    );
    assert.equal(
      (await db.query("select version from crm_leads")).rows[0].version,
      2,
    );
    const activity = (
      await db.query(
        `insert into crm_activities(lead_id,body) values('${lead.id}','Synthetic note') returning *`,
      )
    ).rows[0];
    assert.equal(activity.created_by, owner);
    await db.query(
      `insert into crm_events(title,owner_id,starts_at,ends_at,timezone,kind) values('Synthetic call','${owner}','2026-11-01T10:00Z','2026-11-01T11:00Z','UTC','call')`,
    );
    await assert.rejects(
      db.query(
        `insert into crm_events(title,owner_id,starts_at,ends_at,timezone,kind) values('Overlap','${owner}','2026-11-01T10:30Z','2026-11-01T12:00Z','UTC','call')`,
      ),
      /Conflicto/,
    );
    await db.query(
      `insert into crm_events(title,owner_id,starts_at,ends_at,timezone,kind) values('Adjacent','${owner}','2026-11-01T11:00Z','2026-11-01T12:00Z','UTC','call')`,
    );
    const p = (
      await db.query(
        `insert into crm_prospects(company,source,owner_id,opportunity,acquired_at) values('Prospect','manual','${owner}','Documented',now()) returning id`,
      )
    ).rows[0].id;
    await assert.rejects(
      db.query(`select crm_convert_prospect('${p}')`),
      /aprueba/,
    );
    await db.query(
      `update crm_prospects set status='approved' where id='${p}'`,
    );
    const converted = (await db.query(`select crm_convert_prospect('${p}') id`))
      .rows[0].id;
    assert.equal(
      (await db.query(`select crm_convert_prospect('${p}') id`)).rows[0].id,
      converted,
    );
    await db.query(
      `insert into crm_usage(provider,amount,unit,period_start,period_end,source) values('Codex',4,'credits','2026-11-01Z','2026-12-01Z','Manual fixture')`,
    );
    await as(other);
    assert.equal(
      (await db.query("select count(*)::int n from crm_leads")).rows[0].n,
      2,
    );
    await assert.rejects(
      db.query("delete from crm_leads"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update crm_audit set operation='INSERT'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update agency_memberships set role='admin'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        `insert into crm_leads(agency_key,company,source,owner_id) values('other','No','manual','${other}')`,
      ),
      /policy|constraint/,
    );
    await as(stranger);
    for (const table of [
      "crm_leads",
      "crm_events",
      "crm_prospects",
      "crm_usage",
      "crm_activities",
      "crm_stages",
      "crm_audit",
    ])
      assert.equal(
        (await db.query(`select count(*)::int n from ${table}`)).rows[0].n,
        0,
      );
    await assert.rejects(
      db.query(
        `insert into crm_leads(company,source,owner_id) values('No','manual','${owner}')`,
      ),
      /forbidden|policy/i,
    );
    await assert.rejects(
      db.query(`select crm_convert_prospect('${p}')`),
      /forbidden/i,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from crm_leads"),
      /permission denied/,
    );
    t.diagnostic(
      "Real PostgreSQL: owner/shared owner, outsider, anon, immutable audit, duplicate, lost reason, calendar overlap, atomic/idempotent conversion all exercised.",
    );
  },
);
