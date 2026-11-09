import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, Panel, Empty, Badge, DbNotice, param, type SearchParams } from "@/components/os/ui";
import { ProjectSettingsForm } from "@/components/os/projects";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, type Lang } from "@/lib/i18n";
import { getProject } from "@/lib/os/data";
import { BLUEPRINT_TEMPLATES, FIELD_TYPES, PERMISSION_LEVELS, isUuid, readBlueprint } from "@/lib/os/domain";
import { mutateBlueprint } from "../actions";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/crm-creator";
const FIELD_NAMES: Record<string, [string, string]> = {
  text: ["Texto", "Text"], long_text: ["Texto largo", "Long text"], email: ["Correo", "Email"], phone: ["Teléfono", "Phone"], number: ["Número", "Number"],
  currency: ["Importe", "Currency"], date: ["Fecha", "Date"], boolean: ["Sí/No", "Yes/No"], select: ["Selección", "Select"], url: ["URL", "URL"],
};
const LEVEL_NAMES: Record<string, [string, string]> = { none: ["Sin acceso", "None"], view: ["Ver", "View"], edit: ["Editar", "Edit"], manage: ["Gestionar", "Manage"] };

function OpForm({ id, version, op, children, className }: { id: string; version: number; op: string; children: ReactNode; className?: string }) {
  return (
    <form action={mutateBlueprint} className={className ?? s.inline}>
      <input type="hidden" name="projectId" value={id} /><input type="hidden" name="version" value={version} /><input type="hidden" name="op" value={op} />
      {children}
    </form>
  );
}
function RemoveButton({ lang, label }: { lang: Lang; label: string }) {
  return <button type="submit" className={`${s.btnGhost} ${s.small}`} aria-label={`${pick(lang, "Quitar", "Remove")} ${label}`}>✕</button>;
}

