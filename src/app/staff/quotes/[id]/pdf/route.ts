import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getStaffState } from "@/lib/auth/staff";
import { canonicalQuote, isQuoteContent, quoteFileName, type QuoteStatus } from "@/lib/quotes/model";
import { renderQuotePdf } from "@/lib/quotes/pdf";
import { isSellerTitle, type SellerQuoteDetail } from "@/lib/staff/seller";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same rule as the owners' route: a client-facing PDF only once the exact revision was approved internally. */
const DOWNLOADABLE: QuoteStatus[] = ["approved", "sent", "accepted"];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  const inline = url.searchParams.get("view") === "inline";
  const staff = await getStaffState();
  if (staff.state !== "ok" || !staff.mfaEnrolled || !staff.permissions.commercial_permissions.includes("quote_send") || !isSellerTitle(staff.permissions.job_title))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const v = Number(url.searchParams.get("v"));
  if (!UUID.test(id) || !Number.isInteger(v) || v < 1 || v > 100000) return NextResponse.json({ error: "Invalid quote" }, { status: 400 });
  // The brokered RPC returns the current revision only for the seller who owns the lead (null otherwise).
  const { data, error } = await staff.supabase.rpc("staff_seller_quote", { p_quote: id });
  const q = data as SellerQuoteDetail | null;
  if (error || !q || q.current_version !== v || !isQuoteContent(q.content)) return NextResponse.json({ error: "Quote not available" }, { status: 404 });
  if (createHash("sha256").update(canonicalQuote(q.content)).digest("hex") !== q.content_sha256)
    return NextResponse.json({ error: "Quote integrity check failed" }, { status: 409 });
  if (!DOWNLOADABLE.includes(q.status))
    return NextResponse.json({ error: "The owners must approve this revision before it is downloaded" }, { status: 409 });
  let bytes: Uint8Array;
  try {
    bytes = renderQuotePdf(q.content, { number: q.quote_number, version: v });
  } catch {
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": (inline ? "inline" : "attachment") + '; filename="' + quoteFileName(q.quote_number, v) + '"',
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": inline ? "default-src 'none'; frame-ancestors 'self'" : "default-src 'none'; sandbox",
      "X-Frame-Options": "SAMEORIGIN",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
