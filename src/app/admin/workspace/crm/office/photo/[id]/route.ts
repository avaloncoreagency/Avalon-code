import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { attachmentMime, decodeBytea } from "@/lib/crm/attachments";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 700 * 1024;
const json = (data: unknown, status: number) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/** Profile photo of a member (owners only). Served as image with nosniff and a sandbox CSP. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession();
  if (!session) return json({ error: "No autorizado" }, 403);
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "Miembro inválido" }, 400);
  const { data } = await session.supabase.from("office_profiles").select("photo,photo_mime,photo_sha256").eq("user_id", id).maybeSingle();
  if (!data?.photo || !data.photo_mime) return json({ error: "Sin foto" }, 404);
  const bytes = decodeBytea(data.photo);
  return new NextResponse(new Uint8Array(bytes), { headers: {
    "Content-Type": data.photo_mime, "Content-Length": String(bytes.length), ETag: `"${data.photo_sha256}"`,
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cache-Control": "private, max-age=300",
  } });
}

/** Upload your OWN photo (the id must be the caller). PNG/JPEG/WEBP, ≤ 700 KB, signature checked. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession();
  if (!session) return json({ error: "No autorizado" }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return json({ error: "Origen no permitido" }, 403);
  const { id } = await params;
  if (id !== session.user.id) return json({ error: "Solo puedes cambiar tu propia foto." }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > MAX + 64 * 1024) return json({ error: "Foto mayor de 700 KB." }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: "Formulario inválido" }, 400); }
  const file = form.get("photo");
  if (!(file instanceof File) || file.size < 1 || file.size > MAX) return json({ error: "Elige una foto PNG, JPG o WEBP de hasta 700 KB." }, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = attachmentMime(file.name, bytes);
  if (!mime || !mime.startsWith("image/")) return json({ error: "Solo PNG, JPG o WEBP." }, 415);
  const { error } = await session.supabase.from("office_profiles").upsert({ user_id: session.user.id, photo: "\\x" + bytes.toString("hex"), photo_mime: mime,
    photo_sha256: createHash("sha256").update(bytes).digest("hex") }, { onConflict: "user_id" });
  return error ? json({ error: error.code === "42P01" || error.code === "PGRST205" ? "La migración de Oficina no está aplicada en este entorno." : "No se pudo guardar la foto." }, 400) : json({ ok: true }, 201);
}
