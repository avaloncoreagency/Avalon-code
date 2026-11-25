import { getOwnerSession } from "@/lib/auth/session";
import { documentById } from "@/lib/docs/library";
import { libraryFileName, renderLibraryPdf } from "@/lib/docs/library-pdf";

export const dynamic = "force-dynamic";

/** Owner-only PDF of a library document (private download, never a public file; pending ones are watermarked). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const doc = /^[A-Z0-9-]{3,40}$/.test(id) ? documentById(id) : null;
  if (!doc) return new Response("Not found", { status: 404 });
  const pdf = renderLibraryPdf(doc);
  return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${libraryFileName(doc)}"`,
    "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
