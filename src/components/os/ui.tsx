import Link from "next/link";
import type { ReactNode } from "react";
import { pick, type Lang } from "@/lib/i18n";
import { Icon } from "@/components/suite/icons";
import type { DbErrorCode } from "@/lib/os/data";
import s from "./os.module.css";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const param = (params: Record<string, string | string[] | undefined>, key: string) => {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
};

export function PageHeader({ eyebrow, title, description, actions, crumbs }: {
  eyebrow?: string; title: string; description?: string; actions?: ReactNode; crumbs?: { href: string; label: string }[];
}) {
  return (
    <header className={s.header}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className={s.crumbs}>
          <ol>{crumbs.map(c => <li key={c.href}><Link href={c.href}>{c.label}</Link></li>)}</ol>
        </nav>
      )}
      <div className={s.headerRow}>
        <div>
          {eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <p className={s.lead}>{description}</p>}
        </div>
        {actions && <div className={s.headerActions}>{actions}</div>}
      </div>
    </header>
  );
}

const OK: Record<string, [string, string]> = {
  created: ["Creado correctamente.", "Created."],
  saved: ["Cambios guardados.", "Changes saved."],
  archived: ["Archivado.", "Archived."],
  restored: ["Restaurado.", "Restored."],
  deleted: ["Eliminado.", "Deleted."],
  published: ["Publicado internamente (sin despliegue externo).", "Published internally (no external deployment)."],
  unpublished: ["Vuelto a borrador.", "Moved back to draft."],
  template: ["Plantilla aplicada.", "Template applied."],
};
const ERR: Record<string, [string, string]> = {
  required: ["Completa los campos obligatorios.", "Fill in the required fields."],
  too_long: ["Algún campo supera la longitud permitida.", "A field is too long."],
  invalid: ["Datos no válidos. Revisa el formulario.", "Invalid data. Check the form."],
  url: ["La URL debe empezar por https://.", "URLs must start with https://."],
  date: ["Fecha no válida.", "Invalid date."],
  number: ["Número no válido.", "Invalid number."],
  price: ["Precio no válido (ej. 19.99).", "Invalid price (e.g. 19.99)."],
  slug: ["Ruta no válida: usa minúsculas, números y guiones.", "Invalid path: use lowercase letters, numbers and hyphens."],
  duplicate: ["Ya existe un registro con ese identificador.", "A record with that identifier already exists."],
  conflict: ["Otra persona guardó cambios antes. Recarga y vuelve a intentarlo.", "Someone saved changes first. Reload and try again."],
  denied: ["No tienes permiso para esta operación.", "You are not allowed to do that."],
  schema_pending: ["La base de datos de módulos aún no está instalada (migración pendiente de aprobación).", "The module database is not installed yet (migration pending approval)."],
  unavailable: ["Servicio no disponible. Inténtalo de nuevo.", "Service unavailable. Try again."],
  not_found: ["No encontrado.", "Not found."],
  block: ["Bloque no válido.", "Invalid block."],
  block_url: ["El enlace del botón no es seguro o no es válido.", "The button link is invalid or unsafe."],
  block_button: ["El botón necesita texto y enlace.", "Buttons need both a label and a link."],
  block_too_long: ["El bloque supera la longitud permitida.", "The block is too long."],
  bp_key: ["Clave no válida (minúsculas, números y _; empieza por letra; no reservada).", "Invalid key (lowercase, digits, _; starts with a letter; not reserved)."],
  bp_duplicate: ["Clave duplicada.", "Duplicate key."],
  bp_label: ["Nombre obligatorio (máx. 80).", "Label required (max 80)."],
  bp_type: ["Tipo no válido.", "Invalid type."],
  bp_options: ["Los campos de selección necesitan opciones.", "Select fields need options."],
  bp_reference: ["El pipeline debe apuntar a una entidad existente.", "Pipelines must point to an existing entity."],
  bp_limit: ["Se alcanzó el límite permitido.", "Limit reached."],
  bp_shape: ["Estructura JSON no válida.", "Invalid JSON structure."],
  bp_json: ["JSON mal formado.", "Malformed JSON."],
  rc_name: ["El asistente necesita un nombre.", "The assistant needs a name."],
  rc_timezone: ["Zona horaria no válida (ej. America/New_York).", "Invalid time zone (e.g. America/New_York)."],
  rc_email: ["Correo de transferencia no válido.", "Invalid handoff email."],
  rc_phone: ["Teléfono de transferencia no válido.", "Invalid handoff phone."],
  rc_language: ["Selecciona al menos un idioma.", "Select at least one language."],
  rc_hours: ["Horario no válido: la apertura debe ser anterior al cierre.", "Invalid hours: opening must be before closing."],
};

