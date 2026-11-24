"use client";
import Link from "next/link";
import { inboxLocationQuery, readInboxLocation, type InboxLocation } from "@/lib/crm/inbound-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { pick, type Lang } from "@/lib/i18n";
import { inquiryTriageReason } from "@/lib/crm/inquiry-triage";
import { presentInquiry } from "@/lib/crm/inquiry-presentation";
import s from "@/components/sales/sales.module.css";
import ui from "./inbound-inbox.module.css";

type Inquiry = { id:string; version:number; company:string; contact:string; email:string|null; phone:string; source:string; industry:string; location:string; opportunity:string; acquired_at:string; status:string; owner_id:string; lead_id:string|null; do_not_contact:boolean; crm_public_inquiries?:{id:string;created_at:string;services:string[];language:string}[] };
type Message = { id:string; prospect_id:string; created_at:string; services:string[]; language:string; message:string|null; review_status:string; review_note:string; version:number; reviewed_at:string|null };
const API = "/admin/workspace/crm/api";
const REVIEW = {pending:["Por revisar","To review"],legitimate:["Consulta legítima","Legitimate inquiry"],possible_spam:["Posible spam","Possible spam"],duplicate:["Repetido","Repeated"],discarded:["Descartado por propietario","Discarded by owner"]} as const;
type ReviewStatus = keyof typeof REVIEW;
const FOCUS = {"":["Todos","All"],pending:["Por revisar","To review"],possible_spam:["Posible spam","Possible spam"],duplicate:["Repetidos","Repeated"],reviewed:["Revisados","Reviewed"]} as const;
type Focus = keyof typeof FOCUS;
const inFocus=(focus:Focus,review:string)=>focus===""||(focus==="reviewed"?review==="legitimate"||review==="discarded":review===focus);
const STATES = {pending:["Pendiente","Pending"],approved:["Aprobado","Approved"],rejected:["Descartado","Discarded"],converted:["En pipeline","In pipeline"]} as const;
export function InboundInbox({lang,initial=readInboxLocation(new URLSearchParams())}:{lang:Lang;initial?:InboxLocation}) {
  const t=(es:string,en:string)=>pick(lang,es,en);
  const [rows,setRows]=useState<Inquiry[]>([]),[count,setCount]=useState<number|null>(null),[page,setPage]=useState(initial.page);
  const [status,setStatus]=useState(initial.status),[query,setQuery]=useState(initial.query),[search,setSearch]=useState(initial.query);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [revision,setRevision]=useState(0),[lead,setLead]=useState<string|null>(null);
  const lock=useRef(false);
  const [duplicate,setDuplicate]=useState<{id:string;company:string;prospect:string}|null>(null);
  // Every stored message per prospect (P0.1). null = the database does not record message history yet.
  const [messages,setMessages]=useState<Message[]|null>(null),[focus,setFocus]=useState<Focus>(initial.focus as Focus);
  useEffect(()=>{
    const href=window.location.pathname+inboxLocationQuery({query:search,status,focus,page})+window.location.hash;
    if(href!==window.location.pathname+window.location.search+window.location.hash) window.history.replaceState(window.history.state,"",href);
  },[search,status,focus,page]);
  const visibleRows=rows.filter(row=>messages===null||focus===""||messages.some(m=>m.prospect_id===row.id&&inFocus(focus,m.review_status)));
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
      <label>{t("Estado de la empresa","Business status")}<select value={status} disabled={busy} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="">{t("Todos los estados","All statuses")}</option>{Object.entries(STATES).map(([key,names])=><option key={key} value={key}>{pick(lang,names[0],names[1])}</option>)}</select></label>
      <button className={s.button} disabled={busy}>{t("Buscar","Search")}</button>
      <button className={s.button} type="button" disabled={busy||loading} onClick={reload}>{t("Actualizar","Refresh")}</button>
    </form>
    {error&&<p role="alert" className={s.flash} data-tone="error">{error}</p>}
    {notice&&<p role="status" className={s.flash} data-tone="ok">{notice}</p>}
    {lead&&<Link className={s.button} href={`/admin/workspace/crm/lead/${lead}`}>{t("Abrir oportunidad","Open opportunity")}</Link>}
    {duplicate&&<div role="status"><p>{t("Posible lead existente","Possible existing lead")}: {duplicate.company}</p><Link href={`/admin/workspace/crm/lead/${duplicate.id}`}>{t("Revisar ficha","Review record")}</Link><button type="button" className={s.button} disabled={busy} onClick={()=>{const row=rows.find(x=>x.id===duplicate.prospect);if(row)void act(row,"link_existing");}}>{t("Vincular al lead existente","Link to existing lead")}</button></div>}
    <p role="status">{loading?t("Consultando solicitudes…","Loading inquiries…"):count===null?t("Recuento no disponible","Count unavailable"):t(`${count} empresas con solicitudes · página ${page+1}`,`${count} businesses with inquiries · page ${page+1}`)}</p>
    {!loading&&messages!==null&&<div className={ui.summary} role="group" aria-label={t("Filtrar mensajes de esta página","Filter messages on this page")}>
      {(Object.keys(FOCUS) as Focus[]).map(key=><button key={key||"all"} type="button" className={s.button} aria-pressed={focus===key} onClick={()=>setFocus(key)}>
        {pick(lang,FOCUS[key][0],FOCUS[key][1])} ({messages.filter(m=>inFocus(key,m.review_status)).length})</button>)}
    </div>}
    {!loading&&!error&&rows.length===0&&<p className={s.empty}>{t("No hay solicitudes en esta vista.","No inquiries in this view.")}</p>}
    {!loading&&!error&&rows.length>0&&visibleRows.length===0&&<p className={s.empty}>{t("No hay mensajes con este filtro en esta página.","No messages match this filter on this page.")}</p>}
    {!loading&&<ul className={ui.cards}>{visibleRows.map(row=>{
      const visibleMessages=messages?.filter(m=>m.prospect_id===row.id&&inFocus(focus,m.review_status))??[];
      const legacy=presentInquiry(row.opportunity,(row.crm_public_inquiries??[]).flatMap(x=>x.services),lang);
      const statusText=Object.hasOwn(STATES,row.status)?pick(lang,STATES[row.status as keyof typeof STATES][0],STATES[row.status as keyof typeof STATES][1]):row.status;
      return <li key={row.id} className={ui.requestCard}>
        <header className={ui.requestHeader}>
          <div className={ui.identity}>
            <h2>{row.company}</h2>
            <p>{row.contact||t("Contacto no indicado","Contact not supplied")}</p>
          </div>
          <span className={ui.state} data-status={row.status}>{statusText}</span>
        </header>
        {messages===null
          ?<section className={ui.messageCard} aria-label={t("Solicitud inicial","Initial inquiry")}>
            <strong className={ui.messageTitle}>{t("Qué necesita el cliente","What the customer needs")}</strong>
            <p className={ui.body}>{legacy.text||t("No hay descripción disponible.","No description available.")}</p>
            {legacy.services.length>0&&<div className={ui.chips} aria-label={t("Servicios solicitados","Requested services")}>{legacy.services.map(service=><span key={service} className={ui.chip}>{service}</span>)}</div>}
            {messages===null&&triageText(row.opportunity)}
            <details className={ui.details}><summary>{t("Ver registro original","View original record")}</summary><p className={ui.rawNote}>{row.opportunity}</p></details>
            <p className={ui.quiet}>{t("Historial anterior no disponible en esta base de datos; se conserva el registro original.","Earlier history is not available in this database; the original record is retained.")}</p>
          </section>
          :<ol className={ui.messages} aria-label={t("Mensajes de ","Messages from ")+row.company}>
            {visibleMessages.map(m=>{
              const view=presentInquiry(m.message,m.services,lang);
              const reviewed=Object.hasOwn(REVIEW,m.review_status)?reviewLabel(m.review_status as ReviewStatus):m.review_status;
              return <li key={m.id} className={ui.messageCard} data-review={m.review_status}>
                <div className={ui.messageHeader}>
                  <strong className={ui.messageTitle}>{t("Qué necesita el cliente","What the customer needs")}</strong>
                  <span className={ui.reviewStatus} data-review={m.review_status}>{reviewed}</span>
                </div>
                <p className={ui.body}>{view.text||t("Mensaje no registrado: recibido antes del historial.","Message not recorded: received before message history.")}</p>
                {view.services.length>0&&<div className={ui.chips} aria-label={t("Servicios solicitados","Requested services")}>{view.services.map(service=><span key={service} className={ui.chip}>{service}</span>)}</div>}
                <p className={ui.quiet}><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString(lang==="es"?"es":"en",{dateStyle:"medium",timeStyle:"short"})}</time></p>
                {triageText(m.message)}
                <details className={ui.details}>
                  <summary>{t("Revisión y detalles del mensaje","Message review and details")}</summary>
                  <div className={ui.detailsBody}>
                    {m.review_note&&<p className={ui.quiet}><strong>{t("Nota de revisión","Review note")}:</strong> {m.review_note}</p>}
                    {m.message && view.text !== m.message.trim() && <p className={ui.rawNote}><strong>{t("Mensaje completo (registro original)","Full message (original record)")}:</strong> {m.message}</p>}
                    <div className={ui.actions} role="group" aria-label={t("Revisar este mensaje","Review this message")}>
                      {(Object.keys(REVIEW) as ReviewStatus[]).filter(k=>k!==m.review_status).map(k=>
                        <button key={k} type="button" className={s.button} disabled={busy} onClick={()=>void review(m,k)}>{k==="pending"?t("Volver a revisar","Back to review"):reviewLabel(k)}</button>)}
                    </div>
                  </div>
                </details>
              </li>;
            })}
          </ol>}
        <details className={ui.details}>
          <summary>{t("Contacto y datos de seguimiento","Contact and tracking details")}</summary>
          <div className={ui.detailsBody}>
            <p>{t("Correo","Email")}: {row.email||"—"} · {t("Teléfono","Phone")}: {row.phone||"—"}</p>
            <p>{t("Sector","Industry")}: {row.industry||"—"} · {t("Ubicación","Location")}: {row.location||"—"}</p>
            <p>{t("Solicitudes registradas","Recorded inquiries")}: {row.crm_public_inquiries?.length??"—"} · {t("Origen","Source")}: {row.source} · {row.acquired_at.slice(0,10)} · v{row.version}</p>
          </div>
        </details>
        {row.do_not_contact
          ?<p className={ui.quiet}>{t("No contactar: revisión bloqueada.","Do not contact: review blocked.")}</p>
          :row.status==="converted"
            ?row.lead_id&&<Link className={s.button} href={"/admin/workspace/crm/lead/"+row.lead_id}>{t("Abrir oportunidad","Open opportunity")}</Link>
            :<div className={ui.actions}>
              {row.status!=="approved"&&<button className={s.button} disabled={busy} onClick={()=>void act(row,"approved")}>{t("Aprobar revisión","Approve review")}</button>}
              {row.status==="approved"&&<button className={s.button} disabled={busy} onClick={()=>void act(row,"convert")}>{t("Convertir a lead","Convert to lead")}</button>}
              {row.status!=="rejected"&&<button className={s.button} disabled={busy} onClick={()=>void act(row,"rejected")}>{t("Descartar","Discard")}</button>}
            </div>}
      </li>;
    })}</ul>}
    <nav className={s.actions} aria-label={t("Páginas de solicitudes","Inquiry pages")}>
      <button className={s.button} disabled={busy||loading||page===0} onClick={()=>setPage(p=>p-1)}>{t("Anterior","Previous")}</button>
      <button className={s.button} disabled={busy||loading||count===null||(page+1)*50>=count||page>=10000} onClick={()=>setPage(p=>p+1)}>{t("Siguiente","Next")}</button>
    </nav>
    <p className={s.muted}>{t("Las solicitudes se agrupan por empresa y comparten su estado de revisión. La aprobación es una decisión humana. La conversión usa los controles de duplicados existentes; no crea una venta ni un cliente.","Inquiries are grouped by business and share its review status. Approval is a human decision. Conversion uses existing duplicate controls; it creates neither a sale nor a client.")}</p>
  </section>;
}
