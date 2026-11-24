import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { loadInvoiceDoc } from "@/lib/sales/invoice-server";
import { fileName, renderInvoicePdf } from "@/lib/sales/invoice";

export const dynamic = "force-dynamic";

/** GET only and read-only: the PDF is rendered from the stored invoice; nothing is written, numbered or paid. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id, invoiceId } = await params;
  const lang = await getLang();
  const r = await loadInvoiceDoc(session.supabase, id, invoiceId, lang);
  if (!r.ok) return NextResponse.json({ error: r.status === 400 ? "Invalid invoice" : "Invoice not available" }, { status: r.status });
  let bytes: Uint8Array;
  try { bytes = renderInvoicePdf(r.doc, lang, new Date().toISOString().slice(0, 10)); }
  catch { return NextResponse.json({ error: "PDF generation failed" }, { status: 500 }); }
  return new NextResponse(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName(r.doc.number)}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
