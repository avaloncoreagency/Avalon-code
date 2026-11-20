import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { radarExternalEnabled } from "@/lib/crm/radar-control";
import s from "@/components/sales/sales.module.css";

type State = "READY" | "PENDING" | "BLOCKED" | "NOT_VERIFIED";
export type ReadinessItem = {name:string;state:State;evidence:string;action:string;href:string};
/** Reachability is evidence for a read only, never a claim that a whole integration works. No secrets or row bodies. */
export async function clientReadiness(db:SupabaseClient,lang:Lang):Promise<ReadinessItem[]> {
 const t=(es:string,en:string)=>pick(lang,es,en);
 const checks=[
  ["CRM / Clients 360","crm_clients","/admin/workspace/crm/clients"],
  [t("Contratos","Contracts"),"crm_client_agreement_drafts","/admin/workspace/crm/clients"],
  [t("Ventas","Sales"),"crm_sales","/admin/workspace/crm/sales"],
  [t("Finanzas Core Engine","Core Engine finances"),"crm_invoices","/admin/workspace/crm/settings"],
  ["Project Bridge","os_project_versions","/admin/workspace/website-designer"],
  [t("Documentos / Storage","Documents / Storage"),"crm_attachments","/admin/workspace/crm/clients"],
  ["Code Exchange","os_code_mainline","/admin/dev-bridge"],
 ] as const;
 const rows=await Promise.all(checks.map(async([name,table,href])=>{
  try {
   const {error}=await db.from(table).select("id",{head:true}).limit(0);
   return {name,state:(error?"BLOCKED":"NOT_VERIFIED") as State,href,
    evidence:error?t("Lectura no disponible: revisar esquema o permisos.","Read unavailable: review schema or permissions."):t("Lectura autorizada del esquema disponible; no prueba un recorrido funcional.","Authorized schema read available; this does not verify a functional journey."),
    action:error?t("Revisar compatibilidad y autorización; no aplicar SQL automáticamente.","Review compatibility and authorization; do not apply SQL automatically."):t("Ejecutar aceptación aislada y revisar evidencia del SHA candidato.","Run isolated acceptance and review candidate-SHA evidence.")};
  } catch {return {name,state:"BLOCKED" as State,href,evidence:t("Lectura no confirmada.","Read not confirmed."),action:t("Revisar conexión.","Review connection.")};}
 }));
 return [
  {name:t("Sesión del propietario actual","Current owner session"),state:"READY",evidence:t("La página exige UUID y membresía de propietario en servidor.","The page requires UUID and server-verified owner membership."),action:t("La aceptación con ambos propietarios sigue siendo una prueba aparte.","Acceptance with both owners remains a separate test."),href:"/admin/profile"},
  ...rows,
  {name:t("Radar externo","External Radar"),state:radarExternalEnabled()?"PENDING":"READY",evidence:radarExternalEnabled()?t("Peticiones habilitadas explícitamente en este despliegue.","Requests explicitly enabled in this deployment."):t("Interruptor de este despliegue deshabilitado por defecto.","This deployment's switch is disabled by default."),action:t("Verificar por separado el worker remoto y scheduler; esta página no los cambia.","Verify remote worker and scheduler separately; this page does not change them."),href:"/admin/workspace/crm/hunter"},
  {name:"Dev Bridge / Creative Bridge",state:"NOT_VERIFIED",evidence:t("Los enlaces y registros no certifican entrega ni publicación.","Links and records do not prove delivery or publication."),action:t("Consultar diagnóstico existente y validar una entrega aislada.","Consult existing diagnostics and validate an isolated delivery."),href:"/admin/dev-bridge"},
  {name:t("Migraciones, despliegue y recuperación","Migrations, deployment and recovery"),state:"NOT_VERIFIED",evidence:t("Este panel no tiene privilegios administrativos ni ejecuta cambios remotos.","This panel has no administrative credentials and performs no remote changes."),action:t("Contrastar registro de migraciones, backup, CI y deployment por SHA.","Compare migration ledger, backup, CI and deployment by SHA."),href:"/admin/security"},
 ];
}
export async function ClientReadiness({db,lang}:{db:SupabaseClient;lang:Lang}) {
 const rows=await clientReadiness(db,lang);const t=(es:string,en:string)=>pick(lang,es,en);
 return <section className={s.panel} aria-label="System Readiness"><h2>System Readiness · NOT_READY</h2>
 <p>{t("La preparación del piloto requiere aceptación integral, finanzas activadas con autorización, aislamiento y respaldo comprobados.","Pilot readiness requires end-to-end acceptance, authorized finance activation, verified isolation and recovery.")}</p>
 <p className={s.muted}>{t("Consulta","Checked")}: {formatDate(lang,new Date().toISOString(),true)} · {t("Sin consultas a proveedores de pago.","No paid-provider requests.")}</p>
 <ul className={s.list}>{rows.map(row=><li key={row.name}><strong>{row.name} · {row.state}</strong><p>{row.evidence}</p><p className={s.muted}>{row.action}</p><Link href={row.href}>{t("Revisar","Review")}</Link></li>)}</ul>
 </section>;
}
