import { Suite } from "@/components/suite/suite";
import { PageHeader, Panel, Badge } from "@/components/os/ui";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getAppOrigin } from "@/lib/auth/policy";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { countRows, run, type AuditRow } from "@/lib/os/data";
import { checkLiveHeaders, deploymentInfo } from "@/lib/security/checks";
import { FINDINGS, REVIEWED_AT, SEVERITY_ORDER, type FindingStatus, type Severity } from "@/lib/security/findings";
import { authLimiter } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/avaloncoreagency/Avalon-code";
const DOC = (file: string) => `${REPO}/blob/main/docs/security/${file}`;

const SEVERITY: Record<Severity, [string, string, "danger" | "warn" | "info" | "neutral"]> = {
  critical: ["Crítico", "Critical", "danger"], high: ["Alto", "High", "danger"], medium: ["Medio", "Medium", "warn"],
  low: ["Bajo", "Low", "info"], info: ["Informativo", "Info", "neutral"],
};
const STATUS: Record<FindingStatus, [string, string, "ok" | "info" | "warn" | "danger" | "neutral"]> = {
  verified: ["Verificado", "Verified", "ok"], implemented: ["Implementado · pendiente de validar", "Implemented · pending validation", "info"],
  open: ["Pendiente", "Open", "warn"], blocked: ["Bloqueado · requiere acción", "Blocked · needs action", "danger"], accepted: ["Riesgo aceptado", "Accepted risk", "neutral"],
};
const yesNo = (lang: Lang, ok: boolean | null, labels?: [string, string, string, string]) =>
  ok === null ? <Badge tone="neutral">{pick(lang, "No verificado", "Not verified")}</Badge>
    : ok ? <Badge tone="ok">{labels ? pick(lang, labels[0], labels[1]) : pick(lang, "Correcto", "OK")}</Badge>
      : <Badge tone="warn">{labels ? pick(lang, labels[2], labels[3]) : pick(lang, "Revisar", "Review")}</Badge>;

