"use client";
import Link from "next/link";
import { PresenceAvatar, presenceName } from "@/components/office/presence-avatar";
import type { StaffPresence } from "@/lib/office/presence";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { LanguageSwitch } from "./language-switch";
import { SUITE_POLL_INTERVAL_MS, shouldRefreshNow } from "./poll-policy";
import { Icon } from "./icons";
import s from "./suite.module.css";

export type ChromeNotification = { tone: "warning" | "danger" | "info"; text: string; href: string };
export type StaffNotice = { id: string; severity: "urgent" | "normal"; category: string; title: string; body: string; link: string; created_at: string };
type User = { name: string; email: string; role: string; initial: string; title?: string; photoUrl?: string | null };

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open, close]);
  return ref;
}

export function SuiteChrome({ lang, collapsed: initialCollapsed, section, user, notifications, initialStaffNotices, initialUnread, initialPresence, schemaReady, nav, logout, children }: {
  lang: Lang; collapsed: boolean; section: string; user: User; notifications: ChromeNotification[]; initialStaffNotices: StaffNotice[]; initialUnread: number; initialPresence: StaffPresence; schemaReady: boolean;
  nav: ReactNode; logout: ReactNode; children: ReactNode;
}) {
  const es = lang === "es";
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState<"profile" | "alerts" | null>(null);
  const [staffNotices, setStaffNotices] = useState<StaffNotice[]>(initialStaffNotices);
  const [unread, setUnread] = useState(initialUnread);
  const [noticeError, setNoticeError] = useState(false);
  const [myPresence, setMyPresence] = useState<StaffPresence>(initialPresence);
  const pathname = usePathname();
  const menuId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const alertsId = useId();
  const inboxLastAttemptAt = useRef(0);
  const presenceLastAttemptAt = useRef(0);
  // A dedicated thumb-friendly dock keeps the highest-frequency workflows visible.
  // Drawer navigation remains the complete, accessible route list.
  const salesActive = pathname.startsWith("/admin/workspace/crm/sales");
  const radarActive = pathname.startsWith("/admin/workspace/crm/hunter");
  const pipelineActive = pathname.startsWith("/admin/workspace/crm/leads") || pathname === "/admin/workspace/crm";
  const dashboardActive = pathname.startsWith("/admin/dashboard");
  const closeMenu = () => setMenu(null);
  const profileRef = useDismiss(menu === "profile", closeMenu);
  const alertsRef = useDismiss(menu === "alerts", closeMenu);

  useEffect(() => { setDrawer(false); setMenu(null); }, [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    document.addEventListener("keydown", onKey);
    // iOS Safari: lock background scrolling and move focus into the open drawer.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.querySelector<HTMLElement>("#os-sidebar button[data-drawer-close]")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; };
  }, [drawer]);

  // Fetch only the signed-in member's persisted inbox; refresh on focus and navigation.
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    const refresh = async (throttle = false) => {
      if (inFlight) return;
      const now = Date.now();
      if (throttle && !shouldRefreshNow(inboxLastAttemptAt.current, now, document.visibilityState === "visible")) return;
      inboxLastAttemptAt.current = now;
      inFlight = true;
      try {
        const response = await fetch("/admin/api/notifications", { cache: "no-store" });
        if (!response.ok) throw Error("inbox");
        const data = await response.json() as { notices: StaffNotice[]; unread: number };
        if (alive) { setStaffNotices(data.notices ?? []); setUnread(data.unread ?? 0); setNoticeError(false); }
      } catch { if (alive) setNoticeError(true); }
      finally { inFlight = false; }
    };
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(true); }, SUITE_POLL_INTERVAL_MS);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(true); };
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [pathname]);

  // Synchronized with Office every 30s. Shows schedule-based availability, not a login signal.
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const update = async (throttle = false) => {
      if (inFlight) return;
      const now = Date.now();
      if (throttle && !shouldRefreshNow(presenceLastAttemptAt.current, now, document.visibilityState === "visible")) return;
      presenceLastAttemptAt.current = now;
      inFlight = true;
      try {
        const response = await fetch("/admin/api/staff-presence", { cache: "no-store" });
        if (!response.ok) return;
        const info = await response.json() as { presence?: StaffPresence };
        if (active && info.presence) setMyPresence(info.presence);
      } catch { /* Keep last known status on a transient connectivity failure. */ }
      finally { inFlight = false; }
    };
    void update();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void update(true);
    }, SUITE_POLL_INTERVAL_MS);
    const onFocus = () => { if (document.visibilityState === "visible") void update(true); };
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [pathname]);

  const markNotice = async (id: string) => {
    try {
      const response = await fetch("/admin/api/notifications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }), keepalive: true
      });
      if (!response.ok) throw Error("mark");
      setStaffNotices(items => items.filter(item => item.id !== id));
      setUnread(x => Math.max(0, x - 1));
    } catch { setNoticeError(true); }
  };

  // "/" focuses global search unless the user is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `avalon-sidebar=${next ? "collapsed" : "expanded"}; path=/admin; max-age=31536000; samesite=lax${secure}`;
  };

  return (
    <div className={s.shell} data-collapsed={collapsed ? "true" : "false"} data-drawer={drawer ? "open" : "closed"}>
      <a className="skip-link" href="#main">{es ? "Saltar al contenido" : "Skip to content"}</a>
      <aside className={s.sidebar} id="os-sidebar" aria-label="Avalon OS">
        <div className={s.brandRow}>
          <Link href="/admin/dashboard" className={s.brand} aria-label="Avalon OS — Dashboard">
            <svg viewBox="0 0 140 130" className={s.logo} aria-hidden="true">
              <defs><linearGradient id="os-mark" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#64d7f5" /><stop offset=".5" stopColor="#7668e8" /><stop offset="1" stopColor="#b9a3ff" /></linearGradient></defs>
              <path d="M70 12 131 112H99L70 62 40 112H9ZM70 79 91 115H49Z" fill="url(#os-mark)" />
            </svg>
            <span className={s.brandText}><strong>AVALON</strong><small>CORE AGENCY · OS</small></span>
          </Link>
          <button type="button" className={s.collapse} onClick={toggleCollapsed} aria-controls="os-sidebar" aria-expanded={!collapsed}
            aria-label={collapsed ? (es ? "Expandir menú" : "Expand menu") : (es ? "Contraer menú" : "Collapse menu")}>
            <Icon name="dots" />
          </button>
          <button type="button" className={s.drawerClose} data-drawer-close onClick={() => setDrawer(false)} aria-label={es ? "Cerrar menú" : "Close menu"}>
            <Icon name="close" />
          </button>
        </div>
        {nav}
        <div className={s.sidebarFooter}>{logout}</div>
      </aside>
      <div className={s.scrim} onClick={() => setDrawer(false)} aria-hidden="true" />

      <div className={s.main}>
        <header className={s.topbar}>
          <button type="button" className={s.menuButton} onClick={() => setDrawer(true)} aria-controls="os-sidebar" aria-expanded={drawer} aria-label={es ? "Abrir menú" : "Open menu"}>
            <Icon name="menu" />
          </button>
          <div className={s.titleBlock}>
            <span className={s.eyebrow}>Avalon Operations Center</span>
            <span className={s.section} aria-live="polite">{section}</span>
          </div>
          <form className={s.search} action="/admin/search" role="search">
            <label className="sr-only" htmlFor="os-search">{es ? "Buscar en Avalon OS" : "Search Avalon OS"}</label>
            <input id="os-search" ref={searchRef} name="q" type="search" maxLength={80} autoComplete="off"
              placeholder={es ? "Buscar…  ( / )" : "Search…  ( / )"} />
          </form>
          <div className={s.topActions}>
            <span className={s.status} data-ok={schemaReady ? "true" : "false"} title={schemaReady ? (es ? "Base de datos de módulos activa" : "Module database active") : (es ? "Migración de módulos pendiente" : "Module migration pending")}>
              <span className={s.dot} aria-hidden="true" />
              <span className={s.statusLabel}>{schemaReady ? (es ? "Sistemas activos" : "Systems online") : (es ? "Migración pendiente" : "Migration pending")}</span>
            </span>
            <LanguageSwitch lang={lang} className={s.lang} />
            <div className={s.popoverWrap} ref={alertsRef}>
              <button type="button" className={s.iconButton} aria-expanded={menu === "alerts"} aria-controls={alertsId} onClick={() => setMenu(menu === "alerts" ? null : "alerts")}
                aria-label={`${es ? "Notificaciones" : "Notifications"}: ${unread + notifications.length}`}>
                <Icon name="bell" />
                {unread + notifications.length > 0 && <span className={s.badge} aria-hidden="true">{unread + notifications.length}</span>}
              </button>
              {menu === "alerts" && (
                <div className={`${s.popover} ${s.alertPopover}`} id={alertsId} role="region" aria-label={es ? "Notificaciones" : "Notifications"}>
                  <div className={s.alertHeader}>
                    <div>
                      <span className={s.alertEyebrow}>{es ? "AVALON STAFF" : "AVALON STAFF"}</span>
                      <h2>{es ? "Notificaciones" : "Notifications"}</h2>
                      <p>{es ? "Lo importante para tu jornada, en un solo lugar." : "What matters for your workday, in one place."}</p>
                    </div>
                    <span className={s.alertCount} aria-label={es ? `${unread} sin leer` : `${unread} unread`}>{unread}</span>
                  </div>
                  {staffNotices.length === 0 && notifications.length === 0 ? (
                    <div className={s.alertEmptyState}>
                      <span className={s.alertEmptyMark} aria-hidden="true">✓</span>
                      <strong>{es ? "Todo al día" : "All caught up"}</strong>
                      <p>{es ? "No tienes avisos pendientes. ¡Buen trabajo!" : "No pending alerts. You're all set!"}</p>
                    </div>
                  ) : (
                    <ul className={s.alertList}>
                      {staffNotices.map(n => <li key={n.id} className={s.alertItem} data-tone={n.severity === "urgent" ? "danger" : "info"}>
                        <div className={s.alertItemHead}>
                          <span className={s.alertCategory}>{n.category === "task" ? (es ? "Tarea" : "Task") : n.category === "calendar" ? (es ? "Calendario" : "Calendar") : n.category === "message" ? (es ? "Mensaje" : "Message") : n.category === "project" ? (es ? "Proyecto" : "Project") : n.category}</span>
                          <time className={s.alertTimestamp} dateTime={n.created_at}>{new Date(n.created_at).toLocaleDateString(es ? "es" : "en", {day:"numeric",month:"short",timeZone:"UTC"})}</time>
                        </div>
                        <Link className={s.alertTitle} href={n.link || "/admin/workspace/crm/notifications"} onClick={() => { void markNotice(n.id); }}>{n.title}</Link>
                        {n.body && <p className={s.alertDescription}>{n.body}</p>}
                        <button className={s.alertRead} type="button" onClick={() => { void markNotice(n.id); }} aria-label={es ? "Marcar leído" : "Mark read"}>{es ? "Marcar como leído" : "Mark as read"} <span aria-hidden="true">✓</span></button>
                      </li>)}
                      {notifications.map(n => <li key={n.text} className={s.alertItem} data-tone={n.tone}>
                        <span className={s.alertCategory}>{es ? "Sistema" : "System"}</span>
                        <Link className={s.alertTitle} href={n.href}>{n.text}</Link>
                      </li>)}
                    </ul>
                  )}
                  {noticeError && <p role="alert" className={s.alertError}>{es ? "No se pudo sincronizar el buzón." : "Could not sync inbox."}</p>}
                  <Link href="/admin/workspace/crm/notifications" className={s.alertFooter}>{es ? "Abrir centro de notificaciones" : "Open notification center"} <span aria-hidden="true">↗</span></Link>
                </div>
              )}
            </div>
            <div className={s.popoverWrap} ref={profileRef}>
              <button type="button" className={s.profileButton} aria-expanded={menu === "profile"} aria-controls={menuId} onClick={() => setMenu(menu === "profile" ? null : "profile")}
                aria-label={es ? `Menú de ${user.name}` : `${user.name} menu`}>
                <PresenceAvatar presence={myPresence} size={34} lang={lang}>
                  {user.photoUrl ? <img className={s.avatar} src={user.photoUrl} alt="" width={34} height={34} style={{objectFit:"cover",borderRadius:"50%"}}/> :
                    <span className={s.avatar} aria-hidden="true">{user.initial}</span>}
                </PresenceAvatar>
                <span className={s.profileText}><strong>{user.name}</strong><small data-role={user.role}>{user.title || (es ? "Miembro del staff" : "Staff member")} · {presenceName(myPresence.state, lang)}</small></span>
              </button>
              {menu === "profile" && (
                <div className={s.popover} id={menuId}>
                  <p className={s.popoverTitle}>{user.email}</p>
                  <ul className={s.menuList}>
                    <li><Link href="/admin/profile"><Icon name="profile" size={18} />{es ? "Mi perfil" : "My profile"}</Link></li>
                    <li><Link href="/admin/settings"><Icon name="settings" size={18} />{es ? "Configuración" : "Settings"}</Link></li>
                    <li className={s.menuLogout}>{logout}</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main" className={s.content} tabIndex={-1}>{children}</main>
        <nav className={s.mobileDock} aria-label={es ? "Accesos rápidos de Avalon" : "Avalon quick navigation"}>
          <Link href="/admin/dashboard" aria-current={dashboardActive ? "page" : undefined}>
            <Icon name="dashboard" size={21} /><span>{es ? "Inicio" : "Home"}</span>
          </Link>
          <Link href="/admin/workspace/crm/hunter" aria-current={radarActive ? "page" : undefined}>
            <Icon name="search" size={21} /><span>Radar</span>
          </Link>
          <Link href="/admin/workspace/crm/leads" aria-current={pipelineActive ? "page" : undefined}>
            <Icon name="crm" size={21} /><span>Pipeline</span>
          </Link>
          <Link href="/admin/workspace/crm/sales" aria-current={salesActive ? "page" : undefined}>
            <Icon name="store" size={21} /><span>{es ? "Ventas" : "Sales"}</span>
          </Link>
          <button type="button" onClick={() => setDrawer(true)} aria-controls="os-sidebar" aria-expanded={drawer}
            aria-label={es ? "Abrir todos los módulos" : "Open all modules"}>
            <Icon name="menu" size={21} /><span>{es ? "Menú" : "Menu"}</span>
          </button>
        </nav>
        <footer className={s.footer}>AVALON OS · AI. PEOPLE. SYSTEMS.</footer>
      </div>
    </div>
  );
}
