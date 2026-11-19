"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import type { Row, Stage } from "@/lib/crm/domain";
import { followUpState, groupPipeline } from "@/lib/crm/kanban";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import s from "./lead-board.module.css";

type Props = {
  lang?: Lang;
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

const currency = (value: number, lang: Lang) =>
  new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const priorityText: Record<string, [string, string]> = { high: ["Alta", "High"], normal: ["Normal", "Normal"], low: ["Baja", "Low"] };

export function LeadBoard({ lang = "es", stages, leads, total, page, busy, currentOwnerId, onEdit, onDetail, onMove }: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragPointer = useRef<{ x: number; y: number } | null>(null);
  const columns = groupPipeline(stages, leads);
  const openStages = stages.filter((stage) => stage.kind === "open");
  const t = (es: string, en: string) => pick(lang, es, en);

  // Native drag-and-drop does not scroll overflow containers when a card reaches
  // an offscreen column. A frame loop keeps scrolling even when dragover pauses.
  useEffect(() => {
    if (!draggedId) return;
    let frame = 0;
    const trackPointer = (event: globalThis.DragEvent) => {
      dragPointer.current = { x: event.clientX, y: event.clientY };
    };
    const scrollAtEdge = () => {
      const node = scrollRef.current;
      const pointer = dragPointer.current;
      if (node && pointer) {
        const rect = node.getBoundingClientRect();
        if (pointer.y >= rect.top - 40 && pointer.y <= rect.bottom + 40) {
          const edge = Math.min(110, rect.width * 0.22);
          const leftDistance = pointer.x - rect.left;
          const rightDistance = rect.right - pointer.x;
          const strength = leftDistance >= 0 && leftDistance < edge
            ? -Math.pow(1 - leftDistance / edge, 2)
            : rightDistance >= 0 && rightDistance < edge
              ? Math.pow(1 - rightDistance / edge, 2)
              : 0;
          if (strength) {
            node.scrollLeft += strength * 25;
            // Scrolling changes the column beneath a stationary drag pointer.
            const column = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>("[data-kanban-stage]");
            if (column && node.contains(column)) setTargetId((current) => current === column.dataset.kanbanStage ? current : column.dataset.kanbanStage ?? null);
          }
        }
      }
      frame = requestAnimationFrame(scrollAtEdge);
    };
    window.addEventListener("dragover", trackPointer);
    frame = requestAnimationFrame(scrollAtEdge);
    return () => {
      window.removeEventListener("dragover", trackPointer);
      cancelAnimationFrame(frame);
      dragPointer.current = null;
    };
  }, [draggedId]);

  function drop(event: DragEvent<HTMLElement>, stageId: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/x-avalon-lead") || draggedId;
    setDraggedId(null);
    setTargetId(null);
    dragPointer.current = null;
    if (busy || !id) return;
    const lead = leads.find((item) => String(item.id) === id);
    if (lead && String(lead.stage_id) !== stageId) onMove(lead, stageId);
  }

  return (
    <section aria-label={t("Pipeline de oportunidades", "Opportunity pipeline")} className={s.wrap}>
      <div className={s.intro}>
        <div>
          <h2>{t("Tu pipeline, etapa por etapa", "Your pipeline, stage by stage")}</h2>
          <p>{t(`${total} oportunidades con estos filtros · mostrando ${leads.length} en la página ${page + 1}.`, `${total} opportunities with these filters · showing ${leads.length} on page ${page + 1}.`)}</p>
        </div>
        <p>{t("Arrastra una tarjeta o usa Cambiar etapa. Abre Ficha para las notas y el historial.", "Drag a card or use Change stage. Open Details for notes and history.")}</p>
      </div>
      <div ref={scrollRef} className={s.scroll} data-dragging={draggedId ? "true" : undefined} role="region" tabIndex={0} aria-label={t("Columnas del pipeline; desplázate horizontalmente para ver todas las etapas", "Pipeline columns; scroll horizontally to see all stages")}>
        <div className={s.board}>
          {columns.map(({ stage, leads: cards, estimatedValue }) => (
            <section
              className={s.column}
              key={stage.id}
              data-kanban-stage={stage.id}
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
                  <span aria-label={cards.length + t(" oportunidades", " opportunities")}>{cards.length}</span>
                </div>
                <small>{estimatedValue > 0 ? currency(estimatedValue, lang) + t(" estimados", " estimated") : t("Sin valor estimado en esta página", "No estimated value on this page")}</small>
              </header>
              <div className={s.cards}>
                {cards.map((lead) => {
                  const followUp = followUpState(lead.follow_up_at);
                  const stagePosition = openStages.findIndex((stage) => stage.id === String(lead.stage_id));
                  const previousStage = stagePosition > 0 ? openStages[stagePosition - 1] : null;
                  const nextStage = stagePosition >= 0 ? openStages[stagePosition + 1] : null;
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
                      onDragEnd={() => { setDraggedId(null); setTargetId(null); dragPointer.current = null; }}
                    >
                      <div className={s.cardTitle}>
                        <strong>{String(lead.company || t("Empresa sin nombre", "Unnamed business"))}</strong>
                        {lead.priority === "high" && <span title={t("Prioridad definida en CRM", "Priority set in CRM")}>{t("Prioridad alta", "High priority")}</span>}
                      </div>
                      <p className={s.contact}>{lead.contact ? String(lead.contact) : t("Contacto por completar", "Contact details missing")}</p>
                      <p className={s.value}>{Number(lead.value) > 0 ? currency(Number(lead.value), lang) : t("Valor por estimar", "Value not estimated")}</p>
                      <p className={s.next} data-overdue={followUp === "overdue" ? "true" : undefined}>
                        {followUp === "overdue" ? t("Seguimiento vencido", "Overdue follow-up") :
                          followUp === "today" ? t("Seguimiento hoy", "Follow-up today") :
                          followUp === "scheduled" ? t("Próximo seguimiento", "Next follow-up") : t("Sin seguimiento programado", "No follow-up scheduled")}
                        {followUp !== "missing" && <small>{formatDate(lang, String(lead.follow_up_at))}</small>}
                      </p>
                      <p className={s.meta}>
                        {lead.owner_id === currentOwnerId ? t("Responsable: tú", "Owner: you") : lead.owner_id ? t("Responsable: otro propietario", "Owner: another owner") : t("Sin responsable", "Unassigned")}
                        {" · "}{(priorityText[String(lead.priority)] ? pick(lang, ...priorityText[String(lead.priority)]) : t("Prioridad no indicada", "Priority not set"))}
                      </p>
                      <p className={s.source} title={String(lead.source ?? "")}>{t("Origen", "Source")}: {String(lead.source || t("Sin registrar", "Not recorded"))}</p>
                      <div className={s.quickStage} aria-label={t(`Mover ${String(lead.company)} por el pipeline`, `Move ${String(lead.company)} through pipeline`)}>
                        <button type="button" disabled={busy || !previousStage} onClick={() => previousStage && onMove(lead, previousStage.id)} aria-label={t(`Retroceder a ${previousStage?.label ?? "etapa anterior"}`, `Move back to ${previousStage?.label ?? "previous stage"}`)} title={previousStage?.label}>
                          ← {t("Anterior", "Previous")}
                        </button>
                        <button type="button" disabled={busy || !nextStage} onClick={() => nextStage && onMove(lead, nextStage.id)} aria-label={t(`Avanzar a ${nextStage?.label ?? "etapa siguiente"}`, `Advance to ${nextStage?.label ?? "next stage"}`)} title={nextStage?.label}>
                          {t("Avanzar", "Advance")} →
                        </button>
                      </div>
                      <label className={s.change}>
                        {t("Ir a otra etapa", "Jump to another stage")}
                        <select
                          aria-label={t(`Etapa de ${String(lead.company)}`, `Stage for ${String(lead.company)}`)}
                          disabled={busy}
                          value={String(lead.stage_id)}
                          onChange={(event) => onMove(lead, event.target.value)}
                        >
                          {stages.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                      </label>
                      <div className={s.actions}>
                        <button type="button" disabled={busy} onClick={() => onDetail(lead)}>{t("Ficha", "Details")}</button>
                        <Link href={`/admin/workspace/crm/lead/${String(lead.id)}?tab=summary&edit=1#lead-edit`} draggable={false}>{t("Editar datos", "Edit profile")}</Link>
                        {!lead.archived && <Link href={`/admin/workspace/crm/sales/new?lead=${encodeURIComponent(String(lead.id))}`} draggable={false} aria-label={t(`Registrar venta para ${String(lead.company)}`, `Record sale for ${String(lead.company)}`)}>{t("Registrar venta", "Record sale")}</Link>}
                        <details className={s.moreActions}>
                          <summary>{t("Más opciones", "More options")}</summary>
                          <div className={s.moreLinks}>
                            <button type="button" disabled={busy} onClick={() => onEdit(lead)}>{t("Edición rápida", "Quick edit")}</button>
                            <Link href={`/admin/workspace/crm/lead/${String(lead.id)}`} draggable={false}>{t("Revisar oportunidad", "Review deal")}</Link>
                            <Link href={`/admin/workspace/clients/${String(lead.id)}`} draggable={false}>{t("Proyectos", "Projects")}</Link>
                          </div>
                        </details>
                      </div>
                    </article>
                  );
                })}
                {cards.length === 0 && <p className={s.empty}>{t("Sin oportunidades en esta etapa de la página actual.", "No opportunities in this stage on the current page.")}</p>}
              </div>
            </section>
          ))}
        </div>
      </div>
      <p className={s.footnote}>{t("Los importes son estimaciones, no ingresos cobrados. El tablero agrupa hasta 50 registros por página; usa Anterior/Siguiente para consultar el resto. Cerrar un lead no crea un cliente automáticamente.", "Amounts are estimates, not collected revenue. The board groups up to 50 records per page; use Previous/Next for the rest. Closing a lead does not automatically create a client.")}</p>
    </section>
  );
}