export default async function SecurityPage() {
  const { supabase, user } = await requireOwner();
  const lang = await getLang();
  let origin: string | null = null;
  try { origin = getAppOrigin(); } catch { origin = null; }
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [headers, factors, aal, modulesDb, audit7d, deletes7d, recentDeletes] = await Promise.all([
    checkLiveHeaders(origin),
    supabase.auth.mfa.listFactors().catch(() => null),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => null),
    countRows(supabase, "os_projects"),
    countRows(supabase, "os_audit", [["gte", "created_at", since]]),
    countRows(supabase, "os_audit", [["gte", "created_at", since], ["eq", "operation", "DELETE"]]),
    run<AuditRow[]>(supabase.from("os_audit").select("id,table_name,record_id,project_id,operation,actor_id,summary,created_at").eq("operation", "DELETE").order("created_at", { ascending: false }).limit(8)),
  ]);
  const deploy = deploymentInfo();
  const mfaOn = factors?.data ? factors.data.totp.some(f => f.status === "verified") : null;
  const flowSecret = (process.env.AUTH_FLOW_SECRET ?? "").length >= 32;
  const open = FINDINGS.filter(f => f.status !== "verified" && f.status !== "accepted");
  const bySeverity = SEVERITY_ORDER.map(sev => [sev, open.filter(f => f.severity === sev).length] as const);
  const sorted = [...FINDINGS].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return (
    <Suite active="security">
      <PageHeader eyebrow="Avalon Security Command Center" title={pick(lang, "Seguridad", "Security")}
        description={pick(lang, "Solo datos reales. Lo que la aplicación no puede comprobar por sí misma aparece como «No verificado».", "Real data only. Anything the app cannot check by itself is shown as “Not verified”.")} />

      <Panel title={pick(lang, "Resumen", "Summary")} id="summary">
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>{pick(lang, "Indicador", "Indicator")}</th><th>{pick(lang, "Estado", "Status")}</th><th>{pick(lang, "Fuente", "Source")}</th></tr></thead>
            <tbody>
              <tr><td>{pick(lang, "Hallazgos abiertos por severidad", "Open findings by severity")}</td>
                <td>{bySeverity.map(([sev, n]) => <span key={sev} style={{ marginRight: 6 }}><Badge tone={n ? SEVERITY[sev][2] : "neutral"}>{pick(lang, SEVERITY[sev][0], SEVERITY[sev][1])}: {n}</Badge></span>)}</td>
                <td className={s.meta}>{pick(lang, `Registro revisado el ${REVIEWED_AT}`, `Register reviewed ${REVIEWED_AT}`)}</td></tr>
              <tr><td>{pick(lang, "Cabeceras de seguridad en producción", "Security headers in production")}</td>
                <td>{headers.status === "checked" ? <Badge tone={headers.missing.length ? "warn" : "ok"}>{headers.present.length}/{headers.present.length + headers.missing.length}</Badge> : <Badge tone="neutral">{headers.status === "not_configured" ? pick(lang, "No configurado", "Not configured") : pick(lang, "No verificado", "Not verified")}</Badge>}</td>
                <td className={s.meta}>{pick(lang, "Comprobación en vivo", "Live check")}</td></tr>
              <tr><td>{pick(lang, "Tu verificación en dos pasos", "Your two-step verification")}</td><td>{yesNo(lang, mfaOn, ["Activada", "Enabled", "Desactivada", "Disabled"])}</td><td className={s.meta}>Supabase Auth</td></tr>
              <tr><td>{pick(lang, "Eventos auditados (7 días)", "Audited events (7 days)")}</td>
                <td>{audit7d.error ? <Badge tone="neutral">{pick(lang, "No disponible", "Unavailable")}</Badge> : <>{audit7d.count} · {pick(lang, "eliminaciones", "deletions")}: {deletes7d.count ?? "—"}</>}</td>
                <td className={s.meta}>public.os_audit</td></tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className={s.split}>
        <Panel title={pick(lang, "Verificaciones en vivo", "Live checks")} id="live">
          <div className={s.tableWrap}>
            <table className={s.table}>
              <tbody>
                {headers.status === "checked" ? <>
                  {headers.present.map(h => <tr key={h}><td><code>{h}</code></td><td><Badge tone="ok">{pick(lang, "Presente", "Present")}</Badge></td></tr>)}
                  {headers.missing.map(h => <tr key={h}><td><code>{h}</code></td><td><Badge tone="warn">{pick(lang, "Ausente", "Missing")}</Badge></td></tr>)}
                </> : <tr><td>{pick(lang, "Cabeceras HTTP", "HTTP headers")}</td><td><Badge tone="neutral">{pick(lang, "No verificado", "Not verified")}</Badge></td></tr>}
                <tr><td>{pick(lang, "Origen de la app (APP_ORIGIN)", "App origin (APP_ORIGIN)")}</td><td>{origin ? <Badge tone="ok">{origin}</Badge> : <Badge tone="warn">{pick(lang, "No configurado", "Not configured")}</Badge>}</td></tr>
                <tr><td>{pick(lang, "Firma de enlaces de email (AUTH_FLOW_SECRET)", "Email link signing (AUTH_FLOW_SECRET)")}</td><td>{yesNo(lang, flowSecret, ["Configurada", "Configured", "Falta", "Missing"])}</td></tr>
                <tr><td>{pick(lang, "Base de datos de módulos (RLS)", "Module database (RLS)")}</td><td>{yesNo(lang, modulesDb.error === null, ["Accesible", "Reachable", "Revisar", "Review"])}</td></tr>
                <tr><td>{pick(lang, "Despliegue", "Deployment")}</td><td className={s.meta}>{deploy.environment ? `${deploy.environment} · ${deploy.branch ?? "—"} · ${deploy.commit ?? "—"}` : pick(lang, "No disponible", "Unavailable")}</td></tr>
                <tr><td>{pick(lang, "Límite de intentos (esta instancia)", "Rate limiter (this instance)")}</td><td className={s.meta}>{pick(lang, `${authLimiter.size()} claves activas`, `${authLimiter.size()} active keys`)}</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title={pick(lang, "Tu cuenta", "Your account")} id="account">
          <div className={s.tableWrap}>
            <table className={s.table}>
              <tbody>
                <tr><td>{pick(lang, "Nivel de autenticación de la sesión", "Session assurance level")}</td><td>{aal?.data ? <Badge tone={aal.data.currentLevel === "aal2" ? "ok" : "info"}>{aal.data.currentLevel?.toUpperCase() ?? "—"}</Badge> : <Badge tone="neutral">{pick(lang, "No verificado", "Not verified")}</Badge>}</td></tr>
                <tr><td>MFA (TOTP)</td><td>{yesNo(lang, mfaOn, ["Activada", "Enabled", "Desactivada", "Disabled"])} {mfaOn === false && <a href="/admin/profile#mfa">{pick(lang, "Activar", "Enable")}</a>}</td></tr>
                <tr><td>{pick(lang, "Último acceso", "Last sign-in")}</td><td>{formatDate(lang, user.last_sign_in_at, true)}</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title={pick(lang, "Servicios externos", "External services")} id="external">
        <p className={s.meta}>{pick(lang, "La app no tiene credenciales para leer estos servicios; se verifican en su panel. Nunca se muestran métricas inventadas.", "The app has no credentials to read these services; check them in their dashboards. Metrics are never invented.")}</p>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>{pick(lang, "Control", "Control")}</th><th>{pick(lang, "Estado", "Status")}</th><th>{pick(lang, "Dónde verificar", "Where to check")}</th></tr></thead>
            <tbody>
              <tr><td>{pick(lang, "CI de seguridad (audit, CodeQL, secretos)", "Security CI (audit, CodeQL, secrets)")}</td><td><Badge tone="neutral">{pick(lang, "No verificado", "Not verified")}</Badge></td><td><a href={`${REPO}/actions`} target="_blank" rel="noopener noreferrer">GitHub Actions</a></td></tr>
              <tr><td>{pick(lang, "Alertas de dependencias", "Dependency alerts")}</td><td><Badge tone="neutral">{pick(lang, "No verificado", "Not verified")}</Badge></td><td><a href={`${REPO}/security`} target="_blank" rel="noopener noreferrer">GitHub Security</a></td></tr>
              <tr><td>{pick(lang, "Protección de la rama main", "main branch protection")}</td><td><Badge tone="danger">{pick(lang, "No configurado (R-02)", "Not configured (R-02)")}</Badge></td><td><a href={`${REPO}/settings/rules`} target="_blank" rel="noopener noreferrer">GitHub Rules</a></td></tr>
              <tr><td>{pick(lang, "Backups y restauración", "Backups and restore")}</td><td><Badge tone="neutral">{pick(lang, "No verificado", "Not verified")}</Badge></td><td><a href={DOC("RESPALDOS_Y_RECUPERACION.md")} target="_blank" rel="noopener noreferrer">{pick(lang, "Plan de recuperación", "Recovery plan")}</a></td></tr>
              <tr><td>{pick(lang, "Asesor de seguridad de Supabase", "Supabase security advisor")}</td><td><Badge tone="neutral">{pick(lang, "No verificado", "Not verified")}</Badge></td><td className={s.meta}>Supabase → Advisors</td></tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={pick(lang, "Eliminaciones recientes", "Recent deletions")} id="deletions">
        {recentDeletes.error ? <p className={s.meta}>{pick(lang, "No disponible.", "Unavailable.")}</p> : (recentDeletes.data ?? []).length === 0 ? <p className={s.meta}>{pick(lang, "Sin eliminaciones registradas.", "No deletions recorded.")}</p> : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>{pick(lang, "Fecha", "Date")}</th><th>{pick(lang, "Tabla", "Table")}</th><th>{pick(lang, "Elemento", "Item")}</th><th>{pick(lang, "Autor", "Actor")}</th></tr></thead>
              <tbody>{(recentDeletes.data ?? []).map(r => <tr key={r.id}><td className={s.meta}>{formatDate(lang, r.created_at, true)}</td><td><code>{r.table_name}</code></td><td>{r.summary || "—"}</td><td className={s.meta}>{r.actor_id === user.id ? pick(lang, "Tú", "You") : r.actor_id ? r.actor_id.slice(0, 8) : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={pick(lang, "Registro de hallazgos", "Findings register")} id="findings">
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>ID</th><th>{pick(lang, "Severidad", "Severity")}</th><th>{pick(lang, "Hallazgo", "Finding")}</th><th>{pick(lang, "Estado", "Status")}</th></tr></thead>
            <tbody>
              {sorted.map(f => (
                <tr key={f.id}>
                  <td><code>{f.id}</code></td>
                  <td><Badge tone={SEVERITY[f.severity][2]}>{pick(lang, SEVERITY[f.severity][0], SEVERITY[f.severity][1])}</Badge></td>
                  <td><strong>{pick(lang, f.title[0], f.title[1])}</strong><div className={s.meta}>{pick(lang, f.fix[0], f.fix[1])}</div><div className={s.meta}><code>{f.location}</code></div></td>
                  <td><Badge tone={STATUS[f.status][2]}>{pick(lang, STATUS[f.status][0], STATUS[f.status][1])}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={pick(lang, "Respuesta a incidentes", "Incident response")} id="incident">
        <ol className={s.meta} style={{ paddingLeft: 18 }}>
          {[["Detectar", "Detect"], ["Clasificar", "Classify"], ["Contener", "Contain"], ["Investigar", "Investigate"], ["Corregir", "Fix"], ["Recuperar", "Recover"], ["Documentar", "Document"]].map(([es, en]) => <li key={en}>{pick(lang, es, en)}</li>)}
        </ol>
        <div className={s.actions}>
          <a className={s.btn} href={DOC("RESPUESTA_A_INCIDENTES.md")} target="_blank" rel="noopener noreferrer">{pick(lang, "Procedimiento completo", "Full procedure")}</a>
          <a className={s.btn} href={DOC("AUDITORIA.md")} target="_blank" rel="noopener noreferrer">{pick(lang, "Auditoría y matriz de controles", "Audit and control matrix")}</a>
        </div>
      </Panel>
    </Suite>
  );
}
