import { directoryDisplayName } from "@/lib/identity/owners";
import type { ReactNode } from "react";
import { CrmNavigation, CrmTools } from "@/components/crm/navigation";
import { pick, type Lang } from "@/lib/i18n";
import { label, saleErrorText, tone } from "@/lib/sales/domain";
import { workspaceFeedback } from "@/lib/crm/workspace-feedback";
import s from "./sales.module.css";

export type Query = Record<string, string | string[] | undefined>;
export const q = (params: Query, key: string) => (typeof params[key] === "string" ? params[key] as string : undefined);
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Legacy operational routes are available under one collapsed, accessible tool menu. */
export function OpsLinks({ lang, active }: { lang: Lang; active?: string }) {
  return <CrmTools lang={lang} active={active} />;
}

/** Main navigation always exposes Leads Pipeline, Sales and Clients 360°. */
export function OpsHeader({ lang, active, crm, title, eyebrow, lead, actions }: {
  lang: Lang; active: string; crm?: string; title: string; eyebrow: string; lead?: string; actions?: ReactNode;
}) {
  return <>
    <CrmNavigation active={crm === "sales" || active === "sales" || active === "new" ? "sales" : crm === "clients" || active === "clients" ? "clients" : active} lang={lang} />
    <OpsLinks lang={lang} active={active} />
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
  return <p className={s.flash} data-tone="error" role="alert">{workspaceFeedback("error", lang, code) ?? saleErrorText(lang, code)}</p>;
}

const OK: Record<string, [string, string]> = {
  confirmed: ["Venta confirmada. Proyectos, tareas y avisos creados en una sola operación.", "Sale confirmed. Projects, tasks and notices were created in one operation."],
  replayed: ["Esta venta ya estaba confirmada: no se duplicó nada.", "This sale was already confirmed: nothing was duplicated."],
  saved: ["Cambios guardados.", "Changes saved."],
  payment: ["Cobro registrado.", "Payment recorded."],
  created: ["Creado correctamente.", "Created."],
};
export function OkFlash({ lang, code }: { lang: Lang; code?: string }) {
  const message = code ? workspaceFeedback("ok", lang, code) : null;
  // URL query codes are untrusted; inherited Object keys are never valid success codes.
  const legacy = code && Object.hasOwn(OK, code) ? OK[code] : undefined;
  if (!message && !legacy) return null;
  return <p className={s.flash} data-tone="ok" role="status">{message ?? (legacy ? pick(lang, ...legacy) : "")}</p>;
}

export function Unavailable({ lang, code }: { lang: Lang; code: string }) {
  return <p className={s.flash} data-tone={code === "schema_pending" ? "warn" : "error"} role="alert">{saleErrorText(lang, code === "denied" ? "crm_forbidden" : code)}</p>;
}

export function ownerName(owners: { user_id: string; email: string }[], id: string | null | undefined) {
  if (!id) return "—";
  return directoryDisplayName(owners, id);
}
