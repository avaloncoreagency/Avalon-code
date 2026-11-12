import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Panel, DbNotice } from "@/components/os/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { countRows } from "@/lib/os/data";
import s from "@/components/os/os.module.css";

export const dynamic = "force-dynamic";
export default async function CommunicationsAnalytics() {
  const {supabase}=await requireOwner();
  const lang=await getLang();
  const [bots, receptionists, entries, faq] = await Promise.all([
    countRows(supabase,"os_projects",[["eq","module","chatbots"],["neq","status","archived"]]),
    countRows(supabase,"os_projects",[["eq","module","receptionist"],["neq","status","archived"]]),
    countRows(supabase,"os_receptionist_entries",[["eq","kind","knowledge"]]),
    countRows(supabase,"os_receptionist_entries",[["eq","kind","faq"]]),
  ]);
  const rows=[
    {key:"chatbots",value:bots,es:"Chatbots registrados",en:"Registered chatbots",href:"/admin/workspace/ai-chatbots"},
    {key:"receptionists",value:receptionists,es:"Recepcionistas registrados",en:"Registered receptionists",href:"/admin/workspace/ai-receptionist"},
    {key:"knowledge",value:entries,es:"Fuentes de conocimiento (recepción)",en:"Reception knowledge entries",href:"/admin/workspace/ai-communications/knowledge"},
    {key:"faq",value:faq,es:"Preguntas frecuentes (recepción)",en:"Reception FAQ entries",href:"/admin/workspace/ai-communications/knowledge"},
  ];
  return <Suite active="ai-communications">
    <PageHeader eyebrow="AI Communications / Analytics"
      title={pick(lang,"Métricas verificables","Verified analytics")}
      description={pick(lang,"Solo inventario persistido en la base de datos. No se estiman conversaciones, llamadas, conversiones, coste ni ROI sin datos del proveedor.","Database inventory only. Conversations, calls, conversions, costs and ROI are not estimated without provider evidence.")}
      crumbs={[{href:"/admin/workspace/ai-communications",label:"AI Communications Hub"}]} />
    <div className={s.stats}>
      {rows.map(item=><div className={s.stat} key={item.key}>
        <span>{pick(lang,item.es,item.en)}</span>
        <strong>{item.value.count===null?"—":item.value.count.toLocaleString(lang==="es"?"es-ES":"en-US")}</strong>
        <Link href={item.href}>{pick(lang,"Ver registros","View records")}</Link>
      </div>)}
    </div>
    {rows.some(x=>x.value.error)&&<Panel title={pick(lang,"Datos pendientes","Unavailable data")}>
      {rows.filter(x=>x.value.error).map(x=><DbNotice key={x.key} lang={lang} error={x.value.error!}/>)}
    </Panel>}
    <Panel title={pick(lang,"Métricas de proveedores","Provider metrics")}>
      <p>{pick(lang,"Conversaciones: sin telemetría · Llamadas: sin telemetría · Tokens: sin telemetría · Gasto: sin telemetría. Una cifra ausente no equivale a cero.","Conversations: no telemetry · Calls: no telemetry · Tokens: no telemetry · Spend: no telemetry. Missing data is not zero.")}</p>
      <Link href="/admin/workspace/crm">{pick(lang,"Ver resultados comerciales del CRM","See CRM sales results")}</Link>
    </Panel>
  </Suite>;
}
