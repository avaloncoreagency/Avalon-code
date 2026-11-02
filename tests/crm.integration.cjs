// Production Next.js -> synthetic Auth/PostgREST bridge -> real isolated PostgreSQL.
// NODE_PATH must include @electric-sql/pglite; CRM_BROWSER=1 additionally needs playwright.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const owner = "00000000-0000-4000-8000-000000000001",
  outsider = "00000000-0000-4000-8000-000000000003";
const routes = ["", "/leads", "/calendar", "/kpis", "/hunter", "/ai-usage"];
const api = "/admin/workspace/crm/api";
test(
  "CRM owner CRUD and RLS over production HTTP and PostgreSQL",
  { timeout: 120000 },
  async (t) => {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${owner}'),('${outsider}');`,
    );
    await db.exec(
      fs.readFileSync(
        "supabase/migrations/20261102053022_avalon_owner_memberships_rls.sql",
        "utf8",
      ),
    );
    await db.exec(
      `insert into agency_memberships(user_id,role) values('${owner}','owner');`,
    );
    await db.exec(
      fs.readFileSync(
        "supabase/migrations/20261102081000_crm_core.sql",
        "utf8",
      ),
    );
    const tokens = new Map();
    function session(id) {
      const user = {
        id,
        email: "synthetic@example.invalid",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: { provider: "google" },
        user_metadata: {},
        identities: [],
        created_at: "2026-01-01T00:00:00Z",
      };
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const enc = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
      const access_token = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: id, exp, role: "authenticated" })}.synthetic`;
      tokens.set(access_token, user);
      return {
        access_token,
        refresh_token: "synthetic",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: exp,
        user,
      };
    }
    const ownerSession = session(owner),
      outsiderSession = session(outsider);
    let queue = Promise.resolve(),
      unavailable = false;
    const tables = [
      "agency_memberships",
      "crm_stages",
      "crm_leads",
      "crm_events",
      "crm_activities",
      "crm_prospects",
      "crm_usage",
      "crm_audit",
    ];
    const identifier = (x) => {
      assert.match(x, /^[a-z_]+$/);
      return '"' + x + '"';
    };
    const remote = createServer((req, res) => {
      queue = queue
        .then(async () => {
          const url = new URL(req.url, "http://localhost");
          const identity = tokens.get(
            req.headers.authorization?.replace("Bearer ", ""),
          );
          const json = (status, value, headers = {}) => {
            res.writeHead(status, {
              "Content-Type": "application/json",
              ...headers,
            });
            res.end(JSON.stringify(value));
          };
          if (url.pathname === "/auth/v1/user")
            return identity
              ? json(200, identity)
              : json(401, { message: "Invalid synthetic user" });
          if (!identity) return json(401, { message: "No identity" });
          const table = url.pathname.split("/").pop();
          if (!tables.includes(table) && table !== "crm_convert_prospect")
            return json(404, { message: "Unknown fixture route" });
          if (unavailable && table === "crm_stages")
            return json(404, {
              code: "42P01",
              message: "Fixture: migration missing",
            });
          await db.exec(
            `reset role;set request.jwt.claim.sub='${identity.id}';set role authenticated;`,
          );
          try {
            let raw = "";
            for await (const chunk of req) raw += chunk;
            const body = raw ? JSON.parse(raw) : null;
            let data = [];
            const values = [];
            const param = (v) => {
              values.push(v);
              return "$" + values.length;
            };
            const conditions = [];
            for (const [key, v] of url.searchParams) {
              if (
                [
                  "select",
                  "order",
                  "offset",
                  "limit",
                  "or",
                  "columns",
                ].includes(key)
              )
                continue;
              const dot = v.indexOf("."),
                op = v.slice(0, dot),
                val = v.slice(dot + 1);
              const operator = { eq: "=", gte: ">=", lt: "<", ilike: "ilike" }[
                op
              ];
              if (!operator)
                throw new Error("Fixture filter not implemented: " + op);
              conditions.push(
                `${identifier(key)} ${operator} ${param(key === "archived" ? val === "true" : val)}`,
              );
            }
            if (url.searchParams.get("or")) {
              const parts = url.searchParams.get("or").slice(1, -1).split(",");
              conditions.push(
                "(" +
                  parts
                    .map((part) => {
                      const [column, op, ...value] = part.split(".");
                      assert.equal(op, "ilike");
                      return `${identifier(column)} ilike ${param(value.join("."))}`;
                    })
                    .join(" or ") +
                  ")",
              );
            }
            const where = conditions.length
              ? " where " + conditions.join(" and ")
              : "";
            if (table === "crm_convert_prospect") {
              data = (
                await db.query("select crm_convert_prospect($1) id", [
                  body.prospect_id,
                ])
              ).rows[0].id;
              return json(200, data);
            }
            if (req.method === "POST") {
              await db.exec("begin");
              try {
                for (const row of Array.isArray(body) ? body : [body]) {
                  const keys = Object.keys(row);
                  const sql = `insert into ${identifier(table)}(${keys.map(identifier).join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`;
                  data.push(
                    ...(
                      await db.query(
                        sql,
                        keys.map((k) => row[k]),
                      )
                    ).rows,
                  );
                }
                await db.exec("commit");
              } catch (e) {
                await db.exec("rollback");
                throw e;
              }
            } else if (req.method === "PATCH") {
              const sets = Object.keys(body).map(
                (k) => `${identifier(k)}=${param(body[k])}`,
              );
              data = (
                await db.query(
                  `update ${identifier(table)} set ${sets.join(",")}${where} returning *`,
                  values,
                )
              ).rows;
            } else {
              const count = (
                await db.query(
                  `select count(*)::int n from ${identifier(table)}${where}`,
                  values,
                )
              ).rows[0].n;
              const order = (url.searchParams.get("order") ?? "")
                .split(",")
                .filter(Boolean)
                .map((v) => {
                  const [key, dir] = v.split(".");
                  return identifier(key) + (dir === "desc" ? " desc" : " asc");
                })
                .join(",");
              const limit = Number(url.searchParams.get("limit") ?? 1000),
                offset = Number(url.searchParams.get("offset") ?? 0);
              data = (
                await db.query(
                  `select * from ${identifier(table)}${where}${order ? " order by " + order : ""} limit ${limit} offset ${offset}`,
                  values,
                )
              ).rows;
              res.setHeader(
                "content-range",
                `${offset}-${offset + data.length - 1}/${count}`,
              );
            }
            const object = req.headers.accept?.includes("vnd.pgrst.object");
            return json(
              req.method === "POST" ? 201 : 200,
              object ? data[0] : data,
            );
          } catch (e) {
            return json(e.code === "42501" ? 403 : 400, {
              code: e.code ?? "XX000",
              message: e.message,
            });
          }
        })
        .catch((e) => {
          res.writeHead(500);
          res.end(JSON.stringify({ message: e.message }));
        });
    });
    await new Promise((r) => remote.listen(0, "127.0.0.1", r));
    t.after(() => new Promise((r) => remote.close(r)));
    const reservation = createServer();
    await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
    const port = reservation.address().port;
    await new Promise((r) => reservation.close(r));
    const origin = `http://localhost:${port}`,
      remoteOrigin = `http://127.0.0.1:${remote.address().port}`;
    const child = spawn(
      process.execPath,
      [require.resolve("next/dist/bin/next"), "start", "-p", String(port)],
      {
        env: {
          ...process.env,
          APP_ORIGIN: origin,
          NEXT_PUBLIC_SUPABASE_URL: remoteOrigin,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-key",
          AUTH_PASSWORD_LOGIN_ENABLED: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (c) => (output += c));
    child.stderr.on("data", (c) => (output += c));
    t.after(async () => {
      child.kill();
      await new Promise((r) => child.once("exit", r));
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      if (i === 99) assert.fail(output);
      await new Promise((r) => setTimeout(r, 100));
    }
    const cookieName = "sb-127-auth-token",
      cookie = (s) =>
        `${cookieName}=base64-${Buffer.from(JSON.stringify(s)).toString("base64url")}`;
    const req = (path, options = {}, s = ownerSession) =>
      fetch(origin + path, {
        redirect: "manual",
        ...options,
        headers: { cookie: s ? cookie(s) : "", ...options.headers },
      });
    const post = (body, originHeader = origin) =>
      req(api, {
        method: "POST",
        headers: { origin: originHeader, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    for (const suffix of routes) {
      assert.equal(
        (await req("/admin/workspace/crm" + suffix, {}, null)).status,
        307,
      );
      assert.equal(
        (await req("/admin/workspace/crm" + suffix, {}, outsiderSession))
          .status,
        307,
      );
      assert.equal((await req("/admin/workspace/crm" + suffix)).status, 200);
    }
    assert.equal((await req("/admin/workspace/crm/unknown")).status, 404);
    assert.equal((await req(api, {}, outsiderSession)).status, 307);
    assert.equal((await post({}, "https://attacker.invalid")).status, 403);
    assert.equal(
      (await post({ entity: "leads", values: { company: "Invalid" } })).status,
      400,
    );
    const values = {
      company: "Synthetic HTTP",
      contact: "Tester",
      email: "http@example.invalid",
      phone: "",
      source: "fixture",
      owner_id: owner,
      stage_id: "new",
      value: 100,
      probability: 50,
      priority: "normal",
    };
    let response = await post({ entity: "leads", values });
    assert.equal(response.status, 201, await response.clone().text());
    const created = await response.json();
    assert.equal((await post({ entity: "leads", values })).status, 409);
    response = await req(api + "?entity=leads");
    assert.match(response.headers.get("cache-control"), /no-store/);
    let payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.rows[0].company, values.company);
    assert.equal(
      (
        await post({
          entity: "leads",
          id: created.id,
          version: created.version,
          values: { ...values, stage_id: "won" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post({
          entity: "leads",
          id: created.id,
          version: created.version,
          values,
        })
      ).status,
      409,
    );
    const kpi = await (await req(api + "?entity=kpis")).json();
    assert.equal(kpi.metrics.won, 100);
    assert.equal(kpi.metrics.open, 0);
    assert.equal(
      (
        await post({
          entity: "activities",
          values: { lead_id: created.id, body: "HTTP note", status: "pending" },
        })
      ).status,
      201,
    );
    const ev = {
      title: "HTTP event",
      owner_id: owner,
      lead_id: created.id,
      starts_at: "2026-11-10T10:00:00Z",
      ends_at: "2026-11-10T11:00:00Z",
      timezone: "UTC",
      kind: "meeting",
      status: "scheduled",
    };
    assert.equal((await post({ entity: "events", values: ev })).status, 201);
    assert.equal((await post({ entity: "events", values: ev })).status, 409);
    assert.equal(
      (
        await post({
          action: "import",
          csv: "company,source,opportunity\nCSV Synthetic,fixture,Review required",
        })
      ).status,
      201,
    );
    const prospect = (await (await req(api + "?entity=prospects")).json())
      .rows[0];
    assert.equal(
      (await post({ action: "convert", id: prospect.id })).status,
      400,
    );
    assert.equal(
      (
        await post({
          entity: "prospects",
          id: prospect.id,
          version: prospect.version,
          values: { ...prospect, status: "approved" },
        })
      ).status,
      200,
    );
    assert.equal(
      (await post({ action: "convert", id: prospect.id })).status,
      200,
    );
    assert.equal(
      (
        await post({
          entity: "usage",
          values: {
            provider: "Claude",
            amount: 80,
            unit: "credits",
            period_start: "2026-11-01T00:00:00Z",
            period_end: "2026-12-01T00:00:00Z",
            limit_value: 100,
            source: "Manual synthetic",
          },
        })
      ).status,
      201,
    );
    assert.equal(
      (await (await req(api + `?entity=leads&id=${created.id}`)).json()).rows
        .length,
      1,
    );
    unavailable = true;
    assert.equal((await req(api + "?entity=leads")).status, 503);
    unavailable = false;
    if (process.env.CRM_BROWSER === "1") {
      const { chromium } = require("playwright");
      const browser = await chromium.launch({
        executablePath:
          process.env.CHROME_PATH ||
          (process.platform === "darwin"
            ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            : undefined),
        headless: true,
      });
      t.after(() => browser.close());
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      await ctx.addCookies([
        {
          name: cookieName,
          value: cookie(ownerSession).split("=").slice(1).join("="),
          url: origin,
        },
      ]);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(origin + "/admin/workspace/crm");
      await page.getByRole("heading", { name: "Centro comercial de Avalon" }).waitFor();
      await page.goto(origin + "/admin/workspace/crm/leads");
      await page
        .getByRole("button", { name: "Crear lead", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Crear lead", exact: true })
        .click();
      await page
        .getByLabel("Empresa *", { exact: true })
        .fill("Synthetic Browser");
      await page
        .getByLabel("Origen / fuente *", { exact: true })
        .fill("browser");
      await page.getByRole("button", { name: "Guardar", exact: true }).click();
      await page
        .getByText("Guardado correctamente.", { exact: true })
        .waitFor();
      await page
        .getByLabel("Etapa de Synthetic Browser")
        .selectOption("contacted");
      await page.waitForTimeout(200);
      await page.reload();
      await page.getByLabel("Etapa de Synthetic Browser").waitFor();
      assert.equal(
        await page.getByLabel("Etapa de Synthetic Browser").inputValue(),
        "contacted",
      );
      fs.mkdirSync("../evidence", { recursive: true });
      await page.screenshot({
        path: "../evidence/crm-desktop.png",
        fullPage: true,
      });
      for (const suffix of routes.slice(1)) {
        await page.goto(origin + "/admin/workspace/crm" + suffix);
        await page.getByRole("button", { name: "Aplicar filtros" }).waitFor();
        await page.waitForFunction(
          () => !document.body.innerText.includes("Cargando CRM…"),
        );
        assert.deepEqual(
          (await page.getByRole("alert").allTextContents()).filter((s) =>
            s.trim(),
          ),
          [],
          suffix,
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(origin + "/admin/workspace/crm/leads");
      await page
        .getByRole("button", { name: "Crear lead", exact: true })
        .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        "mobile document must not overflow",
      );
      await page.screenshot({
        path: "../evidence/crm-mobile.png",
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      t.diagnostic(
        "Browser: create -> keyboard stage selection -> reload persistence; all five sections; 390px mobile overflow; no page errors.",
      );
    }
    t.diagnostic(
      "HTTP + real PostgreSQL: five private routes, CSRF, CRUD, conflicts, stale version, KPIs, notes, CSV approval/conversion, usage and missing migration state passed.",
    );
  },
);
