"use client";
import { useEffect, useState } from "react";

type Activity = {
 manager_key: string; run_id: string | null; status: string; task_title: string | null;
 started_at: string | null; finished_at: string | null; result_summary: string | null;
 evidence_refs: { type: string; id: string; label?: string }[];
 error_code: string | null; updated_at: string | null;
};
const keys = ["ren", "shin", "haru", "sora", "kenji"];
const labels: Record<string, [string,string]> = {
 idle:["Sin ejecutar","Not run"],queued:["En cola","Queued"],running:["En ejecución","Running"],
 completed:["Completado","Completed"],failed:["Fallido","Failed"],blocked:["Bloqueado","Blocked"],
 stale:["Desactualizado","Stale"],
};
/** Consumes Claude PR #120. Missing backend remains visibly disconnected. */
export function ManagerActivityPanel({lang}:{lang:string}) {
 const en=lang==="en";
 const [runs,setRuns]=useState<Activity[]>([]);
 const [state,setState]=useState("loading");
 const [busy,setBusy]=useState(false);
 async function refresh(signal?:AbortSignal) {
  setBusy(true);
  try {
   const response=await fetch("/admin/workspace/crm/office/manager-activity",{cache:"no-store",credentials:"same-origin",signal});
   if(!response.ok)throw Error("unavailable");
   const data=await response.json();
   if(data?.meta?.executor_kind!=="deterministic" || !Array.isArray(data.managers) ||
     data.managers.length!==5 || !keys.every((key,index)=> {
      const r=data.managers[index];
      return r?.manager_key===key && Object.hasOwn(labels,r.status) &&
       (r.result_summary===null || typeof r.result_summary==="string" && r.result_summary.length<=2000) &&
       Array.isArray(r.evidence_refs) && r.evidence_refs.length<=20 &&
       r.evidence_refs.every((e:{type:unknown;id:unknown;label?:unknown}|null)=>e!==null && typeof e.type==="string" && typeof e.id==="string" && (e.label===undefined || typeof e.label==="string")) &&
       [r.task_title,r.error_code,r.updated_at].every(v=>v===null || typeof v==="string");
     }))throw Error("invalid_contract");
   setRuns(data.managers);setState("connected");
  } catch { if(!signal?.aborted){setRuns([]);setState("disconnected");} }
  finally {if(!signal?.aborted)setBusy(false);}
 }
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return ()=>controller.abort();},[]);
 return <section aria-labelledby="manager-engine-title" style={{padding:20,overflowWrap:"anywhere"}}>
  <h2 id="manager-engine-title">{en?"Manager execution reports":"Informes de ejecución de managers"}</h2>
  <p>{en?"Deterministic checks. Each result belongs to a recorded execution.":"Comprobaciones deterministas. Cada resultado corresponde a una ejecución registrada."}</p>
  <button type="button" disabled={busy} onClick={()=>void refresh()}>{busy?(en?"Checking…":"Consultando…"):(en?"Refresh reports":"Actualizar informes")}</button>
  {state==="disconnected" && <p role="status">{en?"Not connected. The execution backend is unavailable.":"No conectado. El backend de ejecución no está disponible."}</p>}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:12}}>
  {keys.map(key=>{const run=runs.find(r=>r.manager_key===key);return <article key={key} style={{padding:12,border:"1px solid #526078",borderRadius:12,minWidth:0}}>
   <h3>{key.toUpperCase()}</h3><p role="status">{run?labels[run.status][en?1:0]:en?"Not connected":"No conectado"}</p>
   {run?.task_title && <p>{run.task_title}</p>}
   {run?.result_summary && <p style={{whiteSpace:"pre-wrap"}}>{run.result_summary}</p>}
   {run?.error_code && <p role="alert">{en?"Block or error":"Bloqueo o error"}: {run.error_code}</p>}
   {run?.updated_at && <p>{en?"Updated":"Actualizado"}: <time dateTime={run.updated_at}>{run.updated_at}</time></p>}
   {run?.run_id && <details><summary>{en?"Execution evidence":"Evidencia de ejecución"}</summary><p>{run.run_id}</p><ul>{run.evidence_refs.map((ref,index)=><li key={index}>{ref.label || ref.type}: {ref.id}</li>)}</ul></details>}
  </article>;})}</div>
 </section>;
}
