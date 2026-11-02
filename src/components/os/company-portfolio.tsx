"use client";
import Link from 'next/link';
import { useState } from 'react';
import { pick, formatDate, type Lang } from '@/lib/i18n';
import { SERVICES, type Service, type CompanyGroup } from '@/lib/os/client-hud';
import s from './client-hud.module.css';

export function CompanyPortfolio({ groups, module, lang }: { groups: CompanyGroup[]; module: Service; lang: Lang }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const shown = groups.filter(g => (`${g.name} ${g.projects.map(p => `${p.name} ${p.description}`).join(' ')}`).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (status !== 'active' || g.active > 0));
  return <section className={s.hud} data-service={module} aria-label={pick(lang,'Empresas y productos','Companies and products')}>
    <header className={s.header}><div><p className={s.eyebrow}>{SERVICES[module].name}</p><h2>{pick(lang,'Empresas y proyectos','Companies and projects')}</h2><p className={s.description}>{pick(lang,'Abre una empresa para administrar sus productos, revisar resultados y solicitar mejoras.','Open a company to manage its products, review results and request improvements.')}</p></div></header>
    <div className={s.stats}><div className={s.stat}>{pick(lang,'Empresas vinculadas','Linked companies')}<strong>{groups.filter(g=>g.linked).length}</strong></div><div className={s.stat}>{pick(lang,'Proyectos activos','Active projects')}<strong>{groups.reduce((n,g)=>n+g.active,0)}</strong></div><div className={s.stat}>{pick(lang,'En preparaci\u00f3n','In preparation')}<strong>{groups.reduce((n,g)=>n+g.drafts,0)}</strong></div></div>
    <div className={s.toolbar}><label className={s.field}>{pick(lang,'Buscar empresa o proyecto','Search companies or projects')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} /></label><label className={s.field}>{pick(lang,'Mostrar','Show')}<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">{pick(lang,'Todos los registrados','All registered')}</option><option value="active">{pick(lang,'Con proyectos activos','With active projects')}</option></select></label></div>
    <div className={s.grid}>{shown.map(g=><Link key={(g.linked?'client:':'project:')+g.id} className={s.company} href={g.linked?`/admin/workspace/clients/${g.id}?tool=${module}`:`/admin/workspace/products/${g.id}`}>
      <span className={s.initial} aria-hidden="true">{g.name.slice(0,1).toLocaleUpperCase()}</span><h3>{g.name}</h3>
      {!g.linked&&<span className={s.tag}>{pick(lang,'Sin empresa vinculada','No linked company')}</span>}
      <p className={s.description}>{g.projects.map(p=>p.name).slice(0,3).join(' / ')}</p>
      <p className={s.muted}>{g.projects[0]?.description?.slice(0,180)||pick(lang,'A\u00fan no hay descripci\u00f3n del producto.','No product description yet.')}</p>
      <div className={s.actions}><span className={s.tag}>{g.projects.length} {pick(lang,'proyectos','projects')}</span><span className={s.tag}>{g.active} {pick(lang,'activos','active')}</span></div>
      <span className={s.muted}>{pick(lang,'Actualizado','Updated')} {formatDate(lang,g.updated_at)}</span><strong>{pick(lang,'Abrir HUD','Open HUD')} &rarr;</strong>
    </Link>)}</div>
    {!shown.length&&<p className={s.empty}>{pick(lang,'No hay empresas para estos filtros. Vincula el proyecto a un registro del CRM desde su ficha operativa.','No companies match these filters. Link a project to a CRM record in its operations form.')}</p>}
    <p className={s.muted}>{pick(lang,'Resumen de los proyectos cargados (hasta 100 recientes). Cada empresa se identifica por su referencia del CRM, nunca solo por su nombre. Activo no significa pago confirmado.','Summary of loaded projects (up to 100 recent records). Companies are identified by CRM reference, never name alone. Active does not mean payment confirmed.')}</p>
  </section>;
}
