"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { Lang } from "@/lib/i18n";
import { IsoOffice } from "./iso-office";
import s from "./office.module.css";

type Stats = { assigned: number; open: number; overdue: number; done: number; projects: number };
type Member = {
  user_id: string; role: string; email: string; joined_at: string | null; display_name: string; title: string; department: string;
  bio: string; specialties: string[]; has_photo: boolean; profile_updated_at: string | null; stats: Stats; lastActivity: string | null; unread: number;
};
type Manager = { key: string; name: string; hue: number; role: { es: string; en: string }; modules: { es: string; en: string }[];
  station: { x: number; y: number }; examples: { es: string; en: string }; status: string; registered: number };
type Activity = { id: number; event_type: string; module: string; actor_id?: string; detail: string; result: string; created_at: string };
type Data = {
  me: string; period: string; profilesReady: boolean; messagingReady: boolean; tasksReady: boolean;
  members: Member[]; managers: Manager[];
  integration: { status: string; externalNote: { es: string; en: string } };
  team: { active: number; overdue: number; done: number; projects: number | null; series: number[] };
  recent: Activity[];
};
type Selected = { kind: "member"; id: string } | { kind: "manager"; key: string } | null;
type Message = { id: string; sender_id: string; recipient_id: string; body: string; ref_type: string | null; ref_id: string | null; read_at: string | null; created_at: string };
type Request = { id: string; body: string; ref_type: string | null; ref_id: string | null; status: string; created_by: string; created_at: string };
type StaffProject = { id: string | null; name: string; module: string | null; status: string | null; client_id: string | null; client_name: string | null; work_orders: number; open_tasks: number };

const API = "/admin/workspace/crm/office/api";
const PROJECT_BASE: Record<string, string> = {
  website: "/admin/workspace/website-designer",
  ecommerce: "/admin/workspace/ecommerce-designer",
  crm_creator: "/admin/workspace/crm-creator",
  receptionist: "/admin/workspace/ai-receptionist",
  marketing: "/admin/workspace/marketing-hub",
};
const projectHref = (project: StaffProject) =>
  project.id && project.module && PROJECT_BASE[project.module]
    ? `${PROJECT_BASE[project.module]}/${project.id}`
    : null;
const PERIODS = [["7", "7 días", "7 days"], ["30", "30 días", "30 days"], ["90", "90 días", "90 days"], ["all", "Todo", "All time"]] as const;
const REFS = [["lead", "Lead", "Lead"], ["client", "Cliente", "Client"], ["sale", "Venta", "Sale"], ["project", "Proyecto", "Project"], ["task", "Tarea", "Task"]] as const;
const ROLE: Record<string, [string, string]> = { owner: ["Propietario", "Owner"], admin: ["Administrador", "Admin"], operator: ["Operador", "Operator"] };
const STATUS: Record<string, [string, string]> = {
  available: ["Disponible", "Available"], configured_idle: ["Configurado pero no ejecutado", "Configured, not run"],
  offline: ["Sin conexión", "Offline"], not_implemented: ["No implementado", "Not implemented"],
};

const refHref = (type: string | null, id: string | null) =>
  !type || !id ? null : type === "lead" ? `/admin/workspace/crm/leads?lead=${id}` : type === "client" ? `/admin/workspace/crm/clients/${id}` :
  type === "sale" ? `/admin/workspace/crm/sales/${id}` : type === "task" ? `/admin/workspace/crm/tasks?task=${id}` : null;
const nameOf = (m: Pick<Member, "display_name" | "email">) => m.display_name || m.email.split("@")[0] || "—";
const initials = (text: string) => text.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "·";

async function post(body: unknown) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "Error");
  return d;
}

