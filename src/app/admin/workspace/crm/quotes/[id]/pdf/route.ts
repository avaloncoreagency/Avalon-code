import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getOwnerSession } from "@/lib/auth/session";
import { canonicalQuote, isQuoteContent, quoteFileName, type QuoteStatus } from "@/lib/quotes/model";
import { renderQuotePdf } from "@/lib/quotes/pdf";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A PDF meant for the client is only handed out once the exact revision was approved internally. */
const DOWNLOADABLE: QuoteStatus[] = ["approved", "sent", "accepted"];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  const inline = url.searchParams.get("view") === "inline";
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const v = Number(url.searchParams.get("v"));
  if (!UUID.test(id) || !Number.isInteger(v) || v < 1 || v > 100000) return NextResponse.json({ error: "Invalid quote" }, { status: 400 });

  const { data: quote, error } = await session.supabase.from("crm_quotes")
    .select("id,quote_number,status,current_version").eq("id", id).maybeSingle();
  if (error || !quote) return NextResponse.json({ error: "Quote not available" }, { status: 404 });
  // Only the client-facing column is selected: internal notes never reach the renderer.
  const { data: version } = await session.supabase.from("crm_quote_versions")
    .select("content,content_sha256").eq("quote_id", id).eq("version_no", v).maybeSingle();
  if (!version || !isQuoteContent(version.content)) return NextResponse.json({ error: "Quote version not available" }, { status: 404 });
  if (createHash("sha256").update(canonicalQuote(version.content)).digest("hex") !== version.content_sha256)
    return NextResponse.json({ error: "Quote integrity check failed" }, { status: 409 });
  if (!inline && (v !== quote.current_version || !DOWNLOADABLE.includes(quote.status as QuoteStatus)))
    return NextResponse.json({ error: "Approve this revision internally before downloading it" }, { status: 409 });

  let bytes: Uint8Array;
  try {
    bytes = renderQuotePdf(version.content, { number: quote.quote_number, version: v });
  } catch {
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": (inline ? "inline" : "attachment") + '; filename="' + quoteFileName(quote.quote_number, v) + '"',
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": inline ? "default-src 'none'; frame-ancestors 'self'" : "default-src 'none'; sandbox",
      "X-Frame-Options": "SAMEORIGIN",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
