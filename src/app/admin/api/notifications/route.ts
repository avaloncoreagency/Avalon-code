import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) => NextResponse.json(value, {
  status, headers: { "Cache-Control": "private, no-store" }
});
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Global staff inbox. DB RLS scopes notices to the authenticated recipient. */
export async function GET() {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 401);
  const { data, count, error } = await session.supabase
    .from("crm_notifications")
    .select("id,severity,category,title,body,link,created_at", { count: "exact" })
    .eq("recipient_id", session.user.id).is("read_at", null)
    .order("created_at", { ascending: false }).limit(20);
  if (error) return reply({ error: "Bandeja no disponible" }, 503);
  return reply({ notices: data ?? [], unread: count ?? 0 });
}

/** User-controlled mark-read, never client-controlled recipient. */
export async function POST(req: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 401);
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return reply({ error: "Origen no permitido" }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > 1024) return reply({ error: "Solicitud grande" }, 413);
  let id: unknown;
  try { ({ id } = await req.json()); } catch { return reply({ error: "Solicitud inválida" }, 400); }
  if (typeof id !== "string" || !UUID.test(id)) return reply({ error: "Aviso inválido" }, 400);
  const { error } = await session.supabase.from("crm_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id).eq("recipient_id", session.user.id).is("read_at", null);
  if (error) return reply({ error: "No se pudo marcar leído" }, 400);
  return reply({ ok: true });
}
