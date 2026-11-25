import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth/staff";
import { QuoteWizard, type CatalogItem } from "@/components/quotes/quote-wizard";
import type { QuoteContent } from "@/lib/quotes/model";
import { SELLER_MESSAGES, type SellerCatalog, type SellerLead } from "@/lib/staff/seller";
import { createSellerQuote } from "../../seller-actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A seller drafts a proposal for one of their own leads. The database rejects any lead that is not theirs. */
export default async function SellerNewQuote({ searchParams }: { searchParams: Promise<{ lead?: string; error?: string }> }) {
  const { supabase, user } = await requireSeller();
  const { lead: leadId, error } = await searchParams;
  if (!leadId || !UUID.test(leadId)) notFound();
  const [leadsR, catalogR, profileR] = await Promise.all([
    supabase.rpc("staff_seller_leads"), supabase.rpc("staff_seller_catalog"),
    supabase.from("staff_contacts").select("display_name").eq("user_id", user.id).maybeSingle(),
  ]);
  const lead = ((leadsR.data ?? []) as SellerLead[]).find(l => l.lead_id === leadId);
  if (leadsR.error || catalogR.error) return <Shell><p role="alert" className={s.flash}>Las propuestas aún no están activadas en este entorno.</p></Shell>;
  if (!lead || lead.stage_kind !== "open") notFound();
  const catalog: CatalogItem[] = ((catalogR.data ?? []) as SellerCatalog[]).map(c => ({
    code: c.code, name: c.name, deliverables: c.deliverables, billing: c.billing_type,
    // Only an owner-approved catalog price prefills the line; anything else is entered and later approved by an owner.
    approvedPrice: c.offer_status === "approved" && c.suggested_price != null ? String(c.suggested_price) : null,
    approvedMonthly: c.offer_status === "approved" && c.monthly_price != null ? String(c.monthly_price) : null,
  }));
  const today = new Date();
  const sellerName = (profileR.data as { display_name?: string } | null)?.display_name ?? "";
  const initial: QuoteContent = {
    schemaVersion: 1, lang: "es", currency: "USD", title: "", issueDate: iso(today), validUntil: iso(new Date(today.getTime() + 30 * 864e5)),
    client: { company: lead.company, contact: lead.contact ?? "", email: lead.email ?? "", phone: lead.phone ?? "", address: lead.city ?? "" },
    issuer: { name: "Avalon Core Agency", email: user.email ?? "", phone: "" }, seller: sellerName,
    objectives: "", problem: "", solution: "", scope: "", deliverables: "", exclusions: "", dependencies: "", timeline: "", support: "",
    terms: "", notes: "", thirdPartyCosts: "", model: "fixed", lines: [], commission: null,
  };
  return <Shell>
    {error && <p className={s.flash} data-tone="error" role="alert">{SELLER_MESSAGES[error] ?? SELLER_MESSAGES.invalid}</p>}
    <section className={s.panel} aria-labelledby="new-quote">
      <h2 id="new-quote">Nueva propuesta para {lead.company}</h2>
      <p className={s.muted}>Se guarda como borrador. Cuando esté lista, envíala a revisión: la dirección aprueba el precio antes de enviarla al cliente.</p>
      <QuoteWizard lang="es" mode="create" action={createSellerQuote} catalog={catalog} initial={initial}
        initialInternal={{ directCosts: "", marginNote: "", confidential: "" }} hidden={{ lead_id: lead.lead_id, request_key: randomUUID() }} />
    </section>
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className={s.hud} style={{ maxWidth: 1220, margin: "0 auto", padding: "20px 16px" }}>
    <header className={s.header}><div><p className={s.eyebrow}>AVALON / PORTAL DE EMPLEADOS / PROPUESTAS</p><h1>Nueva propuesta</h1></div>
      <Link className={s.button} href="/staff#seller-leads">Volver a mis leads</Link></header>
    {children}
  </main>;
}
