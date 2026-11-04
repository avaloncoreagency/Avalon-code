"use client";

import { useState, type DragEvent } from "react";
import Link from "next/link";
import type { Row, Stage } from "@/lib/crm/domain";
import { followUpState, groupPipeline } from "@/lib/crm/kanban";
import s from "./lead-board.module.css";

type Props = {
  stages: Stage[];
  leads: Row[];
  total: number;
  page: number;
  busy: boolean;
  currentOwnerId: string;
  onEdit: (lead: Row) => void;
  onDetail: (lead: Row) => void;
  onMove: (lead: Row, stageId: string) => void;
};

const currency = (value: number) =>
  new Intl.NumberFormat("es-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const dateText = (value: unknown) => {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(date)
    : "";
};
const priorityText: Record<string, string> = { high: "Alta", normal: "Normal", low: "Baja" };

export function LeadBoard({ stages, leads, total, page, busy, currentOwnerId, onEdit, onDetail, onMove }: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const columns = groupPipeline(stages, leads);

  function drop(event: DragEvent<HTMLElement>, stageId: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/x-avalon-lead") || draggedId;
    setDraggedId(null);
    setTargetId(null);
    if (busy || !id) return;
    const lead = leads.find((item) => String(item.id) === id);
    if (lead && String(lead.stage_id) !== stageId) onMove(lead, stageId);
  }

  return (
    <section aria-label="Pipeline de oportunidades" className={s.wrap}>
      <div className={s.intro}>
        <div>
          <h2>Tu pipeline, etapa por etapa</h2>
          <p>{total} oportunidades con estos filtros · mostrando {leads.length} en la página {page + 1}.</p>
        </div>
        <p>Arrastra una tarjeta o usa <strong>Cambiar etapa</strong>. Abre <strong>Ficha</strong> para las notas y el historial.</p>
      </div>
      <div className={s.scroll} role="region" tabIndex={0} aria-label="Columnas del pipeline; desplázate horizontalmente para ver todas las etapas">
        <div className={s.board}>
          {columns.map(({ stage, leads: cards, estimatedValue }) => (
            <section
              className={s.column}
              key={stage.id}
              data-drop-target={targetId === stage.id ? "true" : undefined}
              aria-label={stage.label}
              onDragOver={(event) => { if (!busy) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
              onDragEnter={(event) => { if (!busy && draggedId) { event.preventDefault(); setTargetId(stage.id); } }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setTargetId(null); }}
              onDrop={(event) => drop(event, stage.id)}
            >
              <header className={s.columnHead}>
                <div className={s.stageTitle}>
                  <h3>{stage.label}</h3>
                  <span aria-label={cards.length + " oportunidades"}>{cards.length}</span>
                </div>
                <small>{estimatedValue > 0 ? currency(estimatedValue) + " estimados" : "Sin valor estimado en esta página"}</small>
              </header>
              <div className={s.cards}>
                {cards.map((lead) => {
                  const followUp = followUpState(lead.follow_up_at);
                  return (
                    <article
                      className={s.card}
                      key={String(lead.id)}
                      draggable={!busy}
                      onDragStart={(event) => {
                        const id = String(lead.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("application/x-avalon-lead", id);
                        setDraggedId(id);
                      }}
                      onDragEnd={() => { setDraggedId(null); setTargetId(null); }}
                    >
                      <div className={s.cardTitle}>
                        <strong>{String(lead.company || "Empresa sin nombre")}</strong>
                        {lead.priority === "high" && <span title="Prioridad definida en CRM">Prioridad alta</span>}
                      </div>
                      <p className={s.contact}>{lead.contact ? String(lead.contact) : "Contacto por completar"}</p>
                      <p className={s.value}>{Number(lead.value) > 0 ? currency(Number(lead.value)) : "Valor por estimar"}</p>
                      <p className={s.next} data-overdue={followUp === "overdue" ? "true" : undefined}>
                        {followUp === "overdue" ? "Seguimiento vencido" :
                          followUp === "today" ? "Seguimiento hoy" :
                          followUp === "scheduled" ? "Próximo seguimiento" : "Sin seguimiento programado"}
                        {followUp !== "missing" && <small>{dateText(lead.follow_up_at)}</small>}
                      </p>
                      <p className={s.meta}>
                        {lead.owner_id === currentOwnerId ? "Responsable: tú" : "Responsable: otro propietario"}
                        {" · "}{priorityText[String(lead.priority)] ?? "Prioridad no indicada"}
                      </p>
                      <p className={s.source} title={String(lead.source ?? "")}>Origen: {String(lead.source || "Sin registrar")}</p>
                      <label className={s.change}>
                        Cambiar etapa
                        <select
                          aria-label={`Etapa de ${String(lead.company)}`}
                          disabled={busy}
                          value={String(lead.stage_id)}
                          onChange={(event) => onMove(lead, event.target.value)}
                        >
                          {stages.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                      </label>
                      <div className={s.actions}>
                        <button type="button" disabled={busy} onClick={() => onDetail(lead)}>Ficha</button>
                        <button type="button" disabled={busy} onClick={() => onEdit(lead)}>Editar</button>
                        <Link href={`/admin/workspace/crm/sales/new?lead=${encodeURIComponent(String(lead.id))}`} draggable={false} aria-label={`Registrar venta para ${String(lead.company)}`}>Registrar venta</Link>
                        <Link href={`/admin/workspace/clients/${String(lead.id)}`} draggable={false}>Proyectos</Link>
                      </div>
                    </article>
                  );
                })}
                {cards.length === 0 && <p className={s.empty}>Sin oportunidades en esta etapa de la página actual.</p>}
              </div>
            </section>
          ))}
        </div>
      </div>
      <p className={s.footnote}>Los importes son estimaciones, no ingresos cobrados. El tablero agrupa hasta 50 registros por página; usa Anterior/Siguiente para consultar el resto. Cerrar un lead no crea un cliente automáticamente.</p>
    </section>
  );
}
