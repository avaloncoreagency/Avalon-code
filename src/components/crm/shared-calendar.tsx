"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BANNER_THEMES, CALENDAR_COLORS, EVENT_KINDS, dayInZone, eventOnDay,
  hourInZone, isCalendarDay, localInput, moveDay, moveMonth, visibleDays,
  type CalendarEvent, type CalendarView, type DayBanner, type OwnerOption,
} from "@/lib/crm/shared-calendar";
import {
  cancelCalendarEvent, deleteCalendarBanner, saveCalendarBanner, saveCalendarEvent,
} from "@/app/admin/workspace/crm/calendar/actions";
import s from "./shared-calendar.module.css";

type Client = { id: string; legal_name: string };
type Lead = { id: string; company: string };
type Props = {
  events: CalendarEvent[]; banners: DayBanner[]; owners: OwnerOption[];
  clients: Client[]; leads: Lead[]; userId: string;
  initialDate: string; initialView: CalendarView; lang: "es" | "en";
  dataError?: string;
};
type DraftEvent = {
  id?: string; version?: number; title: string; owner_id: string;
  attendee_ids: string[]; kind: string; color: string; all_day: boolean;
  start_local: string; end_local: string; start_day: string; end_day: string;
  description: string; location: string; meeting_url: string; participants: string;
  lead_id: string; client_id: string; status?: string;
};
const P = "/admin/workspace/crm/calendar";
const TYPE: Record<string, [string, string]> = {
  meeting: ["Reunión", "Meeting"], appointment: ["Cita", "Appointment"],
  call: ["Llamada", "Call"], "follow-up": ["Seguimiento", "Follow-up"],
  task: ["Bloque de trabajo", "Work block"], personal: ["Personal", "Personal"],
};
const COLOR_LABELS = ["Morado", "Azul", "Turquesa", "Verde", "Ámbar", "Rojo", "Rosa", "Gris"];
const THEME_LABELS: Record<string, [string, string]> = {
  violet: ["Celebración", "Celebration"], blue: ["Azul", "Blue"],
  teal: ["Océano", "Ocean"], green: ["Verde", "Green"],
  amber: ["Dorado", "Golden"], rose: ["Rosa", "Rose"],
};
const pad = (v: number) => String(v).padStart(2, "0");
const localToday = () => {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
const colorStyle = (value: string) => ({ "--calendar-accent": CALENDAR_COLORS.includes(value as typeof CALENDAR_COLORS[number]) ? value : CALENDAR_COLORS[0] }) as CSSProperties;
function downloadIcs(event: CalendarEvent) {
  const escape = (v: string) => v.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, "\\$&");
  const instant = (v: string) => new Date(v).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = (v: string) => v.slice(0, 10).replace(/-/g, "");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Avalon Core Agency//Shared Calendar//ES",
    "BEGIN:VEVENT", "UID:" + event.id + "@avaloncoreagency.com",
    "DTSTAMP:" + instant(new Date().toISOString()),
    event.all_day ? "DTSTART;VALUE=DATE:" + day(event.starts_at) : "DTSTART:" + instant(event.starts_at),
    event.all_day ? "DTEND;VALUE=DATE:" + day(event.ends_at) : "DTEND:" + instant(event.ends_at),
    "SUMMARY:" + escape(event.title), "DESCRIPTION:" + escape(event.description),
    "LOCATION:" + escape(event.location),
    event.meeting_url ? "URL:" + escape(event.meeting_url) : "",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([lines], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "avalon-" + event.id + ".ics";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function SharedCalendar({ events, banners, owners, clients, leads, userId, initialDate, initialView, lang, dataError }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(isCalendarDay(initialDate) ? initialDate : localToday());
  const [view, setView] = useState<CalendarView>(initialView);
  const [selected, setSelected] = useState(isCalendarDay(initialDate) ? initialDate : localToday());
  const [filter, setFilter] = useState("all");
  const [zone, setZone] = useState("America/New_York");
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [bannerDraft, setBannerDraft] = useState<DayBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const t = (es: string, en: string) => lang === "es" ? es : en;

  useEffect(() => { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"); }, []);
  // Two open owner sessions see each other's changes without an external paid service.
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden && !draft && !bannerDraft) router.refresh(); }, 120000);
    return () => window.clearInterval(timer);
  }, [router, draft, bannerDraft]);

  const ownerName = (id: string) => owners.find(o => o.user_id === id)?.email.split("@")[0] || t("Propietario", "Owner");
  const filtered = useMemo(() => events.filter(e =>
    e.status !== "cancelled" && (filter === "all" || e.owner_id === filter || (e.attendee_ids || []).includes(filter))
  ), [events, filter]);
  const days = useMemo(() => visibleDays(date, view), [date, view]);
  const dayEvents = (day: string) => filtered.filter(e => eventOnDay(e, day, zone))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const onDay = dayEvents(selected);
  const today = localToday();
  const title = new Intl.DateTimeFormat(lang === "es" ? "es-419" : "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(date.slice(0, 7) + "-01T12:00:00Z"));
  const dateLabel = (day: string) => new Intl.DateTimeFormat(lang === "es" ? "es-419" : "en-US",
    { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
  const timeLabel = (event: CalendarEvent) => {
    if (event.all_day) return t("Todo el día", "All day");
    const fmt = new Intl.DateTimeFormat(lang === "es" ? "es-419" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: zone });
    return fmt.format(new Date(event.starts_at)) + " – " + fmt.format(new Date(event.ends_at));
  };
  const bannerFor = (day: string) => banners.find(b => b.day === day);
  const navigate = (target: string, mode: CalendarView = view) => {
    if (!isCalendarDay(target)) return;
    setDate(target); setSelected(target); setView(mode);
    router.push(P + "?date=" + encodeURIComponent(target) + "&view=" + mode, { scroll: false });
  };
  const previous = () => navigate(view === "month" ? moveMonth(date, -1) : moveDay(date, view === "week" ? -7 : -1));
  const next = () => navigate(view === "month" ? moveMonth(date, 1) : moveDay(date, view === "week" ? 7 : 1));

  const newEvent = (day = selected, hour = 9) => {
    const h = Math.min(Math.max(hour, 0), 23);
    setSelected(day); setModalError("");
    setDraft({
      title: "", owner_id: userId, attendee_ids: owners.map(o => o.user_id),
      kind: "meeting", color: CALENDAR_COLORS[0], all_day: false,
      start_local: day + "T" + pad(h) + ":00",
      end_local: (h === 23 ? moveDay(day, 1) : day) + "T" + pad((h + 1) % 24) + ":00",
      start_day: day, end_day: day,
      description: "", location: "", meeting_url: "", participants: "", lead_id: "", client_id: "",
    });
  };
  const editEvent = (event: CalendarEvent) => {
    setModalError("");
    const startDay = event.all_day ? event.starts_at.slice(0, 10) : dayInZone(event.starts_at, zone);
    setDraft({
      ...event, owner_id: event.owner_id, attendee_ids: event.attendee_ids || [],
      start_local: localInput(event.starts_at), end_local: localInput(event.ends_at),
      start_day: startDay, end_day: event.all_day ? moveDay(event.ends_at.slice(0, 10), -1) : dayInZone(event.ends_at, zone),
      lead_id: event.lead_id || "", client_id: event.client_id || "",
    });
  };
  const openBanner = (day = selected) => {
    setSelected(day); setModalError("");
    setBannerDraft(bannerFor(day) || { id: "", version: 0, day, title: "", subtitle: "", emoji: "🎉", theme: "violet" });
  };
  const postEvent = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || !draft) return;
    const form = new FormData(e.currentTarget);
    form.set("timezone", zone);
    if (!draft.all_day) {
      const start = new Date(String(form.get("start_local")));
      const end = new Date(String(form.get("end_local")));
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) { setModalError(t("Indica fechas y horas válidas.", "Enter valid dates and times.")); return; }
      form.set("starts_at", start.toISOString());
      form.set("ends_at", end.toISOString());
    }
    setBusy(true); setModalError("");
    try {
      const result = await saveCalendarEvent(form);
      if (result.status === "ok") { setDraft(null); setMessage(result.message); router.refresh(); }
      else setModalError(result.message);
    } catch { setModalError(t("No se pudo confirmar el cambio.", "Could not confirm the change.")); }
    finally { setBusy(false); }
  };
  const cancelEvent = async () => {
    if (!draft?.id || !draft.version || busy || !window.confirm(t("¿Cancelar esta cita para ambos?", "Cancel this event for both?"))) return;
    const form = new FormData(); form.set("id", draft.id); form.set("version", String(draft.version));
    setBusy(true);
    try {
      const result = await cancelCalendarEvent(form);
      if (result.status === "ok") { setDraft(null); setMessage(result.message); router.refresh(); }
      else setModalError(result.message);
    } catch { setModalError(t("No se pudo confirmar.", "Could not confirm.")); }
    finally { setBusy(false); }
  };
  const postBanner = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setModalError("");
    try {
      const result = await saveCalendarBanner(new FormData(e.currentTarget));
      if (result.status === "ok") { setBannerDraft(null); setMessage(result.message); router.refresh(); }
      else setModalError(result.message);
    } catch { setModalError(t("No se pudo guardar el banner.", "Could not save banner.")); }
    finally { setBusy(false); }
  };
  const removeBanner = async () => {
    if (!bannerDraft?.id || busy || !window.confirm(t("¿Eliminar el banner de este día?", "Remove this day's banner?"))) return;
    const form = new FormData(); form.set("id", bannerDraft.id); form.set("version", String(bannerDraft.version));
    setBusy(true);
    try {
      const result = await deleteCalendarBanner(form);
      if (result.status === "ok") { setBannerDraft(null); setMessage(result.message); router.refresh(); }
      else setModalError(result.message);
    } catch { setModalError(t("No se pudo eliminar.", "Could not remove.")); }
    finally { setBusy(false); }
  };
  const chip = (event: CalendarEvent) => (
    <button key={event.id} className={s.eventChip} style={colorStyle(event.color)} type="button"
      onClick={() => editEvent(event)} title={event.title + " · " + timeLabel(event)}>
      {event.all_day ? "★ " : ""}{event.title}
    </button>
  );

  return <section className={s.shell} aria-label={t("Calendario compartido", "Shared calendar")}>
    <header className={s.header}>
      <div><p className={s.eyebrow}>AVALON · SHARED CALENDAR</p>
        <h1 className={s.title}>{t("Nuestro calendario", "Our calendar")}</h1>
        <p className={s.subtitle}>{t("Citas, reuniones y días especiales. Compartido entre los propietarios.", "Appointments, meetings and special days. Shared between owners.")}</p></div>
      <div className={s.tools}>
        <button className={s.button} onClick={() => openBanner()} type="button">{t("🎉 Banner de día", "🎉 Day banner")}</button>
        <button className={s.button} onClick={() => router.refresh()} type="button">{t("Actualizar", "Refresh")}</button>
        <button className={s.button + " " + s.primary} onClick={() => newEvent()} type="button">{t("+ Crear evento", "+ New event")}</button>
      </div>
    </header>
    {dataError && <p className={s.notice + " " + s.warning} role="alert">{dataError}</p>}
    {message && <p className={s.notice} role="status">{message} <button className={s.button} type="button" onClick={() => setMessage("")}>×</button></p>}
    <div className={s.nav}>
      <button className={s.button} type="button" onClick={() => navigate(today)}>{t("Hoy", "Today")}</button>
      <button className={s.button} type="button" onClick={previous} aria-label={t("Periodo anterior", "Previous period")}>‹</button>
      <button className={s.button} type="button" onClick={next} aria-label={t("Siguiente periodo", "Next period")}>›</button>
      <span className={s.period}>{view === "month" ? title : dateLabel(date)}</span>
      <select className={s.filter} value={filter} aria-label={t("Filtrar propietario", "Filter owner")} onChange={e => setFilter(e.target.value)}>
        <option value="all">{t("Ambos / Todos", "Both / Everyone")}</option>
        {owners.map(owner => <option key={owner.user_id} value={owner.user_id}>{ownerName(owner.user_id)}</option>)}
      </select>
      <div className={s.segment} role="group" aria-label={t("Vista", "View")}>
        {(["month", "week", "day"] as const).map(mode =>
          <button key={mode} className={s.button + (view === mode ? " " + s.active : "")}
            aria-pressed={view === mode} onClick={() => navigate(selected, mode)} type="button">
            {mode === "month" ? t("Mes", "Month") : mode === "week" ? t("Semana", "Week") : t("Día", "Day")}
          </button>
        )}
      </div>
    </div>
    <div className={s.summary}>
      <span className={s.pill}>{filtered.length} {t("eventos en el periodo cargado", "events in loaded period")}</span>
      <span className={s.pill}>{owners.length} {t("propietarios autorizados", "authorized owners")}</span>
      <span className={s.pill}>{zone}</span>
    </div>
    <div className={s.split}>
      <div className={s.board}>
        {view === "month" ? <div className={s.scroll}>
          <div className={s.monthGrid} role="grid" aria-label={t("Calendario mensual", "Monthly calendar")}>
            {(lang === "es" ? ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
              .map(name => <div key={name} className={s.weekHeader} role="columnheader">{name}</div>)}
            {days.map(day => {
              const list = dayEvents(day), banner = bannerFor(day);
              return <div key={day} className={s.dayCell + (day.slice(0, 7) !== date.slice(0, 7) ? " " + s.outside : "") + (day === today ? " " + s.today : "")}
                role="gridcell" aria-label={dateLabel(day)}>
                <div className={s.dayTitle}>
                  <button type="button" className={s.daySelect} onClick={() => setSelected(day)} aria-label={t("Ver", "View") + " " + dateLabel(day)}>{Number(day.slice(-2))}</button>
                  <button type="button" className={s.dayAdd} onClick={() => newEvent(day)} aria-label={t("Crear evento", "Create event") + " " + dateLabel(day)}>+</button>
                </div>
                {banner && <button type="button" className={s.banner} data-theme={banner.theme} onClick={() => openBanner(day)} title={banner.title}>
                  <span>{banner.emoji} {banner.title}</span></button>}
                {list.slice(0, 3).map(chip)}
                {list.length > 3 && <button type="button" className={s.more} onClick={() => setSelected(day)}>
                  +{list.length - 3} {t("más", "more")}</button>}
              </div>;
            })}
          </div>
        </div> : <div className={s.scroll}>
          <div className={s.timeGrid} style={{ "--cal-days": days.length, "--cal-min-width": (days.length * 132 + 58) + "px" } as CSSProperties}>
            <div className={s.timeHeader}>{t("Hora", "Time")}</div>
            {days.map(day => <div key={day} className={s.timeHeader}>
              <button type="button" className={s.button} onClick={() => setSelected(day)}>{dateLabel(day)}</button>
              {bannerFor(day) && <button type="button" className={s.banner} data-theme={bannerFor(day)?.theme} onClick={() => openBanner(day)}>
                <span>{bannerFor(day)?.emoji} {bannerFor(day)?.title}</span></button>}
              {dayEvents(day).filter(e => e.all_day).map(chip)}
            </div>)}
            {Array.from({ length: 24 }, (_, hour) => <div key={"hour-" + hour} style={{ display: "contents" }}>
              <div className={s.hourLabel}>{pad(hour)}:00</div>
              {days.map(day => <div key={day + "-" + hour} className={s.slot}>
                <button type="button" className={s.slotAdd} onClick={() => newEvent(day, hour)}
                  aria-label={t("Crear cita", "Create appointment") + " " + dateLabel(day) + " " + pad(hour) + ":00"}>+</button>
                {dayEvents(day).filter(e => !e.all_day && hourInZone(e.starts_at, zone) === hour && dayInZone(e.starts_at, zone) === day).map(chip)}
              </div>)}
            </div>)}
          </div>
        </div>}
      </div>
      <aside className={s.side} aria-label={t("Agenda del día", "Daily agenda")}>
        {bannerFor(selected) && <button type="button" className={s.banner} data-theme={bannerFor(selected)?.theme}
          onClick={() => openBanner(selected)}><span>{bannerFor(selected)?.emoji} {bannerFor(selected)?.title}
          {bannerFor(selected)?.subtitle && " · " + bannerFor(selected)?.subtitle}</span></button>}
        <h2 className={s.sideTitle}>{dateLabel(selected)}</h2>
        {onDay.length === 0 ? <p className={s.empty}>{t("Sin eventos. Puedes programar una reunión o marcar este día como especial.", "No events. Schedule a meeting or mark this day as special.")}</p> :
          <ul className={s.sideList}>{onDay.map(event => <li className={s.sideItem} style={colorStyle(event.color)} key={event.id}>
            <button type="button" onClick={() => editEvent(event)}>{event.title}</button>
            <span className={s.sideMeta}>{timeLabel(event)} · {ownerName(event.owner_id)}</span>
            <span className={s.sideMeta}>{TYPE[event.kind]?.[lang === "es" ? 0 : 1] || event.kind}</span>
            {event.lead_id && <a className={s.sideMeta} href={`/admin/workspace/crm/lead/${event.lead_id}`}>{t("Abrir diagnóstico del lead", "Open lead review")}</a>}
            {event.client_id && <a className={s.sideMeta} href={`/admin/workspace/crm/clients/${event.client_id}`}>{t("Abrir Cliente 360°", "Open Client 360°")}</a>}
            {event.location && <span className={s.sideMeta}>📍 {event.location}</span>
            {event.meeting_url && <a href={event.meeting_url} target="_blank" rel="noopener noreferrer" className={s.sideMeta}>{t("Abrir enlace de reunión", "Open meeting link")}</a>}
          </li>)}</ul>}
        <div className={s.sideActions}>
          <button className={s.button + " " + s.primary} type="button" onClick={() => newEvent(selected)}>{t("Nueva cita", "New appointment")}</button>
          <button className={s.button} type="button" onClick={() => openBanner(selected)}>{t("Banner", "Banner")}</button>
        </div>
      </aside>
    </div>
    <div className={s.footer}>
      <span className={s.footerNote}>{t("Los eventos se guardan en Avalon y se comparten entre propietarios. Actualización automática cada 2 minutos.", "Events are saved in Avalon and shared between owners. Auto refresh every 2 minutes.")}</span>
      <span className={s.footerNote}>{t("Puedes exportar citas .ics. No hay invitaciones automáticas ni sincronización externa todavía.", "You can export .ics events. Automatic invitations and external sync are not enabled yet.")}</span>
    </div>

    {draft && <div className={s.modalShade} onKeyDown={e => { if (e.key === "Escape" && !busy) setDraft(null); }}>
      <section className={s.modal} role="dialog" aria-modal="true" aria-label={draft.id ? t("Editar evento", "Edit event") : t("Crear evento", "Create event")}>
        <div className={s.modalHead}><h2>{draft.id ? t("Editar evento", "Edit event") : t("Nueva cita o reunión", "New appointment or meeting")}</h2>
          <button type="button" className={s.button} onClick={() => setDraft(null)} disabled={busy} aria-label={t("Cerrar", "Close")}>×</button></div>
        <form className={s.form} onSubmit={postEvent}>
          {draft.id && <><input type="hidden" name="id" value={draft.id} /><input type="hidden" name="version" value={draft.version} /></>}
          <label className={s.label}>{t("Título del evento", "Event title")}
            <input autoFocus className={s.input} name="title" maxLength={200} required defaultValue={draft.title} placeholder={t("Reunión con cliente", "Client meeting")} /></label>
          <div className={s.formGrid}>
            <label className={s.label}>{t("Tipo", "Type")}
              <select className={s.select} name="kind" defaultValue={draft.kind}>
                {EVENT_KINDS.map(k => <option value={k} key={k}>{TYPE[k]?.[lang === "es" ? 0 : 1] || k}</option>)}
              </select></label>
            <label className={s.label}>{t("Responsable", "Owner")}
              <select className={s.select} name="owner_id" defaultValue={draft.owner_id}>
                {owners.map(o => <option key={o.user_id} value={o.user_id}>{ownerName(o.user_id)}</option>)}
              </select></label>
          </div>
          <label className={s.checkbox}><input type="checkbox" checked={draft.all_day} onChange={e => setDraft({ ...draft, all_day: e.target.checked })} />
            {t("Evento de todo el día (informativo)", "All-day event (informational)")}</label>
          <input type="hidden" name="all_day" value={draft.all_day ? "yes" : "no"} />
          {draft.all_day ? <div className={s.formGrid}>
            <label className={s.label}>{t("Desde el día", "From day")}<input className={s.input} name="start_day" type="date" required defaultValue={draft.start_day} /></label>
            <label className={s.label}>{t("Hasta el día (inclusive)", "Through day (inclusive)")}<input className={s.input} name="end_day" type="date" required defaultValue={draft.end_day} /></label>
          </div> : <div className={s.formGrid}>
            <label className={s.label}>{t("Inicio", "Start")}<input className={s.input} name="start_local" type="datetime-local" required defaultValue={draft.start_local} /></label>
            <label className={s.label}>{t("Fin", "End")}<input className={s.input} name="end_local" type="datetime-local" required defaultValue={draft.end_local} /></label>
          </div>}
          <div className={s.label}>{t("Invitar a los propietarios", "Include owners")}
            <div className={s.swatches}>{owners.map(o => <label className={s.checkbox} key={o.user_id}>
              <input type="checkbox" name="attendee_ids" value={o.user_id} defaultChecked={draft.attendee_ids.includes(o.user_id)} />{ownerName(o.user_id)}
            </label>)}</div></div>
          <div className={s.label}>{t("Color del evento", "Event color")}
            <input type="hidden" name="color" value={draft.color} />
            <div className={s.swatches}>{CALENDAR_COLORS.map((c, i) => <button key={c} type="button" className={s.swatch}
              style={colorStyle(c)} aria-label={COLOR_LABELS[i]} aria-pressed={draft.color === c}
              onClick={() => setDraft({ ...draft, color: c })}>{draft.color === c ? "✓" : ""}</button>)}</div></div>
          <div className={s.formGrid}>
            <label className={s.label}>{t("Lugar", "Location")}<input className={s.input} name="location" maxLength={300} defaultValue={draft.location} placeholder={t("Oficina o dirección", "Office or address")} /></label>
            <label className={s.label}>{t("Enlace Meet / Zoom / Teams", "Meet / Zoom / Teams link")}
              <input className={s.input} name="meeting_url" type="url" maxLength={500} defaultValue={draft.meeting_url} placeholder="https://" /></label>
          </div>
          <label className={s.label}>{t("Descripción y notas", "Description and notes")}
            <textarea className={s.textarea} name="description" maxLength={4000} defaultValue={draft.description} /></label>
          <label className={s.label}>{t("Invitados externos (notas; no envía invitaciones)", "External guests (notes; no invitations sent)")}
            <input className={s.input} name="participants" maxLength={1000} defaultValue={draft.participants} /></label>
          <div className={s.formGrid}>
            <label className={s.label}>{t("Relacionar con lead", "Related lead")}
              <select className={s.select} name="lead_id" defaultValue={draft.lead_id}><option value="">{t("Sin vincular", "Not linked")}</option>
                {leads.map(l => <option value={l.id} key={l.id}>{l.company}</option>)}</select></label>
            <label className={s.label}>{t("Relacionar con cliente", "Related client")}
              <select className={s.select} name="client_id" defaultValue={draft.client_id}><option value="">{t("Sin vincular", "Not linked")}</option>
                {clients.map(c => <option value={c.id} key={c.id}>{c.legal_name}</option>)}</select></label>
          </div>
          {modalError && <p className={s.notice + " " + s.warning} role="alert">{modalError}</p>}
          <div className={s.modalActions}>
            {draft.id && <button type="button" className={s.button} onClick={() => {
              const existing = events.find(e => e.id === draft.id);
              if (existing) downloadIcs(existing);
            }}>{t("Exportar .ics", "Export .ics")}</button>}
            {draft.id && draft.status === "scheduled" && <button className={s.button + " " + s.danger} type="button" disabled={busy}
              onClick={cancelEvent}>{t("Cancelar cita", "Cancel event")}</button>}
            <button type="button" className={s.button} onClick={() => setDraft(null)} disabled={busy}>{t("Cerrar", "Close")}</button>
            <button className={s.button + " " + s.primary} type="submit" disabled={busy}>{busy ? t("Guardando…", "Saving…") : t("Guardar para ambos", "Save for both")}</button>
          </div>
        </form>
      </section>
    </div>}

    {bannerDraft && <div className={s.modalShade} onKeyDown={e => { if (e.key === "Escape" && !busy) setBannerDraft(null); }}>
      <section className={s.modal} role="dialog" aria-modal="true" aria-label={t("Banner de fecha especial", "Special-day banner")}>
        <div className={s.modalHead}><h2>{t("🎉 Día importante", "🎉 Special day")}</h2>
          <button type="button" className={s.button} onClick={() => setBannerDraft(null)} disabled={busy}>×</button></div>
        <form className={s.form} onSubmit={postBanner}>
          {bannerDraft.id && <><input type="hidden" name="id" value={bannerDraft.id} /><input type="hidden" name="version" value={bannerDraft.version} /></>}
          <label className={s.label}>{t("Fecha", "Date")}<input className={s.input} type="date" name="day" defaultValue={bannerDraft.day} required /></label>
          <label className={s.label}>{t("Título del banner", "Banner title")}<input className={s.input} name="title" maxLength={120} required
            defaultValue={bannerDraft.title} placeholder={t("Aniversario de Avalon", "Avalon anniversary")} /></label>
          <label className={s.label}>{t("Texto adicional", "Subtitle")}<input className={s.input} name="subtitle" maxLength={300} defaultValue={bannerDraft.subtitle} /></label>
          <div className={s.formGrid}>
            <label className={s.label}>{t("Emoji", "Emoji")}<input className={s.input} name="emoji" maxLength={16} defaultValue={bannerDraft.emoji} /></label>
            <label className={s.label}>{t("Tema y color", "Theme and color")}
              <select className={s.select} name="theme" defaultValue={bannerDraft.theme}>
                {BANNER_THEMES.map(k => <option key={k} value={k}>{THEME_LABELS[k]?.[lang === "es" ? 0 : 1] || k}</option>)}
              </select></label>
          </div>
          {modalError && <p className={s.notice + " " + s.warning} role="alert">{modalError}</p>}
          <div className={s.modalActions}>
            {bannerDraft.id && <button type="button" className={s.button + " " + s.danger} onClick={removeBanner} disabled={busy}>{t("Eliminar banner", "Remove banner")}</button>}
            <button type="button" className={s.button} onClick={() => setBannerDraft(null)} disabled={busy}>{t("Cerrar", "Close")}</button>
            <button type="submit" className={s.button + " " + s.primary} disabled={busy}>{busy ? t("Guardando…", "Saving…") : t("Guardar banner", "Save banner")}</button>
          </div>
        </form>
      </section>
    </div>}
  </section>;
}
