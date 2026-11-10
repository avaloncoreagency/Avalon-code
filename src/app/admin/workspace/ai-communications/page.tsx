import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import styles from "../marketing-hub/growth/growth.module.css";

export const dynamic = "force-dynamic";

export default async function AiCommunicationsHub() {
  await requireOwner();
  return <Suite active="ai-receptionist">
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>AVALON GROWTH / AI Communications Hub</span>
        <h1>Un contexto de cliente, dos productos independientes</h1>
        <p>AI Chatbots (web) y AI Receptionist (voz) serán soluciones distintas. Comparten identidades canónicas y, tras autorización, la misma base de conocimiento por cliente; no se mezclan conversaciones ni se infieren citas.</p>
        <nav className={styles.toolbar} aria-label="Módulos relacionados">
          <Link href="/admin/workspace/ai-receptionist">AI Receptionist existente</Link>
          <Link href="/admin/workspace/crm">CRM central</Link>
          <Link href="/admin/workspace/marketing-hub/growth">Marketing Hub</Link>
        </nav>
      </header>
      <section className={styles.section} aria-labelledby="comm-tools">
        <h2 id="comm-tools">Productos y operaciones</h2>
        <div className={styles.grid}>
          <article className={styles.card}>
            <span className={styles.badge}>PR #141 · incorporación pendiente</span>
            <h3>AI Chatbots</h3>
            <p>Producto web independiente. La Biblioteca/Builder y sus proyectos pertenecen al PR #141; no se duplica ese constructor. Inferencia y widget todavía necesitan integración autorizada.</p>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>Módulo existente</span>
            <h3>AI Receptionist</h3>
            <p>Se conserva la configuración actual de recepcionistas. La telefonía de pago y las llamadas reales no están activadas aquí.</p>
            <Link href="/admin/workspace/ai-receptionist">Abrir recepción</Link>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>Contrato compartido pendiente</span>
            <h3>Knowledge Base</h3>
            <p>Diseñada para unir fuentes aprobadas a un `client_id` real, con versiones, permisos y procedencia. No se han importado documentos ni habilitado recuperación automática.</p>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>Sin proveedor conectado</span>
            <h3>Conversations</h3>
            <p>No se muestran chats, transcripciones ni llamadas ficticias. Cada conversación futura necesitará un proveedor, consentimiento, cliente y producto identificados.</p>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>Calendario interno</span>
            <h3>Appointments</h3>
            <p>El CRM ya dispone de calendario. Solicitar una cita en un funnel no genera un evento ni reserva disponibilidad sin confirmación humana.</p>
            <Link href="/admin/workspace/crm/calendar">Abrir calendario CRM</Link>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>Sin telemetría externa</span>
            <h3>Analytics</h3>
            <p>Las métricas de voz y chat requerirán eventos reales de proveedores autorizados. Por ahora se utiliza el CRM para las oportunidades comerciales.</p>
            <Link href="/admin/workspace/crm">Ver CRM</Link>
          </article>
        </div>
      </section>
      <p className={styles.note}>No se crean segundos clientes, contactos, índices de conocimiento ni proveedores. El contrato de datos compartidos queda definido en la documentación del PR.</p>
    </div>
  </Suite>;
}
