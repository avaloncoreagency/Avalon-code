import Link from 'next/link';
import { Suite } from '@/components/suite/suite';
import { requireOwner } from '@/lib/auth/session';
import { snapshot } from '@/lib/dev-bridge/runtime';
import { collaboration, freshness, type Owner } from '@/lib/dev-bridge/core';
import { BridgeAutoRefresh } from './bridge-auto-refresh';
import s from './bridge.module.css';
export const dynamic = 'force-dynamic';
export default async function DevBridge() {
  await requireOwner();
  const state = await snapshot();
  const github = state.github.data;
  const publicOnly = github?.coverage === 'summary';
  const completeGithub = state.github.status === 'VERIFIED' && !publicOnly;
  const owners: Owner[] = ['miguel', 'samuel'];
  const team = collaboration(state.github.status === 'VERIFIED' ? github ?? null : null);
  return <Suite active="dev-bridge"><div className={s.bridge}><BridgeAutoRefresh />
    <header className={s.hero}><small>AVALON / ENGINEERING</small><h1>Dev Bridge <span>2.0</span></h1><p>Contexto compartido. Evidencia verificable. Un siguiente paso seguro.</p><Link href="/admin/dev-bridge">Actualizar lectura ↻</Link><p className={s.muted}>Consulta: {state.at}. Actualización automática cada cinco minutos cuando está visible; caché de 5 minutos (15 si GitHub está en modo público limitado). READY describe un build; la salud de la aplicación sigue UNKNOWN sin una prueba real.</p></header>
    <section className={s.sources} aria-label="Conexiones">{(['github','vercel','supabase'] as const).map(name => <article className={s.card} key={name}><small>{name.toUpperCase()}</small><h2>{freshness<unknown>(state[name]).status}</h2><p>Última verificación: {state[name].verified_at ?? 'Nunca'}</p><p>{state[name].error ?? 'Metadatos consultados; no equivale a una prueba funcional.'}</p></article>)}</section>
    <section className={s.section} aria-label="Guía de uso de Dev Bridge">
      <h2>Cómo usar Dev Bridge · Miguel y Samuel</h2>
      <p>Este panel observa cambios técnicos, no ejecuta tareas ni comprueba por sí solo que el CRM esté funcionando.</p>
      <details>
        <summary>Entender estados, avisos y próximos pasos</summary>
        <ol>
          <li><strong>Verifica las conexiones:</strong> VERIFIED significa que se consultaron metadatos; STALE conserva datos anteriores y UNKNOWN significa que no hay evidencia suficiente. Ninguno confirma por sí solo la salud del sitio.</li>
          <li><strong>Revisa primero CI fallido y conflictos confirmados.</strong> Los solapamientos de archivos y las ramas con bases diferentes son advertencias de coordinación, no errores confirmados. Un build de Vercel ERROR no es automáticamente un test de GitHub fallido.</li>
          <li><strong>Coordina una tarea:</strong> abre el PR, comprueba el commit exacto y enlaza una Issue con una única etiqueta owner:miguel u owner:samuel y una línea Next action:. No atribuyas trabajo sin etiquetas verificadas.</li>
          <li><strong>Prepara una continuación</strong> únicamente con GitHub completo y autenticado. Un resumen público limitado no permite handoff seguro; ninguna acción de este panel fusiona código.</li>
        </ol>
        <p>Diagnóstico técnico con acceso al repositorio: <code>npm run bridge:doctor</code> → <code>npm run bridge:sync</code> → <code>npm run bridge:status</code> → <code>npm run bridge:check</code>. Los tokens deben configurarse como secretos del servidor, nunca en la página ni en el repositorio.</p>
      </details>
    </section>
    <section className={s.section}><h2>Prioridades y bloqueos</h2><p>Salud global: {state.findings.length ? 'REQUIERE REVISIÓN' : 'UNKNOWN · aplicación no sondeada'}</p><ul>{state.findings.slice(0,30).map(f => <li key={f.id}><strong>{f.claim}</strong> · {f.message}</li>)}</ul>{state.findings.length > 30 ? <p>Hay más hallazgos en bridge:report.</p> : null}</section>

    {publicOnly ? <section className={s.section}><h2>GitHub · consulta pública limitada</h2><p>Los PRs, Issues y SHA públicos se pueden leer sin configurar un token de GitHub en Vercel. Esta lectura NO incluye checks de CI, archivos, conflictos, comentarios ni migraciones. Las continuaciones están desactivadas hasta tener una verificación completa autenticada.</p></section> : null}
    <section className={s.section} aria-label="Cooperación entre Miguel y Samuel">
      <h2>Centro de cooperación · Miguel + Samuel</h2>
      <p>La fuente de verdad son las Issues y los PRs de GitHub. Ningún nombre de rama, autor de commit o agente IA demuestra quién es el dueño del trabajo. El traspaso no fusiona ramas ni cambia permisos.</p>
      {state.github.status !== 'VERIFIED' ? <p>UNKNOWN: no se puede afirmar quién está trabajando ni qué PRs son actuales. Reconecta GitHub antes de reanudar.</p> : <>
        <div className={s.sources}>
          <article className={s.card}><small>PRs ABIERTOS</small><h2>{team.total}</h2><p>Ramas con commits propios; no equivalen a cambios publicados.</p></article>
          <article className={s.card}><small>ASIGNACIÓN VERIFICADA</small><h2>{team.assigned.miguel.length + team.assigned.samuel.length}</h2><p>Solo Issues con etiqueta de propietario inequívoca y PR vinculado.</p></article>
          <article className={s.card}><small>SIN DUEÑO VERIFICADO</small><h2>{team.unassigned.length}</h2><p>Visibles para ambos, sin inventar quién los inició.</p></article>
        </div>
        <div className={s.workspaces}>
          {owners.map(owner => <article className={s.card} key={owner}>
            <small>TRABAJO VERIFICABLE</small><h3>{owner === 'miguel' ? 'Miguel' : 'Samuel'}</h3>
            {team.assigned[owner].length ? team.assigned[owner].slice(0,8).map(({pr,issue,next_action}) =>
              <div className={s.task} key={pr.number}>
                <p><a href={pr.url}>PR #{pr.number}: {pr.title}</a></p>
                <p>Issue <a href={issue.url}>#{issue.number}</a> · CI {pr.ci} · SHA {pr.head_sha.slice(0,12)}</p>
                <p>Próximo paso reportado: {next_action ?? 'Sin Next action registrado'}</p>
                {completeGithub ? <a className={s.action} href={`/api/dev-bridge/resume?issue=${issue.number}&as=${owner === 'miguel' ? 'samuel' : 'miguel'}`}>
                  Preparar continuación para {owner === 'miguel' ? 'Samuel' : 'Miguel'} ↓
                </a> : <p>Descarga de continuación bloqueada hasta verificar GitHub completo.</p>}
              </div>) : <p>Sin PR vinculado a una Issue etiquetada de {owner}. Esto NO significa que esté inactivo.</p>}
          </article>)}
        </div>
        <details>
          <summary>PRs sin propietario verificable · {team.unassigned.length}</summary>
          <p>Antes de hacer handoff: vincular una Issue, etiquetar owner:miguel u owner:samuel y documentar un “Next action”. No basta un nombre de rama.</p>
          <ul>{team.unassigned.slice(0,18).map(pr => <li key={pr.number}>
            <a href={pr.url}>#{pr.number} {pr.title}</a> · {pr.branch} · {pr.head_sha.slice(0,12)} · checks {pr.ci}
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
            <a href={pr.url}>PR #{pr.number} {pr.title}</a> · checks {pr.ci} · {pr.head_sha.slice(0,12)}
          </li>)}</ul>
          <p>Un PR validado no activa Higgsfield. Una referencia a una entrega tampoco instala archivos, imágenes, videos o sitios dentro de Avalon. Exigir evidencia visual en Preview aislada.</p>
        </details>
      </>}
    </section>
    <div className={s.workspaces}>{owners.map(owner => <section className={s.card} key={owner}><small>WORKSPACE</small><h2>{owner === 'miguel' ? 'Miguel' : 'Samuel'}</h2><p>La asignación proviene de las etiquetas de GitHub; no del autor de un commit.</p>{github?.issues.filter(i=>i.owner===owner && i.state!=='done').map(i => {const pr=github.pulls.find(p=>p.issues.includes(i.number));return <article className={s.task} key={i.id}><h3><a href={i.url}>#{i.number} · {i.title}</a></h3><p>{i.module} / {i.state}</p><p>Rama: {pr?.branch ?? 'UNKNOWN'}</p><p>Commit: {pr?.head_sha ?? 'UNKNOWN'}</p><p>PR: {pr ? <a href={pr.url}>#{pr.number} · CI {pr.ci}</a> : 'Sin PR vinculado'}</p><p>Siguiente paso reportado: {i.body.match(/^Next action:\s*(.+)$/mi)?.[1] ?? 'Debe registrarse en la Issue.'}</p><p>Último handoff: {i.handoff ? <a href={i.handoff.url}>{i.handoff.state} · {i.handoff.sha.slice(0,12)} · {i.handoff.at} (reportado)</a> : 'Sin handoff registrado'}</p>{pr && completeGithub && freshness(state.github).status==='VERIFIED' ? <a className={s.action} href={`/api/dev-bridge/resume?issue=${i.number}&as=${owner==='miguel'?'samuel':'miguel'}`}>Reanudar trabajo de {owner === 'miguel' ? 'Miguel' : 'Samuel'} ↓</a> : <p>Paquete bloqueado: faltan evidencias.</p>}</article>})}<p className={s.muted}>El paquete comprueba el SHA remoto. Descargarlo no acepta un handoff, no hace checkout y no modifica permisos.</p></section>)}</div>
    <section className={s.section}><h2>Integración compartida</h2><p>Conflictos, dependencias y checkpoints se revisan en las Issues canónicas.</p><ul>{github?.issues.filter(i=>i.labels.includes('type:integration')||i.labels.includes('type:handoff')).map(i=><li key={i.id}><a href={i.url}>#{i.number} {i.title}</a> · {i.state}</li>)}</ul><p>Próximo release: UNKNOWN hasta aprobación de los propietarios.</p></section>
    <section className={s.section}><h2>GitHub · actividad</h2><div className={s.scroll}><table><thead><tr><th>PR / rama</th><th>CI</th><th>Integración</th><th>Archivos</th></tr></thead><tbody>{github?.pulls.map(p=><tr key={p.number}><td><a href={p.url}>#{p.number} {p.title}</a><br/>{p.branch}</td><td>{p.ci}</td><td>{p.conflict===null?'UNKNOWN':p.conflict?'Conflicto confirmado':'Sin conflicto detectado'}<br/>{p.behind} commits detrás de base</td><td><details><summary>{publicOnly ? 'Sin verificar' : `${p.files.length} archivos`}</summary><ul>{p.files.map(f=><li key={f}>{f}</li>)}</ul></details></td></tr>)}</tbody></table></div><details><summary>Commits recientes</summary><ul>{github?.commits.slice(0,20).map(c=><li key={c.sha}><a href={c.url}>{c.sha.slice(0,12)}</a> · {c.date} · autor reportado: {c.author}</li>)}</ul></details></section>
    <section className={s.section}><h2>Vercel · despliegues</h2><p>Alias y promociones: UNKNOWN si el API no aporta evidencia. No se leen variables de entorno ni logs con datos privados.</p><div className={s.scroll}><table><thead><tr><th>Entorno</th><th>Build</th><th>Rama / commit</th><th>Vista</th></tr></thead><tbody>{state.vercel.data?.slice(0,20).map(d=><tr key={d.id}><td>{d.environment}</td><td>{d.state}</td><td>{d.branch}<br/>{d.sha.slice(0,12)}</td><td><a href={d.url} rel="noreferrer">Abrir despliegue ↗</a></td></tr>)}</tbody></table></div></section>
    <section className={s.section}><h2>Supabase · metadatos</h2><p>Referencia: {state.supabase.data?.ref ?? 'UNKNOWN'}</p><p>{state.supabase.data?.status ?? 'Conexión no disponible'}</p><p>Migraciones: {state.supabase.data?.migrations.join(', ') || 'UNKNOWN'}</p><ul>{state.supabase.data?.rls.map(r=><li key={r.table}>{r.table}: RLS {r.enabled?'habilitado':'DESHABILITADO'}</li>)}</ul><p>Funciones: {state.supabase.data?.functions.map(f=>`${f.name}: ${f.status}`).join(', ') || 'Sin evidencia de funciones'}</p><p>No se consultan clientes, usuarios de Auth ni secretos. Cambios de esquema detallados y errores de runtime: UNKNOWN.</p></section>
    <footer className={s.muted}>Memoria persistente: GitHub Issues, commits y docs/dev-bridge. La caché de esta vista se pierde al reiniciar; nunca sustituye el registro canónico.</footer>
  </div></Suite>;
}
