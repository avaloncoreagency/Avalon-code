"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ACTIVITY_API, LEDGER, MANAGER_KEYS, MANAGER_ROLES, ORDERS_API, WORKFLOW_API,
  activityLabel, parseLedgerComments, readActivity, readPublicOrders,
  safeDate, stageLabel, type ActivityFeed, type LedgerEntry, type ManagerKey, type PublicOrder,

} from "@/lib/office/manager-operations-ui";
import s from "./manager-operations.module.css";

const labels = {
  es: { title:"Centro operativo de managers", eyebrow:"AVALON OS / CONTROL DE TRABAJO",
    description:"Actividad real de REN, SHIN, HARU, SORA y KENJI. Una comprobación terminada no significa que un cambio esté implementado o aprobado.",
    activity:"Motor interno", latest:"Última ejecución registrada", inProgress:"Tarea en curso", queued:"Tarea en cola",
    started:"Inicio", finished:"Finalización", result:"Resultado registrado", evidence:"Evidencias", error:"Error o bloqueo",
    noActivity:"Sin actividad verificada", noTask:"Ninguna tarea de ejecución registrada",
    update:"Actualizar datos", updating:"Consultando…", engineOffline:"Motor de ejecución no disponible: pendiente de integración.",
    kill:"Interruptor de emergencia activado: no deben comenzar nuevas ejecuciones.",
    manual:"Comprobación determinista del CRM", noProvider:"Proveedor de IA: no informado por este endpoint",
    history:"Historial GitHub Actions", historyDesc:"Informes publicados por el workflow en el Issue #134; no representan presencia en línea ni cambios de código por sí solos.",
    loadHistory:"Consultar historial real", noHistory:"Sin actividad verificada en el registro consultado.",
    loading:"Consultando historial…", failedHistory:"No se pudo consultar GitHub. El historial no se sustituye por datos inventados.",
    published:"Publicado en GitHub", unknownTimes:"Inicio y fin: consultar ejecución en GitHub Actions",
    provider:"Modelo reportado", totalCost:"Coste reportado de la rutina completa",
    commands:"Comprobaciones citadas", source:"Abrir evidencia", orders:"Órdenes registradas",
    ordersDesc:"Estados reales de Issues etiquetadas avalon:task. Sin una asignación explícita no atribuimos el trabajo a un manager.",
    loadOrders:"Consultar órdenes de GitHub", ordersFailure:"Órdenes no disponibles. Consultar GitHub directamente.",
    noOrders:"No hay órdenes verificables en esta consulta.", assigned:"Responsable",
    unassigned:"No asignado de forma verificable", approval:"Las tareas que requieren aprobación nunca se ejecutan automáticamente.",
    renTitle:"Preparar orden para REN", renHelp:"La recepción aprobada está definida en el PR #132 mediante Issues avalon:task. Avalon aún no tiene una API propia de envío validada. Este borrador no se envía ni se guarda.",
    renPlaceholder:"Describe la tarea, el resultado esperado y los criterios de aceptación…",
    renDisabled:"Enviar · Pendiente de integración", pending:"Pendiente de integración",
    seeContract:"Ver motor e instrucciones", ownRuns:"Entradas del motor interno", noInternal:"La API no ha confirmado ninguna ejecución.",
    noReported:"No registrado", goBack:"Oficina", manualChecks:"Comprobaciones manuales",
    verifiedCount:"Informes registrados", runningCount:"En ejecución", needsOwner:"Necesitan aprobación",
    ordersVerified:"Órdenes verificadas", noSource:"Fuente no disponible", refreshHistory:"Recargar historial",
    viewOrder:"Abrir orden", stopLabel:"Estado del motor", normal:"Consulta disponible",
    caveat:"Las rutinas del Issue #134 y las ejecuciones de Supabase son fuentes distintas; no se fusionan como si fueran una misma ejecución."
  },
  en: { title:"Manager operations center", eyebrow:"AVALON OS / WORK CONTROL",
    description:"Real REN, SHIN, HARU, SORA and KENJI activity. A finished check is not proof that a code change has been implemented or approved.",
    activity:"Internal engine", latest:"Latest recorded execution", inProgress:"Current task", queued:"Queued task",
    started:"Started", finished:"Finished", result:"Recorded result", evidence:"Evidence", error:"Error or blocker",
    noActivity:"No verified activity", noTask:"No recorded execution task",
    update:"Refresh data", updating:"Checking…", engineOffline:"Execution engine unavailable: integration pending.",
    kill:"Emergency stop enabled: no new executions should begin.",
    manual:"Deterministic CRM check", noProvider:"AI provider: not reported by this endpoint",
    history:"GitHub Actions history", historyDesc:"Workflow reports posted in Issue #134; they do not prove online presence or a code change by themselves.",
    loadHistory:"Load real history", noHistory:"No verified activity in the retrieved ledger.",
    loading:"Loading history…", failedHistory:"GitHub history unavailable. No fabricated fallback is shown.",
    published:"Published on GitHub", unknownTimes:"Start and end: inspect the GitHub Actions run",
    provider:"Reported model", totalCost:"Reported cost of the entire routine",
    commands:"Reported checks", source:"Open evidence", orders:"Recorded orders",
    ordersDesc:"Real GitHub issues labeled avalon:task. Without explicit assignment, work is not attributed to any manager.",
    loadOrders:"Load GitHub orders", ordersFailure:"Orders unavailable. View GitHub directly.",
    noOrders:"No verifiable orders in this response.", assigned:"Assigned manager",
    unassigned:"No verified assignment", approval:"Owner approval is never automated.",
    renTitle:"Prepare an order for REN", renHelp:"PR #132 defines approved intake via avalon:task GitHub Issues. Avalon has no verified direct submission API yet. This draft is not sent or saved.",
    renPlaceholder:"Describe the task, expected result and acceptance criteria…",
    renDisabled:"Send · Integration pending", pending:"Integration pending",
    seeContract:"View engine specification", ownRuns:"Internal engine records", noInternal:"The API has not confirmed a run.",
    noReported:"Not recorded", goBack:"Office", manualChecks:"Manual checks",
    verifiedCount:"Recorded reports", runningCount:"Running", needsOwner:"Owner approvals",
    ordersVerified:"Verified orders", noSource:"Source unavailable", refreshHistory:"Refresh history",
    viewOrder:"Open order", stopLabel:"Engine status", normal:"Read-only data available",
    caveat:"Issue #134 routines and Supabase runs are separate sources; they are not merged into a single fictitious execution."
  }
};

