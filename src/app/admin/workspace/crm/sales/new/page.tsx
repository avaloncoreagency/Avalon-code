import { randomUUID } from "node:crypto";
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
  const [services, clients, leads, owners] = await Promise.all([
    run<ServiceRow[]>(supabase.from("crm_service_catalog").select("code,name,name_en,billing_type,suggested_price,crm_departments(label)").eq("active", true).order("department_id").order("name")),
    run<{ id: string; legal_name: string; client_code: string }[]>(supabase.from("crm_clients").select("id,legal_name,client_code").neq("status", "archived").order("legal_name").limit(500)),
    run<{ id: string; company: string; contact: string }[]>(supabase.from("crm_leads").select("id,company,contact").eq("archived", false).order("updated_at", { ascending: false }).limit(300)),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
  ]);
  const failed = services.error ?? clients.error ?? owners.error;
  const clientId = q(p, "client"), leadId = q(p, "lead");
  return <Suite active="crm"><main className={s.hud}>
    <OpsHeader lang={lang} active="new" crm="sales" eyebrow="CRM / Ventas" title={pick(lang, "Registrar venta", "Record a sale")}
      lead={pick(lang, "Registra la venta una sola vez: Avalon crea o vincula el cliente, genera las órdenes de trabajo, los proyectos por departamento, las tareas iniciales y los avisos.", "Record the sale once: Avalon creates or links the client and generates work orders, departmental projects, starter tasks and notices.")} />
    {failed ? <Unavailable lang={lang} code={failed} /> : <SaleForm lang={lang} idempotencyKey={randomUUID()} me={userId}
      services={(services.data ?? []).map<CatalogService>(x => ({ code: x.code, name: x.name, name_en: x.name_en, billing_type: x.billing_type, suggested_price: x.suggested_price, department: x.crm_departments?.label ?? "" }))}
      clients={(clients.data ?? []).map(c => ({ id: c.id, label: `${c.legal_name} · ${c.client_code}` }))}
      leads={(leads.data ?? []).map(l => ({ id: l.id, label: l.contact ? `${l.company} · ${l.contact}` : l.company }))}
      owners={(owners.data ?? []).map(o => ({ id: o.user_id, label: o.email }))}
      defaults={{ client_id: clientId && UUID_RE.test(clientId) ? clientId : undefined, lead_id: leadId && UUID_RE.test(leadId) ? leadId : undefined }} />}
  </main></Suite>;
}
