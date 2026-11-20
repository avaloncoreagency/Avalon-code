"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import type { Row, Stage } from "@/lib/crm/domain";
import { PIPELINE_GROUPS, displayedGroup, groupOfStage, moveRequirement, type PipelineGroup, type PipelineGroupId } from "@/lib/crm/pipeline-groups";
import { pick, type Lang } from "@/lib/i18n";
import s from "./lead-board.module.css";

/** Result of a move as reported by the server; `code` carries business-rule refusals (e.g. won_requires_contract). */
export type MoveError = Error & { code?: string };
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
  /** Persists a group change (versioned update). Rejects with MoveError when the server refuses or the save fails. */
  onMove: (lead: Row, groupId: PipelineGroupId, extra?: { lossReason?: string }) => Promise<void>;
};

type Drag = { id: string; pointerId: number; touch: boolean; startX: number; startY: number; x: number; y: number;
  dx: number; dy: number; width: number; active: boolean; timer: number | null };
const TOUCH_HOLD_MS = 220, MOUSE_SLOP = 5, TOUCH_SLOP = 8;

export function LeadBoard({ lang = "es", leads, total, page, busy, onDetail, onMove }: Props) {
  const t = (es: string, en: string) => pick(lang, es, en);
  const groupLabel = (group: PipelineGroup) => pick(lang, ...group.label);
  const [pending, setPending] = useState<Map<string, PipelineGroupId>>(new Map());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [target, setTarget] = useState<PipelineGroupId | null>(null);
  const [keyboard, setKeyboard] = useState<{ id: string; group: PipelineGroupId } | null>(null);
  const [lostAsk, setLostAsk] = useState<Row | null>(null);
  const [wonBlocked, setWonBlocked] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [announce, setAnnounce] = useState("");
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const labelOf = (id: PipelineGroupId) => groupLabel(PIPELINE_GROUPS.find(g => g.id === id)!);
  const nameOf = (lead: Row) => String(lead.contact || lead.company || t("Sin nombre", "Unnamed"));

  // Optimistic placements end once the server data shows the lead in that group (or the lead left the page).
  useEffect(() => {
    setPending(current => {
      if (current.size === 0) return current;
      const next = new Map(current);
      for (const [id, group] of current) {
        const lead = leads.find(l => String(l.id) === id);
        if (!lead || groupOfStage(lead.stage_id)?.id === group) next.delete(id);
      }
      return next.size === current.size ? current : next;
    });
  }, [leads]);

  const place = (id: string, group: PipelineGroupId | null) => setPending(current => {
    const next = new Map(current);
    if (group) next.set(id, group); else next.delete(id);
    return next;
  });

  const save = useCallback(async (lead: Row, group: PipelineGroupId, lossReason?: string) => {
    const id = String(lead.id);
    place(id, group);
    setNotice("");
    try {
      await onMove(lead, group, lossReason ? { lossReason } : undefined);
      setAnnounce(t(`${nameOf(lead)} movido a ${labelOf(group)}.`, `${nameOf(lead)} moved to ${labelOf(group)}.`));
    } catch (error) {
      place(id, null); // revert to the previous column
      const code = (error as MoveError).code;
      if (code === "won_requires_contract") setWonBlocked(lead);
      else setNotice(code === "stale"
        ? t("Otro propietario cambió esta oportunidad. Se recargó el tablero; vuelve a intentarlo.", "Another owner changed this opportunity. The board was reloaded; try again.")
        : t(`No se guardó el cambio de ${nameOf(lead)}: ${(error as Error).message}. La tarjeta volvió a su grupo.`, `The move of ${nameOf(lead)} was not saved: ${(error as Error).message}. The card returned to its group.`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMove, lang]);

  /** Single entry point for drag, keyboard and touch moves. Lost asks for the required reason first. */
  const commit = useCallback((lead: Row, group: PipelineGroupId) => {
    const id = String(lead.id);
    if (pending.has(id) || displayedGroup(lead, pending) === group) return; // one in-flight move per card
    if (moveRequirement(group) === "loss_reason") { place(id, group); setLostAsk(lead); return; }
    void save(lead, group);
  }, [pending, save]);

  useLayoutEffect(() => { if (lostAsk) reasonRef.current?.focus(); }, [lostAsk]);

  // ---- Pointer drag (mouse, pen and touch; Safari/iPhone uses a short press-and-hold) --------------------------
  const finish = useCallback((dropped: boolean) => {
    const current = dragRef.current;
    dragRef.current = null;
    if (current?.timer) window.clearTimeout(current.timer);
    setDrag(null);
    setTarget(null);
    if (!current?.active) return;
    suppressClick.current = true; // the click that follows a drag must not open the record
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    if (!dropped) return;
    const column = document.elementFromPoint(current.x, current.y)?.closest<HTMLElement>("[data-kanban-group]");
    const group = column?.dataset.kanbanGroup as PipelineGroupId | undefined;
    const lead = leads.find(l => String(l.id) === current.id);
    if (lead && group && PIPELINE_GROUPS.some(g => g.id === group)) commit(lead, group);
  }, [leads, commit]);

  // Window listeners are attached ONCE (not when a drag starts): an early pointercancel/up — e.g. a swipe the browser
  // turns into a scroll — must always reach us, or a stale gesture would block the next touch. Handlers read the latest
  // closures through a ref and ignore pointers that are not the tracked one.
  const handlers = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: (e: PointerEvent) => void; key: (e: globalThis.KeyboardEvent) => void } | null>(null);
  handlers.current = {
    move: event => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      current.x = event.clientX; current.y = event.clientY;
      const distance = Math.hypot(current.x - current.startX, current.y - current.startY);
      if (!current.active) {
        if (current.touch) { if (distance > TOUCH_SLOP) finish(false); return; } // a swipe is a scroll, not a drag
        if (distance < MOUSE_SLOP) return;
        current.active = true;
      }
      const column = document.elementFromPoint(current.x, current.y)?.closest<HTMLElement>("[data-kanban-group]");
      setTarget((column?.dataset.kanbanGroup as PipelineGroupId | undefined) ?? null);
      setDrag({ ...current });
    },
    up: event => { if (dragRef.current && event.pointerId === dragRef.current.pointerId) finish(true); },
    cancel: event => { if (dragRef.current && event.pointerId === dragRef.current.pointerId) finish(false); },
    key: event => { if (event.key === "Escape" && dragRef.current) finish(false); },
  };
  useEffect(() => {
    const move = (e: PointerEvent) => handlers.current?.move(e), up = (e: PointerEvent) => handlers.current?.up(e);
    const cancel = (e: PointerEvent) => handlers.current?.cancel(e), key = (e: globalThis.KeyboardEvent) => handlers.current?.key(e);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, []);

  // While a touch drag is active the page must not scroll. The non-passive listener is attached PERMANENTLY to the board:
  // Safari and Chrome decide at touchstart whether a region has blocking touch listeners, so adding it mid-gesture is ignored.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const blockScroll = (event: TouchEvent) => { if (dragRef.current?.active) event.preventDefault(); };
    node.addEventListener("touchmove", blockScroll, { passive: false });
    return () => node.removeEventListener("touchmove", blockScroll);
  }, []);

  // Edge auto-scroll so a card can reach an offscreen column (board horizontally, page vertically).
  const active = Boolean(drag?.active);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const step = () => {
      const current = dragRef.current, node = scrollRef.current;
      if (current?.active && node) {
        const rect = node.getBoundingClientRect(), edge = Math.min(80, rect.width * 0.18);
        const left = current.x - rect.left, right = rect.right - current.x;
        const strength = left >= 0 && left < edge ? -Math.pow(1 - left / edge, 2) : right >= 0 && right < edge ? Math.pow(1 - right / edge, 2) : 0;
        if (strength) node.scrollLeft += strength * 18;
        if (current.y < 48) window.scrollBy(0, -12); else if (current.y > window.innerHeight - 48) window.scrollBy(0, 12);
        if (strength) {
          const column = document.elementFromPoint(current.x, current.y)?.closest<HTMLElement>("[data-kanban-group]");
          setTarget((column?.dataset.kanbanGroup as PipelineGroupId | undefined) ?? null);
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  function pointerDown(event: ReactPointerEvent<HTMLElement>, lead: Row) {
    if (busy || event.button !== 0 || dragRef.current || pending.has(String(lead.id))) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const touch = event.pointerType === "touch";
    const next: Drag = { id: String(lead.id), pointerId: event.pointerId, touch, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, dx: event.clientX - rect.left, dy: event.clientY - rect.top, width: rect.width, active: false, timer: null };
    if (touch) next.timer = window.setTimeout(() => {
      const current = dragRef.current;
      if (!current || current.id !== next.id) return;
      current.active = true;
      current.timer = null;
      if (navigator.vibrate) navigator.vibrate(8);
      setDrag({ ...current });
    }, TOUCH_HOLD_MS);
    dragRef.current = next;
    setDrag(next);
  }

  // ---- Keyboard alternative: Space picks up, ←/→ choose a group, Space/Enter drops, Escape cancels -----------
  function keyDown(event: KeyboardEvent<HTMLElement>, lead: Row) {
    const id = String(lead.id);
    const order = PIPELINE_GROUPS.map(g => g.id);
    if (keyboard?.id === id) {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const index = Math.max(0, order.indexOf(keyboard.group)) + (event.key === "ArrowRight" ? 1 : -1);
        const group = order[Math.min(order.length - 1, Math.max(0, index))];
        setKeyboard({ id, group });
        setAnnounce(t(`Destino: ${labelOf(group)}`, `Target: ${labelOf(group)}`));
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setKeyboard(null);
        commit(lead, keyboard.group);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setKeyboard(null);
        setAnnounce(t("Movimiento cancelado.", "Move cancelled."));
      }
      return;
    }
    if (event.key === "Enter") { event.preventDefault(); onDetail(lead); }
    else if (event.key === " " && !busy && !pending.has(id)) {
      event.preventDefault();
      const group = displayedGroup(lead, pending) ?? "new";
      setKeyboard({ id, group });
      setAnnounce(t(`${nameOf(lead)} seleccionado. Usa flechas izquierda y derecha para elegir grupo, Espacio para soltar, Escape para cancelar.`,
        `${nameOf(lead)} picked up. Use left and right arrows to choose a group, Space to drop, Escape to cancel.`));
    }
  }

  const columns = PIPELINE_GROUPS.map(group => ({ group, cards: leads.filter(lead => displayedGroup(lead, pending) === group.id) }));
  const unmapped = leads.filter(lead => displayedGroup(lead, pending) === null);
  const dragged = drag?.active ? leads.find(l => String(l.id) === drag.id) : undefined;

  function card(lead: Row) {
    const id = String(lead.id);
    const contact = String(lead.contact ?? "").trim();
    const company = String(lead.company ?? "").trim();
    const first = contact || company || t("Sin nombre", "Unnamed");
    const second = contact ? company : "";
    return (
      <article
        key={id}
        className={s.card}
        role="button"
        tabIndex={0}
        aria-roledescription={t("tarjeta arrastrable", "draggable card")}
        aria-describedby="lead-board-help"
        aria-label={[first, second].filter(Boolean).join(" · ")}
        aria-pressed={keyboard?.id === id ? true : undefined}
        data-lead-id={id}
        data-dragging={drag?.active && drag.id === id ? "true" : undefined}
        data-saving={pending.has(id) && !lostAsk ? "true" : undefined}
        data-picked={keyboard?.id === id ? "true" : undefined}
        onPointerDown={event => pointerDown(event, lead)}
        onClick={() => { if (suppressClick.current || drag?.active) return; onDetail(lead); }}
        onKeyDown={event => keyDown(event, lead)}
        onContextMenu={event => { if (dragRef.current) event.preventDefault(); }}
      >
        <strong title={first}>{first}</strong>
        {second && <span title={second}>{second}</span>}
      </article>
    );
  }

  const highlighted = (group: PipelineGroupId) => (drag?.active && target === group) || keyboard?.group === group;

  return (
    <section aria-label={t("Pipeline de oportunidades", "Opportunity pipeline")} className={s.wrap}>
      <div className={s.intro}>
        <h2>{t("Pipeline", "Pipeline")}</h2>
        <p>{t(`${total} oportunidades · ${leads.length} en la página ${page + 1}`, `${total} opportunities · ${leads.length} on page ${page + 1}`)}</p>
      </div>
      <p id="lead-board-help" className={s.srOnly}>{t("Toca o pulsa Intro para abrir la ficha. Arrastra la tarjeta (en móvil, mantén pulsado) o pulsa Espacio y usa las flechas para cambiar de grupo.",
        "Tap or press Enter to open the record. Drag the card (on mobile, press and hold) or press Space and use the arrows to change group.")}</p>
      <p className={s.srOnly} aria-live="polite">{announce}</p>
      {notice && <p className={s.notice} role="alert">{notice}</p>}
      <div ref={scrollRef} className={s.scroll} data-dragging={drag?.active ? "true" : undefined} role="region" tabIndex={-1}
        aria-label={t("Columnas del pipeline", "Pipeline columns")}>
        <div className={s.board}>
          {columns.map(({ group, cards }) => (
            <section key={group.id} className={s.column} data-kanban-group={group.id} data-drop-target={highlighted(group.id) ? "true" : undefined} aria-label={groupLabel(group)}>
              <header className={s.columnHead}>
                <h3>{groupLabel(group)}</h3>
                <span aria-label={cards.length + t(" en esta página", " on this page")}>{cards.length}</span>
              </header>
              <div className={s.cards}>
                {cards.map(card)}
                {cards.length === 0 && <p className={s.empty}>{t("Suelta aquí", "Drop here")}</p>}
              </div>
            </section>
          ))}
          {unmapped.length > 0 && (
            <section className={s.column} data-unmapped="true" aria-label={t("Etapas por revisar", "Stages to review")}>
              <header className={s.columnHead}>
                <h3>{t("Por revisar", "To review")}</h3>
                <span>{unmapped.length}</span>
              </header>
              <p className={s.hint}>{t("Etapas personalizadas sin grupo. Arrástralas a un grupo al revisarlas.", "Custom stages with no group. Drag them into a group once reviewed.")}</p>
              <div className={s.cards}>{unmapped.map(card)}</div>
            </section>
          )}
        </div>
      </div>
      {dragged && drag && (
        <div className={s.ghost} aria-hidden="true" style={{ width: drag.width, transform: `translate3d(${drag.x - drag.dx}px, ${drag.y - drag.dy}px, 0)` }}>
          <strong>{String(dragged.contact || dragged.company || "")}</strong>
          {dragged.contact && dragged.company ? <span>{String(dragged.company)}</span> : null}
        </div>
      )}
      <p className={s.footnote}>{t("Hasta 50 registros por página; los conteos son de esta página. Cerrar una oportunidad no crea un cliente ni una venta automáticamente.",
        "Up to 50 records per page; counts are for this page. Closing an opportunity never creates a client or a sale automatically.")}</p>

      {lostAsk && (
        <div className={s.scrim} onClick={event => { if (event.target === event.currentTarget) { place(String(lostAsk.id), null); setLostAsk(null); } }}>
          <form className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="lost-title"
            onSubmit={event => {
              event.preventDefault();
              const reason = (reasonRef.current?.value ?? "").trim();
              if (!reason) return;
              const lead = lostAsk;
              setLostAsk(null);
              void save(lead, "lost", reason.slice(0, 1000));
            }}
            onKeyDown={event => { if (event.key === "Escape") { place(String(lostAsk.id), null); setLostAsk(null); } }}>
            <h3 id="lost-title">{t(`Mover ${nameOf(lostAsk)} a Perdido`, `Move ${nameOf(lostAsk)} to Lost`)}</h3>
            <label>{t("Motivo de pérdida (obligatorio)", "Loss reason (required)")}
              <textarea ref={reasonRef} required maxLength={1000} rows={3} defaultValue={String(lostAsk.loss_reason ?? "")} />
            </label>
            <p className={s.hint}>{t("El historial y los datos comerciales se conservan. Podrás recuperarla arrastrándola a otro grupo.", "History and commercial data are kept. You can recover it by dragging it to another group.")}</p>
            <div className={s.dialogActions}>
              <button type="button" onClick={() => { place(String(lostAsk.id), null); setLostAsk(null); }}>{t("Cancelar", "Cancel")}</button>
              <button type="submit" data-primary="true">{t("Mover a Perdido", "Move to Lost")}</button>
            </div>
          </form>
        </div>
      )}

      {wonBlocked && (
        <div className={s.scrim} onClick={event => { if (event.target === event.currentTarget) setWonBlocked(null); }}>
          <div className={s.dialog} role="alertdialog" aria-modal="true" aria-labelledby="won-title" aria-describedby="won-body"
            onKeyDown={event => { if (event.key === "Escape") setWonBlocked(null); }}>
            <h3 id="won-title">{t(`${nameOf(wonBlocked)} aún no puede marcarse como Ganado`, `${nameOf(wonBlocked)} cannot be marked Won yet`)}</h3>
            <p id="won-body">{t("Regla comercial: Ganado requiere un contrato firmado y verificado. Al confirmar una venta real con ese contrato, la oportunidad pasa a Ganado automáticamente. La tarjeta volvió a su grupo; no se creó ninguna venta.",
              "Business rule: Won requires a signed, verified contract. Confirming a real sale with that contract moves the opportunity to Won automatically. The card returned to its group; no sale was created.")}</p>
            <div className={s.dialogActions}>
              <button type="button" onClick={() => setWonBlocked(null)} autoFocus>{t("Cerrar", "Close")}</button>
              <Link href={`/admin/workspace/crm/lead/${String(wonBlocked.id)}`}>{t("Contratos en la ficha", "Contracts in the record")}</Link>
              <Link data-primary="true" href={`/admin/workspace/crm/sales/new?lead=${encodeURIComponent(String(wonBlocked.id))}`}>{t("Registrar venta", "Record sale")}</Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
