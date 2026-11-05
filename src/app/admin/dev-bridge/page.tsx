import Link from 'next/link';
import { Suite } from '@/components/suite/suite';
import { requireOwner } from '@/lib/auth/session';
import { snapshot } from '@/lib/dev-bridge/runtime';
import { collaboration, freshness, type Owner } from '@/lib/dev-bridge/core';
import { BridgeAutoRefresh } from './bridge-auto-refresh';
import { BridgeStatus, BuildStatus, CiStatus, Sha, SourceCard, VerifiedSourceOnly } from './bridge-visuals';
import s from './bridge.module.css';
export const dynamic = 'force-dynamic';
export default async function DevBridge() {
  await requireOwner();
  const state = await snapshot();
  const github = state.github.data;
  const publicOnly = github?.coverage === 'summary';
  const completeGithub = freshness(state.github).status === 'VERIFIED' && !publicOnly && !state.github.error;
  const owners: Owner[] = ['miguel', 'samuel'];
  const githubFresh = freshness(state.github).status === 'VERIFIED' && !state.github.error;
  // Keep cached PRs available to the data layer, but do not present old
  // CI/commit evidence as currently verified when a provider refresh fails.
  const visiblePulls = githubFresh ? (github?.pulls ?? []) : [];
  // Public-summary coverage verifies PR titles, not a full commit feed.
  const visibleCommits = completeGithub ? (github?.commits ?? []) : [];
  // Lists claiming ownership and handoff readiness need full, fresh metadata.
  // A public-only or failed refresh cannot confirm whether an Issue has a PR.
  const verifiedGithub = completeGithub ? github : null;
  const team = collaboration(githubFresh ? github ?? null : null);
  return <Suite active="dev-bridge"><div className={s.bridge}><BridgeAutoRefresh />
    <header className={s.hero}>
      <div className={s.heroTop}>
        <div><small>AVALON / ENGINEERING</small><h1>Dev Bridge <span>2.0</span></h1>
          <p>Un solo lugar para coordinar desarrollo, evidencia y handoffs entre Miguel y Samuel.</p>
        </div>
        <Link className={s.refreshLink} href="/admin/dev-bridge">Actualizar lectura ↻</Link>
      </div>
      <p className={s.muted}>Lectura: <time dateTime={state.at}>{state.at}</time>. Actualiza cada cinco minutos si esta pestaña permanece visible. La caché puede durar hasta 15 minutos con GitHub público. Un build listo no confirma salud funcional.</p>
    </header>
    <section className={s.sources} aria-label="Estado de las fuentes">{(['github', 'vercel', 'supabase'] as const).map(name =>
      <SourceCard key={name} name={name} fact={state[name]} limited={name === 'github' && publicOnly} />
    )}</section>
    <section className={s.section} aria-label="Prioridades y bloqueos">
      <div className={s.sectionTitle}><div><small>ALERTAS CON PROCEDENCIA</small><h2>Prioridades y bloqueos</h2></div>
        <BridgeStatus state={state.findings.length ? 'pending' : 'unknown'} label={state.findings.length ? 'Requiere revisión' : 'Sin diagnóstico global'} /></div>
      {state.findings.length ? <ul className={s.findingList}>{state.findings.slice(0, 15).map(f =>
        <li key={f.id}><span className={s.findingType}>{f.claim === 'VERIFIED' ? 'Reportado por proveedor' : 'Inferencia, revisar'}</span><span>{f.message}</span></li>
      )}</ul> : <p className={s.muted}>No hay alertas en los metadatos disponibles. Eso no demuestra que la aplicación esté libre de fallos.</p>}
      {state.findings.length > 15 ? <p className={s.muted}>Se muestran 15 de {state.findings.length} avisos. Consulta el informe completo con bridge:report.</p> : null}
    </section>

    {publicOnly ? <section className={`${s.section} ${s.notice}`} role="note"><BridgeStatus state="unknown" label="Lectura parcial" /><h2>GitHub · consulta pública limitada</h2><p>Solo se conocen títulos de PR, Issues y SHA públicos. CI, archivos compartidos, conflictos, comentarios y migraciones siguen <strong>Desconocidos</strong>. Los paquetes de handoff están bloqueados hasta obtener una lectura completa autenticada.</p></section> : null}
    <section className={s.section} aria-label="Cooperación entre Miguel y Samuel">
      <h2>Centro de cooperación · Miguel + Samuel</h2>
      <p>La fuente de verdad son las Issues y los PRs de GitHub. Ningún nombre de rama, autor de commit o agente IA demuestra quién es el dueño del trabajo. El traspaso no fusiona ramas ni cambia permisos.</p>
      {!githubFresh ? <p>Desconocido: no hay lectura actual verificada de GitHub. Las asignaciones y los posibles solapamientos requieren nueva comprobación antes de reanudar.</p> : <>
        <div className={s.sources}>
          <article className={s.card}><small>PRs ABIERTOS</small><h2 className={s.metric}>{team.total}</h2><p>Trabajo propuesto; no equivale a un despliegue.</p></article>
          <article className={s.card}><small>CON RESPONSABLE EXPLÍCITO</small><h2 className={s.metric}>{team.assigned.miguel.length + team.assigned.samuel.length}</h2><p>Asignados mediante Issue etiquetada, no por autor o rama.</p></article>
          <article className={s.card}><small>RESPONSABLE DESCONOCIDO</small><h2 className={s.metric}>{team.unassigned.length}</h2><p>Ambos pueden revisarlos, sin atribución inventada.</p></article>
        </div>
        <div className={s.workspaces}>
          {owners.map(owner => <article className={s.card} key={owner}>
            <small>TRABAJO VERIFICABLE</small><h3>{owner === 'miguel' ? 'Miguel' : 'Samuel'}</h3>
            {team.assigned[owner].length ? team.assigned[owner].slice(0, 8).map(({ pr, issue, next_action }) =>
              <div className={s.task} key={pr.number}>
                <p className={s.taskTitle}><a href={pr.url}>PR #{pr.number}: {pr.title}</a></p>
                <div className={s.metaLine}><a href={issue.url}>Issue #{issue.number}</a><CiStatus code={pr.ci} /><Sha value={pr.head_sha} /></div>
                <p><strong>Próximo paso reportado:</strong> {next_action ?? 'No registrado en la Issue.'}</p>
                {completeGithub && next_action ? <a className={s.action} href={`/api/dev-bridge/resume?issue=${issue.number}&as=${owner === 'miguel' ? 'samuel' : 'miguel'}`}>
                  Preparar paquete para {owner === 'miguel' ? 'Samuel' : 'Miguel'} ↓
                </a> : <p className={s.muted}>Descarga de continuación bloqueada: falta lectura completa o un “Next action” registrado.</p>}
              </div>) : <p>Sin PR vinculado a una Issue de {owner}. No significa que esté inactivo.</p>}
          </article>)}
        </div>
        <details>
          <summary>PRs sin propietario verificable · {team.unassigned.length}</summary>
          <p>Antes de hacer handoff: vincular una Issue, etiquetar owner:miguel u owner:samuel y documentar un “Next action”. No basta un nombre de rama.</p>
          <ul>{team.unassigned.slice(0,18).map(pr => <li key={pr.number}>
            <a href={pr.url}>#{pr.number} {pr.title}</a> · {pr.branch} · <Sha value={pr.head_sha} /> · <CiStatus code={pr.ci} />
          </li>)}</ul>
          {team.unassigned.length > 18 ? <p>Otros {team.unassigned.length - 18} PRs: consultar la tabla completa debajo.</p> : null}
        </details>
        <details>
          <summary>Archivos tocados por varias ramas · {publicOnly ? 'NO VERIFICADO' : `${team.overlap_total} pares potenciales`}</summary>
          <p>Son coincidencias de rutas, NO conflictos de merge confirmados. Coordinen antes de editar esos archivos compartidos.</p>
          <ul>{team.overlaps.map(pair => <li key={`${pair.left}-${pair.right}`}>
            PR #{pair.left} y #{pair.right}: {pair.files.join(', ')}
          </li>)}</ul>
          {team.overlap_total > team.overlaps.length ? <p>Se muestran {team.overlaps.length} pares; consultar diffs completos antes de resolver.</p> : null}
          {publicOnly ? <p>Desconocido: el modo público no descargó archivos. No concluyas que no hay conflictos.</p> : team.overlap_total === 0 ? <p>No hay rutas repetidas en los archivos verificados.</p> : null}
        </details>
        <details>
          <summary>Higgsfield / Creative Bridge · {team.creative.length} PRs relacionados</summary>
          <ul>{team.creative.slice(0,12).map(pr => <li key={pr.number}>
            <a href={pr.url}>PR #{pr.number} {pr.title}</a> · <CiStatus code={pr.ci} /> · <Sha value={pr.head_sha} />
          </li>)}</ul>
          <p>Un PR validado no activa Higgsfield. Una referencia a una entrega tampoco instala archivos, imágenes, videos o sitios dentro de Avalon. Exigir evidencia visual en Preview aislada.</p>
        </details>
      </>}
    </section>
    <section className={s.section} aria-label="Tareas sin PR vinculado">
      <h2>Tareas asignadas sin PR vinculado</h2>
      <p className={s.muted}>Una Issue etiquetada puede ser trabajo activo aunque todavía no tenga rama. No se crea una asignación por adivinación.</p>
      <div className={s.workspaces}>{owners.map(owner => {
        const linkedPrs = verifiedGithub?.pulls ?? [];
        const tasks = verifiedGithub?.issues.filter(item => item.owner === owner && item.open !== false && !linkedPrs.some(pr => pr.issues.includes(item.number))) ?? [];
        return <article className={s.card} key={owner}><small>{owner === 'miguel' ? 'MIGUEL' : 'SAMUEL'}</small>
          <h3>{completeGithub ? `${tasks.length} tareas sin PR` : 'Estado desconocido'}</h3>
          {!completeGithub ? <p className={s.noticeText} role="status">No se pueden comprobar tareas sin PR con una lectura incompleta, antigua o fallida de GitHub.</p>
            : tasks.length ? <ul className={s.simpleList}>{tasks.slice(0, 8).map(item =>
            <li key={item.id}><a href={item.url}>#{item.number} · {item.title}</a><span className={s.muted}>Estado reportado: {item.state}</span></li>
          )}</ul> : <p>Sin tareas verificadas de este tipo.</p>}
          {completeGithub && tasks.length > 8 ? <p className={s.muted}>Hay {tasks.length - 8} tareas adicionales en GitHub.</p> : null}
        </article>;
      })}</div>
    </section>
    <section className={s.section}><h2>Integración compartida</h2><p>Conflictos, dependencias y checkpoints se revisan en las Issues canónicas.</p>
      {!completeGithub ? <p className={s.noticeText} role="status">Issues de integración: estado desconocido hasta obtener lectura completa y actual de GitHub.</p>
        : <ul>{verifiedGithub?.issues.filter(i=>i.labels.includes('type:integration')||i.labels.includes('type:handoff')).map(i=><li key={i.id}><a href={i.url}>#{i.number} {i.title}</a> · {i.state}</li>)}</ul>}
      <p>Próximo release: UNKNOWN hasta aprobación de los propietarios.</p></section>
    <section className={s.section} aria-label="PR abiertos y CI">
      <div className={s.sectionTitle}><div><small>GITHUB</small><h2>PR abiertos y sus verificaciones</h2></div><span className={s.muted}>{githubFresh ? `${visiblePulls.length} PR visibles` : 'PRs sin lectura actual'}</span></div>
      <p className={s.muted}>CI corresponde a checks de GitHub, no al build de Vercel. Una coincidencia de archivos no es un conflicto de merge confirmado.</p>
      {!githubFresh ? <p className={s.noticeText}>Los PR mostrados proceden de una lectura antigua o desconocida. No son una confirmación actual y no permiten preparar handoffs.</p> : null}
      <div className={s.desktopTable}><div className={s.scroll} tabIndex={0} role="region" aria-label="Tabla de pull requests desplazable horizontalmente">
        <table><thead><tr><th>PR / rama / SHA</th><th>CI</th><th>Integración</th><th>Archivos</th></tr></thead><tbody>{visiblePulls.map(p =>
          <tr key={p.number}><td><a href={p.url}>#{p.number} {p.title}</a><span className={s.muted}>{p.branch}</span><Sha value={p.head_sha} /></td>
          <td><CiStatus code={completeGithub ? p.ci : null} /></td>
          <td>{publicOnly ? 'Desconocido' : p.conflict === null ? 'Conflicto desconocido' : p.conflict ? 'Conflicto confirmado' : 'Sin conflicto detectado'}
            <span className={s.muted}>{publicOnly ? 'Desfase desconocido' : `${p.behind} commits de diferencia reportada`}</span></td>
          <td>{publicOnly ? 'Desconocido' : <details><summary>{p.files.length} archivos</summary><ul>{p.files.map(f => <li key={f}>{f}</li>)}</ul></details>}</td></tr>
        )}</tbody></table>
      </div></div>
      <div className={s.mobilePRs}>{visiblePulls.map(p => <article className={s.mobilePR} key={p.number}>
        <a className={s.taskTitle} href={p.url}>PR #{p.number} · {p.title}</a>
        <div className={s.metaLine}><CiStatus code={completeGithub ? p.ci : null} /><Sha value={p.head_sha} /></div>
        <p className={s.muted}>{p.branch}</p>
        <p>{publicOnly || p.conflict === null ? 'Integración: Desconocida' : p.conflict ? 'Conflicto de integración confirmado' : 'Sin conflicto detectado'}</p>
        {publicOnly ? <p className={s.muted}>Archivos y CI no verificados.</p> : <details><summary>Archivos tocados · {p.files.length}</summary><ul>{p.files.map(f => <li key={f}>{f}</li>)}</ul></details>}
      </article>)}</div>
      {!visiblePulls.length ? <p className={s.muted}>Sin PRs verificados en la lectura actual. Esto no demuestra que el repositorio esté vacío.</p> : null}
      <details><summary>Commits recientes</summary><ul>{visibleCommits.slice(0, 20).map(c => <li key={c.sha}><a href={c.url}><Sha value={c.sha} /></a> · {c.date} · autor reportado: {c.author}</li>)}</ul></details>
    </section>
    <section className={s.section} aria-label="Despliegues de Vercel">
      <div className={s.sectionTitle}><div><small>VERCEL</small><h2>Despliegues</h2></div><BridgeStatus state={freshness(state.vercel).status === 'VERIFIED' ? 'verified' : 'unknown'} label={freshness(state.vercel).status === 'VERIFIED' ? 'Metadatos disponibles' : 'Sin verificación actual'} /></div>
      <p className={s.muted}>Un build READY no verifica la autenticación ni el funcionamiento del sitio. No se consultan variables ni logs privados.</p>
      <VerifiedSourceOnly fact={state.vercel}>
      <div className={s.deployments}>{state.vercel.data?.slice(0, 12).map(d => <article className={s.deployment} key={d.id}>
        <div className={s.sourceTop}><strong>{d.environment === 'production' ? 'Producción' : 'Vista previa'}</strong><BuildStatus code={d.state} /></div>
        <p>{d.branch || 'Rama desconocida'}</p><Sha value={d.sha} />
        {d.url ? <a href={d.url} rel="noopener noreferrer">Abrir despliegue ↗</a> : <span className={s.muted}>Enlace no disponible</span>}
      </article>)}</div>
      {!state.vercel.data?.length ? <p className={s.muted}>No se obtuvieron despliegues verificables.</p> : null}
      </VerifiedSourceOnly>
    </section>
    <section className={s.section} aria-label="Metadatos de Supabase">
      <div className={s.sectionTitle}><div><small>SUPABASE</small><h2>Metadatos de la base de datos</h2></div><BridgeStatus state={freshness(state.supabase).status === 'VERIFIED' ? 'verified' : 'unknown'} label={freshness(state.supabase).status === 'VERIFIED' ? 'Lectura verificada' : 'Desconocido'} /></div>
      <VerifiedSourceOnly fact={state.supabase}>
      <p>Proyecto: <code>{state.supabase.data?.ref ?? 'Desconocido'}</code> · {state.supabase.data?.status ?? 'Sin estado disponible'}</p>
      <div className={s.metaLine}><span>{state.supabase.data?.migrations.length ?? 0} migraciones reportadas</span><span>{state.supabase.data?.rls.length ?? 0} tablas inspeccionadas</span></div>
      <details><summary>Ver migraciones reportadas</summary><ul>{state.supabase.data?.migrations.map(m => <li key={m}><code>{m}</code></li>)}</ul></details>
      <details><summary>Ver RLS reportado</summary><ul>{state.supabase.data?.rls.map(r => <li key={r.table}>{r.table}: <BridgeStatus state={r.enabled ? 'verified' : 'blocked'} label={r.enabled ? 'RLS habilitado' : 'RLS deshabilitado'} /></li>)}</ul></details>
      <details><summary>Ver funciones reportadas</summary><ul>{state.supabase.data?.functions.map(f => <li key={f.name}>{f.name}: {f.status}</li>)}</ul></details>
      </VerifiedSourceOnly>
      <p className={s.muted}>Las políticas, el aislamiento de clientes, el runtime y las autorizaciones requieren pruebas adicionales. Esta vista no consulta datos personales ni secretos.</p>
    </section>
    <footer className={s.muted}>Fuente de verdad: Issues y commits de GitHub, junto a docs/dev-bridge. Una caché o una captura de esta vista nunca reemplaza las verificaciones del SHA y de los permisos actuales.</footer>
  </div></Suite>;
}