export function Office({ lang }: { lang: Lang }) {
  const t = useCallback((es: string, en: string) => (lang === "en" ? en : es), [lang]);
  const when = useCallback((v: string | null | undefined) => (v ? new Intl.DateTimeFormat(lang === "en" ? "en" : "es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v)) : "—"), [lang]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("30");
  const [role, setRole] = useState("all");
  const [department, setDepartment] = useState("all");
  const [person, setPerson] = useState("all");
  const [view, setView] = useState<"space" | "directory">("space");
  const [selected, setSelected] = useState<Selected>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const c = new AbortController();
    setError("");
    fetch(`${API}?period=${period}`, { signal: c.signal })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Error"); setData(d); })
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => c.abort();
  }, [period, revision]);

  // Live view without a realtime dependency: refresh every 30 s while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") setRevision(n => n + 1); }, 30000);
    return () => clearInterval(id);
  }, []);

  const departments = useMemo(() => [...new Set((data?.members ?? []).map(m => m.department).filter(Boolean))], [data]);
  const members = useMemo(() => (data?.members ?? []).filter(m =>
    (role === "all" || role === "ai" ? true : m.role === role) && (department === "all" || m.department === department) && (person === "all" || m.user_id === person) && role !== "ai"), [data, role, department, person]);
  const managers = useMemo(() => (role === "all" || role === "ai") && person === "all" && department === "all" ? data?.managers ?? [] : [], [data, role, person, department]);
  const totals = useMemo(() => members.reduce((a, m) => ({ open: a.open + m.stats.open, overdue: a.overdue + m.stats.overdue, done: a.done + m.stats.done }), { open: 0, overdue: 0, done: 0 }), [members]);
  const filtered = role !== "all" || department !== "all" || person !== "all";
  const reload = useCallback(() => setRevision(n => n + 1), []);

  const selectedMember = selected?.kind === "member" ? data?.members.find(m => m.user_id === selected.id) ?? null : null;
  const selectedManager = selected?.kind === "manager" ? data?.managers.find(m => m.key === selected.key) ?? null : null;

  if (error) return <p role="alert" className={s.alert}>{error}</p>;
  if (!data) return (
    <div className={s.office} aria-busy="true">
      <div className={`${s.skeleton} ${s.skeletonScene}`} />
      <div className={s.kpis}>{Array.from({ length: 4 }, (_, i) => <div key={i} className={`${s.skeleton} ${s.skeletonCard}`} />)}</div>
      <p role="status" className={s.srOnly}>{t("Cargando la Oficina…", "Loading the Office…")}</p>
    </div>
  );

  const card = (m: Member) => (
    <button key={m.user_id} type="button" className={s.person} data-selected={selected?.kind === "member" && selected.id === m.user_id}
      onClick={() => setSelected({ kind: "member", id: m.user_id })} aria-label={`${t("Abrir perfil de", "Open profile of")} ${nameOf(m)}`}>
      <Avatar member={m} size={44} />
      <span className={s.personText}>
        <strong>{nameOf(m)}{m.user_id === data.me ? ` · ${t("tú", "you")}` : ""}</strong>
        <small>{m.title || t(...ROLE[m.role] ?? ["Miembro", "Member"])}</small>
      </span>
      <span className={s.chips}>
        <span>{m.stats.open} {t("abiertas", "open")}</span>
        {m.stats.overdue > 0 && <span data-tone="danger">{m.stats.overdue} {t("vencidas", "overdue")}</span>}
        {m.unread > 0 && <span data-tone="accent">{m.unread} {t("sin leer", "unread")}</span>}
      </span>
    </button>
  );
  const agentCard = (m: Manager) => (
    <button key={m.key} type="button" className={s.person} data-selected={selected?.kind === "manager" && selected.key === m.key}
      onClick={() => setSelected({ kind: "manager", key: m.key })} aria-label={`${t("Abrir perfil de", "Open profile of")} ${m.name} (${t("manager virtual de IA", "virtual AI manager")})`}>
      <span className={s.agentMark} style={{ "--hue": m.hue } as CSSProperties}>{m.name.slice(0, 2)}</span>
      <span className={s.personText}><strong>{m.name} <em className={s.aiTag}>IA</em></strong><small>{lang === "en" ? m.role.en : m.role.es}</small></span>
      <span className={s.chips}><span data-tone="muted">{t(...STATUS[m.status])}</span>{m.registered > 0 && <span>{m.registered} {t("registradas", "logged")}</span>}</span>
    </button>
  );

  return (
    <div className={s.office}>
      <header className={s.hero}>
        <div>
          <p className={s.eyebrow}>Avalon Headquarters</p>
          <h1>{t("Oficina", "Office")}</h1>
          <p className={s.lead}>{t("Tu equipo, sus tareas y la operación de Avalon en un solo lugar. Todo lo que ves sale de registros guardados.",
            "Your team, their work and Avalon's operations in one place. Everything shown comes from stored records.")}</p>
        </div>
        <div className={s.viewSwitch} role="group" aria-label={t("Vista", "View")}>
          <button type="button" aria-pressed={view === "space"} onClick={() => setView("space")}>{t("Espacio", "Space")}</button>
          <button type="button" aria-pressed={view === "directory"} onClick={() => setView("directory")}>{t("Directorio", "Directory")}</button>
        </div>
      </header>

      {!data.profilesReady && <p className={s.notice} role="status">{t("Migración de Oficina (20261103100000) pendiente: se muestran los propietarios; perfiles, fotos, mensajes y solicitudes a managers se activan al aplicarla.",
        "Office migration (20261103100000) pending: owners are shown; profiles, photos, messages and manager requests activate once it is applied.")}</p>}

      <section className={s.filters} aria-label={t("Filtros", "Filters")}>
        <label>{t("Periodo", "Period")}<select value={period} onChange={e => setPeriod(e.target.value)}>{PERIODS.map(([v, es, en]) => <option key={v} value={v}>{t(es, en)}</option>)}</select></label>
        <label>{t("Rol", "Role")}<select value={role} onChange={e => setRole(e.target.value)}>
          <option value="all">{t("Todos", "All")}</option>
          {[...new Set(data.members.map(m => m.role))].map(r => <option key={r} value={r}>{t(...ROLE[r] ?? [r, r])}</option>)}
          <option value="ai">{t("Managers de IA", "AI managers")}</option>
        </select></label>
        <label>{t("Departamento", "Department")}<select value={department} onChange={e => setDepartment(e.target.value)} disabled={!departments.length}>
          <option value="all">{departments.length ? t("Todos", "All") : t("Sin departamentos", "No departments")}</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select></label>
        <label>{t("Persona", "Person")}<select value={person} onChange={e => setPerson(e.target.value)}>
          <option value="all">{t("Todas", "Everyone")}</option>
          {data.members.map(m => <option key={m.user_id} value={m.user_id}>{nameOf(m)}</option>)}
        </select></label>
      </section>

      {view === "space" ? (
        <section className={s.sceneWrap} aria-label={t("Sede de Avalon: selecciona una estación", "Avalon HQ: select a workstation")}>
          <IsoOffice lang={lang} selected={selected?.kind === "member" ? selected.id : selected?.kind === "manager" ? `ai:${selected.key}` : null}
            onSelect={id => setSelected(id.startsWith("ai:") ? { kind: "manager", key: id.slice(3) } : { kind: "member", id })}
            screen={{ active: data.tasksReady ? data.team.active : null, overdue: data.tasksReady ? data.team.overdue : null, done: data.tasksReady ? data.team.done : null, unread: data.members.reduce((n, m) => n + m.unread, 0) }}
            people={[
              ...members.map(m => ({ id: m.user_id, kind: "human" as const, name: nameOf(m), initials: initials(nameOf(m)), subtitle: m.title || t(...ROLE[m.role] ?? ["Miembro", "Member"]),
                photo: m.has_photo ? `/admin/workspace/crm/office/photo/${m.user_id}` : null, open: m.stats.open, overdue: m.stats.overdue, unread: m.unread,
                recentMinutes: m.lastActivity ? Math.round((Date.now() - Date.parse(m.lastActivity)) / 60000) : null })),
              ...managers.map(m => ({ id: `ai:${m.key}`, kind: "ai" as const, name: m.name, initials: m.name.slice(0, 2), subtitle: t(...STATUS[m.status]), hue: m.hue,
                open: m.registered, overdue: 0, unread: 0, recentMinutes: null, offline: m.status !== "available" })),
            ]} />
          <p className={s.sceneHint}>{t("Toca a una persona o manager para abrir su perfil. Luz verde: actividad registrada en la última hora (no es presencia en tiempo real). Se actualiza cada 30 s.",
            "Tap a person or manager to open their profile. Green light: activity recorded in the last hour (not real-time presence). Refreshes every 30 s.")}</p>
        </section>
      ) : (
        <section className={s.directory} aria-label={t("Directorio", "Directory")}>
          <h2>{t("Personas", "People")} <small>{members.length}</small></h2>
          <div className={s.grid}>{members.map(card)}{!members.length && <p className={s.empty}>{t("Nadie coincide con los filtros.", "Nobody matches the filters.")}</p>}</div>
          {managers.length > 0 && <><h2>{t("Managers virtuales de IA", "Virtual AI managers")} <small>{managers.length}</small></h2><div className={s.grid}>{managers.map(agentCard)}</div></>}
        </section>
      )}

      <section className={s.kpis} aria-label={t("Estadísticas de la Oficina", "Office statistics")}>
        <Kpi label={t("Miembros humanos", "Human members")} value={data.members.length} />
        <Kpi label={t("Managers virtuales configurados", "Virtual managers configured")} value={data.managers.length} />
        <Kpi label={t("Tareas activas", "Active tasks")} value={data.tasksReady ? (filtered ? totals.open : data.team.active) : null} />
        <Kpi label={t("Tareas vencidas", "Overdue tasks")} value={data.tasksReady ? (filtered ? totals.overdue : data.team.overdue) : null} tone={(filtered ? totals.overdue : data.team.overdue) > 0 ? "danger" : undefined} />
        <Kpi label={t("Completadas en el periodo", "Completed in period")} value={data.tasksReady ? (filtered ? totals.done : data.team.done) : null} />
        <Kpi label={t("Proyectos activos", "Active projects")} value={data.team.projects} />
        <Kpi label={t("Agentes con integración", "Agents with integration")} value={data.managers.filter(m => m.status === "available").length} />
        <Kpi label={t("Agentes sin conexión", "Agents offline")} value={data.managers.filter(m => m.status !== "available").length} tone="muted" />
      </section>

      <div className={s.lower}>
        <section className={s.panelBox} aria-labelledby="office-trend">
          <h2 id="office-trend">{t("Tareas completadas · últimos 14 días", "Tasks completed · last 14 days")}</h2>
          <Sparkline values={data.team.series} label={t("Tareas completadas por día", "Tasks completed per day")} />
          <details className={s.defs}>
            <summary>{t("Cómo se calculan", "How these are calculated")}</summary>
            <ul>
              <li>{t("Activas: tareas en Por hacer, En curso o Bloqueada (estado actual).", "Active: tasks in To do, In progress or Blocked (current state).")}</li>
              <li>{t("Vencidas: activas con fecha límite anterior a ahora.", "Overdue: active tasks whose due date has passed.")}</li>
              <li>{t("Completadas: tareas marcadas como hechas dentro del periodo.", "Completed: tasks marked done within the period.")}</li>
              <li>{t("Asignadas: tareas creadas en el periodo para esa persona.", "Assigned: tasks created in the period for that person.")}</li>
              <li>{t("No se calcula ninguna puntuación de productividad.", "No productivity score is computed.")}</li>
            </ul>
          </details>
        </section>
        <section className={s.panelBox} aria-labelledby="office-activity">
          <h2 id="office-activity">{t("Actividad operativa reciente", "Recent operational activity")}</h2>
          {data.recent.length ? (
            <ol className={s.feed}>{data.recent.slice(0, 8).map(a => {
              const who = data.members.find(m => m.user_id === a.actor_id);
              return <li key={a.id} data-result={a.result}><strong>{a.event_type}</strong><span>{a.detail || a.module}</span>
                <small>{when(a.created_at)} · {who ? nameOf(who) : t("Sistema", "System")}</small></li>;
            })}</ol>
          ) : <p className={s.empty}>{t("Sin actividad registrada todavía.", "No recorded activity yet.")}</p>}
        </section>
      </div>

      {selectedMember && <MemberPanel key={selectedMember.user_id} member={selectedMember} data={data} lang={lang} when={when} onClose={() => setSelected(null)} onChanged={reload} />}
      {selectedManager && <ManagerPanel key={selectedManager.key} manager={selectedManager} data={data} lang={lang} when={when} onClose={() => setSelected(null)} onChanged={reload} />}
    </div>
  );
}

