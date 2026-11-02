import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Panel, Badge } from "@/components/os/ui";
import s from "@/components/os/os.module.css";
import { requireOwner, displayName } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { signOut } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { user, role } = await requireOwner();
  const lang = await getLang();
  const provider = typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : "—";
  const passwordEnabled = process.env.AUTH_PASSWORD_LOGIN_ENABLED === "true";
  return (
    <Suite active="profile">
      <PageHeader eyebrow={pick(lang, "Cuenta", "Account")} title={displayName(user)} description={user.email ?? undefined} />
      <div className={s.split}>
        <Panel title={pick(lang, "Identidad", "Identity")} id="identity">
          <div className={s.tableWrap}>
            <table className={s.table}>
              <tbody>
                <tr><td>{pick(lang, "Correo", "Email")}</td><td>{user.email ?? "—"} {user.email_confirmed_at && <Badge tone="ok">{pick(lang, "Verificado", "Verified")}</Badge>}</td></tr>
                <tr><td>{pick(lang, "Rol", "Role")}</td><td><Badge tone="info">{pick(lang, "Propietario", "Owner")} · {role}</Badge></td></tr>
                <tr><td>{pick(lang, "Método de acceso", "Sign-in method")}</td><td>{provider === "google" ? "Google" : provider === "email" ? pick(lang, "Correo y contraseña", "Email and password") : provider}</td></tr>
                <tr><td>{pick(lang, "Último acceso", "Last sign-in")}</td><td>{formatDate(lang, user.last_sign_in_at, true)}</td></tr>
                <tr><td>{pick(lang, "Cuenta creada", "Account created")}</td><td>{formatDate(lang, user.created_at)}</td></tr>
                <tr><td>ID</td><td className={s.meta}>{user.id}</td></tr>
              </tbody>
            </table>
          </div>
          <p className={s.meta}>{pick(lang, "El nombre visible proviene del proveedor de identidad. Los permisos dependen solo de la membresía en la base de datos.", "The display name comes from the identity provider. Permissions depend only on the database membership.")}</p>
        </Panel>
        <div>
          <Panel title={pick(lang, "Sesión", "Session")} id="session">
            <form action={signOut} className={s.form}>
              <p className={s.meta}>{pick(lang, "Cerrar sesión revoca la sesión actual en Supabase y borra las cookies de este dispositivo.", "Signing out revokes the current Supabase session and clears this device's cookies.")}</p>
              <div className={s.actions}><button className={s.btnDanger} type="submit">{pick(lang, "Cerrar sesión", "Sign out")}</button></div>
            </form>
          </Panel>
          {passwordEnabled && (
            <Panel title={pick(lang, "Contraseña", "Password")} id="password">
              <p className={s.meta}>{pick(lang, "Para cambiarla, solicita un enlace de recuperación.", "To change it, request a recovery link.")}</p>
              <Link className={s.btn} href="/admin/forgot-password">{pick(lang, "Solicitar enlace", "Request link")}</Link>
            </Panel>
          )}
        </div>
      </div>
    </Suite>
  );
}
