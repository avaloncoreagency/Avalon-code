"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pick, type Lang } from "@/lib/i18n";
import { inquiryTriageReason } from "@/lib/crm/inquiry-triage";
import s from "@/components/sales/sales.module.css";
import ui from "./inbound-inbox.module.css";

type Inquiry = { id:string; version:number; company:string; contact:string; email:string|null; phone:string; source:string; industry:string; location:string; opportunity:string; acquired_at:string; status:string; owner_id:string; lead_id:string|null; do_not_contact:boolean; crm_public_inquiries?:{id:string;created_at:string;services:string[];language:string}[] };
type Message = { id:string; prospect_id:string; created_at:string; services:string[]; language:string; message:string|null; review_status:string; review_note:string; version:number; reviewed_at:string|null };
const API = "/admin/workspace/crm/api";
const REVIEW = {pending:["Por revisar","To review"],legitimate:["Consulta legítima","Legitimate inquiry"],possible_spam:["Posible spam","Possible spam"],duplicate:["Repetido","Repeated"],discarded:["Descartado por propietario","Discarded by owner"]} as const;
type ReviewStatus = keyof typeof REVIEW;
const STATES = {pending:["Pendiente","Pending"],approved:["Aprobado","Approved"],rejected:["Descartado","Discarded"],converted:["En pipeline","In pipeline"]} as const;
export function InboundInbox({lang}:{lang:Lang}) {
  const t=(es:string,en:string)=>pick(lang,es,en);
  const [rows,setRows]=useState<Inquiry[]>([]),[count,setCount]=useState<number|null>(null),[page,setPage]=useState(0);
  const [status,setStatus]=useState(""),[query,setQuery]=useState(""),[search,setSearch]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [revision,setRevision]=useState(0),[lead,setLead]=useState<string|null>(null);
  const lock=useRef(false);
  const [duplicate,setDuplicate]=useState<{id:string;company:string;prospect:string}|null>(null);
  // Every stored message per prospect (P0.1). null = the database does not record message history yet.
  const [messages,setMessages]=useState<Message[]|null>(null);
  const reload=useCallback(()=>setRevision(x=>x+1),[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError("");
    const params=new URLSearchParams({entity:"prospects",inbound:"true",page:String(page),...(status?{status}:{}),...(search?{q:search}:{})});
    fetch(API+"?"+params,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      if(!response.ok)throw Error("unavailable");
      const data=await response.json();
      if(!Array.isArray(data.rows)||!Number.isSafeInteger(data.count)||data.count<0)throw Error("invalid");
      if(!controller.signal.aborted){setRows(data.rows);setCount(data.count);setMessages(data.messageHistory==="available"&&Array.isArray(data.messages)?data.messages:null);}
    }).catch(()=>{if(!controller.signal.aborted){setRows([]);setCount(null);setError(lang==="es"?"No se pudieron cargar las solicitudes. Reintenta.":"Inquiries could not be loaded. Try again.");}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[status,page,search,revision,lang]);
  async function act(row:Inquiry, action:"approved"|"rejected"|"convert"|"link_existing") {
    if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");setDuplicate(null);setLead(null);
    try {
      const payload=action==="convert"||action==="link_existing"?{action,id:row.id}:{entity:"prospects",id:row.id,version:row.version,values:{...row,status:action}};
      const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok){
        if(result.code==="lead_exists"&&result.lead?.id)setDuplicate({id:result.lead.id,company:result.lead.company,prospect:row.id});
        setError(response.status===409?t("El registro cambió o existe un duplicado. Actualiza y revisa antes de reintentar.","The record changed or a duplicate exists. Refresh and review before trying again."):t("El servidor no confirmó la operación. No se avanzó el estado local.","The server did not confirm the operation. The local status was not advanced."));return;
      }
      setNotice(t("Operación confirmada por el servidor; el historial se conserva.","Operation confirmed by the server; history is retained."));
      if((action==="convert"||action==="link_existing")&&typeof result.id==="string"&&/^[a-f0-9-]{36}$/i.test(result.id))setLead(result.id);
      reload();
    }catch{setError(t("No se recibió confirmación. Actualiza antes de reintentar: la operación pudo haberse guardado.","No confirmation was received. Refresh before retrying: the operation may have been saved."));}
    finally{lock.current=false;setBusy(false);}
  }
  // Owner review of one message: reversible (false positives recover), versioned, never converts anything.
  async function review(message:Message, status:ReviewStatus) {
    if(lock.current)return;
    let note="";
    if(status==="discarded"||status==="possible_spam"){
      const answer=window.prompt(t("Motivo (opcional, visible para el otro propietario):","Reason (optional, visible to the other owner):"),message.review_note||"");
      if(answer===null)return;
      note=answer.slice(0,500);
    }
    lock.current=true;setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"inquiry_review",id:message.id,version:message.version,status,note})});
      if(!response.ok){setError(response.status===409?t("Otro propietario revisó este mensaje. Actualiza antes de reintentar.","Another owner reviewed this message. Refresh before trying again."):t("El servidor no confirmó la revisión.","The server did not confirm the review."));return;}
      setNotice(t("Revisión guardada; el mensaje original y su historial se conservan.","Review saved; the original message and its history are kept."));
      reload();
    }catch{setError(t("No se recibió confirmación. Actualiza antes de reintentar.","No confirmation was received. Refresh before retrying."));}
    finally{lock.current=false;setBusy(false);}
  }
  const reviewLabel=(k:ReviewStatus)=>pick(lang,REVIEW[k][0],REVIEW[k][1]);
  const triageText=(text:string|null)=>{
    const reason=inquiryTriageReason(text);
    if(!reason)return null;
    return <p className={s.flash} data-tone="warning" role="note">
      <strong>{t("Posible mensaje promocional — revisar antes de aprobar.","Possible promotional inquiry — review before approval.")}</strong>{" "}
      {reason==="indexing_solicitation"
        ? t("Parece ofrecer inclusión en un índice de búsqueda; no es una cotización solicitada.", "Appears to offer search-index listing; this is not a requested quote.")
        : t("Parece ofrecer servicios comerciales a Avalon en lugar de solicitar nuestros servicios.", "Appears to pitch services to Avalon rather than request our services.")}
      {" "}{t("Clasificación orientativa: solo Miguel o Samuel pueden decidir.", "Advisory only: Miguel or Samuel makes the decision.")}
    </p>;
  };
  return <section className={`${s.panel} ${ui.inbox}`} aria-label={t("Bandeja de solicitudes","Inquiry inbox")} aria-busy={loading||busy}>
    <form role="search" className={s.toolbar} onSubmit={event=>{event.preventDefault();setPage(0);setSearch(query);}}>
      <label>{t("Buscar negocio, contacto o correo","Search business, contact or email")}<input name="q" type="search" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label>{t("Revisión","Review")}<select value={status} disabled={busy} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="">{t("Todos los estados","All statuses")}</option>{Object.entries(STATES).map(([key,names])=><option key={key} value={key}>{pick(lang,names[0],names[1])}</option>)}</select></label>
      <button className={s.button} disabled={busy}>{t("Buscar","Search")}</button>
      <button className={s.button} type="button" disabled={busy||loading} onClick={reload}>{t("Actualizar","Refresh")}</button>
    </form>
    {error&&<p role="alert" className={s.flash} data-tone="error">{error}</p>}
    {notice&&<p role="status" className={s.flash} data-tone="ok">{notice}</p>}
    {lead&&<Link className={s.button} href={`/admin/workspace/crm/lead/${lead}`}>{t("Abrir oportunidad","Open opportunity")}</Link>}
    {duplicate&&<div role="status"><p>{t("Posible lead existente","Possible existing lead")}: {duplicate.company}</p><Link href={`/admin/workspace/crm/lead/${duplicate.id}`}>{t("Revisar ficha","Review record")}</Link><button type="button" className={s.button} disabled={busy} onClick={()=>{const row=rows.find(x=>x.id===duplicate.prospect);if(row)void act(row,"link_existing");}}>{t("Vincular al lead existente","Link to existing lead")}</button></div>}
    <p role="status">{loading?t("Consultando solicitudes…","Loading inquiries…"):count===null?t("Recuento no disponible","Count unavailable"):t(`${count} empresas con solicitudes · página ${page+1}`,`${count} businesses with inquiries · page ${page+1}`)}</p>
    {!loading&&!error&&rows.length===0&&<p className={s.empty}>{t("No hay solicitudes en esta vista.","No inquiries in this view.")}</p>}
    {!loading&&<ul className={s.list}>{rows.map(row=><li key={row.id}>
      <h2>{row.company}</h2>
      {messages===null&&triageText(row.opportunity)}
      <p>{Object.hasOwn(STATES,row.status)?STATES[row.status as keyof typeof STATES][lang === "es" ? 0 : 1]:row.status}</p>
      <p>{row.contact} · {row.email||"—"} · {row.phone||"—"}</p><p>{row.industry} · {row.location}</p>
      {messages===null&&<p>{row.opportunity}</p>}
      {messages===null
        ?<p className={s.muted}>{t("El historial completo de mensajes aún no está activo en esta base de datos: se muestra el primer mensaje registrado.","Full message history is not active in this database yet: showing the first recorded message.")}</p>
        :<ol className={ui.messages} aria-label={t(`Mensajes de ${row.company}`,`Messages from ${row.company}`)}>
          {messages.filter(m=>m.prospect_id===row.id).map(m=><li key={m.id} data-review={m.review_status}>
            <p className={s.muted}><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString(lang==="es"?"es":"en",{dateStyle:"medium",timeStyle:"short"})}</time> · {m.services.join(", ")||t("Sin servicio marcado","No service selected")} · {Object.hasOwn(REVIEW,m.review_status)?reviewLabel(m.review_status as ReviewStatus):m.review_status}</p>
            {triageText(m.message)}
            <p className={ui.body}>{m.message??t("Mensaje no registrado: llegó antes de que existiera el historial.","Message not recorded: received before history existed.")}</p>
            {m.review_note&&<p className={s.muted}>{t("Nota","Note")}: {m.review_note}</p>}
            <div className={s.actions} role="group" aria-label={t("Revisar este mensaje","Review this message")}>
              {(Object.keys(REVIEW) as ReviewStatus[]).filter(k=>k!==m.review_status).map(k=>
                <button key={k} type="button" className={s.button} disabled={busy} onClick={()=>void review(m,k)}>{k==="pending"?t("Volver a revisar","Back to review"):reviewLabel(k)}</button>)}
            </div>
          </li>)}
        </ol>}
      <p>{t("Solicitudes recibidas","Received inquiries")}: {row.crm_public_inquiries?.length ?? "—"} · {t("Servicios solicitados","Requested services")}: {[...new Set((row.crm_public_inquiries??[]).flatMap(x=>x.services))].join(", ")||"—"}</p><p className={s.muted}>{t("Fuente","Source")}: {row.source} · {row.acquired_at.slice(0,10)} · v{row.version}</p>
      {row.do_not_contact?<p>{t("No contactar: revisión bloqueada.","Do not contact: review blocked.")}</p>:row.status==="converted"?row.lead_id&&<Link href={`/admin/workspace/crm/lead/${row.lead_id}`}>{t("Abrir oportunidad","Open opportunity")}</Link>:<div className={s.actions}>
        {row.status!=="approved"&&<button className={s.button} disabled={busy} onClick={()=>void act(row,"approved")}>{t("Aprobar revisión","Approve review")}</button>}
        {row.status==="approved"&&<button className={s.button} disabled={busy} onClick={()=>void act(row,"convert")}>{t("Convertir a lead","Convert to lead")}</button>}
        {row.status!=="rejected"&&<button className={s.button} disabled={busy} onClick={()=>void act(row,"rejected")}>{t("Descartar","Discard")}</button>}
      </div>}
    </li>)}</ul>}
    <nav className={s.actions} aria-label={t("Páginas de solicitudes","Inquiry pages")}>
      <button className={s.button} disabled={busy||loading||page===0} onClick={()=>setPage(p=>p-1)}>{t("Anterior","Previous")}</button>
      <button className={s.button} disabled={busy||loading||count===null||(page+1)*50>=count||page>=10000} onClick={()=>setPage(p=>p+1)}>{t("Siguiente","Next")}</button>
    </nav>
    <p className={s.muted}>{t("Las solicitudes se agrupan por empresa y comparten su estado de revisión. La aprobación es una decisión humana. La conversión usa los controles de duplicados existentes; no crea una venta ni un cliente.","Inquiries are grouped by business and share its review status. Approval is a human decision. Conversion uses existing duplicate controls; it creates neither a sale nor a client.")}</p>
  </section>;
}