function Avatar({ member, size }: { member: Pick<Member, "user_id" | "has_photo" | "display_name" | "email">; size: number }) {
  const [failed, setFailed] = useState(false);
  const label = initials(nameOf(member));
  return member.has_photo && !failed
    // eslint-disable-next-line @next/next/no-img-element -- owner-only route, not optimizable by next/image
    ? <img className={s.avatar} src={`/admin/workspace/crm/office/photo/${member.user_id}`} alt="" width={size} height={size} onError={() => setFailed(true)} loading="lazy" />
    : <span className={s.avatar} style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden="true">{label}</span>;
}

function Kpi({ label, value, tone }: { label: string; value: number | null; tone?: "danger" | "muted" }) {
  return <div className={s.kpi} data-tone={tone}><span>{label}</span><strong>{value === null ? "—" : value}</strong></div>;
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values), w = 280, h = 64, step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 6 - (v / max) * (h - 12)).toFixed(1)}`).join(" ");
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <figure className={s.spark}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${values.join(", ")}`} preserveAspectRatio="none">
        <polyline points={`0,${h} ${pts} ${w},${h}`} className={s.sparkFill} />
        <polyline points={pts} className={s.sparkLine} />
      </svg>
      <figcaption>{total}</figcaption>
    </figure>
  );
}

