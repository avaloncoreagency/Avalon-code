import { getOwnerSession } from "@/lib/auth/session";
import { ALL_DOCUMENTS, LIBRARY, reviewPackMarkdown } from "@/lib/docs/library";
import { renderEditorialPdf } from "@/lib/docs/library-pdf";

export const dynamic = "force-dynamic";

/** Owner-only review pack (G03): approval matrix + the full text of the 22 documents, for Miguel and Samuel. Internal. */
export async function GET() {
  const session = await getOwnerSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const version = `${LIBRARY.packs.sales.version}+${LIBRARY.packs.client.version}`;
  const pdf = renderEditorialPdf({ ref: "REVIEW-PACK", version, languages: ["es", "en"], title: "Paquete de revisión de la biblioteca · Library review pack",
    markdown: reviewPackMarkdown(ALL_DOCUMENTS), producer: "Avalon OS avalon-library-1",
    status: { label: "REVISION INTERNA / INTERNAL REVIEW", warn: true, banner: "USO INTERNO DE LOS PROPIETARIOS - NO DISTRIBUIR / OWNERS ONLY - DO NOT DISTRIBUTE" } });
  return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="Avalon-Library-Review-Pack.pdf"',
    "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
