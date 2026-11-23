import Link from "next/link";
import type { Ledger } from "@/lib/dev-bridge/ledger-server";
import { TOOL_LABEL, duration, ownerStats, type Owner } from "@/lib/dev-bridge/ledger";
import s from "./bridge.module.css";

const NAME: Record<Owner, string> = { miguel: "Miguel", samuel: "Samuel" };
const OPEN: Record<string, string> = { active: "Trabajando ahora", paused: "En pausa", blocked: "Bloqueado" };

/** "hace 5 min" relative to the server render (the page refreshes itself every five minutes). */
function ago(iso: string, now: number) {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

/**
 * One compact line per owner from the Dev Bridge ledger: who is working right now, the last recorded activity and the
 * last 7 days of session time vs declared hours. Facts only, no score. Everything else lives in the detailed ledger.
 */
export function NowStrip({ ledger, from, to, now }: { ledger: Ledger; from: number; to: number; now: number }) {
  if (ledger.state !== "ready") return <section className={s.now} aria-label="Ahora mismo">
    <p className={s.muted}>Ahora mismo: {ledger.state === "schema_pending" ? "el registro de sesiones aún no está instalado." : "registro de sesiones no disponible."}</p>
  </section>;
  const connected = ledger.agents.some(a => a.token_prefix && !a.revoked_at && a.expires_at && Date.parse(a.expires_at) > now);
  return <section className={s.now} aria-label="Ahora mismo">
    <div className={s.nowHead}><h2>Ahora mismo</h2>
      {!connected && <p className={s.muted}>Ningún agente conectado todavía · <Link href="/admin/dev-bridge/ledger#agents">conectar</Link></p>}</div>
    <div className={s.nowGrid}>{(["miguel", "samuel"] as const).map(owner => {
      const open = ledger.sessions.filter(x => x.owner === owner && OPEN[x.status]);
      const last = ledger.events.find(e => e.owner === owner);
      const st = ownerStats(owner, ledger, from, to);
      return <article key={owner} className={s.nowCard} data-owner={owner}>
        <h3>{NAME[owner]} <span className={open.some(x => x.status === "active") ? s.live : s.idle}>{open.length ? OPEN[open[0].status] : "Sin sesión abierta"}</span></h3>
        {open.slice(0, 2).map(x => <p key={x.id}>{TOOL_LABEL[x.tool]?.[0] ?? x.tool} · {x.title}{x.issue_number ? ` · #${x.issue_number}` : ""} · desde {ago(x.started_at, now)}</p>)}
        <p className={s.muted}>Última actividad: {last ? `${last.title} · ${ago(last.occurred_at, now)}` : "sin registros"}</p>
        <p className={s.muted}>7 días: {duration(st.coveredSessionMs)} en sesiones · {duration(st.declaredMinutes * 60000)} declaradas</p>
      </article>;
    })}</div>
  </section>;
}