export function Flash({ lang, ok, error }: { lang: Lang; ok?: string; error?: string }) {
  const code = error ? (ERR[error] ? error : error.startsWith("block_") ? "block" : "invalid") : undefined;
  if (code) return <p className={s.flash} data-tone="error" role="alert"><Icon name="alert" size={18} />{pick(lang, ...ERR[code])}</p>;
  if (ok && OK[ok]) return <p className={s.flash} data-tone="ok" role="status"><Icon name="check" size={18} />{pick(lang, ...OK[ok])}</p>;
  return null;
}

export function DbNotice({ lang, error }: { lang: Lang; error: DbErrorCode }) {
  if (error === "schema_pending") {
    return (
      <section className={s.notice} data-tone="warning" aria-labelledby="schema-pending">
        <Icon name="clock" size={22} />
        <div>
          <h2 id="schema-pending">{pick(lang, "Módulo listo · base de datos pendiente", "Module ready · database pending")}</h2>
          <p>{pick(lang,
            "El código de este módulo está implementado y probado, pero la migración 20261102120000_avalon_os_modules todavía no se ha aplicado en este entorno. Requiere aprobación explícita. No se muestran ni inventan datos.",
            "This module's code is implemented and tested, but migration 20261102120000_avalon_os_modules has not been applied in this environment yet. It requires explicit approval. No data is shown or invented.")}</p>
          <Link href="/admin/settings">{pick(lang, "Ver estado del sistema", "View system status")}</Link>
        </div>
      </section>
    );
  }
  return <p className={s.flash} data-tone="error" role="alert"><Icon name="alert" size={18} />{pick(lang, ...ERR[error] ?? ERR.unavailable)}</p>;
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon} aria-hidden="true"><Icon name="spark" size={22} /></span>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {children}
    </div>
  );
}

export function Panel({ title, children, actions, id }: { title?: string; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section className={s.panel} aria-labelledby={title && id ? id : undefined}>
      {(title || actions) && <div className={s.panelHead}>{title && <h2 id={id}>{title}</h2>}{actions}</div>}
      {children}
    </section>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger" | "info"; children: ReactNode }) {
  return <span className={s.badge} data-tone={tone}>{children}</span>;
}

export function Tabs({ items, active, label }: { items: { href: string; label: string; key: string }[]; active: string; label: string }) {
  return (
    <nav className={s.tabs} aria-label={label}>
      {items.map(i => <Link key={i.key} href={i.href} aria-current={i.key === active ? "page" : undefined}>{i.label}</Link>)}
    </nav>
  );
}

export const statusTone = (status: string) =>
  status === "active" || status === "published" || status === "approved" ? "ok" : status === "archived" || status === "cancelled" ? "neutral" : status === "planned" || status === "review" ? "info" : "warn";

export const statusLabel = (lang: Lang, status: string) => pick(lang, ({
  draft: "Borrador", active: "Activo", archived: "Archivado", published: "Publicado", idea: "Idea", review: "En revisión",
  approved: "Aprobado", planned: "Planificado", cancelled: "Cancelado",
} as Record<string, string>)[status] ?? status, ({
  draft: "Draft", active: "Active", archived: "Archived", published: "Published", idea: "Idea", review: "In review",
  approved: "Approved", planned: "Planned", cancelled: "Cancelled",
} as Record<string, string>)[status] ?? status);
