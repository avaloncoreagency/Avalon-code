"use client";

import { useEffect, useRef, useState } from "react";
import {
  equalDraftFields, makeWebsiteDraft, parseWebsiteDraft, reconcileWebsiteDraft,
  websiteDraftKey, type DraftFields, type WebsiteDraft, type WebsiteDraftField,
} from "@/lib/os/website-local-draft";

type Notice = "ready" | "protected" | "recovered" | "confirmed" | "conflict" | "unavailable";
type Props = {
  ownerId: string; projectId: string; pageId: string;
  scope: string; serverVersion: number;
  names: readonly WebsiteDraftField[];
  lang: "en" | "es";
};

function formValues(form: HTMLFormElement, names: readonly WebsiteDraftField[]): DraftFields {
  const values: DraftFields = {};
  for (const name of names) {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      values[name] = field.value.slice(0, 11_000);
    }
  }
  return values;
}

function applyValues(form: HTMLFormElement, fields: DraftFields, names: readonly WebsiteDraftField[]) {
  for (const name of names) {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.value = fields[name] ?? "";
    }
  }
}

/**
 * Progressive enhancement to the existing server-action form. The server saves
 * only through the existing version-filtered Supabase action. A local rescue
 * copy is never taken as proof of remote save; it survives redirects and
 * failures in the same tab until the persisted values match.
 */
export function WebsiteDraftGuard({ownerId,projectId,pageId,scope,serverVersion,names,lang}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [notice,setNotice] = useState<Notice>("ready");
  const [conflicting,setConflicting] = useState<WebsiteDraft | null>(null);
  const [discard,setDiscard] = useState<(() => void) | null>(null);
  const en = lang === "en";
  const namesKey = names.join("|");

  useEffect(() => {
    const form = root.current?.closest("form");
    if (!(form instanceof HTMLFormElement)) return;
    const fields = namesKey.split("|") as WebsiteDraftField[];
    let key: string;
    try { key = websiteDraftKey(ownerId,projectId,pageId,scope); }
    catch { setNotice("unavailable"); return; }

    const baseline = formValues(form,fields);
    let storage: Storage;
    try { storage = window.sessionStorage; storage.getItem(key); }
    catch { setNotice("unavailable"); return; }

    const raw = storage.getItem(key);
    const old = parseWebsiteDraft(raw,Date.now());
    if (raw && !old) {
      try { storage.removeItem(key); } catch { /* safe fallback */ }
    }
    const state = reconcileWebsiteDraft(old,serverVersion,baseline,fields);
    if (state === "confirmed") {
      try { storage.removeItem(key); } catch { /* final DB write was already confirmed by read */ }
      setNotice("confirmed");
    } else if (state === "restore" && old) {
      applyValues(form,old.values,fields);
      setNotice("recovered");
    } else if (state === "conflict" && old) {
      setConflicting(old);
      setNotice("conflict");
    } else setNotice("ready");

    const saveLocal = () => {
      const values = formValues(form,fields);
      if (equalDraftFields(values,baseline,fields)) {
        try { storage.removeItem(key); setNotice("ready"); }
        catch { setNotice("unavailable"); }
        return;
      }
      const d = makeWebsiteDraft(serverVersion,baseline,values,Date.now());
      if (!d) { setNotice("unavailable"); return; }
      try {
        storage.setItem(key,JSON.stringify(d));
        setConflicting(null);
        setNotice("protected");
      } catch { setNotice("unavailable"); }
    };
    form.addEventListener("input",saveLocal);
    form.addEventListener("change",saveLocal);
    form.addEventListener("submit",saveLocal);
    setDiscard(() => () => {
      try { storage.removeItem(key); } catch { /* no remote state changes */ }
      setConflicting(null);
      setNotice("ready");
    });
    return () => {
      form.removeEventListener("input",saveLocal);
      form.removeEventListener("change",saveLocal);
      form.removeEventListener("submit",saveLocal);
    };
  },[ownerId,projectId,pageId,scope,serverVersion,namesKey]);

  const copy = conflicting ? Object.entries(conflicting.values)
    .map(([field,value]) => `${field}:\n${value}`).join("\n\n") : "";

  return <div ref={root} className="websiteDraftGuard" style={{display:"grid",gap:7,padding:"10px 12px",border:"1px solid rgba(135,175,220,.35)",borderRadius:10,background:"rgba(31,50,75,.13)",fontSize:12}}>
    <p role="status" style={{margin:0,lineHeight:1.5}}>
      {notice==="protected" ? (en?"Emergency copy saved in this tab. Not yet saved in Avalon.":"Copia de emergencia en esta pestaña. Todavía no guardado en Avalon.") :
       notice==="recovered" ? (en?"Unsaved text recovered. Press Save to store it in Avalon.":"Texto sin guardar recuperado. Pulsa Guardar para almacenarlo en Avalon.") :
       notice==="confirmed" ? (en?"Saved content confirmed in Avalon; emergency copy cleared.":"Contenido confirmado en Avalon; copia de emergencia eliminada.") :
       notice==="conflict" ? (en?"Conflict: the saved page changed. Your earlier draft was preserved below and was NOT applied over the newer content.":"Conflicto: cambió la página guardada. Tu borrador anterior se conservó abajo y NO sobrescribió el contenido nuevo.") :
       notice==="unavailable" ? (en?"This browser cannot keep an emergency copy. Copy your text before leaving.":"Este navegador no puede conservar una copia de emergencia. Copia el texto antes de salir.") :
       (en?"Changes are saved remotely only when you press Save. Emergency copies stay in this tab.":"Los cambios se guardan en Avalon solo al pulsar Guardar. Las copias de emergencia permanecen en esta pestaña.")}
    </p>
    {conflicting && <details>
      <summary style={{cursor:"pointer",fontWeight:650}}>{en?"View and copy unsaved draft":"Ver y copiar borrador sin guardar"}</summary>
      <textarea readOnly value={copy} rows={5} aria-label={en?"Copy this draft manually":"Copia este borrador manualmente"} style={{width:"100%",maxWidth:"100%",resize:"vertical",font:"inherit",fontSize:13,marginTop:8}}/>
      <p style={{margin:"7px 0"}}>{en?"Compare with the current version, then paste only the fields you want to keep.":"Compáralo con la versión actual y pega solo los campos que desees conservar."}</p>
      <button type="button" onClick={()=>discard?.()} style={{border:"1px solid currentColor",borderRadius:6,padding:"7px 10px",background:"transparent",cursor:"pointer"}}>
        {en?"Discard this local copy":"Descartar esta copia local"}
      </button>
    </details>}
    <small style={{opacity:.75,lineHeight:1.45}}>{en
      ?"Local-only rescue, not shared across devices or owners. Do not enter secrets or personal client data."
      :"Respaldo local, no compartido entre dispositivos o propietarios. No introduzcas secretos ni datos personales de clientes."}</small>
  </div>;
}
