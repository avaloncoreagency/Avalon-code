import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedMember } from "@/lib/auth/access";
export const dynamic = "force-dynamic";
export default async function SalesPage() {
  const client = await createClient();
  const member = await getAuthorizedMember(client);
  if (!member) return <Suite active="crm"><p>Acceso no autorizado.</p></Suite>;
  const { data: stages, error: stagesError } = await client.from("crm_stages").select("id,label,kind,position").order("position");
  const { data: leads, error: leadsError } = await client.from("crm_leads").select("id,company,contact,value,stage_id").eq("archived", false).order("created_at", { ascending: false }).limit(200);
  return <Suite active="crm"><main style={{padding:24}}><h1>Ventas</h1><p>Vista de oportunidades vinculadas al pipeline de Avalon. Los movimientos de etapa se gestionan en Leads Pipeline.</p><Link href="/admin/workspace/crm">Volver al CRM</Link>{stagesError || leadsError ? <p role="alert">No se pudo cargar el tablero.</p> : <div style={{display:"flex",gap:16,overflowX:"auto",paddingTop:24}}>{(stages ?? []).filter(stage => stage.kind !== "lost").map(stage => <section key={stage.id} style={{minWidth:240,padding:16,border:"1px solid #777",borderRadius:12}}><h2>{stage.label}</h2>{(leads ?? []).filter(lead => lead.stage_id === stage.id).map(lead => <article key={lead.id} style={{padding:12,marginBottom:12,border:"1px solid #555",borderRadius:8}}><strong>{lead.company}</strong><p>{lead.contact}</p><p>{Number(lead.value ?? 0).toLocaleString("es",{style:"currency",currency:"USD"})} estimados</p><Link href={'/admin/workspace/crm/leads?lead='+lead.id}>Abrir lead</Link></article>)}</section>)}</div>}<p>Se muestran hasta 200 registros recientes. La vista de ventas es de solo lectura hasta disponer de un flujo independiente de oportunidades.</p></main></Suite>;
}