export default async function BlueprintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "crm_creator", id);
  if (!project.error && !project.data) notFound();
  const bp = readBlueprint(project.data?.settings);
  const v = project.data?.version ?? 0;
  const fieldCount = bp.entities.reduce((n, e) => n + e.fields.length, 0);

  return (
    <Suite active="crm-creator">
      <PageHeader eyebrow="CRM Creator" title={project.data?.name ?? "—"} description={project.data?.description || undefined}
        crumbs={[{ href: BASE, label: "CRM Creator" }]}
        actions={project.data && <>
          <a className={s.btnPrimary} href={`${BASE}/${id}/studio`} data-testid="open-studio">{pick(lang, "Abrir editor visual (Nova)", "Open visual editor (Nova)")}</a>
          <a className={s.btn} href={`${BASE}/${id}/export`} download>{pick(lang, "Exportar JSON", "Export JSON")}</a>
          <a className={s.btn} href={`${BASE}/${id}/export?format=sql`} download>{pick(lang, "Vista previa SQL", "SQL preview")}</a>
        </>} />
      <Flash lang={lang} ok={param(query, "ok")} error={param(query, "error")} />
      {project.error ? <DbNotice lang={lang} error={project.error} /> : project.data && (
        <>
          <div className={s.stats}>
            <div className={s.stat}><span>{pick(lang, "Entidades", "Entities")}</span><strong>{bp.entities.length}</strong></div>
            <div className={s.stat}><span>{pick(lang, "Campos", "Fields")}</span><strong>{fieldCount}</strong></div>
            <div className={s.stat}><span>Pipelines</span><strong>{bp.pipelines.length}</strong></div>
            <div className={s.stat}><span>{pick(lang, "Roles", "Roles")}</span><strong>{bp.roles.length}</strong></div>
          </div>
          <div className={s.split}>
            <div>
              <Panel title={pick(lang, "Entidades y campos", "Entities and fields")} id="entities">
                {bp.entities.length === 0 && <Empty title={pick(lang, "Sin entidades", "No entities")} body={pick(lang, "Añade una entidad (p. ej., Empresas) o aplica una plantilla.", "Add an entity (e.g. Companies) or apply a template.")} />}
                <div className={s.stack}>
                  {bp.entities.map(e => (
                    <section key={e.key} className={s.block} aria-label={e.label}>
                      <div className={s.blockHead}>
                        <span><strong>{e.label}</strong> <span className={s.meta}>{e.key}</span></span>
                        <OpForm id={id} version={v} op="remove_entity"><input type="hidden" name="entity" value={e.key} /><RemoveButton lang={lang} label={e.label} /></OpForm>
                      </div>
                      {e.fields.length > 0 && (
                        <div className={s.tableWrap} style={{ marginBottom: 10 }}>
                          <table className={s.table}>
                            <thead><tr><th>{pick(lang, "Campo", "Field")}</th><th>{pick(lang, "Clave", "Key")}</th><th>{pick(lang, "Tipo", "Type")}</th><th>{pick(lang, "Obligatorio", "Required")}</th><th><span className="sr-only">{pick(lang, "Acciones", "Actions")}</span></th></tr></thead>
                            <tbody>
                              {e.fields.map(f => (
                                <tr key={f.key}>
                                  <td>{f.label}{f.options.length > 0 && <div className={s.meta}>{f.options.join(" · ")}</div>}</td>
                                  <td className={s.meta}>{f.key}</td>
                                  <td>{pick(lang, ...FIELD_NAMES[f.type])}</td>
                                  <td>{f.required ? pick(lang, "Sí", "Yes") : "—"}</td>
                                  <td><OpForm id={id} version={v} op="remove_field"><input type="hidden" name="entity" value={e.key} /><input type="hidden" name="field" value={f.key} /><RemoveButton lang={lang} label={f.label} /></OpForm></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <OpForm id={id} version={v} op="add_field" className={s.row}>
                        <input type="hidden" name="entity" value={e.key} />
                        <label className={s.field}><span>{pick(lang, "Nuevo campo", "New field")}</span><input className={s.input} name="label" required maxLength={80} /></label>
                        <label className={s.field}><span>{pick(lang, "Tipo", "Type")}</span><select className={s.select} name="type">{FIELD_TYPES.map(t => <option key={t} value={t}>{pick(lang, ...FIELD_NAMES[t])}</option>)}</select></label>
                        <label className={s.field}><span>{pick(lang, "Opciones (selección, separadas por comas)", "Options (select, comma-separated)")}</span><input className={s.input} name="options" maxLength={2000} /></label>
                        <div className={s.actions} style={{ alignSelf: "end" }}>
                          <label className={s.check}><input type="checkbox" name="required" />{pick(lang, "Obligatorio", "Required")}</label>
                          <button className={`${s.btn} ${s.small}`} type="submit">{pick(lang, "Añadir campo", "Add field")}</button>
                        </div>
                      </OpForm>
                    </section>
                  ))}
                </div>
                <OpForm id={id} version={v} op="add_entity" className={s.actions}>
                  <label className="sr-only" htmlFor="new-entity">{pick(lang, "Nueva entidad", "New entity")}</label>
                  <input id="new-entity" className={s.input} name="label" required maxLength={80} placeholder={pick(lang, "Nueva entidad (p. ej., Empresas)", "New entity (e.g. Companies)")} style={{ flex: 1, minWidth: 180, marginTop: 12 }} />
                  <button className={s.btnPrimary} type="submit" style={{ marginTop: 12 }}>{pick(lang, "Añadir entidad", "Add entity")}</button>
                </OpForm>
              </Panel>

              <Panel title="Pipelines" id="pipelines">
                {bp.pipelines.length === 0 && <p className={s.meta}>{pick(lang, "Sin pipelines. Necesitas al menos una entidad.", "No pipelines. You need at least one entity.")}</p>}
                <div className={s.stack}>
                  {bp.pipelines.map(p => (
                    <section key={p.key} className={s.block} aria-label={p.label}>
                      <div className={s.blockHead}>
                        <span><strong>{p.label}</strong> <span className={s.meta}>→ {bp.entities.find(e => e.key === p.entity)?.label ?? p.entity}</span></span>
                        <OpForm id={id} version={v} op="remove_pipeline"><input type="hidden" name="pipeline" value={p.key} /><RemoveButton lang={lang} label={p.label} /></OpForm>
                      </div>
                      <div className={s.actions} style={{ marginBottom: 10 }}>
                        {p.stages.map(st => (
                          <span key={st.key} className={s.actions} style={{ gap: 2 }}>
                            <Badge tone={st.kind === "won" ? "ok" : st.kind === "lost" ? "danger" : "info"}>{st.label}</Badge>
                            <OpForm id={id} version={v} op="remove_stage"><input type="hidden" name="pipeline" value={p.key} /><input type="hidden" name="stage" value={st.key} /><RemoveButton lang={lang} label={st.label} /></OpForm>
                          </span>
                        ))}
                      </div>
                      <OpForm id={id} version={v} op="add_stage" className={s.actions}>
                        <input type="hidden" name="pipeline" value={p.key} />
                        <label className="sr-only" htmlFor={`stage-${p.key}`}>{pick(lang, "Nueva etapa", "New stage")}</label>
                        <input id={`stage-${p.key}`} className={s.input} name="label" required maxLength={80} placeholder={pick(lang, "Nueva etapa", "New stage")} style={{ flex: 1, minWidth: 140 }} />
                        <select className={s.select} name="kind" style={{ width: "auto" }} aria-label={pick(lang, "Tipo de etapa", "Stage kind")}>
                          <option value="open">{pick(lang, "Abierta", "Open")}</option><option value="won">{pick(lang, "Ganada", "Won")}</option><option value="lost">{pick(lang, "Perdida", "Lost")}</option>
                        </select>
                        <button className={`${s.btn} ${s.small}`} type="submit">{pick(lang, "Añadir etapa", "Add stage")}</button>
                      </OpForm>
                    </section>
                  ))}
                </div>
                {bp.entities.length > 0 && (
                  <OpForm id={id} version={v} op="add_pipeline" className={s.actions}>
                    <label className="sr-only" htmlFor="new-pipeline">{pick(lang, "Nuevo pipeline", "New pipeline")}</label>
                    <input id="new-pipeline" className={s.input} name="label" required maxLength={80} placeholder={pick(lang, "Nuevo pipeline", "New pipeline")} style={{ flex: 1, minWidth: 160, marginTop: 12 }} />
                    <select className={s.select} name="entity" style={{ width: "auto", marginTop: 12 }} aria-label={pick(lang, "Entidad", "Entity")}>{bp.entities.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}</select>
                    <button className={s.btn} type="submit" style={{ marginTop: 12 }}>{pick(lang, "Añadir pipeline", "Add pipeline")}</button>
                  </OpForm>
                )}
              </Panel>

              <Panel title={pick(lang, "Roles y permisos", "Roles and permissions")} id="roles">
                {bp.roles.length === 0 && <p className={s.meta}>{pick(lang, "Sin roles definidos.", "No roles defined.")}</p>}
                <div className={s.stack}>
                  {bp.roles.map(r => (
                    <section key={r.key} className={s.block} aria-label={r.label}>
                      <div className={s.blockHead}>
                        <strong>{r.label}</strong>
                        <OpForm id={id} version={v} op="remove_role"><input type="hidden" name="role" value={r.key} /><RemoveButton lang={lang} label={r.label} /></OpForm>
                      </div>
                      {bp.entities.length > 0 && (
                        <OpForm id={id} version={v} op="set_permissions" className={s.row}>
                          <input type="hidden" name="role" value={r.key} />
                          {bp.entities.map(e => (
                            <label key={e.key} className={s.field}><span>{e.label}</span>
                              <select className={s.select} name={`perm_${e.key}`} defaultValue={r.permissions[e.key] ?? "none"}>
                                {PERMISSION_LEVELS.map(l => <option key={l} value={l}>{pick(lang, ...LEVEL_NAMES[l])}</option>)}
                              </select>
                            </label>
                          ))}
                          <div className={s.actions} style={{ alignSelf: "end" }}><button className={`${s.btn} ${s.small}`} type="submit">{pick(lang, "Guardar permisos", "Save permissions")}</button></div>
                        </OpForm>
                      )}
                    </section>
                  ))}
                </div>
                <OpForm id={id} version={v} op="add_role" className={s.actions}>
                  <label className="sr-only" htmlFor="new-role">{pick(lang, "Nuevo rol", "New role")}</label>
                  <input id="new-role" className={s.input} name="label" required maxLength={80} placeholder={pick(lang, "Nuevo rol (p. ej., Comercial)", "New role (e.g. Sales rep)")} style={{ flex: 1, minWidth: 160, marginTop: 12 }} />
                  <button className={s.btn} type="submit" style={{ marginTop: 12 }}>{pick(lang, "Añadir rol", "Add role")}</button>
                </OpForm>
              </Panel>
            </div>

            <div>
              <Panel title={pick(lang, "Plantillas", "Templates")} id="templates">
                <OpForm id={id} version={v} op="apply_template" className={s.form}>
                  <select className={s.select} name="template" aria-label={pick(lang, "Plantilla", "Template")}>
                    {Object.entries(BLUEPRINT_TEMPLATES).map(([key, t]) => <option key={key} value={key}>{lang === "es" ? t.es : t.en}</option>)}
                  </select>
                  <label className={s.check}><input type="checkbox" name="confirm" value="yes" required />{pick(lang, "Reemplazar el diseño actual", "Replace the current design")}</label>
                  <div className={s.actions}><button className={s.btn} type="submit">{pick(lang, "Aplicar plantilla", "Apply template")}</button></div>
                </OpForm>
              </Panel>
              <Panel title={pick(lang, "Editor JSON avanzado", "Advanced JSON editor")} id="json">
                <OpForm id={id} version={v} op="replace_json" className={s.form}>
                  <label className="sr-only" htmlFor="bp-json">JSON</label>
                  <textarea id="bp-json" className={`${s.textarea} ${s.code}`} name="json" rows={14} defaultValue={JSON.stringify(bp, null, 2)} spellCheck={false} />
                  <div className={s.actions}><button className={s.btn} type="submit">{pick(lang, "Validar y guardar", "Validate and save")}</button></div>
                </OpForm>
              </Panel>
              <Panel title={pick(lang, "Instalación", "Installation")} id="install">
                <p className={s.meta}>{pick(lang, "La exportación genera una definición versionada y un borrador SQL para revisión. La instalación en el proyecto de un cliente se hará mediante migraciones revisadas, nunca desde el navegador.", "Export produces a versioned definition and a draft SQL for review. Installing into a client project will use reviewed migrations, never the browser.")}</p>
              </Panel>
              <Panel title={pick(lang, "Proyecto", "Project")} id="settings"><ProjectSettingsForm lang={lang} project={project.data} /></Panel>
            </div>
          </div>
        </>
      )}
    </Suite>
  );
}
