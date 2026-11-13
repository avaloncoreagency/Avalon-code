"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate, pick, type Lang } from "@/lib/i18n";
import type { CompanyGroup } from "@/lib/os/client-hud";
import s from "./communications.module.css";

type Kind = "all" | "receptionist" | "chatbots";
type Scope = "all" | "linked" | "unlinked";

const route = (module: string, id: string) => module === "receptionist"
  ? `/admin/workspace/ai-receptionist/${id}`
  : `/admin/workspace/ai-chatbots/${id}`;

export function CommunicationsPortfolio({ groups, lang, page, loaded, total }: {
  groups: CompanyGroup[]; lang: Lang; page: number; loaded: number; total: number | null;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [scope, setScope] = useState<Scope>("all");
  const t = (es: string, en: string) => pick(lang, es, en);
  const term = query.trim().toLocaleLowerCase();
  const filtered = groups.map(g => {
    const matchesCompany = g.linked && g.name.toLocaleLowerCase().includes(term);
    const projects = g.projects.filter(p =>
      (kind === "all" || p.module === kind)
      && (!term || matchesCompany || `${p.name} ${p.description}`.toLocaleLowerCase().includes(term)));
    return { ...g, projects };
  }).filter(g => g.projects.length > 0 && (scope === "all" || (scope === "linked") === g.linked));
  const linked = filtered.filter(g => g.linked);
  const unlinked = filtered.filter(g => !g.linked).flatMap(g => g.projects);

  const renderProject = (p: CompanyGroup["projects"][number]) => {
    const href = route(p.module, p.id);
    const label = p.module === "receptionist" ? "AI Receptionist" : "AI Chatbot";
    return <li className={s.project} key={p.id}>
      <span className={s.projectType}>{label}</span>
      <div className={s.projectMain}><strong>{p.name}</strong>
        <span className={s.projectStatus}>{p.status === "draft" ? t("Borrador","Draft") : p.status === "active" ? t("Activo en Avalon","Active in Avalon") : t("Archivado","Archived")}</span>
      </div>
      <span className={s.muted}>{t("Actualizado","Updated")} {formatDate(lang,p.updated_at)}</span>
      <div className={s.projectActions}>
        <Link href={`/admin/workspace/products/${p.id}`}>{t("Abrir ficha, errores y versiones","Open record, issues and versions")}</Link>
        <Link href={href}>{t("Configuración existente","Existing configuration")}</Link>
      </div>
    </li>;
  };

  return <div className={s.board}>
    <div className={s.toolbar}>
      <label className={s.field}>{t("Buscar en esta página","Search this page")}
        <input className={s.input} type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={t("Empresa o nombre del agente","Company or agent name")} />
      </label>
      <label className={s.field}>{t("Tipo de agente","Agent type")}
        <select className={s.select} value={kind} onChange={e => setKind(e.target.value as Kind)}>
          <option value="all">{t("Todos","All")}</option>
          <option value="receptionist">AI Receptionist</option>
          <option value="chatbots">AI Chatbots</option>
        </select>
      </label>
      <label className={s.field}>{t("Vinculación","Company association")}
        <select className={s.select} value={scope} onChange={e => setScope(e.target.value as Scope)}>
          <option value="all">{t("Todas","All")}</option>
          <option value="linked">{t("Empresas vinculadas","Linked companies")}</option>
          <option value="unlinked">{t("Sin empresa","Unassigned")}</option>
        </select>
      </label>
    </div>
    {linked.length > 0 && <div className={s.groupGrid}>
      {linked.map(g => <article className={s.company} key={g.id}>
        <div className={s.companyHead}>
          <span className={s.avatar} aria-hidden="true">{g.name.trim().slice(0,1).toLocaleUpperCase()}</span>
          <div><h3 className={s.companyName}>{g.name}</h3>
            <p>{t("Empresa vinculada por ID de CRM","Linked by CRM record ID")}</p></div>
        </div>
        <div className={s.companyStats}>
          <span className={s.chip}>{g.projects.filter(p => p.module === "receptionist").length} {t("recepcionistas","receptionists")}</span>
          <span className={s.chip}>{g.projects.filter(p => p.module === "chatbots").length} chatbots</span>
        </div>
        <ul className={s.projectList}>{g.projects.map(renderProject)}</ul>
        <div className={s.projectActions}><Link href={`/admin/workspace/clients/${g.id}`}>{t("Abrir ficha CRM","Open CRM record")}</Link></div>
      </article>)}
    </div>}
    {unlinked.length > 0 && <section className={s.unlinked}>
      <h3>{t("Agentes sin empresa vinculada","Agents without a linked company")} ({unlinked.length})</h3>
      <p className={s.muted}>{t("Estos proyectos se conservan separados. Abre cada agente y vincula su empresa desde la ficha operativa, sin adivinar por el nombre.","These projects remain separate. Open each agent and link its company from the operations record; company names are never guessed.")}</p>
      <ul className={s.projectList}>{unlinked.map(renderProject)}</ul>
    </section>}
    {filtered.length === 0 && <div className={s.empty}>
      {loaded === 0 ? t("Todavía no hay agentes registrados. Crea el primero abajo.","No agents registered yet. Create the first one below.")
        : t("No hay coincidencias con estos filtros en esta página.","No matching agents with these filters on this page.")}
    </div>}
    <p className={s.muted}>{t("Los filtros buscan entre los proyectos cargados en esta página. Cada empresa se agrupa por su ID real del CRM, nunca solamente por el nombre.","Filters search projects loaded on this page. Companies are grouped by their actual CRM ID, never by name alone.")}</p>
    <div className={s.pager}>
      <span>{t("Página","Page")} {page} · {loaded} {t("agentes cargados","loaded agents")}{total === null ? "" : ` / ${total} ${t("registrados","registered")}`}</span>
      <div className={s.pager}>
        {page > 1 && <Link href={`/admin/workspace/ai-communications?page=${page-1}#directory`}>{t("Anterior","Previous")}</Link>}
        {(total === null ? loaded >= 60 : page * 60 < total) &&
          <Link href={`/admin/workspace/ai-communications?page=${page+1}#directory`}>{t("Siguiente","Next")}</Link>}
      </div>
    </div>
  </div>;
}
