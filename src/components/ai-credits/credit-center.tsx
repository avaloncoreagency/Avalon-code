"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ACCOUNTS, METRICS, acceptedMetric, latestSnapshots,
  type AccountKey, type SeatKey, type MetricKey, type QuotaWindow, type Snapshot,
} from "@/lib/ai-credits/model";
import s from "./credit-center.module.css";

const endpoint = "/admin/workspace/crm/ai-credits/api";
const choices: { account: AccountKey; seat: SeatKey; label: string }[] = [
  { account: "chatgpt_business", seat: "miguel", label: "ChatGPT · Miguel" },
  { account: "chatgpt_business", seat: "samuel", label: "ChatGPT · Samuel" },
  { account: "chatgpt_business", seat: null, label: "ChatGPT · fondo común" },
  { account: "claude_miguel", seat: null, label: "Claude Pro · Miguel" },
  { account: "claude_samuel", seat: null, label: "Claude Pro · Samuel" },
  { account: "higgsfield_team", seat: null, label: "Higgsfield · fondo común" },
];
const windows: {value:Exclude<QuotaWindow,null>; label:string}[] = [
  {value:"session",label:"Sesión (5 h en Claude Pro)"},
  {value:"weekly",label:"Semana"},
  {value:"monthly",label:"Mes"},
  {value:"other",label:"Otra cuota"},
];
const windowName: Record<Exclude<QuotaWindow,null>,string> = {
  session:"Sesión",weekly:"Semana",monthly:"Mes",other:"Otra cuota",
};
type HiggsfieldUsage =
  | { status:"disconnected"|"unavailable"|"incomplete"; reason:string }
  | {status:"connected";start:string;end:string;updatedAt:string;
    spentCredits:number;generations:number;
    members:Array<{display:string;spentCredits:number;generations:number}>};
const currency = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
const number = new Intl.NumberFormat("es-US",{maximumFractionDigits:2});
const fmt = (n:number,unit:string) => unit==="USD"?currency.format(n):number.format(n)+" "+unit;
const date = (raw:string|null|undefined) => raw
  ? new Date(raw).toLocaleString("es-US",{dateStyle:"short",timeStyle:"short"}) : "sin fecha";

