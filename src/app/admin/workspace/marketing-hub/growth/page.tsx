import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import styles from "./growth.module.css";

export const dynamic = "force-dynamic";

export default async function GrowthHub() {
  const { supabase } = await requireOwner();
  // Exact CRM count, not traffic or ad-platform impressions.
  const count = await supabase.from("crm_leads").select("id", { count: "exact" })
    .like("source", "Funnel: %").range(0, 0);
  const leads = count.error ? null : count.count;
  return <Suite active="marketing-hub">
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>AVALON GROWTH / Marketing Hub</span>
        <h1>Campañas y conversión, conectadas al CRM</h1>
        <p>Campaigns administra acciones multicanal; Meta Ads será su integración especializada. Funnel Builder recibe solicitudes voluntarias. Ningún módulo publica anuncios, consume presupuesto ni crea métricas simuladas.</p>
        <nav className={styles.toolbar} aria-label="Herramientas de marketing">
          <Link href="/admin/workspace/marketing-hub/funnels">Funnel Builder</Link>
          <Link href="/admin/workspace/marketing-hub/commercial">Commercial Foundation</Link>
          <Link href="/admin/workspace/marketing-hub">Campaigns existentes</Link>
          <Link href="/admin/creative-bridge">Creative Assets</Link>
          <Link href="/admin/workspace/crm/leads">CRM</Link>
          <Link href="/admin/workspace/ai-communications">AI Communications</Link>
        </nav>
      </header>
      <div className={styles.stats}>
        <div><strong>{leads ?? "—"}</strong><span>Leads con fuente Funnel en CRM</span></div>
        <div><strong>—</strong><span>Gasto publicitario: no conectado</span></div>
        <div><strong>—</strong><span>Conversiones Meta: sin integración</span></div>
      </div>
      <section className={styles.section} aria-labelledby="growth-tools">
        <h2 id="growth-tools">Herramientas comerciales</h2>
        <div className={styles.grid}>
          <article className={styles.card}>
            <span className={styles.badge}>Builder / entorno aislado</span>
            <h3>Funnel Builder</h3>
            <p>Plantillas de captación, propuesta y solicitudes de cita. Formularios con consentimiento, deduplicación y registro en CRM mediante RPC revisada.</p>
            <Link href="/admin/workspace/marketing-hub/funnels">Abrir Builder</Link>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>Gestión interna existente</span>
            <h3>Campaigns</h3>
            <p>Usa los proyectos de Marketing Hub y su calendario editorial. Presupuesto interno por campaña todavía requiere contrato y persistencia aprobados.</p>
            <Link href="/admin/workspace/marketing-hub">Abrir Campaigns</Link>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>Herramienta privada · sin guardado</span>
            <h3>Commercial Foundation</h3>
            <p>Calcula márgenes y comisiones con importes introducidos por los propietarios. Sin precios aprobados, sin cobros y sin distribución real de leads.</p>
            <Link href="/admin/workspace/marketing-hub/commercial">Abrir estimador comercial</Link>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>Sin conexión externa</span>
            <h3>Meta Ads · Facebook / Instagram</h3>
            <p>No hay cuentas publicitarias conectadas ni estadísticas verificadas. Los permisos oficiales y App Review deben aprobarse antes de cualquier lectura o publicación.</p>
            <span className={styles.note}>Publicación, sincronización y gasto desactivados.</span>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>Solo datos de CRM</span>
            <h3>Marketing Analytics</h3>
            <p>El conteo de leads por fuente viene del CRM. Visitas, CTR, ROAS y conversiones externas no están disponibles sin medición legítima.</p>
            <Link href="/admin/workspace/crm/leads">Ver leads reales</Link>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>Preparado / no conectado</span>
            <h3>Marketing Automations</h3>
            <p>Diseño pendiente de autorización, opt-in verificable, límites de frecuencia e idempotencia. Ninguna comunicación sale automáticamente.</p>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>Biblioteca de procedencia</span>
            <h3>Creative Assets</h3>
            <p>Reutiliza Creative Bridge: imágenes, videos y modelos disponibles solo si su importación y licencia están verificadas.</p>
            <Link href="/admin/creative-bridge">Abrir Creative Bridge</Link>
          </article>
        </div>
      </section>
      <p className={styles.note}>Este panel muestra únicamente datos internos verificables. Para clientes, cuentas y proyectos usa las identidades canónicas del CRM; no copies contactos a sistemas paralelos.</p>
    </div>
  </Suite>;
}
