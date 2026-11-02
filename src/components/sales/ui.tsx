import Link from "next/link";
import type { ReactNode } from "react";
import { CrmNavigation } from "@/components/crm/navigation";
import { pick, type Lang } from "@/lib/i18n";
import { label, saleErrorText, tone } from "@/lib/sales/domain";
import s from "./sales.module.css";

export type Query = Record<string, string | string[] | undefined>;
export const q = (params: Query, key: string) => (typeof params[key] === "string" ? params[key] as string : undefined);
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LINKS = [
  ["sales", "/admin/workspace/crm/sales", "Ventas", "Sales"],
  ["new", "/admin/workspace/crm/sales/new", "Registrar venta", "Record sale"],
  ["clients", "/admin/workspace/crm/clients", "Clientes 360°", "Clients 360°"],
  ["activity", "/admin/workspace/crm/activity", "Centro de actividad", "Activity center"],
  ["notifications", "/admin/workspace/crm/notifications", "Avisos", "Notices"],
] as const;

/** Main five-tab CRM order is preserved; operations views sit in a secondary row. */
export function OpsHeader({ lang, active, crm, title, eyebrow, lead, actions }: {
  lang: Lang; active: string; crm?: string; title: string; eyebrow: string; lead?: string; actions?: ReactNode;
}) {
  return <>
    <CrmNavigation active={crm} />
    <nav className={s.subnav} aria-label={pick(lang, "Operaciones comerciales", "Commercial operations")}>
      {LINKS.map(([key, href, es, en]) => <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>{pick(lang, es, en)}</Link>)}
    </nav>
    <header className={s.header}>
      <div><p className={s.eyebrow}>{eyebrow}</p><h1>{title}</h1>{lead && <p className={s.lead}>{lead}</p>}</div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  </>;
}

export function Tag({ lang, value }: { lang: Lang; value: string }) {
  return <span className={s.tag} data-tone={tone(value)}>{label(lang, value)}</span>;
}

export function ErrorFlash({ lang, code }: { lang: Lang; code?: string | null }) {
  if (!code) return null;
  return <p className={s.flash} data-tone="error" role="alert">{saleErrorText(lang, code)}</p>;
}

const OK: Record<string, [string, string]> = {
  confirmed: ["Venta confirmada. Proyectos, tareas y avisos creados en una sola operación.", "Sale confirmed. Projects, tasks and notices were created in one operation."],
  replayed: ["Esta venta ya estaba confirmada: no se duplicó nada.", "This sale was already confirmed: nothing was duplicated."],
  saved: ["Cambios guardados.", "Changes saved."],
  payment: ["Cobro registrado.", "Payment recorded."],
  created: ["Creado correctamente.", "Created."],
};
export function OkFlash({ lang, code }: { lang: Lang; code?: string }) {
  if (!code || !OK[code]) return null;
  return <p className={s.flash} data-tone="ok" role="status">{pick(lang, ...OK[code])}</p>;
}

export function Unavailable({ lang, code }: { lang: Lang; code: string }) {
  return <p className={s.flash} data-tone={code === "schema_pending" ? "warn" : "error"} role="alert">{saleErrorText(lang, code === "denied" ? "crm_forbidden" : code)}</p>;
}

export function ownerName(owners: { user_id: string; email: string }[], id: string | null | undefined) {
  if (!id) return "—";
  const owner = owners.find(o => o.user_id === id);
  return owner ? owner.email.split("@")[0] || owner.email : id.slice(0, 8);
}
