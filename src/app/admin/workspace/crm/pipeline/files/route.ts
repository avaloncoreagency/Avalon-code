import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { ATTACHMENT_MAX_BYTES, attachmentMime } from "@/lib/crm/attachments";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Upload one small document to a lead's timeline. Type is checked by extension AND file signature. */
export async function POST(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return reply({ error: "Origen no permitido" }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > ATTACHMENT_MAX_BYTES + 64 * 1024) return reply({ error: "Archivo mayor de 5 MB." }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return reply({ error: "Formulario inválido" }, 400); }
  const lead = String(form.get("lead") ?? ""), note = String(form.get("note") ?? "").trim().slice(0, 500), file = form.get("file");
  if (!UUID.test(lead)) return reply({ error: "Lead inválido" }, 400);
  if (!(file instanceof File) || file.size < 1) return reply({ error: "Elige un archivo." }, 400);
  if (file.size > ATTACHMENT_MAX_BYTES) return reply({ error: "Archivo mayor de 5 MB." }, 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = file.name.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(-200) || "archivo";
  const mime = attachmentMime(filename, bytes);
  if (!mime) return reply({ error: "Tipo no permitido. Usa PDF, PNG, JPG, WEBP, TXT, CSV, DOCX o XLSX." }, 415);
  const { data, error } = await session.supabase.from("crm_attachments").insert({
    lead_id: lead, filename, mime, size_bytes: bytes.length, note,
    sha256: createHash("sha256").update(bytes).digest("hex"), content: "\\x" + bytes.toString("hex"),
  }).select("id").single();
  if (error) return reply({ error: error.message?.includes("attachment_quota") ? "Este lead ya usa 25 MB de archivos." :
    error.code === "42P01" || error.code === "PGRST205" ? "La migración del tablero (20261102210000) no está aplicada en este entorno." : "No se pudo subir el archivo." }, 400);
  return reply(data, 201);
}
