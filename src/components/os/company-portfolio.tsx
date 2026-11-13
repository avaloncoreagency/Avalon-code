"use client";
import Link from "next/link";
import { useState } from "react";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { SERVICES, type Service, type CompanyGroup } from "@/lib/os/client-hud";
import s from "./client-hud.module.css";

/** Every card belongs to this module. Companies group products, but never replace direct product access. */
export function CompanyPortfolio({ groups, module, lang }: { groups: CompanyGroup[]; module: Service; lang: Lang }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const term = query.trim().toLocaleLowerCase();
  const shown = groups.map(g => ({
    ...g,
    projects: g.projects.filter(p =>
      (!term || `${g.name} ${p.name} ${p.description}`.toLocaleLowerCase().includes(term)) &&
      (status === "all" || p.status === status)),
  })).filter(g => g.projects.length > 0);

  return <section className={s.hud} data-service={module} aria-label={pick(lang,"Productos por empresa","Products by company")}>
    <header className={s.header}><div><p className={s.eyebrow}>{SERVICES[module].name}</p>
      <h2>{pick(lang,"Mis productos por empresa","My products by company")}</h2>
      <p className={s.description}>{pick(lang,
        "Cada producto tiene su propia ficha de acceso, archivos, versiones, pruebas y errores. La empresa se vincula por su ID del CRM.",
        "Each product has its own record for access, files, versions, checks and issues. Companies are linked by CRM ID.")}</p>
    </div></header>
    <div className={s.stats}>
      <div className={s.stat}>{pick(lang,"Productos registrados","Registered products")}<strong>{groups.reduce((n,g)=>n+g.projects.length,0)}</strong></div>
      <div className={s.stat}>{pick(lang,"Empresas vinculadas","Linked companies")}<strong>{groups.filter(g=>g.linked).length}</strong></div>
      <div className={s.stat}>{pick(lang,"Proyectos internos activos","Active internal projects")}<strong>{groups.reduce((n,g)=>n+g.active,0)}</strong></div>
    </div>
    <div className={s.toolbar}>
      <label className={s.field}>{pick(lang,"Buscar empresa o producto","Search company or product")}
        <input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label className={s.field}>{pick(lang,"Estado de Avalon","Avalon status")}
        <select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="all">{pick(lang,"Todos","All")}</option>
          <option value="draft">{pick(lang,"Borradores","Drafts")}</option>
          <option value="active">{pick(lang,"Activos en Avalon","Active in Avalon")}</option>
          <option value="archived">{pick(lang,"Archivados","Archived")}</option>
        </select>
      </label>
    </div>
    <div className={s.grid}>{shown.map(g=><article className={s.company} key={(g.linked?"client:":"project:")+g.id}>
      <span className={s.initial} aria-hidden="true">{g.name.slice(0,1).toLocaleUpperCase()}</span>
      <h3>{g.name}</h3>
      {g.linked
        ? <Link href={g.linkKind==="client"?`/admin/workspace/crm/clients/${g.id}`:`/admin/workspace/clients/${g.id}?tool=${module}`}>{pick(lang,"Ver empresa en CRM","View CRM company")}</Link>
        : <span className={s.tag}>{pick(lang,"Sin empresa vinculada","Not linked to a company")}</span>}
      <ul className={s.list}>{g.projects.map(p=><li className={s.row} key={p.id}>
        <strong>{p.name}</strong>
        <p className={s.description}>{p.description || pick(lang,"Sin descripción","No description")}</p>
        <p className={s.muted}>{pick(lang,"Actualizado","Updated")} {formatDate(lang,p.updated_at)} · {p.status}</p>
        <Link href={`/admin/workspace/products/${p.id}`}>{pick(lang,"Administrar producto, errores y mejoras","Manage product, issues and improvements")}</Link>
        {" · "}
        <Link href={`/admin/workspace/library/${p.id}`}>{pick(lang,"Versiones y archivos","Versions and files")}</Link>
      </li>)}</ul>
    </article>)}</div>
    {!shown.length&&<p className={s.empty}>{pick(lang,"No hay productos para estos filtros.","No products match these filters.")}</p>}
    <p className={s.muted}>{pick(lang,
      "Hasta 100 registros recientes por módulo. «Activo» indica el estado interno en Avalon; no confirma que el producto externo esté online ni pagado.",
      "Up to 100 recent records per module. “Active” is an internal Avalon status, not proof that the external product is online or paid.")}</p>
  </section>;
}
