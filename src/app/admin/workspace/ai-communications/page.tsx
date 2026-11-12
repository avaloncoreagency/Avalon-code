import Link from "next/link";
import {Suite} from "@/components/suite/suite";
import {requireOwner} from "@/lib/auth/session";
import {getLang} from "@/lib/i18n-server";
import {pick} from "@/lib/i18n";
import {listProjects} from "@/lib/os/data";
import styles from "../marketing-hub/growth/growth.module.css";

export const dynamic="force-dynamic";
export default async function AiCommunicationsHub() {
  const {supabase}=await requireOwner();
  const lang=await getLang();
  const [chatbots,receptionists]=await Promise.all([
    listProjects(supabase,"chatbots"),listProjects(supabase,"receptionist")
  ]);
  const unavailable=chatbots.error||receptionists.error;
  const count=(rows:typeof chatbots)=>rows.error?"—":String(rows.data?.length??0);
  return <Suite active="ai-communications">
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>Avalon OS / AI Communications Hub</span>
        <h1>{pick(lang,"Una central de comunicación, dos productos independientes","One communications center, two independent products")}</h1>
        <p>{pick(lang,
          "Organiza bots web y asistentes de recepción sin duplicar los clientes del CRM. Los proyectos y configuraciones se guardan de forma privada; la IA conversacional y las llamadas reales siguen desconectadas.",
          "Organize web bots and reception assistants without duplicating CRM clients. Project settings are stored privately; conversational AI and real phone calls remain disconnected.")}</p>
        <nav className={styles.toolbar} aria-label={pick(lang,"Productos de comunicación","Communications products")}>
          <Link href="/admin/workspace/ai-chatbots">{pick(lang,"Abrir AI Chatbots","Open AI Chatbots")}</Link>
          <Link href="/admin/workspace/ai-receptionist">{pick(lang,"Abrir AI Receptionist","Open AI Receptionist")}</Link>
          <Link href="/admin/workspace/crm/clients">{pick(lang,"Clientes CRM","CRM clients")}</Link>
        </nav>
      </header>
      {unavailable&&<p className={styles.banner} role="status">{pick(lang,
        "Algunas cifras de proyectos no están disponibles. La migración de chatbots puede seguir pendiente; no se muestran ceros inventados.",
        "Some project counts are unavailable. The chatbot migration may still be pending; unavailable counts are not reported as zero.")}</p>}
      <div className={styles.stats} aria-label={pick(lang,"Proyectos guardados","Saved projects")}>
        <div><span>AI Chatbots</span><strong>{count(chatbots)}</strong><span>{pick(lang,"Proyectos sin archivar","Non-archived projects")}</span></div>
        <div><span>AI Receptionist</span><strong>{count(receptionists)}</strong><span>{pick(lang,"Proyectos sin archivar","Non-archived projects")}</span></div>
        <div><span>{pick(lang,"Canales con proveedor activo","Channels with active providers")}</span><strong>—</strong><span>{pick(lang,"Sin telemetría de proveedor conectada","No provider telemetry connected")}</span></div>
      </div>
      <section className={styles.section} aria-labelledby="comm-tools">
        <h2 id="comm-tools">{pick(lang,"Productos y operaciones","Products and operations")}</h2>
        <div className={styles.grid}>
          <article className={styles.card}><span className={styles.badge}>{pick(lang,"Biblioteca y constructor","Library and builder")}</span>
            <h3>AI Chatbots</h3><p>{pick(lang,"Crea proyectos por cliente, edita personalidad, bienvenida y entradas de conocimiento. Sin motor LLM ni widget público activado.","Create client projects, edit personality, greetings and knowledge entries. No LLM engine or public widget is enabled.")}</p>
            <Link href="/admin/workspace/ai-chatbots/builder">{pick(lang,"Abrir constructor","Open builder")}</Link>
          </article>
          <article className={styles.card}><span className={styles.badge}>{pick(lang,"Configuración persistente","Saved configuration")}</span>
            <h3>AI Receptionist</h3><p>{pick(lang,"Gestiona horarios, FAQ, reglas de transferencia y guiones. No hay telefonía, voz ni llamadas en vivo conectadas.","Manage business hours, FAQ, handoff rules and prompts. No phone, speech or live calls are connected.")}</p>
            <Link href="/admin/workspace/ai-receptionist">{pick(lang,"Abrir recepción","Open reception")}</Link>
          </article>
          <article className={styles.card}><span className={styles.badge}>{pick(lang,"Índice de fuentes privadas","Private source index")}</span>
            <h3>Knowledge Base</h3><p>{pick(lang,"Los borradores de conocimiento de cada producto permanecen aislados. Compartir fuentes entre ambos requerirá autorización del cliente, permisos RLS y versiones auditables.","Each product's knowledge drafts remain isolated. Sharing sources will require client authorization, RLS and auditable versions.")}</p>
            <Link href="/admin/workspace/ai-communications/knowledge">{pick(lang,"Ver índice de conocimiento","Open knowledge index")}</Link>
          </article>
          <article className={styles.card}><span className={styles.badge}>{pick(lang,"Proveedor no conectado","Provider not connected")}</span>
            <h3>Conversations</h3><p>{pick(lang,"Sin chats, llamadas ni transcripciones ficticias. Para habilitarlos se requieren proveedor autorizado, consentimiento y política de retención.","No fabricated chats, calls or transcripts. Enabling them requires an approved provider, consent and retention rules.")}</p>
            <Link href="/admin/workspace/ai-communications/conversations">{pick(lang,"Ver estado de conversaciones","View conversations status")}</Link>
          </article>
          <article className={styles.card}><span className={styles.badge}>{pick(lang,"Calendario CRM existente","Existing CRM calendar")}</span>
            <h3>Appointments</h3><p>{pick(lang,"Abre el calendario real del CRM. Una solicitud no se registra como cita confirmada sin disponibilidad y aprobación.","Open the real CRM calendar. A request is not a confirmed booking without availability and approval.")}</p>
            <Link href="/admin/workspace/ai-communications/appointments">{pick(lang,"Ver citas y calendario","View appointments and calendar")}</Link>
          </article>
          <article className={styles.card}><span className={styles.badge}>{pick(lang,"Datos de proveedor pendientes","Provider data pending")}</span>
            <h3>Analytics</h3><p>{pick(lang,"Aún no hay datos verificables de tokens, conversaciones, duración de llamadas ni costes. Para oportunidades y clientes usa el CRM.","There is no verified token, conversation, call-duration or cost telemetry yet. Use the CRM for sales opportunities and clients.")}</p>
            <Link href="/admin/workspace/ai-communications/analytics">{pick(lang,"Abrir métricas","Open analytics")}</Link>
          </article>
        </div>
      </section>
      <p className={styles.note}>{pick(lang,"Los proyectos pueden registrarse sin conectar APIs. Ninguna acción de esta página envía mensajes, inicia llamadas ni produce cargos.","Projects may be registered without API connections. Nothing on this page sends messages, initiates calls or incurs charges.")}</p>
    </div>
  </Suite>;
}
