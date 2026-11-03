"use client";

import { useEffect, useRef, useState } from "react";
import s from "./radar-auto-research.module.css";

type Pending = { id: string; company: string };
type Queue = { batch: Pending[]; pending: number; remaining: number; max_daily: number; error?: string };
type Result = { ok?: boolean; error?: string; stars?: number | null; report?: { status?: string } };

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
  const refresh = useRef(onChanged);
  refresh.current = onChanged;

  useEffect(() => {
    let cancelled = false;
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
      }
    };

    void work();
    // A new radar search changes revision and initiates a fresh queue run.
    return () => { cancelled = true; controller.abort(); };
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
      <p className={s.note}>
        Se inicia solo al abrir el radar o buscar negocios. Sin clics adicionales, máximo 12 informes diarios por propietario.
        Los sitios sin web verificable o sin oportunidades comprobadas permanecen «Sin calificar».
        Esta versión requiere una sesión de propietario activa.
      </p>
    </aside>
  );
}
