import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { decodeBytea } from "@/lib/crm/attachments";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIEWABLE_MIMES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const ALLOWED_MIMES = new Set([...VIEWABLE_MIMES, "text/plain", "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);

/** Owner-only immutable file. Download by default; inline preview only for safe image/PDF types. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  const { data, error } = await session.supabase.from("crm_attachments").select("filename,mime,content").eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  const bytes = decodeBytea(data.content);
  if (!bytes.length) return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  const mime = ALLOWED_MIMES.has(data.mime) ? data.mime : "application/octet-stream";
  const preview = _request.nextUrl.searchParams.get("preview") === "1" && VIEWABLE_MIMES.has(mime);
  const disposition = preview ? "inline" : "attachment";
  const ascii = data.filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime, "Content-Length": String(bytes.length),
      "Content-Disposition": `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(data.filename)}`,
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; object-src 'none'",
      "X-Frame-Options": "DENY", "Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "private, no-store",
    },
  });
}
