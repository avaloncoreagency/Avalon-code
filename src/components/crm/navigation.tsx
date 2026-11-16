import Link from "next/link";
import { crmNavigation } from "@/lib/crm/domain";
import { pick, type Lang } from "@/lib/i18n";
import s from "./crm.module.css";

/** Only the two daily destinations are primary; legacy pages are never deleted. */
export function CrmNavigation({ active, lang = "es" }: { active?: string; lang?: Lang }) {
  const selected = active === "clients" || active === "sales" ? "clients" : "leads";
  return (
    <nav aria-label={pick(lang, "Secciones principales del CRM", "CRM primary sections")} className={s.tabs}>
      {crmNavigation.map((tab) => (
        <Link key={tab.slug} href={tab.href}
          className={`${s.tab} ${selected === tab.slug ? s.active : ""}`}
          aria-current={selected === tab.slug ? "page" : undefined}>
          {tab.slug === "clients" ? pick(lang, "Clientes 360°", "Clients 360°") : tab.label}
        </Link>
      ))}
    </nav>
  );
}

/** Keep the complete workflow one tap away, without six competing top-level tabs. */
const tools = [
  ["hunter", "/admin/workspace/crm/hunter", "Radar / Lead Hunter", "Radar / Lead Hunter"],
  ["desk", "/admin/workspace/crm/desk", "Bandeja comercial avanzada", "Advanced sales desk"],
  ["overview", "/admin/workspace/crm/overview", "Resumen y consumo", "Overview and usage"],
  ["sales", "/admin/workspace/crm/sales", "Ventas", "Sales"],
  ["new", "/admin/workspace/crm/sales/new", "Registrar venta", "Record sale"],
  ["calendar", "/admin/workspace/crm/calendar", "Calendario", "Calendar"],
  ["tasks", "/admin/workspace/crm/tasks", "Tareas", "Tasks"],
  ["kpis", "/admin/workspace/crm/kpis", "Estadísticas", "Analytics"],
  ["notifications", "/admin/workspace/crm/notifications", "Avisos", "Notifications"],
  ["activity", "/admin/workspace/crm/activity", "Actividad", "Activity"],
  ["settings", "/admin/workspace/crm/settings", "Configuración", "Settings"],
  ["ai-usage", "/admin/workspace/crm/ai-usage", "Uso de IA", "AI usage"],
] as const;

export function CrmTools({ lang = "es", active }: { lang?: Lang; active?: string }) {
  return (
    <details className={s.tools}>
      <summary>{pick(lang, "Más herramientas del CRM", "More CRM tools")}</summary>
      <nav className={s.toolLinks} aria-label={pick(lang, "Herramientas secundarias del CRM", "Secondary CRM tools")}>
        {tools.map(([key, href, es, en]) => (
          <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>{pick(lang, es, en)}</Link>
        ))}
      </nav>
    </details>
  );
}
