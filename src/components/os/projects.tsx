import Link from "next/link";
import type { ReactNode } from "react";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import type { ModuleKey } from "@/lib/os/domain";
import type { ProjectRow, Loaded } from "@/lib/os/data";
import { createProject, updateProject } from "@/app/admin/workspace/project-actions";
import { Badge, DbNotice, Empty, Panel, statusLabel, statusTone } from "./ui";
import s from "./os.module.css";

export function ProjectsIndex({ lang, module, base, projects, noun, createFields, showArchived }: {
  lang: Lang; module: ModuleKey; base: string; projects: Loaded<ProjectRow[]>; noun: { es: string; en: string };
  createFields?: ReactNode; showArchived: boolean;
}) {
  return (
    <div className={s.split}>
      <div>
        {projects.error ? <DbNotice lang={lang} error={projects.error} /> : (projects.data ?? []).length === 0 ? (
          <Empty title={pick(lang, `Aún no hay ${noun.es}`, `No ${noun.en} yet`)} body={pick(lang, "Crea el primero con el formulario. Todo se guarda en la base de datos privada de Avalon.", "Create the first one with the form. Everything is stored in Avalon's private database.")} />
        ) : (
          <div className={s.grid}>
            {(projects.data ?? []).map(p => (
              <Link key={p.id} href={`${base}/${p.id}`} className={s.item}>
                <h3>{p.name}</h3>
                {p.description && <p>{p.description.length > 140 ? p.description.slice(0, 140) + "…" : p.description}</p>}
                <span className={s.itemFoot}><Badge tone={statusTone(p.status)}>{statusLabel(lang, p.status)}</Badge><span>{pick(lang, "Actualizado", "Updated")} {formatDate(lang, p.updated_at)}</span></span>
              </Link>
            ))}
          </div>
        )}
        <p className={s.meta} style={{ marginTop: 12 }}>
          <Link href={showArchived ? base : `${base}?archived=1`}>{showArchived ? pick(lang, "Ocultar archivados", "Hide archived") : pick(lang, "Mostrar archivados", "Show archived")}</Link>
        </p>
      </div>
      <div id="new">
        <Panel title={pick(lang, "Crear", "Create")} id="create-title">
          <form action={createProject} className={s.form}>
            <input type="hidden" name="module" value={module} />
            <label className={s.field}><span>{pick(lang, "Nombre", "Name")} *</span><input className={s.input} name="name" required maxLength={120} autoComplete="off" /></label>
            <label className={s.field}><span>{pick(lang, "Descripción", "Description")}</span><textarea className={s.textarea} name="description" maxLength={2000} rows={3} /></label>
            {createFields}
            <div className={s.actions}><button className={s.btnPrimary} type="submit" disabled={Boolean(projects.error)}>{pick(lang, "Crear", "Create")}</button></div>
            {projects.error === "schema_pending" && <p className={s.meta}>{pick(lang, "Disponible cuando se aplique la migración de módulos.", "Available once the module migration is applied.")}</p>}
          </form>
        </Panel>
      </div>
    </div>
  );
}

export function ProjectSettingsForm({ lang, project, returnTo }: { lang: Lang; project: ProjectRow; returnTo?: "settings" }) {
  return (
    <form action={updateProject} className={s.form}>
      <input type="hidden" name="module" value={project.module} />
      <input type="hidden" name="id" value={project.id} />
      <input type="hidden" name="version" value={project.version} />
      {returnTo && <input type="hidden" name="return" value={returnTo} />}
      <div className={s.row}>
        <label className={s.field}><span>{pick(lang, "Nombre", "Name")} *</span><input className={s.input} name="name" defaultValue={project.name} required maxLength={120} /></label>
        <label className={s.field}><span>{pick(lang, "Estado", "Status")}</span>
          <select className={s.select} name="status" defaultValue={project.status}>
            {(["draft", "active", "archived"] as const).map(v => <option key={v} value={v}>{statusLabel(lang, v)}</option>)}
          </select>
        </label>
      </div>
      <label className={s.field}><span>{pick(lang, "Descripción", "Description")}</span><textarea className={s.textarea} name="description" defaultValue={project.description} maxLength={2000} rows={3} /></label>
      <div className={s.actions}>
        <button className={s.btnPrimary} type="submit">{pick(lang, "Guardar", "Save")}</button>
        <span className={s.meta}>v{project.version} · {pick(lang, "Creado", "Created")} {formatDate(lang, project.created_at)}</span>
      </div>
    </form>
  );
}
