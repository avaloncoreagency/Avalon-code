import { OWNER_NAMES } from "@/lib/identity/owners";
import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { LEDGER_ERRORS, loadLedger } from "@/lib/dev-bridge/ledger-server";
import { COMMITMENT_LABEL, EVIDENCE_LABEL, SESSION_LABEL, TOOL_LABEL, duration, effectiveEntries, ownerStats, period, sessionIntervals, totalMs, type Evidence, type Owner } from "@/lib/dev-bridge/ledger";
import { claimOwner, createCommitment, declareTime, importGithub, moveCommitment, recordHandoff, revokeAgentToken } from "./actions";
import { TokenIssuer } from "./token-issuer";
import b from "../bridge.module.css";
import s from "./ledger.module.css";

export const dynamic = "force-dynamic";
type Q = { period?: string; owner?: string; tool?: string; evidence?: string; ok?: string; error?: string; n?: string };
const OWNERS: Owner[] = ["miguel", "samuel"];
const NAME: Record<Owner, string> = OWNER_NAMES;
const PERIODS = ["today", "7d", "30d", "all"] as const;

export default async function DevBridgeLedger({ searchParams }: { searchParams: Promise<Q> }) {
  const { supabase, userId } = await requireOwner();
  const lang = await getLang(), q = await searchParams;
  const t = (es: string, en: string) => pick(lang, es, en);
  const L2 = (pair: readonly [string, string]) => pick(lang, pair[0], pair[1]);
  const p = period(PERIODS.includes(q.period as never) ? q.period! : "7d");
  const l = await loadLedger(supabase, userId, p.from, p.to);
  const ny = (iso: string) => new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  const href = (patch: Partial<Q>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ period: q.period, owner: q.owner, tool: q.tool, evidence: q.evidence, ...patch })) if (v) u.set(k, v); return `/admin/dev-bridge/ledger?${u}`; };
  const flash = q.error ? <p role="alert" className={s.error}>{L2(LEDGER_ERRORS[q.error] ?? (q.error === "github_unverified" ? ["GitHub no está verificado con acceso completo; no se importó nada.", "GitHub is not verified with full access; nothing was imported."] : LEDGER_ERRORS.unavailable))}</p>
    : q.ok ? <p role="status" className={s.ok}>{q.ok === "imported" ? t(`Importados ${q.n ?? 0} hechos nuevos de GitHub (los repetidos se ignoran).`, `Imported ${q.n ?? 0} new GitHub facts (duplicates ignored).`) : t("Guardado.", "Saved.")}</p> : null;

  const header = <header className={b.hero}>
    <small>AVALON / ENGINEERING / LEDGER</small>
    <h1>Dev Bridge <span>3.0</span></h1>
    <p>{t("Registro verificable de sesiones, contribuciones, horas declaradas y compromisos de Miguel Hobaica y Samuel Muñoz. Sin vigilancia oculta: solo se registra lo que cada agente o propietario envía.", "Verifiable record of sessions, contributions, declared hours and commitments for Miguel Hobaica and Samuel Muñoz. No hidden monitoring: only what each agent or owner sends is recorded.")}</p>
    <p><Link href="/admin/dev-bridge">{t("← Dev Bridge 2.0 (GitHub, Vercel, Supabase)", "← Dev Bridge 2.0 (GitHub, Vercel, Supabase)")}</Link></p>
    {flash}
  </header>;

  if (l.state !== "ready") return <Suite active="dev-bridge"><div className={b.bridge}>{header}
    <section className={b.section}><h2>{t("Registro no disponible", "Ledger unavailable")}</h2><p>{L2(LEDGER_ERRORS[l.state])}</p></section></div></Suite>;

  const stats = Object.fromEntries(OWNERS.map(o => [o, ownerStats(o, l, p.from, p.to)])) as Record<Owner, ReturnType<typeof ownerStats>>;
  const inRange = (iso: string) => { const x = Date.parse(iso); return x >= p.from && x < p.to; };
  const events = l.events.filter(e => inRange(e.occurred_at)
    && (!q.owner || (q.owner === "unknown" ? e.owner === null : e.owner === q.owner))
    && (!q.tool || e.tool === q.tool) && (!q.evidence || e.evidence === q.evidence));
  const claimed = new Set(l.people.map(x => x.owner));
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 86400000); return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d); });
  const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
  const entries = effectiveEntries(l.entries);

  return <Suite active="dev-bridge"><div className={b.bridge}>{header}

    {!l.me && <section className={b.section} aria-labelledby="who">
      <h2 id="who">{t("¿Quién eres en el registro?", "Who are you in the ledger?")}</h2>
      <p>{t("Cada propietario registra SU identidad una sola vez desde su propia cuenta. No se puede tomar la del otro.", "Each owner registers THEIR identity once, from their own account. Nobody can take the other's.")}</p>
      <div className={s.inline}>{OWNERS.filter(o => !claimed.has(o)).map(o => <form key={o} action={claimOwner}><input type="hidden" name="owner" value={o} /><button className={s.chip}>{t(`Soy ${NAME[o]}`, `I am ${NAME[o]}`)}</button></form>)}</div>
    </section>}

    <nav aria-label={t("Periodo", "Period")} className={s.filters}>
      {PERIODS.map(k => { const pp = period(k); return <Link key={k} className={s.chip} aria-current={(q.period ?? "7d") === k ? "page" : undefined} href={href({ period: k })}>{L2(pp.label)}</Link>; })}
      <a className={s.chip} href={`/api/dev-bridge/export?kind=events&period=${q.period ?? "7d"}`}>{t("CSV eventos", "Events CSV")}</a>
      <a className={s.chip} href={`/api/dev-bridge/export?kind=sessions&period=${q.period ?? "7d"}`}>{t("CSV sesiones", "Sessions CSV")}</a>
      <a className={s.chip} href={`/api/dev-bridge/export?kind=hours&period=${q.period ?? "7d"}`}>{t("CSV horas", "Hours CSV")}</a>
      <a className={s.chip} href={`/api/dev-bridge/export?kind=commitments&period=${q.period ?? "7d"}`}>{t("CSV compromisos", "Commitments CSV")}</a>
    </nav>

    <section className={b.section} aria-labelledby="compare">
      <h2 id="compare">{t("Miguel Hobaica y Samuel Muñoz", "Miguel Hobaica and Samuel Muñoz")} · {L2(p.label)}</h2>
      <p className={b.muted}>{t("Las cifras se miden por separado y no se combinan en una puntuación. Horas declaradas = lo que cada propietario registró. Tiempo de sesión = intervalos entre eventos de agentes autenticados (hora del servidor), sin contar dos veces sesiones simultáneas. Sin registros no significa inactividad. Ninguna métrica decide propiedad, compensación ni valor económico.", "Figures are measured separately and never combined into a score. Declared hours = what each owner recorded. Session time = intervals between authenticated agent events (server time), without double counting concurrent sessions. No records does not mean inactivity. No metric decides ownership, compensation or economic value.")}</p>
      <div className={s.grid}>{OWNERS.map(o => { const st = stats[o]; return <article className={b.card} key={o} aria-label={NAME[o]}>
        <small>{claimed.has(o) ? t("IDENTIDAD REGISTRADA", "IDENTITY REGISTERED") : t("IDENTIDAD SIN REGISTRAR", "IDENTITY NOT REGISTERED")}</small>
        <h3>{NAME[o]}</h3>
        <div className={s.stats}>
          <div className={s.stat}><small>{t("Horas declaradas", "Declared hours")}</small><strong>{duration(st.declaredMinutes * 60000)}</strong></div>
          <div className={s.stat}><small>{t("Tiempo cubierto por sesiones", "Time covered by sessions")}</small><strong>{duration(st.coveredSessionMs)}</strong></div>
          {(["claude_code", "codex"] as const).map(tool => <div className={s.stat} key={tool}><small>{L2(TOOL_LABEL[tool])} · {t("sesiones", "sessions")}</small><strong>{st.byTool[tool]?.sessions ?? 0} · {duration(st.byTool[tool]?.sessionMs ?? 0)}</strong></div>)}
          <div className={s.stat}><small>{t("Sesiones abiertas", "Open sessions")}</small><strong>{st.openSessions}</strong></div>
          <div className={s.stat}><small>{t("Compromisos verificados / total", "Verified / total commitments")}</small><strong>{st.commitments.verified ?? 0} / {Object.values(st.commitments).reduce((a, b) => a + b, 0)}</strong></div>
        </div>
        <p className={s.meta}>{t("Actividad registrada", "Recorded activity")}: {Object.entries(st.activity).map(([k, v]) => `${k} ${v}`).join(" · ") || t("sin registros", "no records")}</p>
        <p className={s.meta}>{t("Evidencia", "Evidence")}: {(Object.keys(st.evidence) as Evidence[]).map(k => `${L2(EVIDENCE_LABEL[k])} ${st.evidence[k]}`).join(" · ")}</p>
      </article>; })}</div>
      {l.truncated && <p className={s.error}>{t("Se muestran los 2.000 eventos más recientes; usa un periodo más corto o el CSV.", "Showing the latest 2,000 events; use a shorter period or the CSV.")}</p>}
    </section>

    <section className={b.section} aria-labelledby="timeline">
      <h2 id="timeline">{t("Timeline: quién → qué → cuándo → herramienta → resultado → evidencia", "Timeline: who → what → when → tool → result → evidence")}</h2>
      <form className={s.filters} method="get">
        <input type="hidden" name="period" value={q.period ?? "7d"} />
        <label>{t("Propietario", "Owner")}<select name="owner" defaultValue={q.owner ?? ""}><option value="">{t("Todos", "All")}</option><option value="miguel">{OWNER_NAMES.miguel}</option><option value="samuel">{OWNER_NAMES.samuel}</option><option value="unknown">{t("Sin atribuir", "Unattributed")}</option></select></label>
        <label>{t("Herramienta", "Tool")}<select name="tool" defaultValue={q.tool ?? ""}><option value="">{t("Todas", "All")}</option>{Object.keys(TOOL_LABEL).map(k => <option key={k} value={k}>{L2(TOOL_LABEL[k])}</option>)}</select></label>
        <label>{t("Evidencia", "Evidence")}<select name="evidence" defaultValue={q.evidence ?? ""}><option value="">{t("Toda", "All")}</option>{(Object.keys(EVIDENCE_LABEL) as Evidence[]).map(k => <option key={k} value={k}>{L2(EVIDENCE_LABEL[k])}</option>)}</select></label>
        <button type="submit">{t("Filtrar", "Filter")}</button>
      </form>
      {events.length === 0 ? <p>{t("Sin eventos en este periodo con estos filtros.", "No events in this period with these filters.")}</p> :
        <ol className={s.timeline}>{events.slice(0, 200).map(e => <li key={e.id} data-evidence={e.evidence}>
          <strong>{e.owner ? NAME[e.owner] : t("Sin atribuir", "Unattributed")}</strong> → {e.title === e.kind && SESSION_LABEL[e.kind] ? L2(SESSION_LABEL[e.kind]) : e.title}
          <div className={s.meta}><span className={s.badge}>{SESSION_LABEL[e.kind] ? L2(SESSION_LABEL[e.kind]) : e.kind}</span><span className={s.badge}>{e.tool ? L2(TOOL_LABEL[e.tool] ?? [e.tool, e.tool]) : "—"}</span><span className={s.badge}>{L2(EVIDENCE_LABEL[e.evidence])}</span>
            <time dateTime={e.occurred_at}>{ny(e.occurred_at)}</time>{e.issue_number ? ` · Issue #${e.issue_number}` : ""}{e.evidence_url ? <> · <a href={e.evidence_url} rel="noopener noreferrer" target="_blank">{t("evidencia", "evidence")} ↗</a></> : ""}</div>
        </li>)}</ol>}
      {events.length > 200 && <p className={b.muted}>{t(`${events.length - 200} eventos más en el CSV.`, `${events.length - 200} more events in the CSV.`)}</p>}
    </section>

    <section className={b.section} aria-labelledby="calendar">
      <h2 id="calendar">{t("Calendario · últimos 14 días (America/New_York)", "Calendar · last 14 days (America/New_York)")}</h2>
      <p className={b.muted}>{t("Un día vacío significa que no hay registros, no que no se trabajara.", "An empty day means there are no records, not that nobody worked.")}</p>
      <div className={s.cal}>{days.map(d => <div className={s.day} key={d}><strong>{d.slice(5)}</strong>{OWNERS.map(o => {
        const sess = l.sessions.filter(x => x.owner === o && dayOf(x.started_at) === d).length;
        const mins = entries.filter(x => x.owner === o && x.work_date === d).reduce((a, x) => a + x.minutes, 0);
        return sess || mins ? <div key={o}>{NAME[o]}: {sess ? `${sess} ses.` : ""}{sess && mins ? " · " : ""}{mins ? duration(mins * 60000) : ""}</div> : null;
      })}</div>)}</div>
    </section>

    <section className={b.section} aria-labelledby="sessions">
      <h2 id="sessions">{t("Sesiones de agentes", "Agent sessions")}</h2>
      {l.sessions.length === 0 ? <p>{t("Aún no hay sesiones. Conecta un agente abajo y usa `npm run bridge:session -- start`.", "No sessions yet. Connect an agent below and run `npm run bridge:session -- start`.")}</p> :
        <div className={b.scroll}><table><thead><tr><th>{t("Sesión", "Session")}</th><th>{t("Agente", "Agent")}</th><th>{t("Estado", "Status")}</th><th>{t("Tiempo medido", "Measured time")}</th><th>{t("Próximo paso", "Next action")}</th></tr></thead>
          <tbody>{l.sessions.slice(0, 50).map(x => { const r = sessionIntervals(l.events.filter(e => e.session_id === x.id)); return <tr key={x.id}>
            <td>{x.title}<br /><span className={s.meta}>{ny(x.started_at)}{x.issue_number ? ` · #${x.issue_number}` : ""}</span></td>
            <td>{NAME[x.owner]} · {L2(TOOL_LABEL[x.tool] ?? [x.tool, x.tool])}</td>
            <td>{x.status}{r.open ? <><br /><span className={s.meta}>{t("abierta: cuenta hasta el último evento", "open: counted up to last event")}</span></> : null}</td>
            <td>{duration(totalMs(r.intervals))}</td>
            <td>{x.next_action || "—"}</td></tr>; })}</tbody></table></div>}
    </section>

    <section className={b.section} aria-labelledby="commitments">
      <h2 id="commitments">{t("Compromisos", "Commitments")}</h2>
      <p className={b.muted}>{t("Un agente no puede verificar nada. «Verificado» lo marca el otro propietario con un enlace de evidencia.", "An agent cannot verify anything. «Verified» is set by the other owner with an evidence link.")}</p>
      {l.commitments.length === 0 ? <p>{t("Sin compromisos registrados.", "No commitments recorded.")}</p> : <ul className={s.timeline}>{l.commitments.map(c => <li key={c.id} data-evidence={c.status === "verified" ? "VERIFIED" : c.status === "blocked" ? "UNKNOWN" : "SELF_REPORTED"}>
        <strong>{NAME[c.owner]}</strong> → {c.title} <span className={s.badge}>{L2(COMMITMENT_LABEL[c.status] ?? [c.status, c.status])}</span>
        <div className={s.meta}>{t("Acordado", "Agreed")} {c.agreed_on} · {t("Objetivo", "Target")} {c.target_date}{c.evidence_url ? <> · <a href={c.evidence_url} rel="noopener noreferrer" target="_blank">{t("evidencia", "evidence")} ↗</a></> : null}</div>
        <div className={s.meta}>{t("Criterio", "Criteria")}: {c.acceptance_criteria}</div>
        {!["verified", "cancelled"].includes(c.status) && l.me && <details><summary>{t("Actualizar", "Update")}</summary>
          <form action={moveCommitment} className={s.form}>
            <input type="hidden" name="id" value={c.id} /><input type="hidden" name="version" value={c.version} />
            <div className={s.row}>
              <label>{t("Nuevo estado", "New status")}<select name="to" required>{["in_progress", "blocked", "ready_for_review", "completed", "verified", "in_progress_reopen", "reschedule", "cancelled"].map(k => <option key={k} value={k}>{k === "reschedule" ? t("Nueva fecha acordada", "New agreed date") : k === "in_progress_reopen" ? t("Reabrir", "Reopen") : L2(COMMITMENT_LABEL[k])}</option>)}</select></label>
              <label>{t("Nueva fecha (solo reprogramar)", "New date (reschedule only)")}<input type="date" name="new_target" /></label>
              <label>{t("Enlace de evidencia", "Evidence link")}<input name="evidence_url" type="url" placeholder="https://" /></label>
            </div>
            <label>{t("Nota o motivo", "Note or reason")}<input name="note" maxLength={1000} /></label>
            <button type="submit">{t("Guardar", "Save")}</button>
          </form></details>}
      </li>)}</ul>}
      {l.me && <details><summary>{t("Registrar compromiso", "Record commitment")}</summary><form action={createCommitment} className={s.form}>
        <div className={s.row}>
          <label>{t("Responsable", "Responsible")}<select name="owner" defaultValue={l.me}>{OWNERS.map(o => <option key={o} value={o}>{NAME[o]}</option>)}</select></label>
          <label>{t("Acordado el", "Agreed on")}<input type="date" name="agreed_on" required /></label>
          <label>{t("Fecha objetivo", "Target date")}<input type="date" name="target_date" required /></label>
          <label>Issue #<input name="issue" inputMode="numeric" /></label>
        </div>
        <label>{t("Tarea", "Task")}<input name="title" required minLength={3} maxLength={200} /></label>
        <label>{t("Criterio de aceptación", "Acceptance criteria")}<textarea name="criteria" required minLength={5} maxLength={2000} /></label>
        <label>{t("Dependencias", "Dependencies")}<input name="dependencies" maxLength={1000} /></label>
        <button type="submit">{t("Registrar", "Record")}</button>
      </form></details>}
    </section>

    {l.me && <section className={b.section} aria-labelledby="record">
      <h2 id="record">{t(`Registrar trabajo de ${NAME[l.me]}`, `Record ${NAME[l.me]}'s work`)}</h2>
      <p className={b.muted}>{t("Solo puedes registrar tu propio trabajo. Las horas declaradas se marcan como «Declarado»; una corrección crea un registro nuevo y conserva el original.", "You can only record your own work. Declared hours are marked «Self-reported»; a correction creates a new record and keeps the original.")}</p>
      <div className={s.grid}>
        <form action={declareTime} className={s.form} aria-label={t("Declarar horas", "Declare hours")}>
          <h3>{t("Declarar horas", "Declare hours")}</h3>
          <div className={s.row}>
            <label>{t("Fecha", "Date")}<input type="date" name="work_date" required /></label>
            <label>{t("Horas", "Hours")}<input name="hours" type="number" min={0} max={24} step="1" inputMode="numeric" /></label>
            <label>{t("Minutos", "Minutes")}<input name="minutes" type="number" min={0} max={59} inputMode="numeric" /></label>
          </div>
          <label>{t("Qué hiciste", "What you did")}<input name="description" required minLength={3} maxLength={1000} /></label>
          <div className={s.row}>
            <label>Issue #<input name="issue" inputMode="numeric" /></label>
            <label>{t("Evidencia (opcional)", "Evidence (optional)")}<input name="evidence_url" type="url" placeholder="https://" /></label>
          </div>
          <details><summary>{t("Corregir un registro anterior", "Correct an earlier entry")}</summary>
            <label>{t("Registro a corregir", "Entry to correct")}<select name="supersedes" defaultValue=""><option value="">—</option>{entries.filter(e => e.owner === l.me).slice(0, 30).map(e => <option key={e.id} value={e.id}>{e.work_date} · {duration(e.minutes * 60000)} · {e.description.slice(0, 40)}</option>)}</select></label>
            <label>{t("Motivo de la corrección", "Correction reason")}<input name="reason" maxLength={500} /></label>
          </details>
          <button type="submit">{t("Guardar horas", "Save hours")}</button>
        </form>
        <form action={recordHandoff} className={s.form} aria-label={t("Importar handoff de ChatGPT", "Import ChatGPT handoff")}>
          <h3>{t("Handoff de ChatGPT o trabajo manual", "ChatGPT handoff or manual work")}</h3>
          <p className={s.meta}>{t("Pega el handoff estándar (Propietario, Departamento, Fecha, Tarea, Decisiones, Trabajo realizado, Documentos, Evidencia, Estado, Próximo paso). Avalon no lee chats privados: solo lo que pegas aquí.", "Paste the standard handoff (Owner, Department, Date, Task, Decisions, Work done, Documents, Evidence, Status, Next step). Avalon does not read private chats: only what you paste here.")}</p>
          <div className={s.row}>
            <label>{t("Origen", "Source")}<select name="source"><option value="chatgpt_import">ChatGPT</option><option value="manual">{t("Manual", "Manual")}</option></select></label>
            <label>{t("Tipo", "Type")}<select name="kind"><option value="handoff">{t("Trabajo / handoff", "Work / handoff")}</option><option value="decision">{t("Decisión o propuesta", "Decision or proposal")}</option></select></label>
            <label>{t("Departamento", "Department")}<input name="department" maxLength={60} /></label>
          </div>
          <label>{t("Título (si no, se usa «Tarea»)", "Title (otherwise «Task» is used)")}<input name="title" maxLength={300} /></label>
          <label>{t("Texto del handoff", "Handoff text")}<textarea name="handoff" maxLength={8000} /></label>
          <label>{t("Enlace de evidencia (doc, Issue, PR)", "Evidence link (doc, Issue, PR)")}<input name="evidence_url" type="url" placeholder="https://" /></label>
          <button type="submit">{t("Registrar", "Record")}</button>
        </form>
      </div>
      <form action={importGithub} className={s.inline}><button type="submit">{t("Importar actividad verificable de GitHub", "Import verifiable GitHub activity")}</button>
        <span className={s.meta}>{t("Commits y PRs del snapshot autenticado, con su fecha original. Sin etiqueta owner: inequívoca → «Desconocido».", "Commits and PRs from the authenticated snapshot, with original dates. Without an unambiguous owner: label → «Unknown».")}</span></form>
    </section>}

    <section className={b.section} aria-labelledby="agents">
      <h2 id="agents">{t("Conexiones de agentes", "Agent connections")}</h2>
      <p className={b.muted}>{t("Cada agente tiene su propio token. Solo su propietario lo emite o revoca: Miguel no puede activar los agentes de Samuel ni al revés.", "Each agent has its own token. Only its owner issues or revokes it: Miguel cannot activate Samuel's agents, nor the reverse.")}</p>
      {/* Cards, not a table: the action column must stay reachable at 320–390 px without inner scrolling. */}
      <ul className={s.agents}>{l.agents.map(a => { const active = a.token_prefix && !a.revoked_at && a.expires_at && Date.parse(a.expires_at) > Date.now(); return <li key={a.id} data-agent={a.id}>
        <div><code>{a.id}</code> <span className={s.meta}>{NAME[a.owner]} · {L2(TOOL_LABEL[a.tool])}</span></div>
        <div className={s.meta}>{active ? `${t("Conectado", "Connected")} · ${a.token_prefix}… · ${t("vence", "expires")} ${ny(a.expires_at!)}` : a.revoked_at ? t("Revocado", "Revoked") : t("Sin conectar", "Not connected")}
          {" · "}{t("Último uso", "Last used")}: {a.last_used_at ? ny(a.last_used_at) : "—"}</div>
        {l.me === a.owner ? <><TokenIssuer agent={a.id} lang={lang} label={active ? t("Rotar token", "Rotate token") : t("Emitir token", "Issue token")} />
          {active && <form action={revokeAgentToken}><input type="hidden" name="agent" value={a.id} /><button className={s.chip}>{t("Revocar", "Revoke")}</button></form>}</> : <span className={s.meta}>{t(`Lo gestiona ${NAME[a.owner]}`, `Managed by ${NAME[a.owner]}`)}</span>}
      </li>; })}</ul>
      <details><summary>{t("Cómo inicia y cierra sesión un agente", "How an agent starts and stops a session")}</summary>
        <ol>
          <li>{t("El propietario emite el token del agente aquí y lo guarda como secreto del entorno de ese agente:", "The owner issues the agent token here and stores it as a secret in that agent's environment:")} <code>AVALON_BRIDGE_AGENT_TOKEN=avd_…</code></li>
          <li><code>npm run bridge:session -- start --title &quot;…&quot; --issue 303</code></li>
          <li><code>npm run bridge:session -- pause</code> / <code>resume</code> / <code>checkpoint</code> / <code>blocked --note &quot;…&quot;</code></li>
          <li><code>npm run bridge:session -- event --kind test --title &quot;npm test 800/0&quot; --url https://…</code></li>
          <li><code>npm run bridge:session -- stop --summary &quot;…&quot; --next &quot;…&quot;</code></li>
        </ol>
        <p>{t("Sin conexión, los eventos quedan en .dev-bridge/outbox.jsonl y se reenvían sin duplicarse. El tiempo de sesión usa la hora del servidor.", "Offline, events stay in .dev-bridge/outbox.jsonl and are resent without duplicates. Session time uses server time.")}</p>
      </details>
    </section>
  </div></Suite>;
}
