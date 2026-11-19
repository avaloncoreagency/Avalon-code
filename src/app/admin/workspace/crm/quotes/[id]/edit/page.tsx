import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { QuoteWizard, type CatalogItem } from "@/components/quotes/quote-wizard";
import { REVISABLE, isQuoteContent, type QuoteContent, type QuoteStatus } from "@/lib/quotes/model";
import { ERROR_TEXT } from "@/lib/quotes/text";
import { reviseQuote } from "../../actions";
import { QuoteUnavailable } from "@/components/quotes/unavailable";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";
type Catalog = { code: string; name: string; name_en: string; deliverables: string; billing_type: "one_time" | "monthly" | "annual"; suggested_price: string | null; monthly_price: string | null; offer_status: string };

export default async function EditQuote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const quoteR = await run<{ id: string; quote_number: string; status: QuoteStatus; current_version: number; version: number } | null>(
    supabase.from("crm_quotes").select("id,quote_number,status,current_version,version").eq("id", id).maybeSingle());
  if (quoteR.error) return <Suite active="crm"><div className={s.hud}><QuoteUnavailable lang={lang} code={quoteR.error} /></div></Suite>;
  const quote = quoteR.data;
  if (!quote) notFound();
  const [versionR, catalogR] = await Promise.all([
    run<{ content: QuoteContent; internal: Record<string, string> } | null>(supabase.from("crm_quote_versions").select("content,internal").eq("quote_id", id).eq("version_no", quote.current_version).maybeSingle()),
    run<Catalog[]>(supabase.from("crm_service_catalog").select("code,name,name_en,deliverables,billing_type,suggested_price,monthly_price,offer_status").eq("active", true).order("name")),
  ]);
  const content = versionR.data?.content;
  const error = q(p, "error");
  const catalog: CatalogItem[] = (catalogR.data ?? []).map(c => ({
    code: c.code, name: lang === "en" && c.name_en ? c.name_en : c.name, deliverables: c.deliverables, billing: c.billing_type,
    approvedPrice: c.offer_status === "approved" && c.suggested_price != null ? String(c.suggested_price) : null,
    approvedMonthly: c.offer_status === "approved" && c.monthly_price != null ? String(c.monthly_price) : null,
  }));
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="quotes" eyebrow={`${pick(lang, "Cotización", "Quote")} ${quote.quote_number}`} title={pick(lang, `Nueva revisión (v${quote.current_version + 1})`, `New revision (v${quote.current_version + 1})`)}
      lead={pick(lang, "La versión actual se conserva intacta. Al guardar, la cotización vuelve a borrador para aprobarla de nuevo.", "The current version is kept intact. Saving sends the quote back to draft for re-approval.")}
      actions={<Link className={s.button} href={`/admin/workspace/crm/quotes/${id}`}>{pick(lang, "Cancelar", "Cancel")}</Link>} />
    {error && <p className={s.flash} data-tone="error" role="alert">{pick(lang, ...(ERROR_TEXT[error] ?? ERROR_TEXT.save))}</p>}
    {!REVISABLE.includes(quote.status) ? <p className={s.flash} data-tone="warn" role="alert">{pick(lang, ...ERROR_TEXT.quote_not_revisable)}{" "}
      <Link href={`/admin/workspace/crm/quotes/${id}`}>{pick(lang, "Volver", "Back")}</Link></p>
      : !content || !isQuoteContent(content) ? <QuoteUnavailable lang={lang} code={versionR.error ?? "unavailable"} /> :
      <section className={s.panel}><QuoteWizard lang={lang} mode="revise" action={reviseQuote} catalog={catalog} initial={content}
        initialInternal={{ directCosts: String(versionR.data?.internal?.directCosts ?? ""), marginNote: String(versionR.data?.internal?.marginNote ?? ""), confidential: String(versionR.data?.internal?.confidential ?? "") }}
        hidden={{ quote_id: id, expected_version: String(quote.version) }} /></section>}
  </div></Suite>;
}
