"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ACCOUNTS, METRICS, acceptedMetric, latestSnapshots,
  type AccountKey, type SeatKey, type MetricKey, type Snapshot,
} from "@/lib/ai-credits/model";
import s from "./credit-center.module.css";

const endpoint = "/admin/workspace/crm/ai-credits/api";
const choices: { account: AccountKey; seat: SeatKey; label: string }[] = [
  { account: "chatgpt_business", seat: "miguel", label: "ChatGPT · asiento Miguel" },
  { account: "chatgpt_business", seat: "samuel", label: "ChatGPT · asiento Samuel" },
  { account: "chatgpt_business", seat: null, label: "ChatGPT · fondo compartido" },
  { account: "claude_miguel", seat: null, label: "Claude Pro · Miguel" },
  { account: "claude_samuel", seat: null, label: "Claude Pro · Samuel" },
  { account: "higgsfield_team", seat: null, label: "Higgsfield · fondo compartido" },
];
const fmt = (n: number, unit: string) => unit === "USD"
  ? new Intl.NumberFormat("en-US",{ style:"currency",currency:"USD" }).format(n)
  : new Intl.NumberFormat("es-US",{ maximumFractionDigits: 4 }).format(n) + " " + unit;
const stamp = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString("es-US", {dateStyle:"medium", timeStyle:"short"}) : "sin fecha";
function Observation({ row }: { row: Snapshot }) {
  const past = row.period_end && Date.parse(row.period_end) < Date.now();
  return <div className={s.reading}>
    <div className={s.readingHeading}><span>{METRICS[row.metric_key].label}</span><strong>{fmt(row.amount, row.unit)}</strong></div>
    <p className={s.small}>{past ? "Periodo cerrado · " : ""}Última observación manual: {stamp(row.observed_at)}</p>
    <p className={s.small}>Fuente: {row.source_label}
      {row.period_end ? " · Cierra " + stamp(row.period_end) : ""}</p>
    {row.limit_value !== null && <p className={s.small}>Límite reportado: {fmt(row.limit_value, row.unit)}</p>}
    {row.metric_key === "quota_used_pct" && <div className={s.meter} role="progressbar"
      aria-label="Porcentaje utilizado" aria-valuenow={row.amount} aria-valuemin={0} aria-valuemax={100}>
      <div className={s.fill} style={{ width: Math.min(100,row.amount) + "%" }} />
    </div>}
    {row.metric_key === "quota_used_pct" && row.amount >= 75 &&
      <p className={s.warning} role="status">Queda {Math.max(0,100-row.amount)}% de cuota según la última observación manual.</p>}
    {row.metric_key === "quota_used_pct" && row.amount >= 90 &&
      <p className={s.warning}>Alerta de consumo elevado: 90% o más usado.</p>}
    {row.metric_key === "credits_available" && row.limit_value !== null && row.limit_value > 0 &&
      row.amount / row.limit_value <= 0.25 && <p className={s.warning}>Queda 25% o menos del saldo total declarado.</p>}
  </div>;
}
function Bucket({ title, rows, account, seat }: {
  title: string; rows: Snapshot[]; account: AccountKey; seat: SeatKey;
}) {
  const current = latestSnapshots(rows.filter(r => r.account_key === account && r.seat_key === seat));
  return <div className={s.bucket}>
    <h3>{title}</h3>
    {current.length ? current.map(r => <Observation key={r.id} row={r} />)
      : <p className={s.missing}>Sin datos verificados. No se interpreta como saldo cero.</p>}
  </div>;
}
export function CreditCenter() {
  const [rows,setRows] = useState<Snapshot[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [saving,setSaving] = useState(false);
  const [notice,setNotice] = useState("");
  const [target,setTarget] = useState(3);
  const [metric,setMetric] = useState<MetricKey>("quota_used_pct");
  const [amount,setAmount] = useState("");
  const [limit,setLimit] = useState("");
  const [source,setSource] = useState("");
  const [periodEnd,setPeriodEnd] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint,{cache:"no-store"});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No disponible");
      setRows(body.rows || []);
      setError("");
    } catch(e) { setError(e instanceof Error ? e.message : "No disponible"); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{ void load(); },[load]);
  const targetAccount = choices[target];
  const availableMetrics = (Object.keys(METRICS) as MetricKey[]).filter(m =>
    acceptedMetric(targetAccount.account,targetAccount.seat,m));
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(endpoint,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          account_key:targetAccount.account,seat_key:targetAccount.seat,metric_key:metric,
          amount:Number(amount),limit_value:limit === "" ? null : Number(limit),
          source_label:source,period_end:periodEnd ? new Date(periodEnd+"T23:59:59Z").toISOString():null,
          period_start:periodEnd ? new Date("2026-01-01T00:00:00Z").toISOString():null,
        }),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || "No se pudo guardar");
      setNotice("Observación manual guardada; no es una lectura en vivo.");
      setAmount(""); setLimit(""); setSource(""); setPeriodEnd("");
      await load();
    } catch(e) { setNotice(e instanceof Error ? e.message : "Error al guardar"); }
    finally {setSaving(false);}
  }
  return <main className={s.wrap}>
    <header className={s.header}>
      <div><p className={s.eyebrow}>AVALON OS / OPERACIONES / IA</p>
        <h1>AI Credit Center</h1>
        <p className={s.small}>Cuotas personales, fondos compartidos y gastos API, sin duplicar saldos ni convertir unidades distintas.</p>
      </div>
      <Link href="/admin/workspace/crm" className={s.back}>Volver al CRM</Link>
    </header>
    <div className={s.notice}>Los cuatro grupos de cuentas están configurados como estructura, pero ninguna fuente automática está vinculada a esta aplicación.
      Los valores introducidos abajo son observaciones manuales y no balances en tiempo real.</div>
    {error && <p role="alert" className={s.warning}>{error}</p>}
    <div className={s.cards}>
      {ACCOUNTS.map(a=><section className={s.card} key={a.key}>
        <div className={s.cardTop}><h2>{a.label}</h2><span className={s.tag}>{a.scope==="shared"?"Compartido":"Personal"}</span></div>
        <p className={s.small}>{a.plan} · {a.description}</p>
        {a.key === "chatgpt_business" ? <>
          <Bucket title="Asiento · Miguel" rows={rows} account={a.key} seat="miguel" />
          <Bucket title="Asiento · Samuel" rows={rows} account={a.key} seat="samuel" />
          <Bucket title="Créditos comunes · una sola vez" rows={rows} account={a.key} seat={null} />
        </> : <Bucket title={a.scope==="shared"?"Fondo único Avalon":"Cuota individual"}
          rows={rows} account={a.key} seat={null} />}
      </section>)}
    </div>
    <section className={s.card} aria-label="Registrar lectura manual">
      <h2>Registrar una lectura oficial</h2>
      <p className={s.small}>Usa datos que veas en el proveedor. Nunca ingreses una contraseña ni una API key aquí.</p>
      <form className={s.form} onSubmit={save}>
        <label>Cuenta / titular
          <select value={target} onChange={e=>{
            const index=Number(e.target.value);setTarget(index);
            const next=choices[index];
            setMetric((Object.keys(METRICS) as MetricKey[]).find(m=>acceptedMetric(next.account,next.seat,m))!);
          }}>
            {choices.map((c,i)=><option value={i} key={i}>{c.label}</option>)}
          </select>
        </label>
        <label>Métrica
          <select value={availableMetrics.includes(metric)?metric:availableMetrics[0]}
            onChange={e=>setMetric(e.target.value as MetricKey)}>
            {availableMetrics.map(m=><option key={m} value={m}>{METRICS[m].label}</option>)}
          </select>
        </label>
        <label>Valor <input inputMode="decimal" type="number" min="0" max={metric==="quota_used_pct"?"100":undefined} step="any" required value={amount}
          onChange={e=>setAmount(e.target.value)} /></label>
        <label>Límite o saldo inicial (opcional) <input type="number" min="0" step="any" value={limit}
          onChange={e=>setLimit(e.target.value)} /></label>
        <label>Fuente (panel oficial, factura, etc.) <input required maxLength={180} value={source}
          onChange={e=>setSource(e.target.value)} placeholder="Ej.: Claude Settings / Usage" /></label>
        <label>Fin de periodo (opcional) <input type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} /></label>
        <button type="submit" disabled={saving}>{saving?"Guardando…":"Guardar observación"}</button>
      </form>
      {notice && <p role="status" className={s.small}>{notice}</p>}
    </section>
    <section className={s.card}>
      <h2>Cómo vincular cada fuente</h2>
      <p className={s.small}>ChatGPT Business: cuotas de cada asiento por separado y créditos comunes si existen; exportación/manual hasta contar con permisos para una API compatible.</p>
      <p className={s.small}>Claude Pro (Miguel/Samuel): dos cuotas personales. El panel personal de Claude no es una API empresarial de consulta de saldos.</p>
      <p className={s.small}>Higgsfield Team: puede conectarse a un backend autorizado en una fase separada. Un saldo consultado en otra aplicación no autoriza a Avalon a reutilizar esa sesión.</p>
      <p className={s.small}>El gasto en USD se sigue por fuente y no se suma con créditos, tokens, generaciones o porcentajes. Ninguna API key se expone al navegador.</p>
    </section>
    {loading && <p role="status">Consultando observaciones autorizadas…</p>}
  </main>;
}
