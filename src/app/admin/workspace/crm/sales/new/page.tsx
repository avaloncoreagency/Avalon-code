import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { SaleForm, type CatalogService, type ClientOption, type QuoteSalePreset } from "@/components/sales/sale-form";
import { MAX_LINES } from "@/lib/sales/domain";
import { isQuoteContent } from "@/lib/quotes/model";
import { OpsHeader, Unavailable, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type ServiceRow = { code: string; name: string; name_en: string; billing_type: string; suggested_price: string | null; monthly_price: string | null; offer_status: string; crm_departments: { label: string } | null };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase, userId } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const requestedLeadId = q(p, "lead");
  const requestedQuoteId = q(p, "quote");
  const quoteId = requestedQuoteId && UUID_RE.test(requestedQuoteId) ? requestedQuoteId : null;
  const quoteR = quoteId ? await run<{ id: string; quote_number: string; status: string; lead_id: string; current_version: number } | null>(
    supabase.from("crm_quotes").select("id,quote_number,status,lead_id,current_version").eq("id", quoteId).maybeSingle()
  ) : null;
  const acceptedQuote = quoteR?.data?.status === "accepted" ? quoteR.data : null;
  const quoteMismatch = Boolean(requestedQuoteId && !acceptedQuote)
    || Boolean(requestedLeadId && acceptedQuote && requestedLeadId !== acceptedQuote.lead_id);
  const leadId = !quoteMismatch
    ? requestedLeadId && UUID_RE.test(requestedLeadId) ? requestedLeadId : acceptedQuote?.lead_id ?? null
    : null;
  type LeadChoice = { id: string; company: string; contact: string };
  type ClientChoice = { id: string; legal_name: string; client_code: string; origin_lead_id?: string | null };
  const [services, clients, leads, owners, linkedLead, linkedClient] = await Promise.all([
    run<ServiceRow[]>(supabase.from("crm_service_catalog").select("code,name,name_en,billing_type,suggested_price,monthly_price,offer_status,crm_departments(label)").eq("active", true).order("department_id").order("name")),
    run<ClientChoice[]>(supabase.from("crm_clients").select("id,legal_name,client_code,origin_lead_id").neq("status", "archived").order("legal_name").limit(500)),
    run<{ id: string; company: string; contact: string }[]>(supabase.from("crm_leads").select("id,company,contact").eq("archived", false).order("updated_at", { ascending: false }).limit(300)),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    leadId
      ? run<LeadChoice | null>(supabase.from("crm_leads").select("id,company,contact").eq("id", leadId).eq("archived", false).maybeSingle())
      : Promise.resolve({ data: null, error: null, count: null } as const),
    leadId
      ? run<ClientChoice | null>(supabase.from("crm_clients").select("id,legal_name,client_code,origin_lead_id").eq("origin_lead_id", leadId).neq("status", "archived").maybeSingle())
      : Promise.resolve({ data: null, error: null, count: null } as const),
  ]);
  const clientId = q(p, "client");
  // A Client 360 shortcut carries a canonical customer UUID, not a company-name guess.
  const selectedClient = clientId && UUID_RE.test(clientId)
    ? await run<{id:string;legal_name:string;client_code:string;origin_lead_id:string|null}|null>(
      supabase.from("crm_clients").select("id,legal_name,client_code,origin_lead_id")
        .eq("id",clientId).neq("status","archived").maybeSingle())
    : {data:null,error:null,count:null} as const;
  const quoteVersion = acceptedQuote ? await run<{ content: unknown } | null>(
    supabase.from("crm_quote_versions").select("content")
      .eq("quote_id", acceptedQuote.id).eq("version_no", acceptedQuote.current_version).maybeSingle()
  ) : null;
  const content = quoteVersion?.data?.content && isQuoteContent(quoteVersion.data.content) ? quoteVersion.data.content : null;
  const serviceByCode = new Map((services.data ?? []).map(item => [item.code, item]));
  const sourceLines = content?.lines ?? [];
  const canUseQuote = Boolean(acceptedQuote && content && !content.commission && sourceLines.length > 0
    && sourceLines.length <= MAX_LINES && sourceLines.every(line =>
      line.code && serviceByCode.has(line.code)
      && (serviceByCode.get(line.code)?.billing_type === line.kind)));
  const quoteSource: QuoteSalePreset | undefined = acceptedQuote ? {
    id: acceptedQuote.id, number: acceptedQuote.quote_number,
    lines: canUseQuote ? sourceLines.map(line => ({
      service: line.code!, price: line.unitPrice, qty: String(line.qty), description: line.description,
    })) : [],
    compatible: canUseQuote,
    billingMode: sourceLines.every(line => line.kind === "monthly") ? "monthly"
      : sourceLines.every(line => line.kind === "one_time") ? "one_time" : "mixed",
  } : undefined;
  const failed = services.error ?? clients.error ?? leads.error ?? owners.error ?? linkedLead.error ?? linkedClient.error ?? selectedClient.error ?? quoteR?.error ?? quoteVersion?.error;
  const sourceLead = linkedLead.data;
  const sourceClient = linkedClient.data;
  const clientChoices = [sourceClient, selectedClient.data, ...(clients.data ?? [])]
    .filter((c): c is ClientChoice => Boolean(c))
    .filter((c,index,rows) => rows.findIndex(other => other.id === c.id) === index);
  const chosenLeadId = sourceLead?.id ?? selectedClient.data?.origin_lead_id ?? undefined;
  const originLead = chosenLeadId && !(leads.data ?? []).some(l => l.id === chosenLeadId) && chosenLeadId !== sourceLead?.id
    ? await run<LeadChoice|null>(supabase.from("crm_leads").select("id,company,contact")
      .eq("id",chosenLeadId).eq("archived",false).maybeSingle())
    : null;
  const leadChoices = [sourceLead, originLead?.data, ...(leads.data ?? [])]
    .filter((l): l is LeadChoice => Boolean(l))
    .filter((l,index,rows) => rows.findIndex(other => other.id === l.id) === index);
  // Canonical company ↔ opportunity relation (crm_clients.origin_lead_id). Leads already owned by a company are
  // never offered for a different or new company; an existing client only shows its own opportunity.
  const leadLabel = new Map(leadChoices.map(l => [l.id, l.contact ? `${l.company} · ${l.contact}` : l.company]));
  const ownedLeads = new Set(clientChoices.map(c => c.origin_lead_id).filter((id): id is string => Boolean(id)));
  const clientOptions: ClientOption[] = clientChoices.map(c => ({ id: c.id, label: `${c.legal_name} · ${c.client_code}`,
    lead: c.origin_lead_id ? { id: c.origin_lead_id, label: leadLabel.get(c.origin_lead_id) ?? pick(lang, "Oportunidad vinculada a este cliente", "Opportunity linked to this client") } : null }));
  const freeLeads = leadChoices.filter(l => !ownedLeads.has(l.id) || l.id === sourceLead?.id);
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="new" crm="sales" eyebrow="CRM / Ventas" title={pick(lang, "Registrar venta", "Record a sale")}
      lead={pick(lang, "Registra la venta una sola vez: Avalon crea o vincula el cliente, genera las órdenes de trabajo, los proyectos por departamento, las tareas iniciales y los avisos.", "Record the sale once: Avalon creates or links the client and generates work orders, departmental projects, starter tasks and notices.")} />
    {failed ? <Unavailable lang={lang} code={failed} /> : quoteMismatch
      ? <p className={s.flash} data-tone="error" role="alert">{pick(lang, "La cotización no existe, no está aceptada o no coincide con la oportunidad solicitada. No se registró ninguna venta.", "The quote is unavailable, not accepted or mismatched with the opportunity. No sale was recorded.")} <Link href="/admin/workspace/crm/quotes">{pick(lang, "Volver a cotizaciones", "Back to quotes")}</Link></p>
      : requestedLeadId && !sourceLead
      ? <p className={s.flash} data-tone="error" role="alert">{pick(lang, "La oportunidad enlazada no está disponible. No se registró ninguna venta.", "The linked opportunity is unavailable. No sale was recorded.")} <Link href="/admin/workspace/crm/leads">{pick(lang, "Volver al pipeline", "Back to pipeline")}</Link></p>
      : <SaleForm lang={lang} idempotencyKey={randomUUID()} initialDate={new Date().toISOString().slice(0, 10)} me={userId}
      services={(services.data ?? []).map<CatalogService>(x => ({ code: x.code, name: x.name, name_en: x.name_en, billing_type: x.billing_type, suggested_price: x.offer_status === "approved"
        ? x.billing_type === "monthly" ? (x.monthly_price ?? x.suggested_price) : x.suggested_price
        : null, department: x.crm_departments?.label ?? "" }))}
      clients={clientOptions}
      leads={freeLeads.map(l => ({ id: l.id, label: leadLabel.get(l.id) ?? l.company }))}
      owners={(owners.data ?? []).map(o => ({ id: o.user_id, label: o.email }))}
      quoteSource={quoteSource}
      defaults={{ client_id: sourceLead ? sourceClient?.id : selectedClient.data?.id ?? undefined, lead_id: sourceLead?.id ?? chosenLeadId, legal_name: sourceLead?.company }} />}
  </div></Suite>;
}
