import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Panel, Badge } from "@/components/os/ui";
import s from "@/components/os/os.module.css";
import { requireOwner, displayName } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { signOut } from "@/app/dashboard/actions";
import { removeTotpFactor } from "@/app/admin/mfa-actions";
import { MfaEnroll } from "@/components/os/mfa-settings";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ mfa?: string }> }) {
  const { user, role, supabase } = await requireOwner();
  const { mfa } = await searchParams;
  const factors = await supabase.auth.mfa.listFactors().catch(() => null);
  const verified = factors?.data?.totp.filter(f => f.status === "verified") ?? [];
  const lang = await getLang();
  const provider = typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : "—";
  const passwordEnabled = true;
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
          <Panel title={pick(lang, "Verificación en dos pasos (MFA)", "Two-step verification (MFA)")} id="mfa">
            {mfa === "removed" && <p className={s.meta} role="status">{pick(lang, "Factor eliminado.", "Factor removed.")}</p>}
            {mfa === "failed" && <p className={s.meta} role="alert">{pick(lang, "No se pudo eliminar. Cierra sesión, vuelve a entrar con tu código y reinténtalo.", "Could not remove it. Sign out, sign back in with your code and retry.")}</p>}
            {mfa === "required" && <p className={s.meta} role="alert">{pick(lang, "Marca la casilla de confirmación.", "Tick the confirmation box.")}</p>}
            {factors?.error ? <p className={s.meta}>{pick(lang, "No se pudo consultar el estado de MFA.", "Could not read MFA status.")}</p> : verified.length > 0 ? (
              <div className={s.form}>
                <p><Badge tone="ok">{pick(lang, "Activada", "Enabled")}</Badge> {pick(lang, "Cada inicio de sesión pide un código de tu app.", "Every sign-in asks for a code from your app.")}</p>
                {verified.map(f => (
                  <form key={f.id} action={removeTotpFactor} className={s.form}>
                    <input type="hidden" name="factorId" value={f.id} />
                    <p className={s.meta}>{f.friendly_name || "TOTP"} · {pick(lang, "registrado", "enrolled")} {formatDate(lang, f.created_at)}</p>
                    <label className={s.check}><input type="checkbox" name="confirm" value="yes" required />{pick(lang, "Confirmo que quiero desactivar la verificación en dos pasos.", "I confirm disabling two-step verification.")}</label>
                    <div className={s.actions}><button className={s.btnDanger} type="submit">{pick(lang, "Desactivar", "Disable")}</button></div>
                  </form>
                ))}
              </div>
            ) : <MfaEnroll lang={lang} />}
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