function Drawer({ title, subtitle, onClose, children, lang }: { title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; lang: Lang }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className={s.scrim} onClick={e => e.target === e.currentTarget && onClose()}>
      <aside ref={ref} tabIndex={-1} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="office-drawer-title">
        <header className={s.drawerHead}>
          <div>{title}{subtitle}</div>
          <button type="button" className={s.close} onClick={onClose} aria-label={lang === "en" ? "Back to the office" : "Volver a la oficina"}>✕</button>
        </header>
        {children}
      </aside>
    </div>
  );
}

function RefFields({ lang }: { lang: Lang }) {
  const t = (es: string, en: string) => (lang === "en" ? en : es);
  return (
    <details className={s.refBox}>
      <summary>{t("Vincular a un registro del CRM (opcional)", "Link to a CRM record (optional)")}</summary>
      <div className={s.row2}>
        <label>{t("Tipo", "Type")}<select name="ref_type" defaultValue=""><option value="">—</option>{REFS.map(([v, es, en]) => <option key={v} value={v}>{t(es, en)}</option>)}</select></label>
        <label>ID<input name="ref_id" inputMode="text" pattern="[0-9a-fA-F-]{36}" placeholder="00000000-0000-…" /></label>
      </div>
    </details>
  );
}

function MemberPanel({ member, data, lang, when, onClose, onChanged }: { member: Member; data: Data; lang: Lang; when: (v: string | null) => string; onClose: () => void; onChanged: () => void }) {
  const t = (es: string, en: string) => (lang === "en" ? en : es);
  const self = member.user_id === data.me;
  const [tab, setTab] = useState<"profile" | "projects" | "tasks" | "messages">("profile");
  const [detail, setDetail] = useState<{ activity: Activity[]; tasks: { id: string; title: string; priority: string; status: string; due_at: string | null }[]; projects: StaffProject[]; projectsUnavailable?: boolean } | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [ok, setOk] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    fetch(`${API}?member=${member.user_id}`, { signal: c.signal }).then(r => r.json()).then(setDetail).catch(() => undefined);
    return () => c.abort();
  }, [member.user_id, rev]);
  const run = async (e: FormEvent<HTMLFormElement>, build: (f: FormData) => unknown, done: string, after?: () => void) => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    setBusy(true); setErr(""); setOk("");
    try { await post(build(f)); form.reset(); setOk(done); setRev(n => n + 1); onChanged(); after?.(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setErr(""); setOk("");
    const fd = new FormData(); fd.set("photo", file);
    try {
      const r = await fetch(`/admin/workspace/crm/office/photo/${member.user_id}`, { method: "POST", body: fd });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setOk(t("Foto actualizada.", "Photo updated.")); onChanged();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <Drawer lang={lang} onClose={onClose}
      title={<div className={s.idRow}><Avatar member={member} size={72} /><div>
        <p className={s.eyebrow}>{t("Humano", "Human")} · {t(...ROLE[member.role] ?? ["Miembro", "Member"])}</p>
        <h2 id="office-drawer-title">{nameOf(member)}</h2>
        <p className={s.sub}>{[member.title, member.department].filter(Boolean).join(" · ") || t("Cargo y departamento sin definir", "Title and department not set")}</p>
      </div></div>}>
      <div className={s.tabs} role="tablist">
        {([["profile", t("Perfil", "Profile")], ["projects", t("Proyectos", "Projects")], ["tasks", t("Tareas", "Tasks")], ...(!self ? [["messages", t("Mensajes", "Messages")]] : [])] as [typeof tab, string][]).map(([k, label]) =>
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setOk(""); setErr(""); }}>{label}{k === "messages" && member.unread > 0 ? ` · ${member.unread}` : ""}</button>)}
      </div>
      {ok && <p role="status" className={s.ok}>{ok}</p>}
      {err && <p role="alert" className={s.alert}>{err}</p>}

      {tab === "profile" && <>
        <dl className={s.stats}>
          <div><dt>{t("Asignadas", "Assigned")}</dt><dd>{member.stats.assigned}</dd></div>
          <div><dt>{t("Pendientes", "Open")}</dt><dd>{member.stats.open}</dd></div>
          <div><dt>{t("Completadas", "Completed")}</dt><dd>{member.stats.done}</dd></div>
          <div data-tone={member.stats.overdue ? "danger" : undefined}><dt>{t("Vencidas", "Overdue")}</dt><dd>{member.stats.overdue}</dd></div>
          <div><dt>{t("Proyectos", "Projects")}</dt><dd>{member.stats.projects}</dd></div>
        </dl>
        <p className={s.muted}>{t("Periodo", "Period")}: {PERIODS.find(p => p[0] === data.period)?.[lang === "en" ? 2 : 1]} · {t("Última actividad registrada", "Last recorded activity")}: {when(member.lastActivity)}</p>
        <section className={s.block}>
          <h3>{t("Identidad", "Identity")}</h3>
          <p>{member.bio || <span className={s.muted}>{self ? t("Aún no has escrito tu descripción.", "You haven't written your description yet.") : t("Sin descripción.", "No description.")}</span>}</p>
          {member.specialties.length > 0 && <ul className={s.tags}>{member.specialties.map(x => <li key={x}>{x}</li>)}</ul>}
          <dl className={s.facts}>
            <dt>{t("Correo", "Email")}</dt><dd>{member.email}</dd>
            <dt>{t("Permisos", "Access")}</dt><dd>{t(...ROLE[member.role] ?? [member.role, member.role])} · {member.role === "owner" ? t("acceso completo al OS", "full OS access") : t("sin acceso a la app hasta que se habilite su rol", "no app access until their role is enabled")}</dd>
            <dt>{t("Disponibilidad", "Availability")}</dt><dd className={s.muted}>{t("Sin fuente de presencia conectada", "No presence source connected")}</dd>
          </dl>
        </section>
        <section className={s.block}>
          <h3>{t("Actividad reciente", "Recent activity")}</h3>
          {!detail ? <div className={`${s.skeleton} ${s.skeletonLine}`} /> : detail.activity.length ? (
            <ol className={s.feed}>{detail.activity.map(a => <li key={a.id} data-result={a.result}><strong>{a.event_type}</strong><span>{a.detail || a.module}</span><small>{when(a.created_at)}</small></li>)}</ol>
          ) : <p className={s.empty}>{t("Sin actividad registrada.", "No recorded activity.")}</p>}
        </section>
        {self && (data.profilesReady ? (
          <section className={s.block}>
            <h3>{t("Editar mi perfil", "Edit my profile")}</h3>
            <form className={s.form} onSubmit={e => run(e, f => ({ op: "profile", display_name: f.get("display_name"), title: f.get("title"), department: f.get("department"), bio: f.get("bio"), specialties: f.get("specialties") }), t("Perfil guardado.", "Profile saved."))}>
              <div className={s.row2}>
                <label>{t("Nombre visible", "Display name")}<input name="display_name" maxLength={80} defaultValue={member.display_name} /></label>
                <label>{t("Cargo", "Title")}<input name="title" maxLength={80} defaultValue={member.title} /></label>
              </div>
              <label>{t("Departamento", "Department")}<input name="department" maxLength={80} defaultValue={member.department} /></label>
              <label>{t("Descripción profesional", "Professional summary")}<textarea name="bio" maxLength={600} rows={3} defaultValue={member.bio} /></label>
              <label>{t("Especialidades (separadas por comas)", "Specialties (comma separated)")}<input name="specialties" defaultValue={member.specialties.join(", ")} /></label>
              <button type="submit" className={s.primary} disabled={busy}>{t("Guardar perfil", "Save profile")}</button>
            </form>
            <label className={s.photo}>{t("Tu foto (PNG, JPG o WEBP · máx. 700 KB). Solo tú puedes cambiarla.", "Your photo (PNG, JPG or WEBP · max 700 KB). Only you can change it.")}
              <input type="file" accept=".png,.jpg,.jpeg,.webp" disabled={busy} onChange={e => uploadPhoto(e.target.files?.[0])} /></label>
          </section>
        ) : <p className={s.notice}>{t("La edición de perfil y foto se activa al aplicar la migración de Oficina.", "Profile and photo editing activate once the Office migration is applied.")}</p>)}
      </>}

      {tab === "projects" && (
        <section className={s.block} aria-label={t("Proyectos asignados", "Assigned projects")}>
          <h3>{t("Proyectos asignados", "Assigned projects")}</h3>
          <p className={s.muted}>{t("Solo proyectos con tareas u órdenes asignadas a este miembro. Los expedientes de clientes se comparten entre perfiles autorizados.", "Only projects with tasks or work orders assigned to this member. Client records are shared across authorized profiles.")}</p>
          <label className={s.projectFinder}>
            {t("Finder de proyectos", "Project finder")}
            <input type="search" value={projectFilter} onChange={e => setProjectFilter(e.target.value)} placeholder={t("Buscar por proyecto o cliente…", "Search by project or client…")} maxLength={100} />
          </label>
          {!detail ? <div className={`${s.skeleton} ${s.skeletonLine}`} /> : detail.projectsUnavailable ? (
            <p role="status" className={s.notice}>{t("No se pudo cargar el listado completo de proyectos.", "Could not load the complete project list.")}</p>
          ) : (() => {
            const filtered = (detail.projects ?? []).filter(pr => `${pr.name} ${pr.client_name ?? ""} ${pr.module ?? ""}`.toLocaleLowerCase().includes(projectFilter.trim().toLocaleLowerCase()));
            return filtered.length ? <ul className={s.projectList}>{filtered.map((pr, index) => (
              <li key={pr.id ?? `client-${pr.client_id ?? index}`} className={s.projectItem}>
                <div><strong>{pr.name}</strong><small>{[pr.client_name, pr.module, pr.status].filter(Boolean).join(" · ") || t("Proyecto vinculado", "Linked project")}</small>
                <small>{pr.work_orders} {t("órdenes", "orders")} · {pr.open_tasks} {t("tareas abiertas", "open tasks")}</small></div>
                <div className={s.projectLinks}>
                  {projectHref(pr) && <Link href={projectHref(pr)!}>{t("Abrir proyecto", "Open project")}</Link>}
                  {pr.client_id && <Link href={`/admin/workspace/crm/clients/${pr.client_id}`}>{t("Ficha del cliente", "Client record")}</Link>}
                  {!pr.id && !pr.client_id && <span>{t("Sin vínculo", "Not linked")}</span>}
                </div>
              </li>
            ))}</ul> : <p className={s.empty}>{projectFilter ? t("No hay coincidencias.", "No matches.") : t("Todavía no tiene proyectos asignados.", "No projects assigned yet.")}</p>;
          })()}
          <Link className={s.linkBtn} href="/admin/search">{t("Abrir Finder global", "Open global Finder")}</Link>
        </section>
      )}

      {tab === "tasks" && <>
        <section className={s.block}>
          <h3>{t("Tareas abiertas", "Open tasks")}</h3>
          {!detail ? <div className={`${s.skeleton} ${s.skeletonLine}`} /> : detail.tasks.length ? (
            <ul className={s.taskList}>{detail.tasks.map(x => <li key={x.id} data-priority={x.priority}>
              <Link href={`/admin/workspace/crm/tasks?task=${x.id}`}>{x.title}</Link>
              <small>{x.status} · {x.priority}{x.due_at ? ` · ${t("vence", "due")} ${when(x.due_at)}` : ""}</small></li>)}</ul>
          ) : <p className={s.empty}>{t("Sin tareas abiertas.", "No open tasks.")}</p>}
          <Link className={s.linkBtn} href="/admin/workspace/crm/tasks?view=all">{t("Ver todas las tareas", "See all tasks")}</Link>
        </section>
        <section className={s.block}>
          <h3>{t("Asignar una tarea", "Assign a task")}</h3>
          <form className={s.form} onSubmit={e => run(e, f => ({ op: "task", assignee: member.user_id, title: f.get("title"), description: f.get("description"), priority: f.get("priority"), due_at: f.get("due_at") || null }), t("Tarea creada.", "Task created."))}>
            <label>{t("Título", "Title")}<input name="title" required maxLength={200} /></label>
            <label>{t("Descripción", "Description")}<textarea name="description" rows={2} maxLength={4000} /></label>
            <div className={s.row2}>
              <label>{t("Prioridad", "Priority")}<select name="priority" defaultValue="normal">{[["low", "Baja", "Low"], ["normal", "Normal", "Normal"], ["high", "Alta", "High"], ["urgent", "Urgente", "Urgent"]].map(([v, es, en]) => <option key={v} value={v}>{t(es, en)}</option>)}</select></label>
              <label>{t("Vence", "Due")}<input type="datetime-local" name="due_at" /></label>
            </div>
            <button type="submit" className={s.primary} disabled={busy}>{t("Crear tarea", "Create task")}</button>
          </form>
        </section>
      </>}

      {tab === "messages" && !self && <Thread member={member} data={data} lang={lang} when={when} onChanged={onChanged} />}
    </Drawer>
  );
}

