"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { LanguageSwitch } from "./language-switch";
import { Icon } from "./icons";
import s from "./suite.module.css";

export type ChromeNotification = { tone: "warning" | "danger" | "info"; text: string; href: string };
type User = { name: string; email: string; role: string; initial: string };

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

export function SuiteChrome({ lang, collapsed: initialCollapsed, section, user, notifications, schemaReady, nav, logout, children }: {
  lang: Lang; collapsed: boolean; section: string; user: User; notifications: ChromeNotification[]; schemaReady: boolean;
  nav: ReactNode; logout: ReactNode; children: ReactNode;
}) {
  const es = lang === "es";
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState<"profile" | "alerts" | null>(null);
  const pathname = usePathname();
  const menuId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const alertsId = useId();
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
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

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
              <defs><linearGradient id="os-mark" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#22e3ff" /><stop offset=".5" stopColor="#6d5bff" /><stop offset="1" stopColor="#f45cff" /></linearGradient></defs>
              <path d="M70 12 131 112H99L70 62 40 112H9ZM70 79 91 115H49Z" fill="url(#os-mark)" />
            </svg>
            <span className={s.brandText}><strong>AVALON</strong><small>CORE AGENCY · OS</small></span>
          </Link>
          <button type="button" className={s.collapse} onClick={toggleCollapsed} aria-controls="os-sidebar" aria-expanded={!collapsed}
            aria-label={collapsed ? (es ? "Expandir menú" : "Expand menu") : (es ? "Contraer menú" : "Collapse menu")}>
            <Icon name="dots" />
          </button>
          <button type="button" className={s.drawerClose} onClick={() => setDrawer(false)} aria-label={es ? "Cerrar menú" : "Close menu"}>
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
                aria-label={`${es ? "Notificaciones" : "Notifications"}: ${notifications.length}`}>
                <Icon name="bell" />
                {notifications.length > 0 && <span className={s.badge} aria-hidden="true">{notifications.length}</span>}
              </button>
              {menu === "alerts" && (
                <div className={s.popover} id={alertsId} role="region" aria-label={es ? "Notificaciones" : "Notifications"}>
                  <p className={s.popoverTitle}>{es ? "Notificaciones" : "Notifications"}</p>
                  {notifications.length === 0 ? <p className={s.popoverEmpty}>{es ? "No hay notificaciones." : "No notifications."}</p> : (
                    <ul className={s.alertList}>
                      {notifications.map(n => <li key={n.text} data-tone={n.tone}><Link href={n.href}>{n.text}</Link></li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className={s.popoverWrap} ref={profileRef}>
              <button type="button" className={s.profileButton} aria-expanded={menu === "profile"} aria-controls={menuId} onClick={() => setMenu(menu === "profile" ? null : "profile")}
                aria-label={es ? `Menú de ${user.name}` : `${user.name} menu`}>
                <span className={s.avatar} aria-hidden="true">{user.initial}</span>
                <span className={s.profileText}><strong>{user.name}</strong><small data-role={user.role}>{es ? "Propietario" : "Owner"} · {user.role}</small></span>
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
