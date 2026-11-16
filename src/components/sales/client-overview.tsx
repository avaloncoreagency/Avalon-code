import Link from "next/link";
import type { ModuleKey } from "@/lib/os/domain";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { linkExistingProject } from "@/app/admin/workspace/crm/clients/project-actions";
import styles from "./client-overview.module.css";

type Client = {
  id: string; client_code: string; legal_name: string; trade_name: string; industry: string;
  location: string; country: string; source: string; status: string; created_at: string;
  origin_lead_id: string | null;
};
type Contact = { id: string; full_name: string; role: string; email: string | null; phone: string; is_primary: boolean };
type Task = { id: string; title: string; status: string; due_at: string | null };
type Latest = { event_type: string; created_at: string; detail: string };
type ModuleCounts = Record<ModuleKey, number | null>;
export type ClientCounts = {
  products: number | null; activeProducts: number | null; openTasks: number | null;
  overdueTasks: number | null; sales: number | null; documents: number | null;
  workOrders: number | null; agreements: number | null; modules: ModuleCounts;
};
export type LinkableProduct = { id: string; name: string; module: ModuleKey };

const AREAS: { name: string; es: string; en: string; modules: ModuleKey[]; href: string; noteEs: string; noteEn: string }[] = [
  { name: "Website Designer", es: "Websites", en: "Websites", modules: ["website"], href: "/admin/workspace/website-designer", noteEs: "URLs, versiones y entregas", noteEn: "URLs, versions and deliveries" },
  { name: "E-commerce Designer", es: "Tiendas online", en: "Online stores", modules: ["ecommerce"], href: "/admin/workspace/ecommerce-designer", noteEs: "Tiendas y mantenimiento", noteEn: "Stores and maintenance" },
  { name: "CRM Creator", es: "CRMs personalizados", en: "Custom CRMs", modules: ["crm_creator"], href: "/admin/workspace/crm-creator", noteEs: "Proyectos CRM externos", noteEn: "External CRM projects" },
  { name: "COMMUNICATION HUB", es: "Agentes de comunicación", en: "Communication agents", modules: ["receptionist", "chatbots"], href: "/admin/workspace/ai-communications", noteEs: "Recepcionistas y chatbots", noteEn: "Receptionists and chatbots" },
  { name: "Marketing Hub", es: "Campañas y funnels", en: "Campaigns and funnels", modules: ["marketing"], href: "/admin/workspace/marketing-hub", noteEs: "Campañas registradas", noteEn: "Registered campaigns" },
];

const digits = (v: number | null) => v === null ? "—" : String(v);