function Thread({ member, data, lang, when, onChanged }: { member: Member; data: Data; lang: Lang; when: (v: string | null) => string; onChanged: () => void }) {
  const t = (es: string, en: string) => (lang === "en" ? en : es);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [tick, setTick] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = new AbortController();
    fetch(`${API}?thread=${member.user_id}`, { signal: c.signal }).then(r => r.json()).then(d => {
      setMessages(d.messages ?? []); setUnavailable(d.unavailable ?? null);
      // The server just marked incoming messages as read: refresh the unread badges.
      if ((d.messages ?? []).some((m: Message) => m.sender_id === member.user_id && !m.read_at)) onChanged();
    }).catch(() => undefined);
    return () => c.abort();
  }, [member.user_id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  // No realtime dependency: refresh every 20 s while the conversation is open and the tab is visible.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") setTick(n => n + 1); }, 20000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages?.length]);
  if (unavailable === "schema") return <p className={s.notice}>{t("La mensajería se activa al aplicar la migración de Oficina (20261103100000).", "Messaging activates once the Office migration (20261103100000) is applied.")}</p>;
  return (
    <section className={s.thread} aria-label={t("Conversación privada", "Private conversation")}>
      <ol className={s.messages} aria-live="polite">
        {!messages ? <li className={`${s.skeleton} ${s.skeletonLine}`} /> : messages.map(m => {
          const mine = m.sender_id === data.me, href = refHref(m.ref_type, m.ref_id);
          return <li key={m.id} data-mine={mine}>
            <p>{m.body}</p>
            {m.ref_type && <span className={s.refTag}>{href ? <Link href={href}>{t(...(REFS.find(r => r[0] === m.ref_type)?.slice(1) as [string, string]))} ↗</Link> : `${m.ref_type} ${m.ref_id?.slice(0, 8)}`}</span>}
            <small>{when(m.created_at)}{mine ? ` · ${m.read_at ? t("Leído", "Read") : t("Enviado", "Sent")}` : ""}</small>
          </li>;
        })}
        {messages && !messages.length && <li className={s.empty}>{t("Aún no hay mensajes. Escribe el primero.", "No messages yet. Write the first one.")}</li>}
      </ol>
      <div ref={end} aria-hidden="true" />
      <form className={s.composer} onSubmit={async e => {
        e.preventDefault();
        const form = e.currentTarget, f = new FormData(form);
        setBusy(true); setErr("");
        try { await post({ op: "message", to: member.user_id, body: f.get("body"), ref_type: f.get("ref_type") || null, ref_id: f.get("ref_id") || null }); form.reset(); setTick(n => n + 1); onChanged(); }
        catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
      }}>
        <label className={s.srOnly} htmlFor="office-msg">{t("Mensaje", "Message")}</label>
        <textarea id="office-msg" name="body" required maxLength={4000} rows={2} placeholder={`${t("Mensaje para", "Message to")} ${nameOf(member)}…`} />
        <RefFields lang={lang} />
        <button type="submit" className={s.primary} disabled={busy}>{t("Enviar", "Send")}</button>
        {err && <p role="alert" className={s.alert}>{err}</p>}
      </form>
    </section>
  );
}

