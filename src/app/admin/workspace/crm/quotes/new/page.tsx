import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, Unavailable, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner, displayName } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { QuoteWizard, type CatalogItem } from "@/components/quotes/quote-wizard";
import { ERROR_TEXT } from "@/lib/quotes/text";
import type { QuoteContent } from "@/lib/quotes/model";
import { createQuote } from "../actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";
type Lead = { id: string; company: string; contact: string; email: string | null; phone: string; archived: boolean };
type Client = { id: string; legal_name: string; trade_name: string; location: string; origin_lead_id: string | null };
type Catalog = { code: string; name: string; name_en: string; deliverables: string; billing_type: "one_time" | "monthly" | "annual";
  suggested_price: string | null; monthly_price: string | null; offer_status: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase, user } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const rawLead = q(p, "lead"), rawClient = q(p, "client");
  if ((rawLead && !UUID_RE.test(rawLead)) || (rawClient && !UUID_RE.test(rawClient))) notFound();
  const error = q(p, "error");

  let client: Client | null = null;
  let leadId = rawLead ?? null;
  if (rawClient) {
    const r = await run<Client | null>(supabase.from("crm_clients").select("id,legal_name,trade_name,location,origin_lead_id").eq("id", rawClient).maybeSingle());
    if (r.error) return <Shell lang={lang}><Unavailable lang={lang} code={r.error} /></Shell>;
    if (!r.data) notFound();
    client = r.data;
    leadId = client.origin_lead_id;
    if (!leadId) return <Shell lang={lang}><section className={s.panel}>
      <p className={s.flash} data-tone="warn" role="alert">{pick(lang, "Este cliente todavía no tiene una oportunidad comercial vinculada. Vincúlala primero desde su ficha (no se crea ninguna venta).", "This client has no linked opportunity yet. Link one from the client page first (no sale is created).")}</p>
      <p><Link className={`${s.button} ${s.primary}`} href={`/admin/workspace/crm/clients/${client.id}`}>{pick(lang, "Abrir Clients 360", "Open Clients 360")}</Link></p>
    </section></Shell>;
  }

  if (!leadId) {
    // Prospect picker: recent active opportunities; a quote always belongs to one.
    const leads = await run<Lead[]>(supabase.from("crm_leads").select("id,company,contact,email,phone,archived").eq("archived", false).order("updated_at", { ascending: false }).limit(200));
    return <Shell lang={lang}><section className={s.panel} aria-labelledby="pick-lead">
      <header><h2 id="pick-lead">{pick(lang, "1. Selecciona el prospecto", "1. Select the prospect")}</h2></header>
      {leads.error ? <Unavailable lang={lang} code={leads.error} /> : leads.data.length === 0 ?
        <p className={s.empty}>{pick(lang, "No hay prospectos. ", "No prospects yet. ")}<Link href="/admin/workspace/crm/leads">{pick(lang, "Crear lead", "Create lead")}</Link></p> :
        <form method="get" className={s.toolbar}>
          <label>{pick(lang, "Prospecto u oportunidad", "Prospect or opportunity")}
            <select name="lead" required defaultValue="">
              <option value="" disabled>{pick(lang, "Elige…", "Choose…")}</option>
              {leads.data.map(l => <option key={l.id} value={l.id}>{l.company}{l.contact ? " · " + l.contact : ""}</option>)}
            </select></label>
          <button className={`${s.button} ${s.primary}`} type="submit">{pick(lang, "Continuar", "Continue")}</button>
        </form>}
    </section></Shell>;
  }

  const [leadR, clientR, catalogR] = await Promise.all([
    run<Lead | null>(supabase.from("crm_leads").select("id,company,contact,email,phone,archived").eq("id", leadId).maybeSingle()),
    client ? Promise.resolve({ data: client, error: null, count: null } as const)
      : run<Client | null>(supabase.from("crm_clients").select("id,legal_name,trade_name,location,origin_lead_id").eq("origin_lead_id", leadId).neq("status", "archived").limit(1).maybeSingle()),
    run<Catalog[]>(supabase.from("crm_service_catalog").select("code,name,name_en,deliverables,billing_type,suggested_price,monthly_price,offer_status").eq("active", true).order("name")),
  ]);
  if (leadR.error) return <Shell lang={lang}><Unavailable lang={lang} code={leadR.error} /></Shell>;
  const lead = leadR.data;
  if (!lead || lead.archived) notFound();
  const linkedClient = clientR.error ? null : clientR.data;
  const catalog: CatalogItem[] = (catalogR.data ?? []).map(c => ({
    code: c.code, name: lang === "en" && c.name_en ? c.name_en : c.name, deliverables: c.deliverables, billing: c.billing_type,
    // Only an owner-approved catalog offer may prefill a price; drafts never do.
    approvedPrice: c.offer_status === "approved" && c.suggested_price != null ? String(c.suggested_price) : null,
    approvedMonthly: c.offer_status === "approved" && c.monthly_price != null ? String(c.monthly_price) : null,
  }));
  const today = new Date();
  const initial: QuoteContent = {
    schemaVersion: 1, lang, currency: "USD", title: "",
    issueDate: iso(today), validUntil: iso(new Date(today.getTime() + 30 * 864e5)),
    client: { company: linkedClient?.legal_name || lead.company, contact: lead.contact ?? "", email: lead.email ?? "", phone: lead.phone ?? "", address: linkedClient?.location ?? "" },
    issuer: { name: "Avalon Core Agency", email: user.email ?? "", phone: "" },
    seller: displayName(user), objectives: "", problem: "", solution: "", scope: "", deliverables: "", exclusions: "", dependencies: "",
    timeline: "", support: "", terms: "", notes: "", thirdPartyCosts: "", model: "fixed", lines: [], commission: null,
  };

  return <Shell lang={lang}>
    {error && <p className={s.flash} data-tone="error" role="alert">{pick(lang, ...(ERROR_TEXT[error] ?? ERROR_TEXT.save))}</p>}
    <section className={s.panel} aria-labelledby="new-quote">
      <header><h2 id="new-quote">{pick(lang, "Nueva cotización para", "New quote for")} {linkedClient?.legal_name || lead.company}</h2>
        <Link href={linkedClient ? `/admin/workspace/crm/clients/${linkedClient.id}` : `/admin/workspace/crm/lead/${lead.id}`}>{pick(lang, "Ver ficha", "View record")}</Link></header>
      <QuoteWizard lang={lang} mode="create" action={createQuote} catalog={catalog} initial={initial}
        initialInternal={{ directCosts: "", marginNote: "", confidential: "" }}
        hidden={{ lead_id: lead.id, request_key: randomUUID(), from: rawClient ? "client" : "lead" }} />
    </section>
  </Shell>;
}

function Shell({ lang, children }: { lang: "es" | "en"; children: React.ReactNode }) {
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="quotes" eyebrow={pick(lang, "CRM / Ventas / Cotizaciones", "CRM / Sales / Quotes")} title={pick(lang, "Nueva cotización", "New quote")}
      lead={pick(lang, "Asistente en cinco pasos. Los precios los define un propietario: nada se inventa ni se precarga sin aprobación.", "Five-step assistant. Prices are set by an owner: nothing is invented or prefilled without approval.")}
      actions={<Link className={s.button} href="/admin/workspace/crm/quotes">{pick(lang, "Todas las cotizaciones", "All quotes")}</Link>} />
    {children}
  </div></Suite>;
}
