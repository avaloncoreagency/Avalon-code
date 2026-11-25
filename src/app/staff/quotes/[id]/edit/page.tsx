import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth/staff";
import { QuoteWizard, type CatalogItem } from "@/components/quotes/quote-wizard";
import { REVISABLE, isQuoteContent } from "@/lib/quotes/model";
import { SELLER_MESSAGES, type SellerCatalog, type SellerQuoteDetail } from "@/lib/staff/seller";
import { reviseSellerQuote } from "../../../seller-actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SellerQuoteEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requireSeller();
  const { error } = await searchParams;
  const [quoteR, catalogR] = await Promise.all([supabase.rpc("staff_seller_quote", { p_quote: id }), supabase.rpc("staff_seller_catalog")]);
  const q = quoteR.data as SellerQuoteDetail | null;
  if (quoteR.error || catalogR.error) return <Shell id={id} title="Editar propuesta"><p role="alert" className={s.flash}>Las propuestas aún no están activadas en este entorno.</p></Shell>;
  if (!q) notFound();
  const catalog: CatalogItem[] = ((catalogR.data ?? []) as SellerCatalog[]).map(c => ({
    code: c.code, name: c.name, deliverables: c.deliverables, billing: c.billing_type,
    approvedPrice: c.offer_status === "approved" && c.suggested_price != null ? String(c.suggested_price) : null,
    approvedMonthly: c.offer_status === "approved" && c.monthly_price != null ? String(c.monthly_price) : null,
  }));
  return <Shell id={id} title={`${q.quote_number} · nueva revisión (v${q.current_version + 1})`}>
    {error && <p className={s.flash} data-tone="error" role="alert">{SELLER_MESSAGES[error] ?? SELLER_MESSAGES.invalid}</p>}
    {!REVISABLE.includes(q.status) ? <p className={s.flash} data-tone="warn" role="alert">Esta propuesta ya fue enviada o cerrada: no se edita. Crea una nueva desde el lead si hace falta.</p>
      : !isQuoteContent(q.content) ? <p role="alert" className={s.flash}>No se pudo cargar el contenido de la propuesta.</p> :
      <section className={s.panel}>
        <p className={s.muted}>La versión actual se conserva. Al guardar, la propuesta vuelve a borrador y necesita nueva aprobación de la dirección.</p>
        <QuoteWizard lang="es" mode="revise" action={reviseSellerQuote} catalog={catalog} initial={q.content}
          initialInternal={{ directCosts: String(q.internal?.directCosts ?? ""), marginNote: String(q.internal?.marginNote ?? ""), confidential: String(q.internal?.confidential ?? "") }}
          hidden={{ quote_id: q.quote_id, expected_version: String(q.version) }} internalLocked={q.internal === null} />
      </section>}
  </Shell>;
}

function Shell({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <main className={s.hud} style={{ maxWidth: 1220, margin: "0 auto", padding: "20px 16px" }}>
    <header className={s.header}><div><p className={s.eyebrow}>AVALON / PORTAL DE EMPLEADOS / PROPUESTAS</p><h1>{title}</h1></div>
      <Link className={s.button} href={`/staff/quotes/${id}`}>Cancelar</Link></header>
    {children}
  </main>;
}
