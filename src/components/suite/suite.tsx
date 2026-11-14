import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { requireOwner, displayName } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { countRows } from "@/lib/os/data";
import { signOut } from "@/app/dashboard/actions";
import { modules } from "./modules";
import { Icon } from "./icons";
import { SuiteChrome, type ChromeNotification, type StaffNotice } from "./chrome";
import { loadStaffPresence } from "@/lib/office/presence-query";
import { INACTIVE } from "@/lib/office/presence";
import s from "./suite.module.css";

const sectionNames: Record<string, { es: string; en: string }> = {
  dashboard: { es: "Dashboard", en: "Dashboard" },
  settings: { es: "Configuración", en: "Settings" },
  profile: { es: "Perfil", en: "Profile" },
  "dev-bridge": { es: "Dev Bridge", en: "Dev Bridge" },
  search: { es: "Búsqueda", en: "Search" },
  security: { es: "Seguridad", en: "Security" },
  "ai-communications": { es: "COMMUNICATION HUB", en: "COMMUNICATION HUB" },
};

/**
 * Private shell for every Avalon OS page. Public API is stable:
 * <Suite active="crm">…</Suite> is used by the CRM module branch.
 */
export async function Suite({ children, active = "dashboard" }: { children: ReactNode; active?: string }) {
  const session = await requireOwner();
  const lang = await getLang();
  const collapsed = (await cookies()).get("avalon-sidebar")?.value === "collapsed";
  const today = new Date().toISOString().slice(0, 10);
  const overdue = await countRows(session.supabase, "os_marketing_items", [["lt", "planned_for", today], ["not_in", "status", ["published", "cancelled"]]]);

  const notifications: ChromeNotification[] = [];
  if (overdue.error === "schema_pending") {
    notifications.push({ tone: "warning", text: pick(lang, "La migración de módulos está pendiente de aprobación. Los módulos no pueden guardar datos todavía.", "Module migration is pending approval. Modules cannot save data yet."), href: "/admin/settings" });
  } else if (overdue.count) {
    notifications.push({ tone: "danger", text: pick(lang, `${overdue.count} contenido(s) de marketing con fecha vencida.`, `${overdue.count} marketing item(s) past their planned date.`), href: "/admin/workspace/marketing-hub" });
  }

  const [office, inbox, presence] = await Promise.all([
    session.supabase.from("office_profiles").select("display_name,title,photo_sha256").eq("user_id",session.user.id).maybeSingle(),
    session.supabase.from("crm_notifications").select("id,severity,category,title,body,link,created_at", { count:"exact" })
      .eq("recipient_id",session.user.id).is("read_at",null).order("created_at",{ascending:false}).limit(20),
    loadStaffPresence(session.supabase, [session.user.id]),
  ]);
  const name = office.data?.display_name || displayName(session.user);
  const photoHash = office.data?.photo_sha256 ?? null;
  const photoUrl = photoHash ? `/admin/workspace/crm/office/photo/${session.user.id}?v=${photoHash}` : null;
  const staffNotices = (inbox.data ?? []) as StaffNotice[];
  const unread = inbox.count ?? 0;
  // Receptionist and Chatbot pages are sub-products of the single top-level Communication Hub.
  const navActive = active === "ai-receptionist" || active === "ai-chatbots" ? "ai-communications" : active;
  const current = modules.find(m => m.slug === navActive);
  const section = current ? current.name : pick(lang, sectionNames[active]?.es ?? "Dashboard", sectionNames[active]?.en ?? "Dashboard");
  const logout = (
    <form action={signOut} className={s.logoutForm}>
      <button type="submit" className={s.navItem}>
        <Icon name="logout" /><span className={s.navLabel}>{pick(lang, "Cerrar sesión", "Sign out")}</span>
      </button>
    </form>
  );
  const nav = (
    <nav aria-label={pick(lang, "Navegación principal", "Main navigation")} className={s.nav}>
      <Link className={s.navItem} aria-current={active === "dashboard" ? "page" : undefined} href="/admin/dashboard" title="Dashboard">
        <Icon name="dashboard" /><span className={s.navLabel}>Dashboard</span>
      </Link>
      <Link className={s.navItem} aria-current={active === "search" ? "page" : undefined} href="/admin/search" title={pick(lang, "Buscar", "Search")}>
        <Icon name="search" /><span className={s.navLabel}>{pick(lang, "Buscar", "Search")}</span>
      </Link>
      <p className={s.navGroup}>{pick(lang, "Módulos", "Modules")}</p>
      {modules.map(m => (
        <Link key={m.slug} className={s.navItem} data-accent={m.accent} aria-current={navActive === m.slug ? "page" : undefined} href={m.href} title={m.name}>
          <Icon name={m.icon} /><span className={s.navLabel}>{m.name}</span>
        </Link>
      ))}
      <Link className={s.navItem} href="/admin/dev-bridge" aria-current={active === "dev-bridge" ? "page" : undefined}><Icon name="blueprint" /><span className={s.navLabel}>Dev Bridge</span></Link>
      <p className={s.navGroup}>{pick(lang, "Cuenta", "Account")}</p>
      <Link className={s.navItem} aria-current={active === "settings" ? "page" : undefined} href="/admin/settings" title={pick(lang, "Configuración", "Settings")}>
        <Icon name="settings" /><span className={s.navLabel}>{pick(lang, "Configuración", "Settings")}</span>
      </Link>
      <Link className={s.navItem} aria-current={active === "security" ? "page" : undefined} href="/admin/security" title={pick(lang, "Seguridad", "Security")}>
        <Icon name="shield" /><span className={s.navLabel}>{pick(lang, "Seguridad", "Security")}</span>
      </Link>
      <Link className={s.navItem} aria-current={active === "profile" ? "page" : undefined} href="/admin/profile" title={pick(lang, "Perfil", "Profile")}>
        <Icon name="profile" /><span className={s.navLabel}>{pick(lang, "Perfil", "Profile")}</span>
      </Link>
    </nav>
  );

  return (
    <SuiteChrome
      lang={lang}
      collapsed={collapsed}
      section={section}
      user={{ name, email: session.user.email ?? "", role: session.role, initial: name.slice(0, 1).toUpperCase(), title: office.data?.title ?? "", photoUrl }}
      notifications={notifications}
      initialStaffNotices={staffNotices}
      initialUnread={unread}
      initialPresence={presence.byUser[session.user.id] ?? INACTIVE}
      schemaReady={overdue.error !== "schema_pending"}
      nav={nav}
      logout={logout}
    >
      {children}
    </SuiteChrome>
  );
}

export { ModuleCards } from "./module-cards";
