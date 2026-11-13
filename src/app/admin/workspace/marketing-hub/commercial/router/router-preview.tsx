"use client";
import {useState} from "react";
import type {Lang} from "@/lib/i18n";
import {evaluateContractorRoute} from "@/lib/commercial/routing";
import styles from "../../growth/growth.module.css";
export default function RouterPreview({lang}:{lang:Lang}){
 const es=lang==="es";
 const [zip,setZip]=useState("33311");
 const [coverage,setCoverage]=useState("33311");
 const [contractor,setContractor]=useState("contractor-a");
 const [seen,setSeen]=useState("contractor-a");
 const [consented,setConsented]=useState("contractor-a");
 const [version,setVersion]=useState("1");
 const [seenVersion,setSeenVersion]=useState("1");
 const [enabled,setEnabled]=useState(true);
 const [terms,setTerms]=useState(true);
 const [license,setLicense]=useState(true);
 const [capacity,setCapacity]=useState(true);
 const [consent,setConsent]=useState(true);
 const result=evaluateContractorRoute({
  campaignId:"synthetic-hvac",contractorId:contractor,version:Number(version),
  enabled,signedContractVerified:terms,licenseVerified:license,capacityAvailable:capacity,
  allowedZips:coverage.split(",").map(x=>x.trim()).filter(Boolean),
  effectiveFromMs:0,effectiveUntilMs:null,
 },{
  zip,displayedContractorId:seen,consentedContractorId:consented,
  displayedPolicyVersion:Number(seenVersion),consentGiven:consent,receivedAtMs:1
 });
 const fields=[
  {label:es?"ZIP solicitado":"Requested ZIP",value:zip,set:setZip},
  {label:es?"ZIPs de cobertura, separados por coma":"Covered ZIPs (comma-separated)",value:coverage,set:setCoverage},
  {label:es?"Contratista vigente":"Current contractor",value:contractor,set:setContractor},
  {label:es?"Contratista mostrado":"Displayed contractor",value:seen,set:setSeen},
  {label:es?"Contratista autorizado por visitante":"Consented contractor",value:consented,set:setConsented},
  {label:es?"Versión vigente":"Current version",value:version,set:setVersion},
  {label:es?"Versión mostrada":"Displayed version",value:seenVersion,set:setSeenVersion}
 ];
 const switches=[
  {label:es?"Campaña activa":"Campaign active",value:enabled,set:setEnabled},
  {label:es?"Contrato verificado (simulación)":"Contract verified (simulation)",value:terms,set:setTerms},
  {label:es?"Licencia verificada (simulación)":"License verified (simulation)",value:license,set:setLicense},
  {label:es?"Capacidad disponible (simulación)":"Capacity available (simulation)",value:capacity,set:setCapacity},
  {label:es?"Consentimiento otorgado":"Consent granted",value:consent,set:setConsent}
 ];
 return <section className={styles.section} aria-labelledby="router-title">
  <h2 id="router-title">{es?"Política de prueba":"Test policy"}</h2>
  <div className={styles.card}><div className={styles.form}>
   <div className={styles.formGrid}>{fields.map(f=><label key={f.label}>{f.label}
    <input value={f.value} onChange={e=>f.set(e.target.value)} autoComplete="off"/></label>)}</div>
   <div className={styles.formGrid}>{switches.map(s=><label key={s.label} style={{display:"flex",alignItems:"center",gap:8}}>
    <input type="checkbox" style={{width:20,minHeight:20}} checked={s.value} onChange={e=>s.set(e.target.checked)}/>{s.label}</label>)}</div>
   <div aria-live="polite">
    <p><strong>{result.status==="eligible"?(es?"Elegible según política sintética":"Eligible under synthetic policy"):(es?"BLOQUEADO — no asignar":"BLOCKED — do not route")}</strong></p>
    <p>{es?"Destino simulado":"Simulated recipient"}: {result.contractorId??"—"}</p>
    {result.reasons.length>0?<ul>{result.reasons.map(code=><li key={code}>{code}</li>)}</ul>:null}
   </div>
  </div></div>
  <p className={styles.note}>{es?
   "Aunque el resultado sea elegible, no existe autorización legal ni conexión real. Las casillas son datos introducidos manualmente y NO verificación de documentos.":
   "An eligible result is not legal approval or a live connection. Checkboxes are manual inputs, NOT document verification."}</p>
 </section>;
}
