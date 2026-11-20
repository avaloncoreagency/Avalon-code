"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import type { Row, Stage } from "@/lib/crm/domain";
import { followUpState } from "@/lib/crm/kanban";
import { PIPELINE_GROUPS, groupOfStage, groupPipelineFive, moveTarget, neighbourGroup, type PipelineGroup } from "@/lib/crm/pipeline-groups";
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
  const { columns, unmapped } = groupPipelineFive(leads);
  const t = (es: string, en: string) => pick(lang, es, en);
  const groupLabel = (group: PipelineGroup) => pick(lang, ...group.label);
  const stageLabel = (id: unknown) => stages.find((stage) => stage.id === String(id ?? ""))?.label ?? String(id ?? "");
  /** Moving into a group writes its canonical stage; a lead already in that group keeps its detailed stage. */
  const moveToGroup = (lead: Row, groupId: string) => {
    const stageId = moveTarget(lead, groupId, stages);
    if (stageId) onMove(lead, stageId);
  };

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
            const column = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>("[data-kanban-group]");
            if (column && node.contains(column)) setTargetId((current) => current === column.dataset.kanbanGroup ? current : column.dataset.kanbanGroup ?? null);
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

  function drop(event: DragEvent<HTMLElement>, groupId: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/x-avalon-lead") || draggedId;
    setDraggedId(null);
    setTargetId(null);
    dragPointer.current = null;
    if (busy || !id) return;
    const lead = leads.find((item) => String(item.id) === id);
    if (lead) moveToGroup(lead, groupId);
  }

  function card(lead: Row) {
    const followUp = followUpState(lead.follow_up_at);
    const group = groupOfStage(lead.stage_id);
    const previousGroup = neighbourGroup(lead, -1);
    const nextGroup = neighbourGroup(lead, 1);
    const company = String(lead.company || t("Empresa sin nombre", "Unnamed business"));
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
          {/* Primary action: the lead's own interactive record (notes, files, history) — not Clients 360. */}
          <button type="button" className={s.openRecord} disabled={busy} onClick={() => onDetail(lead)} draggable={false}
            aria-label={t(`Abrir ficha de ${company}`, `Open record for ${company}`)}>
            <strong>{company}</strong>
          </button>
          {lead.priority === "high" && <span title={t("Prioridad definida en CRM", "Priority set in CRM")}>{t("Prioridad alta", "High priority")}</span>}
        </div>
        <p className={s.stageDetail}>{t("Etapa", "Stage")}: {stageLabel(lead.stage_id)}</p>
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
        <div className={s.quickStage} aria-label={t(`Mover ${company} por el pipeline`, `Move ${company} through pipeline`)}>
          <button type="button" disabled={busy || !previousGroup} onClick={() => previousGroup && moveToGroup(lead, previousGroup.id)} aria-label={t(`Retroceder a ${previousGroup ? groupLabel(previousGroup) : "grupo anterior"}`, `Move back to ${previousGroup ? groupLabel(previousGroup) : "previous group"}`)} title={previousGroup ? groupLabel(previousGroup) : undefined}>
            ← {t("Anterior", "Previous")}
          </button>
          <button type="button" disabled={busy || !nextGroup} onClick={() => nextGroup && moveToGroup(lead, nextGroup.id)} aria-label={t(`Avanzar a ${nextGroup ? groupLabel(nextGroup) : "grupo siguiente"}`, `Advance to ${nextGroup ? groupLabel(nextGroup) : "next group"}`)} title={nextGroup ? groupLabel(nextGroup) : undefined}>
            {t("Avanzar", "Advance")} →
          </button>
        </div>
        <label className={s.change}>
          {t("Cambiar grupo", "Change group")}
          <select
            aria-label={t(`Grupo de ${company}`, `Group for ${company}`)}
            disabled={busy}
            value={group?.id ?? ""}
            onChange={(event) => moveToGroup(lead, event.target.value)}
          >
            {!group && <option value="" disabled>{t(`Por revisar (${stageLabel(lead.stage_id)})`, `To review (${stageLabel(lead.stage_id)})`)}</option>}
            {PIPELINE_GROUPS.map((option) => <option key={option.id} value={option.id}>{groupLabel(option)}</option>)}
          </select>
        </label>
        <div className={s.actions}>
          <button type="button" disabled={busy} onClick={() => onDetail(lead)}>{t("Ficha", "Details")}</button>
          <Link href={`/admin/workspace/crm/lead/${String(lead.id)}?tab=summary&edit=1#lead-edit`} draggable={false}>{t("Editar datos", "Edit profile")}</Link>
          {!lead.archived && <Link href={`/admin/workspace/crm/sales/new?lead=${encodeURIComponent(String(lead.id))}`} draggable={false} aria-label={t(`Registrar venta para ${company}`, `Record sale for ${company}`)}>{t("Registrar venta", "Record sale")}</Link>}
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
  }

  return (
    <section aria-label={t("Pipeline de oportunidades", "Opportunity pipeline")} className={s.wrap}>
      <div className={s.intro}>
        <div>
          <h2>{t("Tu pipeline en 5 grupos", "Your pipeline in 5 groups")}</h2>
          <p>{t(`${total} oportunidades con estos filtros · mostrando ${leads.length} en la página ${page + 1}.`, `${total} opportunities with these filters · showing ${leads.length} on page ${page + 1}.`)}</p>
        </div>
        <p>{t("Toca el nombre de la empresa para abrir su ficha con notas, archivos e historial. Arrastra la tarjeta o usa Cambiar grupo; la etapa detallada se conserva.", "Tap the company name to open its record with notes, files and history. Drag the card or use Change group; the detailed stage is kept.")}</p>
      </div>
      <div ref={scrollRef} className={s.scroll} data-dragging={draggedId ? "true" : undefined} role="region" tabIndex={0} aria-label={t("Columnas del pipeline; desplázate horizontalmente para ver todos los grupos", "Pipeline columns; scroll horizontally to see all groups")}>
        <div className={s.board}>
          {columns.map(({ group, leads: cards, estimatedValue }) => (
            <section
              className={s.column}
              key={group.id}
              data-kanban-group={group.id}
              data-drop-target={targetId === group.id ? "true" : undefined}
              aria-label={groupLabel(group)}
              onDragOver={(event) => { if (!busy) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
              onDragEnter={(event) => { if (!busy && draggedId) { event.preventDefault(); setTargetId(group.id); } }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setTargetId(null); }}
              onDrop={(event) => drop(event, group.id)}
            >
              <header className={s.columnHead}>
                <div className={s.stageTitle}>
                  <h3>{groupLabel(group)}</h3>
                  <span aria-label={cards.length + t(" oportunidades en esta página", " opportunities on this page")}>{cards.length}</span>
                </div>
                <small>{estimatedValue > 0 ? currency(estimatedValue, lang) + t(" estimados en esta página", " estimated on this page") : t("Sin valor estimado en esta página", "No estimated value on this page")}</small>
              </header>
              <div className={s.cards}>
                {cards.map((lead) => card(lead))}
                {cards.length === 0 && <p className={s.empty}>{t("Sin oportunidades en este grupo en la página actual.", "No opportunities in this group on the current page.")}</p>}
              </div>
            </section>
          ))}
          {unmapped.length > 0 && (
            <section className={s.column} data-unmapped="true" aria-label={t("Etapas por revisar", "Stages to review")}>
              <header className={s.columnHead}>
                <div className={s.stageTitle}>
                  <h3>{t("Etapas por revisar", "Stages to review")}</h3>
                  <span aria-label={unmapped.length + t(" oportunidades en esta página", " opportunities on this page")}>{unmapped.length}</span>
                </div>
                <small>{t("Estas etapas personalizadas no pertenecen a ningún grupo. No se ocultan ni se marcan como ganadas: muévelas a un grupo cuando las revises.", "These custom stages belong to no group. They are not hidden or marked won: move them to a group once reviewed.")}</small>
              </header>
              <div className={s.cards}>{unmapped.map((lead) => card(lead))}</div>
            </section>
          )}
        </div>
      </div>
      <p className={s.footnote}>{t("Los importes son estimaciones, no ingresos cobrados. El tablero agrupa hasta 50 registros por página (los conteos son de esta página); usa Anterior/Siguiente para consultar el resto. Cerrar un lead no crea un cliente automáticamente.", "Amounts are estimates, not collected revenue. The board groups up to 50 records per page (counts are for this page); use Previous/Next for the rest. Closing a lead does not automatically create a client.")}</p>
    </section>
  );
}