export function ClientOverview({ lang, client, owner, contacts, nextSteps, latest, counts, candidates, candidateError }: {
  lang: Lang; client: Client; owner: string; contacts: Contact[] | null;
  nextSteps: Task[]; latest: Latest | null; counts: ClientCounts;
  candidates: LinkableProduct[]; candidateError: boolean;
}) {
  const name = client.trade_name || client.legal_name;
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0] ?? "").join("").toUpperCase();
  const primary = contacts?.find(c => c.is_primary) ?? contacts?.[0] ?? null;
  const base = `/admin/workspace/crm/clients/${client.id}`;
  const badges = [
    { es: "Proyectos vinculados", en: "Linked projects", value: counts.products, href: "#projects" },
    { es: "Proyectos activos¹", en: "Active projects¹", value: counts.activeProducts, href: "#projects" },
    { es: "Tareas abiertas", en: "Open tasks", value: counts.openTasks, href: `/admin/workspace/crm/tasks?client=${client.id}` },
    { es: "Tareas vencidas", en: "Overdue tasks", value: counts.overdueTasks, href: `/admin/workspace/crm/tasks?client=${client.id}&view=overdue` },
    { es: "Documentos", en: "Documents", value: counts.documents, href: "#client-files" },
    { es: "Ventas registradas", en: "Recorded sales", value: counts.sales, href: `/admin/workspace/crm/sales?client=${client.id}` },
  ];
  const place = [client.location, client.country].filter(Boolean).join(", ");
  return (
    <section className={styles.overview} aria-label={pick(lang, "Visión general del cliente", "Client overview")} id="client-overview">
      <div className={styles.hero}>
        <span className={styles.avatar} aria-hidden="true">{initials || "AC"}</span>
        <div className={styles.identity}>
          <p className={styles.eyebrow}>AVALON OS / CLIENT 360° · {client.client_code}</p>
          <h2>{name}</h2>
          <p className={styles.subtitle}>{[client.trade_name && client.legal_name !== client.trade_name ? client.legal_name : "", client.industry, place].filter(Boolean).join(" · ") || pick(lang, "Completa los datos de este cliente", "Complete this client's profile")}</p>
          <div className={styles.meta}>
            <span data-status={client.status}>{pick(lang, "Estado", "Status")}: {client.status}</span>
            <span>{pick(lang, "Responsable", "Owner")}: {owner}</span>
            <span>{pick(lang, "Desde", "Since")}: {formatDate(lang, client.created_at)}</span>
          </div>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.primaryAction} href={`/admin/workspace/crm/sales/new?client=${client.id}`}>{pick(lang, "+ Registrar venta", "+ Record sale")}</Link>
          <Link href={`/admin/workspace/crm/sales?client=${client.id}`}>{pick(lang, "Ver ventas del cliente", "Client sales")}</Link>
          <Link href={`${base}/contracts`}>{pick(lang, "Contratos", "Agreements")}</Link>
        </div>
      </div>

      <nav className={styles.jump} aria-label={pick(lang, "Ir a una sección", "Jump to section")}>
        <a href="#client-tools">{pick(lang, "Herramientas", "Tools")}</a>
        <a href="#internal-workspace">{pick(lang, "Expediente", "Dossier")}</a>
        <a href="#projects">{pick(lang, "Proyectos", "Projects")}</a>
        <a href="#client-files">{pick(lang, "Documentos", "Files")}</a>
        <a href="#history">{pick(lang, "Historial", "History")}</a>
      </nav>

      <div className={styles.stats} aria-label={pick(lang, "Indicadores por cliente", "Client-specific indicators")}>
        {badges.map(item => <a className={styles.metric} key={item.en} href={item.href}>
          <span>{pick(lang, item.es, item.en)}</span>
          <strong>{digits(item.value)}</strong>
        </a>)}
      </div>
      <p className={styles.note}>{pick(lang,
        "Los números salen de registros vinculados por identificadores reales; «—» significa no disponible. ¹Activo es el estado interno de Avalon, no una confirmación de que el proveedor externo esté funcionando.",
        "Numbers come from records linked by real IDs; '—' means unavailable. ¹Active is Avalon's internal project state, not proof an external provider is running.")}</p>

      <div className={styles.layout}>
        <section className={styles.panel} id="client-tools" aria-labelledby="client-tools-title">
          <div className={styles.panelHead}><h3 id="client-tools-title">{pick(lang, "Ecosistema de herramientas", "Tools ecosystem")}</h3><span>{pick(lang, "Vínculos reales por cliente", "Real client links")}</span></div>
          <div className={styles.products}>
            {AREAS.map(area => {
              const nums = area.modules.map(module => counts.modules[module]);
              const total = nums.every(v => v !== null) ? nums.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null;
              const search = `?client=${encodeURIComponent(client.id)}`;
              const fragment = area.href.endsWith("ai-communications") ? "#new-agent" : "#new";
              return <article className={styles.product} key={area.name}>
                <div><p className={styles.productEyebrow}>{area.name}</p><h4>{pick(lang, area.es, area.en)}</h4><p>{pick(lang, area.noteEs, area.noteEn)}</p></div>
                <div className={styles.productCount}><strong>{digits(total)}</strong><small>{pick(lang, "registrados", "registered")}</small></div>
                <div className={styles.productActions}>
                  <Link href={area.href}>{pick(lang, "Abrir módulo", "Open module")}</Link>
                  <Link href={area.href + search + fragment}>{pick(lang, "+ Vincular producto nuevo", "+ Register linked product")}</Link>
                </div>
              </article>;
            })}
          </div>
          <div className={styles.linker}>
            <h4>{pick(lang, "Vincular un producto existente", "Link an existing product")}</h4>
            <p>{pick(lang, "Selecciona un proyecto externo todavía sin cliente. Avalon comprobará su lead de origen, sus órdenes y sus tareas antes de asociarlo. El cambio queda en la auditoría del producto.", "Select an external project without a client. Avalon checks its originating lead, orders and tasks before linking; the change remains in the product audit.")}</p>
            {candidateError ? <p role="alert">{pick(lang, "No se pudo cargar la lista de productos sin asignar.", "Unable to load unassigned products.")}</p> :
              candidates.length > 0 ? <form action={linkExistingProject} className={styles.linkForm}>
                <input type="hidden" name="client_id" value={client.id} />
                <label htmlFor="client-product-link">{pick(lang, "Proyecto sin cliente", "Unassigned project")}</label>
                <select id="client-product-link" name="project_id" required defaultValue="">
                  <option value="" disabled>{pick(lang, "Selecciona el proyecto…", "Choose a project…")}</option>
                  {candidates.map(p => <option key={p.id} value={p.id}>{p.name} · {p.module} · {p.id.slice(0, 8)}</option>)}
                </select>
                <button type="submit">{pick(lang, "Vincular al cliente", "Link to client")}</button>
              </form> : <p>{pick(lang, "No hay productos elegibles sin asignar en la lista reciente. Puedes registrar uno desde cualquiera de los módulos.", "No eligible unassigned products in the recent list. Register one from a product module.")}</p>}
          </div>
        </section>

        <aside className={styles.side} aria-label={pick(lang, "Ficha rápida", "Quick facts")}>
          <section className={styles.panel}>
            <h3>{pick(lang, "Contacto principal", "Primary contact")}</h3>
            {contacts === null ? <p>—</p> : primary ? <>
              <strong>{primary.full_name}</strong>
              <p>{primary.role || pick(lang, "Contacto", "Contact")}</p>
              {primary.email && <p><a href={`mailto:${primary.email}`}>{primary.email}</a></p>}
              {primary.phone && <p><a href={`tel:${primary.phone.replace(/[^+\d]/g, "")}`}>{primary.phone}</a></p>}
            </> : <p>{pick(lang, "Falta registrar un contacto. Puedes añadirlo en Identidad y contactos.", "No contact recorded yet. Add one under Identity and contacts.")}</p>}
            <p className={styles.small}>{pick(lang, "Fuente", "Source")}: {client.source || "—"}</p>
            {client.origin_lead_id && <Link href={`/admin/workspace/crm/lead/${client.origin_lead_id}`}>{pick(lang, "Ver lead de origen", "View originating lead")}</Link>}
          </section>
          <section className={styles.panel}>
            <h3>{pick(lang, "Siguiente paso", "Next action")}</h3>
            {nextSteps.length ? <ul className={styles.shortList}>{nextSteps.slice(0, 3).map(t => <li key={t.id}><Link href={`/admin/workspace/crm/tasks?client=${client.id}&task=${t.id}`}>{t.title}</Link><small>{t.due_at ? formatDate(lang, t.due_at, true) : pick(lang, "Sin vencimiento", "No deadline")}</small></li>)}</ul> :
              <p>{pick(lang, "No hay tareas abiertas próximas en los registros consultados.", "No upcoming open tasks in the loaded records.")}</p>}
          </section>
          <section className={styles.panel}>
            <h3>{pick(lang, "Última actividad", "Latest activity")}</h3>
            {latest ? <><strong>{latest.event_type}</strong><p>{formatDate(lang, latest.created_at, true)}</p>{latest.detail && <p className={styles.small}>{latest.detail}</p>}</> :
              <p>{pick(lang, "Sin movimientos auditados en la línea de tiempo.", "No audited timeline events.")}</p>}
            <Link href={`/admin/workspace/crm/activity?client=${client.id}`}>{pick(lang, "Historial completo", "Full history")}</Link>
          </section>
        </aside>
      </div>
    </section>
  );
}
