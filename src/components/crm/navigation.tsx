import Link from "next/link";
import { crmNavigation } from "@/lib/crm/domain";
import { pick, type Lang } from "@/lib/i18n";
import s from "./crm.module.css";

const daily = [
  crmNavigation[0],
  { slug: "quotes", href: "/admin/workspace/crm/quotes", label: "Cotizaciones" },
  ...crmNavigation.slice(1),
  { slug: "calendar", href: "/admin/workspace/crm/calendar", label: "Calendario" },
  { slug: "tasks", href: "/admin/workspace/crm/tasks", label: "Tareas" },
];
const names: Record<string, [string, string]> = {
  leads: ["Leads Pipeline", "Leads Pipeline"], quotes: ["Cotizaciones", "Quotes"], sales: ["Ventas", "Sales"],
  clients: ["Clientes 360°", "Clients 360°"], calendar: ["Calendario", "Calendar"], tasks: ["Tareas", "Tasks"],
};
/** All six daily operations remain visible without opening a secondary menu. */
export function CrmNavigation({ active, lang = "es" }: { active?: string; lang?: Lang }) {
  const selected = active === "new" ? "sales" : active;
  return (
    <nav aria-label={pick(lang, "Secciones principales del CRM", "CRM primary sections")} className={`${s.tabs} ${s.primaryTabs}`}>
      {daily.map((tab) => (
        <Link key={tab.slug} href={tab.href}
          className={`${s.tab} ${selected === tab.slug ? s.active : ""}`}
          aria-current={selected === tab.slug ? "page" : undefined}>
          {pick(lang, ...names[tab.slug])}
        </Link>
      ))}
    </nav>
  );
}

/** Keep the complete workflow one tap away, without six competing top-level tabs. */
const tools = [
  ["desk", "/admin/workspace/crm/desk", "Bandeja comercial avanzada", "Advanced sales desk"],
  ["overview", "/admin/workspace/crm/overview", "Resumen y consumo", "Overview and usage"],
  ["new", "/admin/workspace/crm/sales/new", "Registrar venta", "Record sale"],
  ["calendar", "/admin/workspace/crm/calendar", "Calendario", "Calendar"],
  ["tasks", "/admin/workspace/crm/tasks", "Tareas", "Tasks"],
  ["kpis", "/admin/workspace/crm/kpis", "Estadísticas", "Analytics"],
  ["notifications", "/admin/workspace/crm/notifications", "Avisos", "Notifications"],
  ["activity", "/admin/workspace/crm/activity", "Centro de actividad", "Activity center"],
  ["settings", "/admin/workspace/crm/settings", "Configuración", "Settings"],
  ["ai-usage", "/admin/workspace/crm/ai-usage", "Uso de IA", "AI usage"],
  // The experimental Radar is deliberately last; lead entry is the primary workflow.
  ["hunter", "/admin/workspace/crm/hunter", "Radar / Lead Hunter", "Radar / Lead Hunter"],
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
