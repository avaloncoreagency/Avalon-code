import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { SaleForm, type CatalogService } from "@/components/sales/sale-form";
import { OpsHeader, Unavailable, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type ServiceRow = { code: string; name: string; name_en: string; billing_type: string; suggested_price: string | null; crm_departments: { label: string } | null };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase, userId } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const requestedLeadId = q(p, "lead");
  const leadId = requestedLeadId && UUID_RE.test(requestedLeadId) ? requestedLeadId : null;
  type LeadChoice = { id: string; company: string; contact: string };
  type ClientChoice = { id: string; legal_name: string; client_code: string };
  const [services, clients, leads, owners, linkedLead, linkedClient] = await Promise.all([
    run<ServiceRow[]>(supabase.from("crm_service_catalog").select("code,name,name_en,billing_type,suggested_price,crm_departments(label)").eq("active", true).order("department_id").order("name")),
    run<ClientChoice[]>(supabase.from("crm_clients").select("id,legal_name,client_code").neq("status", "archived").order("legal_name").limit(500)),
    run<{ id: string; company: string; contact: string }[]>(supabase.from("crm_leads").select("id,company,contact").eq("archived", false).order("updated_at", { ascending: false }).limit(300)),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    leadId
      ? run<LeadChoice | null>(supabase.from("crm_leads").select("id,company,contact").eq("id", leadId).eq("archived", false).maybeSingle())
      : Promise.resolve({ data: null, error: null, count: null } as const),
    leadId
      ? run<ClientChoice | null>(supabase.from("crm_clients").select("id,legal_name,client_code").eq("origin_lead_id", leadId).neq("status", "archived").maybeSingle())
      : Promise.resolve({ data: null, error: null, count: null } as const),
  ]);
  const failed = services.error ?? clients.error ?? leads.error ?? owners.error ?? linkedLead.error ?? linkedClient.error;
  const clientId = q(p, "client");
  const sourceLead = linkedLead.data;
  const sourceClient = linkedClient.data;
  // A lead can already be a client; resolve by the canonical origin UUID, never by a name guess.
  // The list only loads 500 clients, so preserve the selected client even when it is older.
  const clientChoices = sourceClient && !(clients.data ?? []).some(item => item.id === sourceClient.id)
    ? [sourceClient, ...(clients.data ?? [])] : (clients.data ?? []);
  // The general 300-lead selector is paginated; keep an older, explicitly linked lead selectable.
  const leadChoices = sourceLead && !(leads.data ?? []).some(item => item.id === sourceLead.id)
    ? [sourceLead, ...(leads.data ?? [])] : (leads.data ?? []);
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="new" crm="sales" eyebrow="CRM / Ventas" title={pick(lang, "Registrar venta", "Record a sale")}
      lead={pick(lang, "Registra la venta una sola vez: Avalon crea o vincula el cliente, genera las órdenes de trabajo, los proyectos por departamento, las tareas iniciales y los avisos.", "Record the sale once: Avalon creates or links the client and generates work orders, departmental projects, starter tasks and notices.")} />
    {failed ? <Unavailable lang={lang} code={failed} /> : requestedLeadId && !sourceLead
      ? <p className={s.flash} data-tone="error" role="alert">{pick(lang, "La oportunidad enlazada no está disponible. No se registró ninguna venta.", "The linked opportunity is unavailable. No sale was recorded.")} <Link href="/admin/workspace/crm/leads">{pick(lang, "Volver al pipeline", "Back to pipeline")}</Link></p>
      : <SaleForm lang={lang} idempotencyKey={randomUUID()} me={userId}
      services={(services.data ?? []).map<CatalogService>(x => ({ code: x.code, name: x.name, name_en: x.name_en, billing_type: x.billing_type, suggested_price: x.suggested_price, department: x.crm_departments?.label ?? "" }))}
      clients={clientChoices.map(c => ({ id: c.id, label: `${c.legal_name} · ${c.client_code}` }))}
      leads={leadChoices.map(l => ({ id: l.id, label: l.contact ? `${l.company} · ${l.contact}` : l.company }))}
      owners={(owners.data ?? []).map(o => ({ id: o.user_id, label: o.email }))}
      defaults={{ client_id: sourceLead ? sourceClient?.id : clientId && UUID_RE.test(clientId) ? clientId : undefined, lead_id: sourceLead?.id, legal_name: sourceLead?.company }} />}
  </div></Suite>;
}
