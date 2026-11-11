import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { reviewCodeDelivery } from "../actions";
import s from "@/components/library/library.module.css";

export const dynamic = "force-dynamic";

type Delivery = {
  id: string; delivery_key: string; author: string; module: string; delivery_commit: string; status: string; package_bytes: number;
  report: { verdict?: string; sensitive_paths?: string[]; conflicts?: string[]; warnings?: string[]; changed_files?: number; integration?: string };
  approved_by: string | null; review_note: string | null; integrated_commit: string | null; created_at: string;
};
type Mainline = { seq: number; commit: string; tests: { passed?: number; failed?: number; command?: string }; deliveries: string[]; preview_url: string | null; created_at: string };

/** Code Exchange: what agents delivered, what the integrator verified, what waits for the owner, and the verified mainline. */
export default async function CodeExchange({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const l = lang === "es" ? "es-ES" : "en-US";
  const [deliveries, mainline] = await Promise.all([
    supabase.from("os_code_deliveries").select("id,delivery_key,author,module,delivery_commit,status,package_bytes,report,approved_by,review_note,integrated_commit,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("os_code_mainline").select("seq,commit,tests,deliveries,preview_url,created_at").order("seq", { ascending: false }).limit(30),
  ]);
  const rows = (deliveries.data ?? []) as Delivery[];
  const waiting = rows.filter(d => d.status === "ready_for_review");
  const head = ((mainline.data ?? []) as Mainline[])[0];
  const state = (st: string) => ({ submitted: "received", verifying: "validating", ready_for_review: "queued", approved: "ready", integrated: "registered", rejected: "rejected", failed: "failed" } as Record<string, string>)[st] ?? st;
  const label = (st: string) => ({
    submitted: pick(lang, "Recibida", "Received"), verifying: pick(lang, "Verificando", "Verifying"), ready_for_review: pick(lang, "Espera tu aprobación", "Awaiting your approval"),
    approved: pick(lang, "Aprobada", "Approved"), integrated: pick(lang, "Integrada", "Integrated"), rejected: pick(lang, "Rechazada", "Rejected"), failed: pick(lang, "Falló al integrar", "Integration failed"),
  } as Record<string, string>)[st] ?? st;

  return (
    <Suite active="library">
      <PageHeader eyebrow="Avalon Code Exchange" title={pick(lang, "Código sin GitHub", "Code without GitHub")}
        crumbs={[{ href: "/admin/workspace/library", label: pick(lang, "Biblioteca", "Library") }]}
        description={pick(lang, "Codex, Claude y los agentes entregan paquetes verificables; el integrador los verifica, integra y publica la versión verificada. Los cambios sensibles esperan tu aprobación.", "Codex, Claude and agents deliver verifiable packages; the integrator verifies, integrates and publishes the verified mainline. Sensitive changes wait for your approval.")}
        actions={<Link className={s.ghost} href="/admin/workspace/library/tokens">{pick(lang, "Tokens", "Tokens")}</Link>} />
      <Flash lang={lang} ok={param(sp, "ok")} error={param(sp, "error")} />
      <div className={s.wrap}>
        <section className={s.panel} aria-labelledby="ml">
          <h2 id="ml">{pick(lang, "Versión verificada (mainline)", "Verified mainline")}</h2>
          {mainline.error ? <p className={s.muted}>{pick(lang, "El Code Exchange no está instalado en esta base.", "Code Exchange is not installed in this database.")}</p>
            : !head ? <p className={s.muted}>{pick(lang, "Aún no hay versión publicada.", "Nothing published yet.")}</p>
            : <div className={s.badges}>
                <span className={s.badge} data-state="ready">#{head.seq} · <span className={s.mono}>{head.commit.slice(0, 12)}</span></span>
                <span className={s.badge} data-state="registered">{pick(lang, "Pruebas", "Tests")}: {head.tests?.passed ?? "?"} ✓ / {head.tests?.failed ?? "?"} ✗</span>
                <span className={s.badge}>{new Date(head.created_at).toLocaleString(l)}</span>
                {head.preview_url && <a className={s.badge} href={head.preview_url} target="_blank" rel="noopener noreferrer">Preview</a>}
              </div>}
        </section>

        <section className={s.panel} aria-labelledby="wait">
          <h2 id="wait">{pick(lang, "Esperan tu aprobación", "Awaiting your approval")} ({waiting.length})</h2>
          {!waiting.length ? <p className={s.muted}>{pick(lang, "Nada pendiente. Las entregas sin rutas sensibles las aprueba el integrador.", "Nothing pending. Deliveries without sensitive paths are approved by the integrator.")}</p>
            : waiting.map(d => (
              <article key={d.id} className={s.panel} data-testid="awaiting-delivery">
                <h3 className={s.mono}>{d.delivery_key}</h3>
                <p className={s.muted}>{d.author} · {d.module} · {d.report.changed_files ?? "?"} {pick(lang, "archivos", "files")} · {pick(lang, "verificación", "verification")}: {d.report.verdict ?? "—"}</p>
                {!!d.report.sensitive_paths?.length && <p>{pick(lang, "Rutas sensibles", "Sensitive paths")}: <span className={s.mono}>{d.report.sensitive_paths.join(", ")}</span></p>}
                {!!d.report.warnings?.length && <ul className={s.muted}>{d.report.warnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}</ul>}
                <form action={reviewCodeDelivery} className={s.form}>
                  <input type="hidden" name="delivery_id" value={d.id} />
                  <label className={s.muted}>{pick(lang, "Nota (opcional)", "Note (optional)")}<input name="note" maxLength={2000} /></label>
                  <div className={s.inline}>
                    <button className={s.primary} name="decision" value="approved">{pick(lang, "Aprobar", "Approve")}</button>
                    <button className={s.danger} name="decision" value="rejected">{pick(lang, "Rechazar", "Reject")}</button>
                  </div>
                </form>
              </article>))}
        </section>

        <section className={s.panel} aria-labelledby="all">
          <h2 id="all">{pick(lang, "Entregas", "Deliveries")}</h2>
          <div className={s.scroll}><table className={s.table}>
            <thead><tr><th>{pick(lang, "Entrega", "Delivery")}</th><th>{pick(lang, "Autor", "Author")}</th><th>{pick(lang, "Estado", "Status")}</th><th>Commit</th><th>{pick(lang, "Fecha", "Date")}</th></tr></thead>
            <tbody>{rows.map(d => <tr key={d.id}>
              <td className={s.mono}>{d.delivery_key}</td><td>{d.author}</td>
              <td><span className={s.badge} data-state={state(d.status)}>{label(d.status)}</span>{d.report.conflicts?.length ? <span className={s.muted}> · {pick(lang, "conflictos", "conflicts")}: {d.report.conflicts.join(", ")}</span> : null}</td>
              <td><code>{(d.integrated_commit ?? d.delivery_commit).slice(0, 12)}</code></td><td>{new Date(d.created_at).toLocaleString(l)}</td></tr>)}</tbody>
          </table></div>
        </section>
      </div>
    </Suite>
  );
}