const GITHUB_API_BASE = "https://api.github.com/repos/avaloncoreagency/Avalon-code/issues/134/comments";
const githubFetch = { headers: { Accept:"application/vnd.github+json" }, cache:"no-store" as const };

async function fetchLastLedgerPage() {
  const response = await fetch(WORKFLOW_API, githubFetch);
  if (!response.ok) throw new Error("github");
  const first: unknown = await response.json();
  if (!Array.isArray(first)) throw new Error("github_contract");
  // GitHub serves comments oldest-first. Read the last page only if it is an
  // exact same-repository link; never follow arbitrary redirect-like content.
  const link = response.headers.get("link") ?? "";
  const last = link.match(/<([^<>]+)>;\s*rel="last"/);
  if (!last) return first;
  const url = new URL(last[1]);
  if (url.origin !== "https://api.github.com" || url.pathname !== new URL(GITHUB_API_BASE).pathname ||
      !/^\d+$/.test(url.searchParams.get("page") ?? "")) return first;
  const latest = await fetch(url.href, githubFetch);
  if (!latest.ok) throw new Error("github_last_page");
  const rows: unknown = await latest.json();
  if (!Array.isArray(rows)) throw new Error("github_contract");
  return rows;
}

function DateField({ label, value, lang }: { label: string; value: string | null; lang: string }) {
  return <div className={s.dateField}><span>{label}</span>
    {value && Number.isFinite(Date.parse(value))
      ? <time dateTime={value}>{safeDate(value, lang)}</time>
      : <strong>{lang==="en"?"Not recorded":"No registrado"}</strong>}
  </div>;
}

/**
 * This surface intentionally has no POST endpoint. The authorized engine is
 * maintained by Claude and is not connected to a new UI order API here.
 */
