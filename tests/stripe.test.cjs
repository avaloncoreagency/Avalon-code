const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const fs = require("node:fs");
const ts = require("typescript");
const { verifyStripeSignature } = require("../src/lib/stripe/signature.cjs");

test("Stripe signing: valid timestamp and HMAC; reject tampering/replays", () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ id: "evt_test_12", livemode: false, type: "invoice.paid" });
  const secret = "whsec_test_only_unit_123456";
  const sign = (t, body = payload) => createHmac("sha256", secret).update(t + "." + body).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${now},v1=${sign(now)}`, secret, now), true);
  assert.equal(verifyStripeSignature(payload + " ", `t=${now},v1=${sign(now)}`, secret, now), false);
  assert.equal(verifyStripeSignature(payload, `t=${now},v1=${"0".repeat(64)}`, secret, now), false);
  assert.equal(verifyStripeSignature(payload, `t=${now - 301},v1=${sign(now - 301)}`, secret, now), false);
  assert.equal(verifyStripeSignature(payload, `t=${now + 301},v1=${sign(now + 301)}`, secret, now), false);
  assert.equal(verifyStripeSignature(payload, "t=1,v1=abc", secret, now), false);
  assert.equal(verifyStripeSignature(payload, null, secret, now), false);
  assert.equal(verifyStripeSignature(payload, `t=${now},v1=${sign(now)}`, "not_a_secret", now), false);
  assert.equal(verifyStripeSignature(payload, `v1=123,t=${now},v1=${sign(now)}`, secret, now), true);
});

test("Stripe integration safety invariants are preserved", () => {
  const source = p => fs.readFileSync(p, "utf8");
  const stripe = source("src/lib/stripe/avalon.ts");
  const webhook = source("src/app/api/stripe/webhook/route.ts");
  const middleware = source("src/lib/supabase/middleware.ts");
  const sql = source("supabase/migrations/20261102203000_stripe_crm_invoices.sql");
  const action = source("src/app/admin/workspace/crm/sales/stripe-actions.ts");
  const salePage = source("src/app/admin/workspace/crm/sales/[id]/page.tsx");
  const saleErrors = source("src/lib/sales/domain.ts");
  assert.match(stripe, /rk_test_\|sk_test_/);
  assert.match(stripe, /STRIPE_SANDBOX_ONLY/);
  assert.match(stripe, /VERCEL_ENV !== "production"/);
  assert.match(webhook, /verifyStripeSignature/);
  assert.match(webhook, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(webhook, /crm_stripe_process_event/);
  assert.match(webhook, /event.livemode !== false/);
  assert.match(middleware, /path === "\/api\/stripe\/webhook"/);
  assert.match(sql, /create unique index crm_stripe_invoice_one_active_per_sale/);
  assert.match(sql, /create policy crm_stripe_invoice_owner_read/);
  assert.match(sql, /on conflict do nothing/);
  assert.match(sql, /if v_type = 'invoice.paid' then/);
  assert.match(sql, /elsif v_type = 'invoice.payment_succeeded' then/);
  assert.match(sql, /stripe_invoice_pending_link/);
  assert.match(sql, /payment_source_unverified/);
  // A malformed migration or a duplicated CREATE can break every Preview DB.
  assert.equal((sql.match(/create function public\.crm_stripe_process_event/g) || []).length, 1);
  assert.equal((sql.match(/^commit;$/gm) || []).length, 1);
  assert.match(sql, /create or replace function crm_private\.payment_guard\(\)/);
  assert.match(sql, /payment_stripe_invoice_active/);
  assert.match(sql, /select i\.sale_id into v_sale_id from public\.crm_stripe_invoices/);
  assert.match(sql, /perform 1 from public\.crm_sales s where s\.id = v_sale_id for update/);
  assert.match(salePage, /!invoiceRows\.error && !activeStripeInvoice/);
  assert.match(saleErrors, /payment_stripe_invoice_active/);
  assert.match(salePage, /Number\(d\.tax_total\) === 0/);
  assert.match(action, /tax_requires_review/);
  assert.match(action, /invoice\.automatic_tax\?\.enabled !== false/);

  assert.match(sql, /grant execute on function public.crm_stripe_process_event\(jsonb\) to service_role/);
  assert.match(action, /crm_stripe_reserve_invoice/);
  assert.match(action, /TEST_EMAIL/);
  assert.match(action, /STRIPE_ALLOW_TEST_SEND/);
  assert.match(action, /"automatic_tax\[enabled\]": "false"/);
  assert.match(action, /finalize/);
  assert.ok(action.indexOf('/finalize') < action.indexOf('/send'), "Stripe invoice must be finalized before it can be sent");
  assert.match(sql, /v_type = 'invoice.sent'/);
  assert.match(sql, /hosted_invoice_url = case/);
  assert.doesNotMatch(action, /automatic_tax[^\n]*true/);
});

test("Sandbox Stripe refuses production DB, live keys and production runtimes", () => {
  const input = fs.readFileSync("src/lib/stripe/avalon.ts", "utf8");
  const js = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function("require","module","exports",js)(id => id === "server-only" ? {} : require(id), mod, mod.exports);
  const ready = mod.exports.stripeSandboxReady;
  const names = ["STRIPE_SECRET_KEY","STRIPE_SANDBOX_ONLY","VERCEL_ENV","NEXT_PUBLIC_SUPABASE_URL"];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.STRIPE_SECRET_KEY = "rk_test_synthetic_only";
    process.env.STRIPE_SANDBOX_ONLY = "true";
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ltbwzcrxeuczdhhtbqgm.supabase.co";
    assert.equal(ready(), false, "Preview must never write sandbox records into production CRM");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic-preview.supabase.co";
    assert.equal(ready(), true);
    process.env.STRIPE_SECRET_KEY = "rk_live_synthetic_only";
    assert.equal(ready(), false, "Live keys must never be accepted");
    process.env.STRIPE_SECRET_KEY = "rk_test_synthetic_only";
    process.env.VERCEL_ENV = "production";
    assert.equal(ready(), false, "No Stripe sandbox calls from production runtime");
    process.env.VERCEL_ENV = "preview";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    assert.equal(ready(), false, "Sandbox cannot be enabled without a database target");
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});

function sandboxAdapter(fakeFetch = async () => ({ ok: true, json: async () => ({ id:"in_test" }) })) {
  const source = fs.readFileSync("src/lib/stripe/avalon.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  // No network access or real credentials: only in-memory dependency injection.
  new Function("require","module","exports","fetch",js)(
    id => id === "server-only" ? {} : require(id), mod, mod.exports, fakeFetch
  );
  return mod.exports;
}

test("Stripe retry window expires before API idempotency keys may be pruned", () => {
  const { stripeReservationRetryable, STRIPE_RESERVATION_RETRY_MAX_AGE_MS } = sandboxAdapter();
  const now = Date.UTC(2026, 10, 2, 12);
  const created = ms => new Date(now - ms).toISOString();
  assert.equal(STRIPE_RESERVATION_RETRY_MAX_AGE_MS,20 * 60 * 60_000);
  assert.equal(stripeReservationRetryable(created(0),now),true);
  assert.equal(stripeReservationRetryable(created(19 * 60 * 60_000),now),true);
  assert.equal(stripeReservationRetryable(created(20 * 60 * 60_000),now),false);
  assert.equal(stripeReservationRetryable(created(25 * 60 * 60_000),now),false);
  assert.equal(stripeReservationRetryable(new Date(now + 4 * 60_000).toISOString(),now),true);
  assert.equal(stripeReservationRetryable(new Date(now + 6 * 60_000).toISOString(),now),false);
  assert.equal(stripeReservationRetryable("not-a-date",now),false);
});

test("Stripe API adapter preserves idempotency, timeout and sanitizes remote failures", async () => {
  const original = Object.fromEntries(
    ["STRIPE_SECRET_KEY","STRIPE_SANDBOX_ONLY","VERCEL_ENV","NEXT_PUBLIC_SUPABASE_URL"]
      .map(name => [name, process.env[name]])
  );
  let requests = [];
  const adapter = sandboxAdapter(async (url, options) => {
    requests.push({url,options});
    if (requests.length === 1) return {ok:true,json:async()=>({id:"in_fake"})};
    return {ok:false,status:403,text:async()=> "fake private error: SECRET_VALUE"};
  });
  try {
    process.env.STRIPE_SECRET_KEY = "rk_test_synthetic_unit_not_real";
    process.env.STRIPE_SANDBOX_ONLY = "true";
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://isolated-test.supabase.co";
    const payload = new URLSearchParams({customer:"cus_synthetic"});
    const result = await adapter.stripeRequest("/invoices","POST",payload,"test-request-uuid");
    assert.equal(result.id,"in_fake");
    assert.equal(requests[0].url,"https://api.stripe.com/v1/invoices");
    assert.equal(requests[0].options.method,"POST");
    assert.equal(requests[0].options.headers["Stripe-Version"],"2026-09-30.endive");
    assert.equal(requests[0].options.headers["Idempotency-Key"],"test-request-uuid");
    assert.equal(requests[0].options.body,"customer=cus_synthetic");
    assert.ok(requests[0].options.signal instanceof AbortSignal);
    assert.equal(requests[0].options.signal.aborted,false);
    await assert.rejects(
      adapter.stripeRequest("/invoices","POST",payload,"test-request-uuid"),
      err => /Stripe API request failed \(403\)/.test(err.message) && !err.message.includes("SECRET_VALUE")
    );
    await assert.rejects(adapter.stripeRequest("//evil-site"),/Invalid Stripe path/);
    assert.equal(requests.length,2,"invalid URL must not trigger network access");
    process.env.STRIPE_SECRET_KEY = "rk_live_fake";
    await assert.rejects(adapter.stripeRequest("/invoices"),/sandbox unavailable/i);
    assert.equal(requests.length,2,"live credentials must not trigger network access");
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
