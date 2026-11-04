"use strict";
/**
 * Zero-new-service Avalon Office technical check.
 * Runs with the short-lived GITHUB_TOKEN provided by GitHub Actions in the
 * existing PUBLIC repository. Never reads CRM/customer records or pays an LLM.
 * Publishes aggregate evidence to one dedicated issue (#108).
 */
const REPO = "avaloncoreagency/Avalon-code";
const LEDGER_ISSUE = 108;
const MARKER = "<!-- AVALON_OFFICE_GITHUB_FREE_V1 -->";
const TITLE = "[OFICINA][GRATIS] Registro horario verificado de los cinco managers";
const CODES = Object.freeze(["ren", "shin", "haru", "sora", "kenji"]);

function issueDocument(report) {
  return MARKER + "\n```json\n" + JSON.stringify(report, null, 2) + "\n```\n\n" +
    "Generado automáticamente mediante GitHub Actions (repositorio público). " +
    "Solo contiene conteos de PR/CI y enlaces internos; nunca datos de clientes. " +
    "**Estas comprobaciones técnicas no son cinco agentes de IA programando.**";
}
function isReviewable(run) {
  return ["success", "failure", "cancelled", "timed_out", "action_required"].includes(run?.conclusion);
}
function label(items) {
  return Array.isArray(items) ? items.filter(x=>Number.isSafeInteger(x?.number)) : [];
}
function buildsReport({ pulls, runs, issues }, when, workflowRunId) {
  if (!Array.isArray(pulls) || !Array.isArray(runs) || !Array.isArray(issues))
    throw new Error("invalid_github_snapshot");
  if (!(when instanceof Date) || !Number.isFinite(when.valueOf())) throw new Error("invalid_timestamp");
  const active = label(pulls).filter(p => p.state === "open");
  const openIssues = label(issues).filter(i => i.state === "open" && !i.pull_request);
  const completedRuns = runs.filter(isReviewable);
  const failed = completedRuns.filter(r => ["failure", "timed_out"].includes(r.conclusion));
  const drafts = active.filter(p => p.draft).length;
  const subset = regex => active.filter(p => regex.test(String(p.title ?? "").slice(0,150)));
  const first = list => list.length ? list[0].number : null;
  const areas = {
    auth: subset(/auth|login|password|security|mfa|rls/i),
    crm: subset(/crm|pipeline|sales|ventas|cliente|task|office/i),
    radar: subset(/radar|hunter|geoapify|copilot|ai\b|ia\b/i),
  };
  const actionable = (prefix, refs) => refs.length
    ? prefix + " PR #" + first(refs) + " y su CI (sin editar otra rama)."
    : "Sin PR abierto detectado para esta área dentro de los primeros 100 PRs.";
  const results = {
    ren: { status:"completed", metrics:[
      { label:"PRs abiertos observados",count:active.length },
      { label:"PRs draft observados",count:drafts },
      { label:"Issues abiertos observados",count:openIssues.length }
    ], nextAction: active.length ? "Priorizar revisión del PR #" + first(active) + " y verificar responsables." :
      "No hay PRs abiertos en esta ventana; revisar el sprint #98." },
    shin: { status:"completed", metrics:[
      { label:"PRs auth/seguridad",count:areas.auth.length },
      { label:"CI recientes fallidos observados",count:failed.length }
    ], nextAction: actionable("Revisar seguridad del",areas.auth) },
    haru: { status:"completed", metrics:[
      { label:"PRs CRM/ventas",count:areas.crm.length },
      { label:"Issues abiertos observados",count:openIssues.length }
    ], nextAction: actionable("Validar flujo comercial en el",areas.crm) },
    sora: { status:"completed", metrics:[
      { label:"PRs Radar/IA",count:areas.radar.length },
      { label:"PRs draft Radar/IA",count:areas.radar.filter(p=>p.draft).length }
    ], nextAction: actionable("Revisar contratos e integración del",areas.radar) },
    kenji: { status:"completed", metrics:[
      { label:"Workflows recientes completados",count:completedRuns.length },
      { label:"Workflows recientes fallidos",count:failed.length }
    ], nextAction: failed.length ? "Investigar fallo del workflow " +
      String(failed[0].id) + " en GitHub Actions." :
      "Sin fallos en los workflows recientes consultados; continuar QA de #98." },
  };
  return {
    schema_version:1, source:"github_actions_public_repo", observed_at:when.toISOString(),
    run_id:String(workflowRunId ?? "").replace(/[^0-9]/g,"").slice(0,30)||"0",
    window:{pull_requests:Math.min(100,pulls.length),issues:Math.min(100,issues.length),workflow_runs:Math.min(60,runs.length)},
    managers:results,
    note:"Ejecución real de comprobaciones de GitHub, no ejecución autónoma de código ni actividad de IA.",
  };
}
async function githubApi(path, token, options = {}, fetcher = fetch) {
  if (typeof token !== "string" || token.length < 10) throw new Error("github_token_unavailable");
  if (!path.startsWith("/repos/" + REPO + "/") || path.includes("://"))
    throw new Error("disallowed_github_endpoint");
  const response = await fetcher("https://api.github.com" + path, {
    ...options, redirect:"error",
    headers:{
      "accept":"application/vnd.github+json",
      "authorization":"Bearer "+token,
      "x-github-api-version":"2022-11-28",
      ...(options.body ? {"content-type":"application/json"}:{}),
    }, signal:AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error("github_request_failed");
  return response.status === 204 ? null : response.json();
}
async function runFreeOffice({ token, now=new Date(), runId="manual", fetcher=fetch }) {
  const prefix="/repos/"+REPO;
  const [pulls,issues,runsResponse,record]=await Promise.all([
    githubApi(prefix+"/pulls?state=open&per_page=100",token,{},fetcher),
    githubApi(prefix+"/issues?state=open&per_page=100",token,{},fetcher),
    githubApi(prefix+"/actions/runs?per_page=60",token,{},fetcher),
    githubApi(prefix+"/issues/"+LEDGER_ISSUE,token,{},fetcher)
  ]);
  if (!record || record.number !== LEDGER_ISSUE || record.title !== TITLE ||
    typeof record.body !== "string" || !record.body.startsWith(MARKER))
    throw new Error("ledger_issue_mismatch");
  const report=buildsReport({pulls,issues,runs:runsResponse?.workflow_runs},now,runId);
  await githubApi(prefix+"/issues/"+LEDGER_ISSUE,token,{
    method:"PATCH",body:JSON.stringify({body:issueDocument(report)})
  },fetcher);
  return { ok:true, issue:LEDGER_ISSUE, run_id:report.run_id, checked_managers:CODES.length,
    pr_window:report.window.pull_requests };
}
if(require.main===module) {
  runFreeOffice({token:process.env.GITHUB_TOKEN,runId:process.env.GITHUB_RUN_ID}).then(result=>{
    // No credentials, user content or raw GitHub responses in logs.
    process.stdout.write(JSON.stringify(result)+"\n");
  }).catch(()=>{
    process.stderr.write("Avalon free manager check unavailable. Ledger was NOT marked completed.\n");
    process.exitCode=1;
  });
}
module.exports={REPO,LEDGER_ISSUE,MARKER,TITLE,CODES,issueDocument,buildsReport,githubApi,runFreeOffice};
