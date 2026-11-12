import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { FUNNEL_TEMPLATES, type FunnelTemplate } from "@/lib/growth/funnel";
import { createGrowthFunnel, setGrowthFunnelStatus } from "./actions";
import styles from "../growth/growth.module.css";

export const dynamic = "force-dynamic";
type FunnelRow = {
  id: string; slug: string; title: string; template: FunnelTemplate;
  status: "draft" | "active" | "paused" | "archived";
  version: number; updated_at: string; client_id: string | null; project_id: string | null;
};
type Option = { id: string; name: string };
type Parameters = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const MSG: Record<string, string> = {
  schema: "El Funnel Builder aún necesita la migración aprobada en Supabase aislado.",
  duplicate: "Ese enlace público ya está reservado. Usa otro identificador.",
  invalid: "Revisa los campos del funnel y vuelve a intentarlo.",
  unavailable: "No se pudo guardar. El sistema no confirmó ningún cambio.",
  conflict: "El funnel cambió desde que abriste la página. Recarga antes de reintentar.",
};
export default async function FunnelsPage({ searchParams }: Parameters) {
  const params = await searchParams;
  const { supabase } = await requireOwner();
  const [funnels, clients, projects, captured] = await Promise.all([
    supabase.from("crm_growth_funnels")
      .select("id,slug,title,template,status,version,updated_at,client_id,project_id")
      .order("updated_at", { ascending: false }).limit(60),
    supabase.from("crm_clients").select("id,legal_name").order("legal_name").limit(100),
    supabase.from("os_projects").select("id,name").eq("module", "marketing")
      .neq("status", "archived").order("name").limit(100),
    supabase.from("crm_growth_funnel_submissions")
      .select("id", { count: "exact" }).range(0, 0),
  ]);
  const items = (funnels.data ?? []) as FunnelRow[];
  const clientOptions = ((clients.data ?? []) as { id: string; legal_name: string }[])
    .map(c => ({ id: c.id, name: c.legal_name }));
  const projectOptions = ((projects.data ?? []) as Option[]);
  const clientNames = new Map(clientOptions.map(c => [c.id, c.name]));
  const projectNames = new Map(projectOptions.map(c => [c.id, c.name]));
  const error = typeof params.error === "string" ? params.error : "";
  const ok = typeof params.ok === "string" ? params.ok : "";
  const missing = Boolean(funnels.error);
  const enabledCount = items.filter(f => f.status === "active").length;
  return <Suite active="marketing-hub">
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>Marketing Hub / Funnel Builder</span>
        <h1>Funnels conectados al CRM</h1>
        <p>Prepara formularios de captación para la propia agencia Avalon. Una solicitud voluntaria no genera pagos ni citas confirmadas. La captación pública permanece cerrada mientras no se autorice la concesión anónima del backend.</p>
        <nav className={styles.toolbar} aria-label="Marketing y CRM">
          <Link href="/admin/workspace/marketing-hub/growth">Panel de Growth</Link>
          <Link href="/admin/workspace/marketing-hub">Campaigns</Link>
          <Link href="/admin/workspace/crm/leads">Abrir CRM</Link>
        </nav>
      </header>
      <div className={styles.stats} aria-label="Conteos de la base">
        <div><strong>{missing ? "—" : items.length}</strong><span>Funnels visibles (máx. 60)</span></div>
        <div><strong>{missing ? "—" : enabledCount}</strong><span>Formularios activos</span></div>
        <div><strong>{captured.error ? "—" : captured.count ?? 0}</strong><span>Solicitudes registradas (todos los funnels)</span></div>
      </div>
      {missing && <p className={styles.banner} role="alert">El esquema de funnels aún no está disponible aquí. La propuesta SQL solo se ejecuta en pruebas sintéticas; no se activó producción.</p>}
      {error && <p className={styles.banner} role="alert">{MSG[error] ?? MSG.unavailable}</p>}
      {ok && <p className={`${styles.banner} ${styles.ok}`} role="status">
        {ok === "created" ? "Borrador guardado. Debes activarlo expresamente para recibir solicitudes." : "Estado del funnel actualizado."}
      </p>}
      <section className={styles.section} aria-labelledby="builder-title">
        <h2 id="builder-title">Nuevo funnel</h2>
        <div className={styles.card}>
          <form action={createGrowthFunnel} className={styles.form}>
            <div className={styles.formGrid}>
              <label>Plantilla
                <select name="template" defaultValue="capture" required>
                  {Object.entries(FUNNEL_TEMPLATES).map(([key, template]) =>
                    <option key={key} value={key}>{template.label} — {template.description}</option>)}
                </select>
              </label>
              <label>Identificador para URL
                <input name="slug" placeholder="captacion-mi-negocio" minLength={3} maxLength={60}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*" required />
              </label>
              <label>Cliente 360° (opcional; funnels de cliente no se pueden publicar)
                <select name="client_id" defaultValue="">
                  <option value="">Funnel de Avalon (B2B, publicable solo con autorización)</option>
                  {clientOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>Proyecto Marketing existente (opcional)
                <select name="project_id" defaultValue="">
                  <option value="">No vinculado</option>
                  {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>
            <label>Título personalizado (opcional)
              <input name="title" maxLength={120} placeholder="Dejar vacío para usar el de la plantilla" />
            </label>
            <label>Descripción (opcional)
              <textarea name="subheading" maxLength={500} rows={3} placeholder="Dejar vacío para usar el texto de la plantilla" />
            </label>
            <label>Botón (opcional)
              <input name="cta" maxLength={80} placeholder="Dejar vacío para usar el de la plantilla" />
            </label>
            <div className={styles.actions}>
              <button type="submit" disabled={missing}>Guardar borrador</button>
              <span className={styles.note}>No publica anuncios ni activa herramientas externas.</span>
            </div>
          </form>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="list-title">
        <h2 id="list-title">Biblioteca de funnels</h2>
        {missing ? <div className={styles.empty}>No se pueden cargar los registros hasta aplicar una migración autorizada en Preview aislado.</div> :
        items.length === 0 ? <div className={styles.empty}>No hay funnels guardados. Crea el primero con datos de prueba en un entorno aislado.</div> :
        <div className={styles.grid}>{items.map(f => <article className={styles.card} key={f.id}>
          <span className={`${styles.badge} ${f.status === "active" ? styles.tagActive : styles.tagPending}`}>
            {f.status === "active" ? "Formulario activo" : f.status === "draft" ? "Borrador" : f.status === "paused" ? "Pausado" : "Archivado"}
          </span>
          <h3>{f.title}</h3>
          <p>{FUNNEL_TEMPLATES[f.template]?.label ?? "Plantilla desconocida"} · versión {f.version} · actualizado {f.updated_at.slice(0, 10)}</p>
          <p>Cliente: {f.client_id ? clientNames.get(f.client_id) ?? `ID ${f.client_id.slice(0, 8)}` : "Sin cliente"}</p>
          {f.client_id && <p className={styles.note} role="status">Este funnel está asociado a un cliente externo (tipo B). No puede publicarse ni enviar leads al CRM B2B de Avalon.</p>}
          <p>Campaña: {f.project_id ? projectNames.get(f.project_id) ?? "Proyecto vinculado" : "Sin proyecto asociado"}</p>
          <p>URL: <code>/f/{f.slug}</code></p>
          <div className={styles.actions}>
            {f.status === "active" ? <Link className={styles.link} href={`/f/${f.slug}`}>Abrir formulario</Link> : null}
            {f.status !== "archived" && !(f.client_id && f.status !== "active") ? <form action={setGrowthFunnelStatus}>
              <input type="hidden" name="id" value={f.id}/><input type="hidden" name="version" value={f.version}/>
              <input type="hidden" name="status" value={f.status === "active" ? "paused" : "active"}/>
              <button type="submit">{f.status === "active" ? "Pausar captación" : "Activar formulario público"}</button>
            </form> : null}
          </div>
        </article>)}</div>}
      </section>
      <p className={styles.note}>Las cifras son registros reales de la base (no campañas externas ni visitas estimadas). La lista se limita a 60 funnels; el conteo total de solicitudes es exacto si la consulta tiene éxito.</p>
    </div>
  </Suite>;
}
