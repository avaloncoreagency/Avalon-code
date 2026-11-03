import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { decodeBytea } from "@/lib/crm/attachments";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owner-only download. Always an attachment, never rendered inline, with nosniff and a sandbox CSP. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  const { data, error } = await session.supabase.from("crm_attachments").select("filename,mime,content").eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  const bytes = decodeBytea(data.content);
  const ascii = data.filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": data.mime, "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(data.filename)}`,
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cache-Control": "private, no-store",
    },
  });
}
