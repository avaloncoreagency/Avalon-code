import Link from "next/link";
import { crmNavigation } from "@/lib/crm/domain";
import { pick, type Lang } from "@/lib/i18n";
import { radarExternalEnabled } from "@/lib/crm/radar-control";
import s from "./crm.module.css";

const daily = [
  crmNavigation[0],
  { slug: "quotes", href: "/admin/workspace/crm/quotes", label: "Cotizaciones" },
  ...crmNavigation.slice(1),
  { slug: "calendar", href: "/admin/workspace/crm/calendar", label: "Calendario" },
  { slug: "tasks", href: "/admin/workspace/crm/tasks", label: "Tareas" },
  { slug: "messages", href: "/admin/workspace/crm/messages", label: "Mensajes internos" },
];
const names: Record<string, [string, string]> = {
  leads: ["Leads Pipeline", "Leads Pipeline"], quotes: ["Cotizaciones", "Quotes"], sales: ["Ventas", "Sales"],
  clients: ["Clientes 360°", "Clients 360°"], calendar: ["Calendario", "Calendar"], tasks: ["Tareas", "Tasks"],
  messages: ["Mensajes internos", "Internal messages"],
};
/** Daily operations, including internal team messaging, remain visible without opening a secondary menu. */
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
  ["inbound", "/admin/workspace/crm/inbound", "Solicitudes del website", "Website inquiries"],
  ["onboarding", "/admin/workspace/crm/onboarding", "Onboarding y entregas", "Onboarding & delivery"],
  ["desk", "/admin/workspace/crm/desk", "Bandeja comercial avanzada", "Advanced sales desk"],
  ["overview", "/admin/workspace/crm/overview", "Resumen y consumo", "Overview and usage"],
  ["new", "/admin/workspace/crm/sales/new", "Registrar venta", "Record sale"],
  ["calendar", "/admin/workspace/crm/calendar", "Calendario", "Calendar"],
  ["tasks", "/admin/workspace/crm/tasks", "Tareas", "Tasks"],
  ["kpis", "/admin/workspace/crm/kpis", "Estadísticas", "Analytics"],
  ["notifications", "/admin/workspace/crm/notifications", "Avisos", "Notifications"],
  ["activity", "/admin/workspace/crm/activity", "Centro de actividad", "Activity center"],
  // Development work ledger (Dev Bridge 3.0) — separate from the commercial activity center above.
  ["dev-ledger", "/admin/dev-bridge/ledger", "Registro de desarrollo", "Development ledger"],
  ["settings", "/admin/workspace/crm/settings", "Configuración", "Settings"],
  ["communications", "/admin/settings/communications", "Comunicaciones con clientes", "Client communications"],
  ["ai-usage", "/admin/workspace/crm/ai-usage", "Uso de IA", "AI usage"],
] as const;
/** Radar is hibernated: it is only offered when the server-side switch is explicitly enabled (see RADAR_REACTIVATION_PLAN.md). */
const radarTool = ["hunter", "/admin/workspace/crm/hunter", "Radar / Lead Hunter", "Radar / Lead Hunter"] as const;

/**
 * `radar` must come from the server when this renders inside a client component: the switch is a server-only
 * variable, so evaluating it in the browser would always read "off" and mismatch the server HTML.
 */
export function CrmTools({ lang = "es", active, radar }: { lang?: Lang; active?: string; radar?: boolean }) {
  const showRadar = radar ?? radarExternalEnabled();
  return (
    <details className={s.tools}>
      <summary>{pick(lang, "Más herramientas del CRM", "More CRM tools")}</summary>
      <nav className={s.toolLinks} aria-label={pick(lang, "Herramientas secundarias del CRM", "Secondary CRM tools")}>
        {[...tools, ...(showRadar ? [radarTool] : [])].map(([key, href, es, en]) => (
          <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>{pick(lang, es, en)}</Link>
        ))}
      </nav>
    </details>
  );
}
