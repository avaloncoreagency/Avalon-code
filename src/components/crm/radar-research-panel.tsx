"use client";

import { useEffect, useState } from "react";
import type { ResearchReport, ResearchSignal } from "@/lib/crm/radar-research";
import s from "./radar-research.module.css";

type Props = {
  prospectId: string;
  businessName: string;
  initialWebsite: string;
  onChanged: () => void;
};

const outcomeName: Record<ResearchSignal["outcome"], string> = {
  observed: "Comprobado",
  not_observed: "No observado",
  unknown: "Sin verificar",
};
const confidenceName: Record<ResearchReport["confidence"], string> = {
  none: "No evaluable", low: "Baja", medium: "Media", high: "Alta",
};

export function RadarResearchPanel({ prospectId, businessName, initialWebsite, onChanged }: Props) {
  const [url, setUrl] = useState(initialWebsite || "");
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setUrl(initialWebsite || "");
    setReport(null);
    setLoading(true);
    setError("");
    setMessage("");
    void fetch("/admin/workspace/crm/radar/research?id=" + encodeURIComponent(prospectId),
      { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json() as { report?: ResearchReport; error?: string };
        if (!response.ok) throw new Error(body.error ?? "No se pudo cargar la investigación");
        if (!controller.signal.aborted) setReport(body.report ?? null);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No disponible");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [prospectId, initialWebsite]);

  async function research() {
    if (running) return;
    setRunning(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/admin/workspace/crm/radar/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: prospectId, website: url }),
      });
      const body = await res.json() as {
        report?: ResearchReport;
        error?: string;
        cached?: boolean;
        recorded_website?: boolean;
      };
      if (!res.ok || !body.report) throw new Error(body.error ?? "Investigación no disponible.");
      setReport(body.report);
      setMessage(body.cached
        ? "Se reutilizó una investigación reciente para no repetir consultas ni gastar recursos."
        : body.recorded_website
          ? "Informe guardado. Confirmamos la web oficial y añadimos esa evidencia positiva al cálculo de estrellas."
          : "Informe guardado con fuentes y señales. Revisa los hallazgos antes de confirmar necesidades.");
      if (!body.cached) onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo investigar.");
    } finally { setRunning(false); }
  }

  return (
    <section className={s.panel} aria-labelledby="research-title">
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>AVALON · RESEARCH</p>
          <h4 id="research-title">Investigación a fondo</h4>
          <p>El radar examina automáticamente el sitio oficial de {businessName} mientras tu sesión esté activa. Aquí puedes consultar el informe o actualizarlo de forma opcional.</p>
        </div>
        <span className={s.budget}>12/día · 24 h de caché</span>
      </header>

      <div className={s.form}>
        <label htmlFor="official-site">Web oficial para investigar</label>
        <input id="official-site" type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://web-oficial-del-negocio.com" maxLength={500}
          aria-describedby="research-source-tip" />
        <button type="button" onClick={() => void research()} disabled={running || loading || !url.trim()}
          aria-busy={running}>
          {running ? "Actualizando investigación…" : "Actualizar investigación (opcional)"}
        </button>
        <small id="research-source-tip">Si Geoapify no registró una web, puedes introducir una que hayas confirmado. Solo se visitan páginas HTTPS públicas permitidas por robots.txt.</small>
      </div>
      {loading && <p className={s.muted} role="status">Cargando informe anterior…</p>}
      {error && <p className={s.error} role="alert">{error}</p>}
      {message && <p className={s.success} role="status">{message}</p>}
      {report && <div className={s.results}>
        <div className={s.stats}>
          <strong>{report.status === "complete" ? "Investigación completada" :
            report.status === "blocked" ? "Investigación restringida" : "Investigación parcial"}</strong>
          <span>Fuentes consultadas: {report.pages.filter(p => p.status === 200).length}</span>
          <span>Confianza del informe: {confidenceName[report.confidence]}</span>
          <span>Fecha: {new Date(report.researched_at).toLocaleString("es")}</span>
        </div>
        {report.suggested_needs.length > 0 && <p className={s.good}>
          Se confirmó la existencia de un sitio vinculado al negocio. Eso no demuestra que necesite un nuevo sitio ni otros servicios.
        </p>}
        {report.warnings.length > 0 && <ul className={s.warnings}>
          {report.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
        </ul>}
        {report.signals.length > 0 && <div className={s.signals}>
          <h5>Hallazgos y evidencia</h5>
          <ul>{report.signals.map(signal => <li key={signal.code} className={s.signal}>
            <div className={s.signalHead}>
              <strong>{signal.label}</strong>
              <span data-outcome={signal.outcome}>{outcomeName[signal.outcome]}</span>
            </div>
            <p>{signal.detail}</p>
            <small>Confianza {signal.confidence === "high" ? "alta" : signal.confidence === "medium" ? "media" : "baja"} · <a href={signal.source_url} target="_blank" rel="noopener noreferrer nofollow">Ver fuente</a></small>
          </li>)}</ul>
        </div>}
        {report.pages.length > 0 && <details className={s.sources}>
          <summary>Ver las {report.pages.length} páginas consultadas</summary>
          <ul>{report.pages.map((page, index) => <li key={index}>
            <span>{page.kind} · HTTP {page.status || "sin respuesta"}</span>
            <a href={page.url} target="_blank" rel="noopener noreferrer nofollow">{page.title || page.url}</a>
          </li>)}</ul>
        </details>}
        <div className={s.unknowns}>
          <strong>Lo que NO podemos concluir solo con una web pública</strong>
          <ul>{report.unverified.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
        <p className={s.note}>Las observaciones técnicas no equivalen automáticamente a necesidades comerciales. Para asignar estrellas fiables, confirma las carencias en «Necesidades por servicio» usando fuentes y notas; el paso a pipeline sigue requiriendo calificación.</p>
      </div>}
      {!loading && !report && !error && <p className={s.muted}>Aún no hay informe guardado. El radar lo investigará automáticamente si tiene una web pública verificable y queda presupuesto diario.</p>}
    </section>
  );
}