export function ManagerOperations({lang, initialManager}:{lang:string; initialManager:ManagerKey}) {
  const en=lang==="en", t=labels[en?"en":"es"];
  const [feed,setFeed]=useState<ActivityFeed|null>(null);
  const [loadState,setLoadState]=useState<"loading"|"ready"|"error">("loading");
  const [selected,setSelected]=useState<ManagerKey>(initialManager);
  const [ledger,setLedger]=useState<LedgerEntry[]|null>(null);
  const [ledgerState,setLedgerState]=useState<"idle"|"loading"|"ready"|"error">("idle");
  const [orders,setOrders]=useState<PublicOrder[]|null>(null);
  const [orderState,setOrderState]=useState<"idle"|"loading"|"ready"|"error">("idle");
  const [draft,setDraft]=useState("");

  useEffect(()=>setSelected(initialManager),[initialManager]);
  async function refreshActivity(signal?: AbortSignal) {
    setLoadState("loading");
    try {
      const response=await fetch(ACTIVITY_API,{credentials:"same-origin",cache:"no-store",signal});
      if(!response.ok) throw new Error("engine_unavailable");
      const data=readActivity(await response.json());
      if(!data) throw new Error("invalid_contract");
      if(!signal?.aborted){setFeed(data);setLoadState("ready");}
    } catch {
      if(!signal?.aborted){setFeed(null);setLoadState("error");}
    }
  }
  useEffect(()=>{
    const controller=new AbortController();
    void refreshActivity(controller.signal);
    return ()=>controller.abort();
  },[]);
  async function loadLedger(){
    setLedgerState("loading");
    try{
      const rows=await fetchLastLedgerPage();
      setLedger(parseLedgerComments(rows));setLedgerState("ready");
    } catch {setLedger(null);setLedgerState("error");}
  }
  async function loadOrders(){
    setOrderState("loading");
    try{
      const response=await fetch(ORDERS_API,githubFetch);
      if(!response.ok)throw new Error("github");
      const rows:unknown=await response.json();
      if(!Array.isArray(rows))throw new Error("contract");
      setOrders(readPublicOrders(rows));setOrderState("ready");
    }catch{setOrders(null);setOrderState("error");}
  }
  const current=feed?.managers.find(m=>m.manager_key===selected);
  const count=feed?.managers.filter(m=>m.run_id!==null).length;
  const running=feed?.managers.filter(m=>m.run_id!==null&&m.status==="running").length;
  const review=orders?.filter(o=>o.stage==="owner").length;
  const verified=orders?.filter(o=>o.stage==="verified").length;
  const history=(ledger??[]).filter(e=>e.manager===selected);
  const orderCount=orders?.length;
  const counts: Array<[string,number|undefined]> = [
    [t.verifiedCount,count],[t.runningCount,running],[t.needsOwner,review],[t.ordersVerified,verified],
  ];

  return <main className={s.panel}>
    <header className={s.hero}>
      <div>
        <p className={s.eyebrow}>{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p>{t.description}</p>
      </div>
      <nav className={s.links} aria-label={en?"Navigation":"Navegación"}>
        <Link href="/admin/workspace/crm/office/hq">{t.goBack}</Link>
        <Link href="/admin/workspace/crm/office/manager-work">{t.manualChecks}</Link>
      </nav>
    </header>
    <div className={s.metrics}>
      {counts.map(([name,value])=><div className={s.metric} key={name}>
        <span>{name}</span><strong>{value===undefined?"—":value}</strong>
      </div>)}
    </div>
    <section className={s.section} aria-labelledby="manager-operation-heading">
      <div className={s.sectionHead}>
        <div><h2 id="manager-operation-heading">{t.activity}</h2>
          <p>{en?"Authorized Supabase execution reports only.":"Solo registros de ejecución autorizados de Supabase."}</p></div>
        <button type="button" onClick={()=>void refreshActivity()} disabled={loadState==="loading"}>
          {loadState==="loading"?t.updating:t.update}
        </button>
      </div>
      {feed?.meta.kill_switch===true && <p className={s.warning} role="status">{t.kill}</p>}
      {loadState==="error" && <p role="alert" className={s.warning}>{t.engineOffline}</p>}
      {loadState==="loading" && <p role="status" className={s.muted}>{t.updating}</p>}
      <div className={s.cards}>
        {MANAGER_KEYS.map(key=>{
          const run=feed?.managers.find(m=>m.manager_key===key);
          const live=run && run.run_id !== null;
          return <article key={key} className={s.card} data-selected={key===selected}>
            <div className={s.cardTop}><span className={s.monogram}>{key.slice(0,2).toUpperCase()}</span>
              <div><h3>{key.toUpperCase()}</h3><p>{MANAGER_ROLES[key][en?1:0]}</p></div>
            </div>
            <p className={s.state} data-state={live?run.status:"idle"} role="status">
              {loadState!=="ready"?t.noActivity:activityLabel(live?run.status:"idle",en)}
            </p>
            <p className={s.taskTitle}>{loadState==="ready" && live && run.task_title
              ? run.task_title : t.noTask}</p>
            <Link className={s.cardLink} href={`?manager=${key}#manager-details`} aria-current={key===selected?"true":undefined}>
              {key===selected?(en?"Selected details":"Detalles seleccionados"):(en?"Open history":"Abrir historial")}
            </Link>
          </article>;
        })}
      </div>
    </section>
    <section className={s.section} id="manager-details" aria-labelledby="manager-detail-heading">
      <div className={s.sectionHead}>
        <div><p className={s.eyebrow}>{t.latest}</p>
          <h2 id="manager-detail-heading">{selected.toUpperCase()} · {MANAGER_ROLES[selected][en?1:0]}</h2></div>
        <span className={s.source}>{t.manual}</span>
      </div>
      {!current?.run_id || loadState!=="ready" ? <p className={s.empty}>{t.noInternal}</p> : <>
        <p className={s.state} data-state={current.status}>{activityLabel(current.status,en)}</p>
        <p><strong>{current.status==="running"?t.inProgress:current.status==="queued"?t.queued:t.latest}:</strong>{" "}{current.task_title||t.noTask}</p>
        <div className={s.dates}>
          <DateField label={t.started} value={current.started_at} lang={lang}/>
          <DateField label={t.finished} value={current.finished_at} lang={lang}/>
        </div>
        <div className={s.bodyText}>
          <h3>{t.result}</h3><p>{current.result_summary?.trim()||t.noReported}</p>
          <h3>{t.evidence}</h3>
          {current.evidence_refs.length ? <ul>{current.evidence_refs.map((e,i)=><li key={i}>
            <strong>{e.label||e.type}</strong> · <code>{e.id}</code>
          </li>)}</ul>:<p>{t.noReported}</p>}
          {current.error_code && <p className={s.warning} role="alert">{t.error}: {current.error_code}</p>}
          <p className={s.muted}>{t.noProvider}</p>
          <p className={s.muted}>ID: <code>{current.run_id}</code></p>
        </div>
      </>}
    </section>
    <section className={s.section} aria-labelledby="manager-history-heading">
      <div className={s.sectionHead}>
        <div><h2 id="manager-history-heading">{t.history} · {selected.toUpperCase()}</h2><p>{t.historyDesc}</p></div>
        <button type="button" disabled={ledgerState==="loading"} onClick={()=>void loadLedger()}>
          {ledgerState==="loading"?t.loading:ledgerState==="ready"?t.refreshHistory:t.loadHistory}
        </button>
      </div>
      {ledgerState==="error" && <p className={s.warning} role="alert">{t.failedHistory} <a href={LEDGER} target="_blank" rel="noopener noreferrer">{t.source}</a></p>}
      {ledgerState==="ready" && history.length===0 && <p className={s.empty}>{t.noHistory}</p>}
      {ledgerState==="idle" && <p className={s.empty}>{en?"Use the button to consult the published ledger.":"Pulsa consultar para cargar el registro publicado."}</p>}
      {ledgerState==="loading" && <p role="status">{t.loading}</p>}
      <div className={s.history}>
        {history.slice(0,12).map(h=><article className={s.historyEntry} key={h.runId+":"+h.commentId}>
          <div className={s.entryHead}><strong>{h.action}</strong><span className={s.state} data-state={h.status.startsWith("succeeded")?"completed":"failed"}>
            {h.status.startsWith("succeeded")?(en?"Check finished":"Comprobación finalizada"):h.status}
          </span></div>
          <p>{h.result||t.noReported}</p>
          <small>{t.published}: <time dateTime={h.publishedAt}>{safeDate(h.publishedAt,lang)}</time></small>
          <small>{t.unknownTimes}</small>
          <p className={s.muted}>{t.provider}: {h.provider||t.noReported}</p>
          <p className={s.muted}>{t.totalCost}: {h.runCostUSD===null?t.noReported:`$${h.runCostUSD.toFixed(2)} USD`}</p>
          <details><summary>{t.commands} ({h.evidence.length})</summary>
            <ul>{h.evidence.map((item,i)=><li key={i}>{item}</li>)}</ul></details>
          <div className={s.links}>
            <a href={`https://github.com/avaloncoreagency/Avalon-code/actions/runs/${h.runId}`} rel="noopener noreferrer" target="_blank">{t.source}: GitHub Actions</a>
            <a href={`${LEDGER}#issuecomment-${h.commentId}`} rel="noopener noreferrer" target="_blank">{en?"Ledger comment":"Comentario del registro"}</a>
          </div>
        </article>)}
      </div>
      <p className={s.muted}>{t.caveat} <a href={LEDGER} target="_blank" rel="noopener noreferrer">{en?"Full ledger":"Registro completo"}</a></p>
    </section>
    <section className={s.section} aria-labelledby="orders-heading">
      <div className={s.sectionHead}>
        <div><h2 id="orders-heading">{t.orders}</h2><p>{t.ordersDesc}</p></div>
        <button type="button" onClick={()=>void loadOrders()} disabled={orderState==="loading"}>
          {orderState==="loading"?t.updating:t.loadOrders}
        </button>
      </div>
      {orderState==="loading" && <p role="status">{t.updating}</p>}
      {orderState==="error" && <p className={s.warning} role="alert">{t.ordersFailure} <a href="https://github.com/avaloncoreagency/Avalon-code/issues?q=label%3Aavalon%3Atask" target="_blank" rel="noopener noreferrer">{t.source}</a></p>}
      {orderState==="ready" && orderCount===0 && <p className={s.empty}>{t.noOrders}</p>}
      {orderState==="idle" && <p className={s.empty}>{en?"Load the issue queue to view recorded states.":"Consulta la cola de Issues para ver sus estados registrados."}</p>}
      <div className={s.orders}>
        {(orders??[]).map(order=><article key={order.number} className={s.order} data-state={order.stage}>
          <span className={s.state} data-state={order.stage}>{stageLabel(order.stage,en)}</span>
          <a href={order.url} rel="noopener noreferrer" target="_blank"><strong>#{order.number} · {order.title}</strong></a>
          <small>{t.assigned}: {order.manager?order.manager.toUpperCase():t.unassigned}</small>
          {order.updatedAt && <small>{t.published}: {safeDate(order.updatedAt,lang)}</small>}
        </article>)}
      </div>
      <p className={s.muted}>{t.approval}</p>
    </section>
    <section className={s.section} aria-labelledby="ren-instructions-heading">
      <div className={s.sectionHead}><div><h2 id="ren-instructions-heading">{t.renTitle}</h2><p>{t.renHelp}</p></div>
        <span className={s.pending}>{t.pending}</span>
      </div>
      <label className={s.composer} htmlFor="ren-order-draft">
        <span>{en?"Draft (local, unsaved)":"Borrador (local, sin guardar)"}</span>
        <textarea id="ren-order-draft" rows={4} maxLength={1800} value={draft} onChange={event=>setDraft(event.target.value)} placeholder={t.renPlaceholder}/>
      </label>
      <div className={s.links}>
        <button type="button" disabled aria-disabled="true">{t.renDisabled}</button>
        <a href="https://github.com/avaloncoreagency/Avalon-code/pull/132" target="_blank" rel="noopener noreferrer">{t.seeContract}</a>
      </div>
    </section>
  </main>;
}
