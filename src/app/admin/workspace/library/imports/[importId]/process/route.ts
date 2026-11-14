import { getOwnerSession } from "@/lib/auth/session";
import { reply, sameOrigin, UUID } from "@/lib/project-bridge/http";
import { processImport, reasonText } from "@/lib/project-bridge/service";
import { supabaseRepo, supabaseStore } from "@/lib/project-bridge/supabase";
import { bridgeCategoryEnabled } from "@/lib/project-bridge/policy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Step 2: validate, extract, store and register the uploaded archive (bounded; safe to call again to retry). */
export async function POST(req: Request, { params }: { params: Promise<{ importId: string }> }) {
  if (!sameOrigin(req)) return reply({ error: "forbidden_origin" }, 403);
  const session = await getOwnerSession();
  if (!session) return reply({ error: "unauthorized" }, 401);
  const { importId } = await params;
  if (!UUID.test(importId)) return reply({ error: "invalid_import" }, 400);
  // Fail closed at the FINAL processing boundary, not just the upload form / API intake.
  // An extended category can be disabled after an import was received; disabling must
  // prevent that pending import from becoming a sealed product version.
  const record = await session.supabase.from("os_project_imports").select("category").eq("id", importId).maybeSingle();
  if (record.error) return reply({ error: "unavailable" }, 503);
  if (!record.data) return reply({ error: "import_not_found" }, 404);
  if (!bridgeCategoryEnabled(record.data.category, process.env.AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS === "true"))
    return reply({ error: "category_not_enabled" }, 409);
  const result = await processImport(supabaseRepo(session.supabase), supabaseStore(session.supabase), importId);
  const lang = (req.headers.get("accept-language") ?? "es").toLowerCase().startsWith("en") ? "en" : "es";
  const status = result.status === "registered" ? 201 : result.status === "duplicate" ? 200 : result.status === "busy" ? 409 : result.status === "rejected" ? 422 : 500;
  return reply({ ...result, message: "reason" in result ? reasonText(result.reason, lang) : null }, status);
}
