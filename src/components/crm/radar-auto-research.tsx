"use client";

import { useEffect, useRef, useState } from "react";
import s from "./radar-auto-research.module.css";

type Pending = { id: string; company: string };
type Queue = { batch: Pending[]; pending: number; remaining: number; max_daily: number; error?: string };
type Result = { ok?: boolean; error?: string; stars?: number | null; report?: { status?: string } };
type ServerJob = { finished_at: string; status: string; checked: number; rated: number; converted: number; message: string };

/**
 * Research begins automatically when the owner opens Radar or a new search
 * completes. It runs through the normal owner session, never stores auth tokens
 * or secrets, and stays under the server's per-owner daily budget.
 */
export function RadarAutoResearch({ revision, onChanged }: {
  revision: string;
  onChanged: () => void;
}) {
  const [state, setState] = useState<"starting" | "running" | "done" | "limited" | "unavailable">("starting");
  const [reviewed, setReviewed] = useState(0);
  const [rated, setRated] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [pending, setPending] = useState(0);
  const [detail, setDetail] = useState("");
  const [serverJob, setServerJob] = useState<ServerJob | null>(null);
  const refresh = useRef(onChanged);
  refresh.current = onChanged;

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/admin/workspace/crm/radar/research?job_status=1", {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) return;
      const value = await response.json() as { job?: ServerJob | null };
      if (!controller.signal.aborted) setServerJob(value.job ?? null);
    }).catch(() => {});
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    let cancelled = false;
    let cycleActive = false;
    const controller = new AbortController();
    const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    const loadQueue = async (): Promise<Queue> => {
      const response = await fetch("/admin/workspace/crm/radar/research?queue=1", {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json() as Queue;
      if (!response.ok) throw new Error(data.error ?? "Cola no disponible");
      return data;
    };

    const work = async () => {
      if (cancelled || cycleActive) return;
      cycleActive = true;
      setState("starting");
      try {
        // One pass is capped at 12 reports. This is a browser-initiated worker,
        // not a hidden timer that keeps spending website requests indefinitely.
        let attempts = 0;
        while (!cancelled && attempts < 12) {
          const queue = await loadQueue();
          if (cancelled) return;
          setRemaining(queue.remaining);
          setPending(queue.pending);
          if (queue.remaining === 0) {
            setState("limited");
            setDetail("Límite diario de investigaciones alcanzado; no se harán consultas adicionales.");
            return;
          }
          if (!queue.batch.length) {
            setState("done");
            setDetail("Los negocios con web conocida ya están revisados o pendientes de información nueva.");
            return;
          }
          setState("running");
          let madeProgress = false;
          for (const prospect of queue.batch) {
            if (cancelled || attempts >= 12) return;
            // Avoid sending a burst to websites; each scan is capped to 3 pages.
            const res = await fetch("/admin/workspace/crm/radar/research", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: prospect.id, automated: true }),
              signal: controller.signal,
            });
            const body = await res.json() as Result;
            if (cancelled) return;
            attempts++;
            if (res.status === 429) {
              setState("limited");
              setDetail("Límite de investigación alcanzado. No repetiremos solicitudes.");
              return;
            }
            if (!res.ok) {
              // A single blocked, changed or invalid website is not a reason to
              // give that business stars or repeatedly hammer it within a loop.
              setState("unavailable");
              setDetail(body.error ?? "No se pudo completar la investigación automática.");
              return;
            }
            madeProgress = true;
            setReviewed(x => x + 1);
            if (typeof body.stars === "number") setRated(x => x + 1);
            setDetail(prospect.company + ": " +
              (typeof body.stars === "number" ? body.stars + " estrella(s) respaldadas" :
                "sin evidencia suficiente para estrellas"));
            refresh.current();
            await pause(1200);
          }
          if (!madeProgress) break;
        }
        if (!cancelled) {
          setState(attempts >= 12 ? "limited" : "done");
          if (attempts >= 12)
            setDetail("Se completó el máximo de 12 investigaciones de esta sesión. Los negocios pendientes siguen seguros.");
        }
      } catch (cause) {
        if (cancelled || controller.signal.aborted) return;
        setState("unavailable");
        setDetail(cause instanceof Error ? cause.message : "La investigación no está disponible.");
      } finally {
        cycleActive = false;
      }
    };

    void work();
    // Retry the safe queue hourly while the owner keeps Avalon open. A daily
    // quota and 30-day dedupe ensure there is no runaway network scraping.
    const interval = setInterval(() => { void work(); }, 60 * 60 * 1000);
    // A new radar search changes revision and initiates a fresh queue run.
    return () => { cancelled = true; clearInterval(interval); controller.abort(); };
  }, [revision]);

  return (
    <aside className={s.worker} aria-label="Investigación automática del radar">
      <div className={s.top}>
        <div className={s.title}>
          <span className={s.led} data-active={state === "running" || state === "starting"} aria-hidden="true" />
          <strong>Investigación automática</strong>
        </div>
        <span className={s.status} data-state={state}>
          {state === "starting" ? "Conectando" : state === "running" ? "Analizando negocios" :
            state === "limited" ? "Límite seguro alcanzado" :
              state === "unavailable" ? "Revisión parcial" : "Revisión del lote finalizada"}
        </span>
      </div>
      <div className={s.metrics}>
        <span><strong>{reviewed}</strong> revisados en esta sesión</span>
        <span><strong>{rated}</strong> con estrellas sustentadas</span>
        <span><strong>{pending}</strong> por investigar</span>
        <span><strong>{remaining}</strong> consultas disponibles hoy</span>
      </div>
      {detail && <p className={s.detail} role="status">{detail}</p>}
      <div className={s.serverJob}>
        <strong>Investigador del servidor (con Avalon cerrado)</strong>
        <span>{serverJob
          ? "Última ejecución: " + new Date(serverJob.finished_at).toLocaleString("es") +
            " · " + serverJob.checked + " revisados, " + serverJob.rated +
            " calificados, " + serverJob.converted + " al pipeline"
          : "Aún no hay una ejecución programada confirmada."}</span>
      </div>
      <p className={s.note}>
        Mientras Avalon esté abierto también se revisa la cola al buscar y cada hora.
        El servidor usa una cuota global máxima de 12 investigaciones diarias.
        Sin web o sin evidencia sólida, un negocio permanece «Sin calificar».
      </p>
    </aside>
  );
}
