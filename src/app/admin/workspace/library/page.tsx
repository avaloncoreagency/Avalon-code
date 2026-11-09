import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { Importer, ProcessButton } from "@/components/library/importer";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/project-bridge/policy";
import { bridgeMessages, STATE_LABEL } from "@/lib/project-bridge/messages";
import s from "@/components/library/library.module.css";

export const dynamic = "force-dynamic";
type Project = { id: string; module: Category; name: string; client_id: string | null; updated_at: string; settings: { bridge?: { source_tool?: string; framework?: string } } };
type Version = { project_id: string; number: number; framework: string; deployable: string; file_count: number; total_bytes: number; created_at: string; source_tool: string };
type Imp = { id: string; status: string; original_name: string; source_kind: string; category: string; error_code: string | null; created_at: string; project_id: string | null };

const kb = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const l = lang === "en" ? "en" : "es";
  const cat = param(params, "category");
  const active = CATEGORIES.includes(cat as Category) ? (cat as Category) : null;
  const [projects, versions, imports, deployments] = await Promise.all([
    (active ? supabase.from("os_projects").select("id,module,name,client_id,updated_at,settings").eq("module", active) : supabase.from("os_projects").select("id,module,name,client_id,updated_at,settings").in("module", CATEGORIES as unknown as string[]))
      .neq("status", "archived").order("updated_at", { ascending: false }).limit(200),
    supabase.from("os_project_versions").select("project_id,number,framework,deployable,file_count,total_bytes,created_at,source_tool").eq("sealed", true).order("number", { ascending: false }).limit(1000),
    supabase.from("os_project_imports").select("id,status,original_name,source_kind,category,error_code,created_at,project_id").order("created_at", { ascending: false }).limit(30),
    supabase.from("os_project_deployments").select("project_id,state,target,url,created_at").order("created_at", { ascending: false }).limit(300),
  ]);
  const schemaMissing = [versions.error, imports.error].some(e => e && /does not exist|schema cache|42P01|PGRST2/.test(`${e.code} ${e.message}`));
  const latest = new Map<string, Version>();
  for (const v of (versions.data ?? []) as Version[]) if (!latest.has(v.project_id)) latest.set(v.project_id, v);
  const counts = new Map<string, number>();
  for (const v of (versions.data ?? []) as Version[]) counts.set(v.project_id, (counts.get(v.project_id) ?? 0) + 1);
  const lastDeploy = new Map<string, { state: string; target: string; url: string | null }>();
  for (const d of deployments.data ?? []) if (!lastDeploy.has(d.project_id)) lastDeploy.set(d.project_id, d);
  const inbox = ((imports.data ?? []) as Imp[]).filter(i => i.source_kind === "api" && (i.status === "received" || i.status === "failed"));
  const label = (st: string) => (STATE_LABEL[st] ? STATE_LABEL[st][l === "es" ? 0 : 1] : st);

  return (
    <Suite active="library">
      <PageHeader eyebrow="Avalon Project Bridge" title={pick(lang, "Biblioteca de proyectos", "Project library")}
        description={pick(lang, "Importa páginas, tiendas, CRM y apps creadas con IA, guárdalas de forma privada con versiones y publícalas en Vercel sin depender de GitHub.", "Import AI-built sites, stores, CRMs and apps, keep them privately with versions and publish them on Vercel without depending on GitHub.")}
        actions={<><Link className={s.ghost} href="/admin/workspace/library/code">{pick(lang, "Código sin GitHub", "Code without GitHub")}</Link> <Link className={s.ghost} href="/admin/workspace/library/tokens">{pick(lang, "API para herramientas", "Tool API")}</Link></>} />
      <Flash lang={lang} ok={param(params, "ok")} error={param(params, "error")} />
      <div className={s.wrap}>
        {schemaMissing && <p role="alert" className={s.panel}>{pick(lang, "La migración del Project Bridge (20261108100000) aún no está aplicada en esta base de datos: la biblioteca no puede guardar proyectos todavía.", "The Project Bridge migration (20261108100000) is not applied to this database yet: the library cannot store projects.")}</p>}
        <section className={s.panel} aria-labelledby="imp"><h2 id="imp">{pick(lang, "Importar proyecto", "Import project")}</h2>
          <Importer lang={l} defaultCategory={active ?? "website"} messages={bridgeMessages(l)} />
        </section>
        {inbox.length > 0 && <section className={s.panel} aria-labelledby="inbox"><h2 id="inbox">{pick(lang, "Recibidos por API (pendientes de revisión)", "Received via API (awaiting review)")}</h2>
          <ul className={s.timeline}>{inbox.map(i => <li key={i.id}><strong>{i.original_name}</strong> · {CATEGORY_LABEL[i.category as Category]?.[l] ?? i.category} · <span className={s.badge} data-state={i.status}>{label(i.status)}</span> <ProcessButton importId={i.id} label={pick(lang, "Validar e importar", "Validate and import")} /></li>)}</ul>
        </section>}
        <nav className={s.tabs} aria-label={pick(lang, "Categorías", "Categories")}>
          <Link className={s.tab} href="/admin/workspace/library" aria-current={!active ? "page" : undefined}>{pick(lang, "Todos", "All")}</Link>
          {CATEGORIES.map(c => <Link key={c} className={s.tab} href={`/admin/workspace/library?category=${c}`} aria-current={active === c ? "page" : undefined}>{CATEGORY_LABEL[c][l]}</Link>)}
        </nav>
        <section aria-label={pick(lang, "Mis proyectos", "My projects")} className={s.grid}>
          {(projects.data ?? []).length === 0 && <p className={s.muted}>{pick(lang, "Todavía no hay proyectos en esta biblioteca. Importa el primero arriba.", "No projects in this library yet. Import the first one above.")}</p>}
          {((projects.data ?? []) as Project[]).map(p => {
            const v = latest.get(p.id); const d = lastDeploy.get(p.id);
            return <Link key={p.id} href={`/admin/workspace/library/${p.id}`} className={s.card}>
              <span className={s.muted}>{CATEGORY_LABEL[p.module]?.[l] ?? p.module}</span>
              <h3>{p.name}</h3>
              <div className={s.badges}>
                {v ? <span className={s.badge} data-state="registered">v{v.number} · {v.framework}</span> : <span className={s.badge}>{pick(lang, "Sin versiones importadas", "No imported versions")}</span>}
                {v && <span className={s.badge}>{v.file_count} {pick(lang, "archivos", "files")} · {kb(Number(v.total_bytes))}</span>}
                {v && <span className={s.badge}>{counts.get(p.id)} {pick(lang, "versiones", "versions")}</span>}
                {d && <span className={s.badge} data-state={d.state}>{d.target === "production" ? pick(lang, "Producción", "Production") : "Preview"} · {label(d.state)}</span>}
                {p.client_id && <span className={s.badge}>{pick(lang, "Cliente asignado", "Client assigned")}</span>}
              </div>
              <small className={s.muted}>{pick(lang, "Origen", "Source")}: {v?.source_tool ?? p.settings?.bridge?.source_tool ?? "—"} · {new Date(p.updated_at).toLocaleDateString(l)}</small>
            </Link>;
          })}
        </section>
        <section className={s.panel} aria-labelledby="recent"><h2 id="recent">{pick(lang, "Importaciones recientes", "Recent imports")}</h2>
          <div className={s.scroll}><table className={s.table}><thead><tr><th>{pick(lang, "Archivo", "File")}</th><th>{pick(lang, "Estado", "Status")}</th><th>{pick(lang, "Motivo", "Reason")}</th><th>{pick(lang, "Fecha", "Date")}</th></tr></thead>
            <tbody>{((imports.data ?? []) as Imp[]).map(i => <tr key={i.id}><td>{i.project_id ? <Link href={`/admin/workspace/library/${i.project_id}`}>{i.original_name}</Link> : i.original_name}{i.source_kind === "api" ? " · API" : ""}</td><td><span className={s.badge} data-state={i.status}>{label(i.status)}</span></td><td className={s.mono}>{i.error_code ?? ""}</td><td>{new Date(i.created_at).toLocaleString(l)}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </Suite>
  );
}
