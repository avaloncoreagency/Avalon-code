import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { Importer } from "@/components/library/importer";
import { PreviewFrame } from "@/components/library/preview-frame";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { CATEGORY_LABEL, type Category } from "@/lib/project-bridge/policy";
import { bridgeMessages, STATE_LABEL } from "@/lib/project-bridge/messages";
import { vercelConfig } from "@/lib/project-bridge/vercel";
import { approvePublication, assignClient, deployVersion, refreshDeployment, restoreVersion } from "../actions";
import s from "@/components/library/library.module.css";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;
type Version = { id: string; number: number; kind: string; restored_from: string | null; source_tool: string; framework: string; entry_path: string | null; deployable: string; file_count: number; total_bytes: number; summary: { warnings?: string[] }; created_by: string; created_at: string };

export default async function LibraryProject({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const l = lang === "en" ? "en" : "es";
  const project = await supabase.from("os_projects").select("id,module,name,description,client_id,settings,created_at,updated_at").eq("id", id).maybeSingle();
  if (!project.data) notFound();
  const p = project.data as { id: string; module: Category; name: string; description: string; client_id: string | null; settings: { bridge?: { vercel_project?: string } }; created_at: string; updated_at: string };
  const [versions, deployments, events, clients, owners, approvals] = await Promise.all([
    supabase.from("os_project_versions").select("id,number,kind,restored_from,source_tool,framework,entry_path,deployable,file_count,total_bytes,summary,created_by,created_at").eq("project_id", id).eq("sealed", true).order("number", { ascending: false }).limit(100),
    supabase.from("os_project_deployments").select("id,version_id,target,vercel_project,deployment_id,url,state,error_code,created_at,checked_at").eq("project_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("os_project_events").select("id,action,detail,actor,created_at").eq("project_id", id).order("id", { ascending: false }).limit(40),
    supabase.from("crm_clients").select("id,legal_name,client_code").neq("status", "archived").order("legal_name").limit(500),
    supabase.rpc("crm_owner_directory"),
    supabase.from("os_project_publish_approvals").select("version_id,expires_at,used_at").eq("project_id", id).is("used_at", null),
  ]);
  const vs = (versions.data ?? []) as Version[];
  const selected = vs.find(v => v.id === param(sp, "version")) ?? vs[0];
  const files = selected ? await supabase.from("os_project_files").select("path,size,sha256,mime").eq("version_id", selected.id).order("path").limit(2000) : null;
  const who = (uid: string | null) => ((owners.data ?? []) as { user_id: string; email: string }[]).find(o => o.user_id === uid)?.email ?? "—";
  const label = (st: string) => (STATE_LABEL[st] ? STATE_LABEL[st][l === "es" ? 0 : 1] : st);
  const vercelReady = !!vercelConfig();
  const approved = new Set(((approvals.data ?? []) as { version_id: string; expires_at: string }[]).filter(a => a.expires_at > new Date().toISOString()).map(a => a.version_id));
  const hasProdBefore = (deployments.data ?? []).some(d => d.target === "production" && d.state === "ready");
  const pages = (files?.data ?? []).filter(f => /\.html?$/i.test(f.path)).map(f => f.path);

  return (
    <Suite active="library">
      <PageHeader eyebrow={`${CATEGORY_LABEL[p.module]?.[l] ?? p.module} · Project Bridge`} title={p.name}
        crumbs={[{ href: "/admin/workspace/library", label: pick(lang, "Biblioteca", "Library") }]}
        description={selected ? `v${selected.number} · ${selected.framework} · ${selected.file_count} ${pick(lang, "archivos", "files")}` : pick(lang, "Sin versiones importadas todavía.", "No imported versions yet.")} />
      <Flash lang={lang} ok={param(sp, "ok")} error={param(sp, "error")} />
      <div className={s.wrap}>
        <div className={s.two}>
          <section className={s.panel} aria-labelledby="pv"><h2 id="pv">{pick(lang, "Vista previa", "Preview")}</h2>
            {selected ? <PreviewFrame projectId={id} versionId={selected.id} pages={pages} entry={selected.entry_path} lang={l} /> : <p className={s.muted}>—</p>}
          </section>
          <div className={s.wrap}>
            <section className={s.panel} aria-labelledby="pub"><h2 id="pub">{pick(lang, "Publicación (Vercel, sin GitHub)", "Publishing (Vercel, no GitHub)")}</h2>
              {!vercelReady && <p className={s.muted}>{pick(lang, "Vercel no está conectado para Avalon: falta AVALON_VERCEL_DEPLOY_TOKEN en el servidor. Ver docs/project-bridge/PROJECT_BRIDGE.md.", "Vercel is not connected: AVALON_VERCEL_DEPLOY_TOKEN is missing on the server.")}</p>}
              {selected && selected.deployable !== "static" && <p className={s.muted}>{pick(lang, "Este proyecto necesita compilación (Next.js/React). La publicación queda bloqueada hasta disponer de un entorno de compilación aislado.", "This project needs a build. Publishing is blocked until an isolated build environment exists.")}</p>}
              {selected && selected.deployable === "static" && <>
                <form action={deployVersion} className={s.form}>
                  <input type="hidden" name="project_id" value={id} /><input type="hidden" name="version_id" value={selected.id} /><input type="hidden" name="target" value="preview" />
                  <button className={s.primary} disabled={!vercelReady}>{pick(lang, `Crear Preview de v${selected.number}`, `Create Preview of v${selected.number}`)}</button>
                  {!hasProdBefore && <small className={s.muted}>{pick(lang, "Nota verificada: en un proyecto nuevo de Vercel el primer despliegue siempre es producción; por eso el primero requiere aprobación.", "Verified: the first deployment of a new Vercel project is always production, so the first one requires approval.")}</small>}
                </form>
                <form action={approvePublication} className={s.form}>
                  <input type="hidden" name="project_id" value={id} /><input type="hidden" name="version_id" value={selected.id} />
                  <label>{pick(lang, `Aprobar publicación en producción de v${selected.number}: escribe PUBLICAR`, `Approve production for v${selected.number}: type PUBLICAR`)}<input name="confirm" autoComplete="off" /></label>
                  <button className={s.ghost}>{pick(lang, "Registrar aprobación (24 h, un uso)", "Record approval (24 h, single use)")}</button>
                </form>
                {approved.has(selected.id) && <form action={deployVersion} className={s.form}>
                  <input type="hidden" name="project_id" value={id} /><input type="hidden" name="version_id" value={selected.id} /><input type="hidden" name="target" value="production" />
                  <button className={s.danger} disabled={!vercelReady}>{pick(lang, `Publicar v${selected.number} en producción`, `Publish v${selected.number} to production`)}</button>
                </form>}
              </>}
              <ul className={s.timeline}>{(deployments.data ?? []).map(d => <li key={d.id}>
                <span className={s.badge} data-state={d.state}>{d.target === "production" ? pick(lang, "Producción", "Production") : "Preview"} · {label(d.state)}</span>{" "}
                v{vs.find(v => v.id === d.version_id)?.number ?? "?"} · {d.vercel_project}{d.url && d.state === "ready" ? <> · <a href={d.url} target="_blank" rel="noopener noreferrer">{d.url.replace("https://", "")}</a></> : null}
                {d.error_code && <div className={s.mono}>{d.error_code}</div>}
                {d.deployment_id && !["ready", "error", "canceled"].includes(d.state) && <form action={refreshDeployment} className={s.inline}><input type="hidden" name="project_id" value={id} /><input type="hidden" name="deployment_row" value={d.id} /><button className={s.ghost}>{pick(lang, "Consultar estado real", "Check real status")}</button></form>}
              </li>)}</ul>
            </section>
            <section className={s.panel} aria-labelledby="cl"><h2 id="cl">{pick(lang, "Cliente", "Client")}</h2>
              <form action={assignClient} className={s.form}>
                <input type="hidden" name="project_id" value={id} />
                <select name="client_id" defaultValue={p.client_id ?? ""} aria-label={pick(lang, "Cliente", "Client")}>
                  <option value="">{pick(lang, "Sin cliente", "No client")}</option>
                  {(clients.data ?? []).map(c => <option key={c.id} value={c.id}>{c.legal_name} · {c.client_code}</option>)}
                </select>
                <button className={s.ghost}>{pick(lang, "Asignar cliente", "Assign client")}</button>
                {p.client_id && <Link href={`/admin/workspace/crm/clients/${p.client_id}`}>{pick(lang, "Abrir Cliente 360°", "Open Client 360°")}</Link>}
              </form>
            </section>
            <section className={s.panel} aria-labelledby="nv"><h2 id="nv">{pick(lang, "Nueva versión", "New version")}</h2>
              <Importer lang={l} projectId={id} defaultCategory={p.module} messages={bridgeMessages(l)} />
            </section>
          </div>
        </div>
        <section className={s.panel} aria-labelledby="vh"><h2 id="vh">{pick(lang, "Historial de versiones", "Version history")}</h2>
          <div className={s.scroll}><table className={s.table}><thead><tr><th>v</th><th>{pick(lang, "Origen", "Source")}</th><th>{pick(lang, "Autor", "Author")}</th><th>{pick(lang, "Fecha", "Date")}</th><th></th></tr></thead>
            <tbody>{vs.map(v => <tr key={v.id}>
              <td><Link href={`?version=${v.id}`} aria-current={v.id === selected?.id ? "true" : undefined}>v{v.number}</Link>{v.kind === "restore" ? ` (${pick(lang, "restaurada de", "restored from")} v${vs.find(x => x.id === v.restored_from)?.number ?? "?"})` : ""}</td>
              <td>{v.source_tool} · {v.framework} · {v.file_count}</td><td>{who(v.created_by)}</td><td>{new Date(v.created_at).toLocaleString(l)}</td>
              <td><a className={s.ghost} href={`/admin/workspace/library/${id}/export?version=${v.id}`} download data-testid={`export-v${v.number}`}>{pick(lang, "Exportar ZIP", "Export ZIP")}</a>{v.id !== vs[0]?.id && <form action={restoreVersion}><input type="hidden" name="project_id" value={id} /><input type="hidden" name="version_id" value={v.id} /><button className={s.ghost}>{pick(lang, "Restaurar como nueva versión", "Restore as new version")}</button></form>}</td>
            </tr>)}</tbody></table></div>
          {selected?.summary?.warnings?.length ? <p className={s.muted}>{pick(lang, "Avisos", "Warnings")}: {selected.summary.warnings.join(" · ")}</p> : null}
        </section>
        {files && <section className={s.panel} aria-labelledby="fl"><h2 id="fl">{pick(lang, `Archivos de v${selected!.number}`, `Files of v${selected!.number}`)}</h2>
          <div className={s.scroll}><table className={s.table}><thead><tr><th>{pick(lang, "Ruta", "Path")}</th><th>{pick(lang, "Tamaño", "Size")}</th><th>SHA-256</th></tr></thead>
            <tbody>{(files.data ?? []).map(f => <tr key={f.path}><td><code>{f.path}</code></td><td>{Number(f.size).toLocaleString(l)} B</td><td className={s.mono}>{f.sha256.slice(0, 16)}…</td></tr>)}</tbody></table></div>
        </section>}
        <section className={s.panel} aria-labelledby="ev"><h2 id="ev">{pick(lang, "Actividad", "Activity")}</h2>
          <ol className={s.timeline}>{(events.data ?? []).map(e => <li key={e.id}><strong>{e.action}</strong> · {who(e.actor)} · {new Date(e.created_at).toLocaleString(l)}</li>)}</ol>
        </section>
      </div>
    </Suite>
  );
}