function Observation({row}:{row:Snapshot}) {
  const past = row.period_end !== null && Date.parse(row.period_end) < Date.now();
  const quota = row.metric_key === "quota_used_pct";
  const remaining = Math.max(0,100-row.amount);
  const label = quota && row.quota_window ? windowName[row.quota_window] : METRICS[row.metric_key].label;
  return <div className={s.reading}>
    <div className={s.readingHeading}>
      <span>{label}</span>
      <strong>{fmt(row.amount,row.unit)}</strong>
    </div>
    {quota && <div className={s.meter} role="progressbar" aria-label={label+" utilizado"}
      aria-valuenow={row.amount} aria-valuemin={0} aria-valuemax={100}>
      <div className={s.fill} style={{width:Math.min(100,row.amount)+"%"}} />
    </div>}
    {quota && !past && row.amount >= 75 &&
      <p className={s.warning}>Queda {number.format(remaining)}% según la última lectura.</p>}
    {row.metric_key === "credits_available" && row.limit_value !== null &&
      row.limit_value > 0 && row.amount / row.limit_value <= .25 &&
      <p className={s.warning}>Saldo bajo: 25% o menos del total indicado.</p>}
    <p className={s.small}>{past?"Periodo finalizado · ":"Última lectura manual · "}{date(row.observed_at)}
      {row.period_end?" · Reinicio/fin: "+date(row.period_end):""}</p>
    <p className={s.small}>Fuente: {row.source_label}</p>
    {row.limit_value !== null && <p className={s.small}>Límite o saldo inicial declarado: {fmt(row.limit_value,row.unit)}</p>}
  </div>;
}
function Bucket({label,rows,account,seat}:{
  label:string; rows:Snapshot[]; account:AccountKey; seat:SeatKey
}) {
  const current = latestSnapshots(rows.filter(r=>r.account_key===account && r.seat_key===seat));
  return <div className={s.bucket}>
    <h3>{label}</h3>
    {current.length ? current.map(r=><Observation key={r.id} row={r}/>)
      : <p className={s.missing}>Pendiente de registrar · No equivale a saldo cero.</p>}
  </div>;
}
export function CreditCenter() {
  const [rows,setRows]=useState<Snapshot[]>([]);
  const [higgsfield,setHiggsfield]=useState<HiggsfieldUsage>({
    status:"disconnected",reason:"Sin clave de lectura de organización configurada."});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const [target,setTarget]=useState(3);
  const [metric,setMetric]=useState<MetricKey>("quota_used_pct");
  const [quotaWindow,setQuotaWindow]=useState<Exclude<QuotaWindow,null>>("weekly");
  const [amount,setAmount]=useState("");
  const [limit,setLimit]=useState("");
  const [source,setSource]=useState("");
  const [periodStart,setPeriodStart]=useState("");
  const [periodEnd,setPeriodEnd]=useState("");

  const reload=useCallback(async()=>{
    setLoading(true);
    try {
      const response=await fetch(endpoint,{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || "No disponible");
      if(!Array.isArray(body.rows))throw new Error("No se pudo cargar el consumo.");
      setRows(body.rows);
      if(body.higgsfieldUsage)setHiggsfield(body.higgsfieldUsage);
      setError("");
    } catch(e) {setError(e instanceof Error?e.message:"Centro de créditos no disponible");}
    finally {setLoading(false);}
  },[]);
  useEffect(()=>{void reload();},[reload]);

  const selected=choices[target];
  const available=(Object.keys(METRICS) as MetricKey[])
    .filter(m=>acceptedMetric(selected.account,selected.seat,m));
  const selectedMetric=available.includes(metric)?metric:available[0];

  async function save(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(amount.trim()==="")return;
    setSaving(true);
    setNotice("");
    try {
      const response=await fetch(endpoint,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          account_key:selected.account,seat_key:selected.seat,metric_key:selectedMetric,
          quota_window:selectedMetric==="quota_used_pct"?quotaWindow:null,
          amount:Number(amount),limit_value:limit===""?null:Number(limit),
          source_label:source,
          period_start:periodStart?new Date(periodStart+"T00:00:00Z").toISOString():null,
          period_end:periodEnd?new Date(periodEnd+"T23:59:59Z").toISOString():null,
        }),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || "No se pudo guardar");
      setNotice("Lectura manual guardada para los dos propietarios.");
      setAmount("");setLimit("");setSource("");setPeriodStart("");setPeriodEnd("");
      await reload();
    } catch(e) {setNotice(e instanceof Error?e.message:"Error al guardar");}
    finally {setSaving(false);}
  }

  return <div className={s.wrap}>
    <div className={s.toolbar}>
      <p className={s.small}>Cada proveedor usa sus propias unidades. Los fondos compartidos se cuentan una sola vez.</p>
      <button type="button" disabled={loading} onClick={()=>void reload()}>
        {loading?"Actualizando…":"Actualizar lecturas"}
      </button>
    </div>
    {error && <p role="alert" className={s.warning}>{error}</p>}
    <div className={s.cards}>
      {ACCOUNTS.map(account=><article className={s.card} key={account.key}>
        <div className={s.cardTop}>
          <h3>{account.label}</h3>
          <span className={s.tag}>{account.scope==="shared"?"Compartido":"Personal"}</span>
        </div>
        <p className={s.small}>{account.plan}</p>
        {account.key==="chatgpt_business"?<>
          <Bucket label="Asiento de Miguel" rows={rows} account={account.key} seat="miguel"/>
          <Bucket label="Asiento de Samuel" rows={rows} account={account.key} seat="samuel"/>
          <Bucket label="Fondo compartido · saldo único" rows={rows} account={account.key} seat={null}/>
        </>:<Bucket label={account.scope==="shared"?"Créditos de Avalon":"Cuota individual"}
          rows={rows} account={account.key} seat={null}/>}
        {account.key==="higgsfield_team" && <div className={s.bucket}>
          <h3>Consumo del equipo · últimos 7 días</h3>
          {higgsfield.status==="connected"?<>
            <p><strong>{fmt(higgsfield.spentCredits,"créditos")}</strong> consumidos, {higgsfield.generations} generaciones registradas.</p>
            <p className={s.small}>Fuente: API oficial Higgsfield · actualizado {date(higgsfield.updatedAt)}. Este dato es gasto, no saldo disponible.</p>
            {higgsfield.members.map((member,i)=>
              <p className={s.small} key={i}>{member.display}: {fmt(member.spentCredits,"créditos")} utilizados</p>)}
            <p className={s.small}>Los usuarios son los que identifica Higgsfield; no se atribuyen a Miguel o Samuel si comparten sesión.</p>
          </>:<p className={s.missing}>API automática: {higgsfield.reason}</p>}
        </div>}
      </article>)}
    </div>
    <details className={s.details}>
      <summary>Actualizar saldos y cuotas desde sus paneles oficiales</summary>
      <p className={s.small}>Las cuotas de Claude Pro y los límites incluidos de ChatGPT se consultan en sus paneles de cuenta; no existe una sincronización personal autorizada con Avalon. Ambas sesiones de Claude tienen límites independientes.</p>
      <form className={s.form} onSubmit={save}>
        <label>Cuenta o asiento
          <select value={target} onChange={e=>{
            const index=Number(e.target.value);setTarget(index);
            const item=choices[index];
            setMetric((Object.keys(METRICS) as MetricKey[]).find(m=>
              acceptedMetric(item.account,item.seat,m))!);
          }}>
            {choices.map((item,i)=><option key={i} value={i}>{item.label}</option>)}
          </select>
        </label>
        <label>Dato a registrar
          <select value={selectedMetric} onChange={e=>setMetric(e.target.value as MetricKey)}>
            {available.map(k=><option key={k} value={k}>{METRICS[k].label}</option>)}
          </select>
        </label>
        {selectedMetric==="quota_used_pct" && <label>Tipo de cuota
          <select value={quotaWindow} onChange={e=>setQuotaWindow(e.target.value as Exclude<QuotaWindow,null>)}>
            {windows.map(w=><option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </label>}
        <label>Valor
          <input type="number" inputMode="decimal" min="0"
            max={selectedMetric==="quota_used_pct"?100:undefined} step="any" required
            value={amount} onChange={e=>setAmount(e.target.value)}/>
        </label>
        <label>Límite o saldo inicial (opcional)
          <input type="number" min="0" step="any" value={limit}
            onChange={e=>setLimit(e.target.value)}/>
        </label>
        <label>Fuente oficial de la lectura
          <input maxLength={180} required value={source} onChange={e=>setSource(e.target.value)}
            placeholder="Ej.: Claude → Settings → Usage"/>
        </label>
        <label>Inicio de periodo (opcional)
          <input type="date" value={periodStart} onChange={e=>setPeriodStart(e.target.value)}/>
        </label>
        <label>Fin o reinicio (opcional)
          <input type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)}/>
        </label>
        <button type="submit" disabled={saving}>{saving?"Guardando…":"Guardar lectura"}</button>
      </form>
      {notice && <p role="status" className={s.small}>{notice}</p>}
    </details>
    <p className={s.small}>Solo los propietarios autenticados pueden consultar y registrar datos. Ninguna contraseña, cookie de otra plataforma ni clave API se pide en este formulario.</p>
  </div>;
}
