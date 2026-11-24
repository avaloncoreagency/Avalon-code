"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CreativeAsset } from "./asset";
import { filterGallery, GALLERY_LABELS, type GalleryProject, type GalleryStatus } from "./gallery-logic";
import styles from "./layout.module.css";

const STATES: GalleryStatus[] = ["imported", "pending", "blocked", "reference"];
const SERVICE_NAMES: Record<string, string> = {
  website: "Website Designer",
  ecommerce: "E-commerce Designer",
  crm_creator: "CRM Creator",
  marketing: "Marketing Hub",
};

export function CreativeGallery({ projects }: { projects: GalleryProject[] }) {
  const [search, setSearch] = useState("");
  const [client, setClient] = useState("all");
  const [service, setService] = useState("all");
  const [state, setState] = useState("all");

  const clients = useMemo(() => Array.from(
    new Map(projects.map(p => [p.clientKey, p.clientLabel])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1], "es")), [projects]);
  const services = useMemo(() => Array.from(new Set(projects.map(p => p.module)))
    .sort(), [projects]);
  const visible = useMemo(() => filterGallery(projects, { search, client, service, state }),
    [projects, search, client, service, state]);
  const groups = useMemo(() => {
    const byClient = new Map<string, GalleryProject[]>();
    for (const project of visible) {
      const list = byClient.get(project.clientKey) ?? [];
      list.push(project);
      byClient.set(project.clientKey, list);
    }
    return Array.from(byClient.entries()).sort((a, b) =>
      a[1][0].clientLabel.localeCompare(b[1][0].clientLabel, "es"));
  }, [visible]);
  const counts = useMemo(() => ({
    imported: projects.filter(p => p.state === "imported").length,
    pending: projects.filter(p => p.state === "pending").length,
    blocked: projects.filter(p => p.state === "blocked").length,
    reference: projects.filter(p => p.state === "reference").length,
  }), [projects]);

  return (
    <section className={styles.library} id="creative-library" aria-labelledby="creative-library-title">
      <div className={styles.sectionIntro}>
        <div>
          <span className={styles.eyebrow}>Biblioteca conectada al CRM</span>
          <h2 id="creative-library-title">Proyectos y recursos creativos</h2>
          <p>Los estados se basan en registros y archivos disponibles. Importado significa presente en la biblioteca, no publicado ni aprobado por el cliente.</p>
        </div>
        <a className={styles.secondaryButton} href="#creative-actions">Gestionar entregas</a>
      </div>
      <div className={styles.metrics} aria-label="Resumen de la biblioteca">
        <div><strong>{projects.length}</strong><span>Proyectos registrados</span></div>
        <div><strong>{counts.imported}</strong><span>Con recursos importados</span></div>
        <div><strong>{counts.pending + counts.blocked}</strong><span>Requieren atención</span></div>
        <div><strong>{counts.reference}</strong><span>Solo referencias</span></div>
      </div>
      <div className={styles.filters} role="group" aria-label="Filtros de la biblioteca">
        <label className={styles.searchField}>Buscar
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Proyecto, empresa o referencia" />
        </label>
        <label>Cliente
          <select value={client} onChange={event => setClient(event.target.value)}>
            <option value="all">Todos los clientes</option>
            {clients.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <label>Servicio
          <select value={service} onChange={event => setService(event.target.value)}>
            <option value="all">Todos los servicios</option>
            {services.map(key => <option key={key} value={key}>{SERVICE_NAMES[key] ?? key}</option>)}
          </select>
        </label>
        <label>Entrega
          <select value={state} onChange={event => setState(event.target.value)}>
            <option value="all">Todos los estados</option>
            {STATES.map(key => <option key={key} value={key}>{GALLERY_LABELS[key]}</option>)}
          </select>
        </label>
      </div>
      <p className={styles.resultCount} role="status" aria-live="polite">
        Mostrando {visible.length} de {projects.length} proyectos.
      </p>
      {groups.length ? groups.map(([key, items]) => (
        <section key={key} className={styles.clientGroup} aria-label={items[0].clientLabel}>
          <div className={styles.groupHeading}>
            <h3>{items[0].clientHref
              ? <Link href={items[0].clientHref}>{items[0].clientLabel}</Link>
              : items[0].clientLabel}</h3>
            <span>{items.length} {items.length === 1 ? "proyecto" : "proyectos"}</span>
          </div>
          <div className={styles.projectGrid}>
            {items.map(project => <article className={styles.projectCard} key={project.id}>
              <div className={styles.projectTop}>
                <span className={styles.serviceTag}>{project.service}</span>
                <span className={`${styles.stateTag} ${styles[project.state]}`}>{GALLERY_LABELS[project.state]}</span>
              </div>
              <h4><Link href={`/admin/workspace/products/${project.id}`}>{project.name}</Link></h4>
              <p className={styles.projectSub}>Versión {project.version} · Actualizado {project.updatedAt || "fecha no registrada"}</p>
              <div className={styles.assetGrid}>
                {project.assets.length ? project.assets.map(asset =>
                  <CreativeAsset key={asset.id} asset={asset} />)
                  : <div className={styles.emptyMedia}>
                    <span aria-hidden="true">◇</span>
                    <strong>Sin archivos incorporados</strong>
                    <p>Una referencia o un checkpoint no demuestra una entrega visual.</p>
                  </div>}
              </div>
              <dl className={styles.facts}>
                <div><dt>Procedencia</dt><dd>{project.agent}{project.sourceRef ? ` · ${project.sourceRef}` : " · sin referencia verificada"}</dd></div>
                <div><dt>Aprobación</dt><dd>{project.approval}</dd></div>
                <div><dt>Checkpoint</dt><dd>{project.headSha
                  ? <code title={project.headSha}>{project.headSha.slice(0, 12)}</code>
                  : "No registrado"}{project.ci ? ` · CI reportada: ${project.ci}` : ""}</dd></div>
                {project.branch ? <div><dt>Rama</dt><dd>{project.branch}</dd></div> : null}
              </dl>
              {project.evidence.length ? <div className={styles.evidence}>
                <span>Evidencias reportadas</span>
                <div>{project.evidence.map(link =>
                  <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>
              </div> : <p className={styles.muted}>No hay enlaces de evidencia verificados en el manifiesto.</p>}
              <nav className={styles.projectLinks} aria-label={`Accesos de ${project.name}`}>
                <Link href={`/admin/workspace/products/${project.id}`}>Ficha del proyecto</Link>
                <Link href={project.serviceHref}>Biblioteca del servicio</Link>
                {project.clientHref ? <Link href={project.clientHref}>Cliente 360°</Link> : null}
                {project.leadHref ? <Link href={project.leadHref}>Empresa en CRM</Link> : null}
                {project.saleHref ? <Link href={project.saleHref}>Consultar venta vinculada</Link> : null}
              </nav>
            </article>)}
          </div>
        </section>
      )) : <div className={styles.emptyLibrary}>
        <strong>{projects.length ? "Ningún proyecto coincide con los filtros." : "Todavía no hay proyectos Higgsfield registrados."}</strong>
        <p>{projects.length
          ? "Prueba otro cliente, servicio o estado. No se han ocultado ni inventado recursos."
          : "Los futuros recursos aparecerán cuando el backend registre su procedencia y, para Importado, exista un archivo disponible."}</p>
        {projects.length ? <button type="button" onClick={() => { setSearch(""); setClient("all"); setService("all"); setState("all"); }}>
          Limpiar filtros
        </button> : <a href="#creative-actions">Ir al registro de entregas</a>}
      </div>}
      <div className={styles.libraryFooter}>
        <Link href="/admin/workspace/website-designer">Website Designer</Link>
        <Link href="/admin/workspace/ecommerce-designer">E-commerce Designer</Link>
        <Link href="/admin/workspace/crm-creator">CRM Creator</Link>
        <Link href="/admin/workspace/marketing-hub">Marketing Hub</Link>
        <Link href="/admin/workspace/crm/leads">CRM</Link>
      </div>
    </section>
  );
}