function ManagerPanel({ manager, data, lang, when, onClose, onChanged }: { manager: Manager; data: Data; lang: Lang; when: (v: string | null) => string; onClose: () => void; onChanged: () => void }) {
  const t = (es: string, en: string) => (lang === "en" ? en : es);
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [ok, setOk] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [tick, setTick] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    fetch(`${API}?agent=${manager.key}`, { signal: c.signal }).then(r => r.json()).then(d => { setRequests(d.requests ?? []); setUnavailable(d.unavailable ?? null); }).catch(() => undefined);
    return () => c.abort();
  }, [manager.key, tick]);
  const who = (id: string) => { const m = data.members.find(x => x.user_id === id); return m ? nameOf(m) : id.slice(0, 8); };
  const pending = requests?.filter(r => r.status === "registered").length ?? 0;
  return (
    <Drawer lang={lang} onClose={onClose}
      title={<div className={s.idRow}><span className={`${s.agentMark} ${s.agentLarge}`} style={{ "--hue": manager.hue } as CSSProperties}>{manager.name.slice(0, 2)}</span><div>
        <p className={s.eyebrow}>{t("Manager virtual de IA · no es una persona", "Virtual AI manager · not a person")}</p>
        <h2 id="office-drawer-title">{manager.name}</h2>
        <p className={s.sub}>{lang === "en" ? manager.role.en : manager.role.es}</p>
      </div></div>}>
      <div className={s.statusRow} data-status={manager.status}>
        <span className={s.statusDot} aria-hidden="true" />
        <div><strong>{t(...STATUS[manager.status])}</strong>
          <p>{t("Avalon no tiene un backend de ejecución conectado para este manager. Nada de lo que escribas se ejecuta automáticamente.", "Avalon has no execution backend connected for this manager. Nothing you write runs automatically.")}</p></div>
      </div>
      <dl className={s.facts}>
        <dt>{t("Función", "Role")}</dt><dd>{lang === "en" ? manager.role.en : manager.role.es}</dd>
        <dt>{t("Módulos a su cargo", "Modules")}</dt><dd>{manager.modules.map(m => (lang === "en" ? m.en : m.es)).join(", ")}</dd>
        <dt>{t("Herramientas conectadas", "Connected tools")}</dt><dd className={s.muted}>{t("Ninguna verificable desde Avalon", "None verifiable from Avalon")}</dd>
        <dt>{t("Automatizaciones configuradas", "Configured automations")}</dt><dd className={s.muted}>{lang === "en" ? data.integration.externalNote.en : data.integration.externalNote.es}</dd>
        <dt>{t("Últimas ejecuciones verificadas", "Last verified runs")}</dt><dd className={s.muted}>{t("Ninguna registrada", "None recorded")}</dd>
        <dt>{t("Errores detectados", "Errors detected")}</dt><dd className={s.muted}>{t("Sin datos (no hay ejecuciones)", "No data (no runs)")}</dd>
        <dt>{t("Consumo de IA", "AI usage")}</dt><dd><Link href="/admin/workspace/crm/ai-usage">{t("Ver centro de uso de IA", "Open AI usage center")}</Link></dd>
        <dt>{t("Requiere aprobación", "Requires approval")}</dt><dd>{t("Cualquier cambio en producción, fusiones, migraciones y gasto de créditos.", "Any production change, merges, migrations and credit spend.")}</dd>
      </dl>
      <dl className={s.stats}>
        <div><dt>{t("Solicitudes pendientes", "Open requests")}</dt><dd>{requests ? pending : "—"}</dd></div>
        <div><dt>{t("Terminadas", "Completed")}</dt><dd>0</dd></div>
      </dl>
      {unavailable === "schema" ? <p className={s.notice}>{t("La bandeja de solicitudes se activa al aplicar la migración de Oficina.", "The request inbox activates once the Office migration is applied.")}</p> : <>
        <form className={s.form} onSubmit={async e => {
          e.preventDefault();
          const form = e.currentTarget, f = new FormData(form);
          setBusy(true); setErr(""); setOk("");
          try { const d = await post({ op: "agent_request", agent: manager.key, body: f.get("body"), ref_type: f.get("ref_type") || null, ref_id: f.get("ref_id") || null }); form.reset(); setOk(d.notice); setTick(n => n + 1); onChanged(); }
          catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
        }}>
          <label>{t("Solicitud para", "Request for")} {manager.name}<textarea name="body" required maxLength={2000} rows={3} placeholder={lang === "en" ? manager.examples.en : manager.examples.es} /></label>
          <RefFields lang={lang} />
          <button type="submit" className={s.primary} disabled={busy}>{t("Registrar solicitud", "Log request")}</button>
        </form>
        {ok && <p role="status" className={s.notice}>{ok}</p>}
        {err && <p role="alert" className={s.alert}>{err}</p>}
        <h3 className={s.h3}>{t("Bandeja de solicitudes", "Request inbox")}</h3>
        {!requests ? <div className={`${s.skeleton} ${s.skeletonLine}`} /> : requests.length ? (
          <ol className={s.feed}>{requests.map(r => <li key={r.id} data-result={r.status === "cancelled" ? "skipped" : "pending"}>
            <strong>{r.status === "registered" ? t("Registrada · sin ejecutar", "Logged · not run") : t("Cancelada", "Cancelled")}</strong>
            <span>{r.body}</span>
            <small>{when(r.created_at)} · {who(r.created_by)}{r.ref_type ? ` · ${r.ref_type}` : ""}</small>
            {r.status === "registered" && r.created_by === data.me && <button type="button" className={s.textBtn} disabled={busy} onClick={async () => {
              setBusy(true); setErr("");
              try { await post({ op: "cancel_request", id: r.id }); setTick(n => n + 1); onChanged(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
            }}>{t("Cancelar", "Cancel")}</button>}
          </li>)}</ol>
        ) : <p className={s.empty}>{t("Sin solicitudes registradas.", "No requests logged.")}</p>}
      </>}
    </Drawer>
  );
}
