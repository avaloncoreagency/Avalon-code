import "server-only";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  MAX_DELIVERY_BYTES, authenticateCreativeDelivery, parseCreativeDelivery,
} from "@/lib/os/creative-bridge-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (message: Record<string, unknown>, status: number) =>
  NextResponse.json(message, { status, headers: { "Cache-Control": "no-store", "Vary": "X-Avalon-Key-Id" } });

export async function POST(request: NextRequest) {
  // Production activation, schema rollout and secrets are independent release gates.
  if (process.env.AVALON_CREATIVE_BRIDGE_ENABLED !== "true" ||
      (process.env.VERCEL_ENV === "production" &&
       process.env.AVALON_CREATIVE_BRIDGE_PRODUCTION_APPROVED !== "true")) {
    return reply({ error: "bridge_disabled" }, 503);
  }
  // Runtime check also protects deployments whose env was changed after build.
  if (process.env.VERCEL_ENV === "preview" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("ltbwzcrxeuczdhhtbqgm"))
    return reply({ error: "isolated_staging_required" }, 503);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.AVALON_CREATIVE_BRIDGE_SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.AVALON_CREATIVE_BRIDGE_OWNER_ID;
  if (!supabaseUrl || !serverKey || !ownerId || !UUID.test(ownerId)) return reply({ error: "not_configured" }, 503);
  if (request.headers.get("origin") || request.headers.get("cookie") ||
      request.headers.get("authorization")) return reply({ error: "invalid_request" }, 400);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? ""))
    return reply({ error: "json_required" }, 415);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length > MAX_DELIVERY_BYTES) return reply({ error: "too_large" }, 413);
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: "empty_body" }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DELIVERY_BYTES) {
      await reader.cancel();
      return reply({ error: "too_large" }, 413);
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  const identity = authenticateCreativeDelivery(
    bytes, request.headers, process.env.AVALON_CREATIVE_BRIDGE_KEYS_JSON, Date.now(),
  );
  if (!identity) return reply({ error: "unauthorized" }, 401);
  let payload;
  try { payload = parseCreativeDelivery(JSON.parse(bytes.toString("utf8"))); }
  catch { return reply({ error: "invalid_delivery" }, 400); }

  // The service-role credential NEVER leaves this protected Node.js process.
  // The RPC (prepared in docs/sql) is restricted to service_role and performs
  // idempotent lead + product registration in a single database transaction.
  const supabase = createClient(supabaseUrl, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.rpc("os_receive_creative_delivery", {
    p_module: payload.module,
    p_source_ref: payload.source_ref,
    p_company_name: payload.company_name,
    p_existing_lead_id: payload.existing_lead_id,
    p_product_name: payload.product_name,
    p_description: payload.description,
    p_project_url: payload.project_url,
    p_repository_url: payload.repository_url,
    p_owner_id: ownerId,
    p_agent: identity.agent,
  });
  if (error) {
    if (error.code === "22023" || error.code === "23505") return reply({ error: "conflict_or_ambiguous_company" }, 409);
    return reply({ error: "bridge_storage_unavailable" }, 503);
  }
  if (!data || typeof data !== "object" || !UUID.test(data.project_id) || !UUID.test(data.lead_id))
    return reply({ error: "bridge_storage_unavailable" }, 503);

  revalidatePath("/admin/workspace/" + (
    payload.module === "website" ? "website-designer" :
    payload.module === "ecommerce" ? "ecommerce-designer" : "crm-creator"
  ));
  revalidatePath("/admin/workspace/clients/" + data.lead_id);
  revalidatePath("/admin/workspace/crm/leads");
  return reply({
    status: "reference_only", project_id: data.project_id, lead_id: data.lead_id,
    created: data.created === true, lead_created: data.lead_created === true,
    product_path: "/admin/workspace/products/" + data.project_id,
    company_path: "/admin/workspace/clients/" + data.lead_id,
  }, data.created === true ? 201 : 200);
}
