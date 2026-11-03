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
import { MyProfilePhoto } from "@/components/office/my-profile-photo";
import { saveStaffProfile, saveStaffAvailability, addStaffTimeOff, deleteStaffTimeOff } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ mfa?: string; profile?: string }> }) {
  const { user, role, supabase } = await requireOwner();
  const { mfa, profile: profileStatus } = await searchParams;
  const factors = await supabase.auth.mfa.listFactors().catch(() => null);
  const verified = factors?.data?.totp.filter(f => f.status === "verified") ?? [];
  const lang = await getLang();
  const [office, availability, absences] = await Promise.all([
    supabase.from("office_profiles").select("display_name,title,department,bio,specialties,photo_sha256").eq("user_id",user.id).maybeSingle(),
    supabase.from("office_availability").select("timezone,weekly_hours,quiet_start,quiet_end").eq("user_id",user.id).maybeSingle(),
    supabase.from("office_time_off").select("id,starts_on,ends_on,reason").eq("user_id",user.id).gte("ends_on",new Date().toISOString().slice(0,10)).order("starts_on").limit(30),
  ]);
  const staff = office.data;
  const prefs = availability.data;
  const schedule = (prefs?.weekly_hours ?? {}) as Record<string, string[]>;
  const weekdays = [["mon","Lunes"],["tue","Martes"],["wed","Miércoles"],["thu","Jueves"],["fri","Viernes"],["sat","Sábado"],["sun","Domingo"]] as const;
  const profileName = staff?.display_name || displayName(user);
  const profileMessage = profileStatus === "saved" ? "Cambios guardados." : profileStatus === "invalid" ? "Revisa los datos y horarios." : profileStatus === "failed" ? "No se pudo guardar. Comprueba el estado de la base de datos." : "";
  const provider = typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : "—";
  const passwordEnabled = true;
  return (
    <Suite active="profile">
      <PageHeader eyebrow={pick(lang, "Cuenta", "Account")} title={profileName} description={user.email ?? undefined} />
      {profileMessage && <p role={profileStatus === "saved" ? "status" : "alert"} className={s.meta}>{profileMessage}</p>}
      <Panel title="Mi perfil profesional" id="staff-identity">
        <p className={s.meta}>Tu nombre y foto se utilizan en la cabecera, el directorio de Oficina y los flujos de trabajo. El cargo no cambia tus permisos de acceso.</p>
        {office.error ? <p role="alert">No se pudo cargar el perfil de Oficina.</p> : <>
          <MyProfilePhoto userId={user.id} photoHash={staff?.photo_sha256 ?? null} name={profileName}/>
          <form action={saveStaffProfile} className={s.form}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:12 }}>
              <label>Nombre visible<input name="display_name" maxLength={80} required defaultValue={staff?.display_name || displayName(user)} /></label>
              <label>Cargo profesional<input name="title" maxLength={80} placeholder="Director de operaciones" defaultValue={staff?.title ?? ""}/></label>
              <label>Departamento<input name="department" maxLength={80} placeholder="Operaciones / CRM" defaultValue={staff?.department ?? ""}/></label>
              <label>Especialidades (separadas por comas)<input name="specialties" maxLength={330} defaultValue={(staff?.specialties ?? []).join(", ")}/></label>
            </div>
            <label>Descripción profesional<textarea name="bio" rows={3} maxLength={600} defaultValue={staff?.bio ?? ""}/></label>
            <div className={s.actions}><button type="submit" className={s.btn}>Guardar perfil</button></div>
          </form>
        </>}
      </Panel>
      <Panel title="Disponibilidad y horarios" id="availability">
        <p className={s.meta}>Define tu horario habitual y zona horaria. Son horarios informativos para que el equipo pueda coordinar citas y tareas; la disponibilidad no bloquea todavía la creación de eventos.</p>
        {availability.error ? <p role="alert">Los horarios aún no están disponibles en este entorno.</p> :
        <form action={saveStaffAvailability} className={s.form}>
          <label>Zona horaria (IANA)
            <select name="timezone" defaultValue={prefs?.timezone ?? "America/New_York"}>
              {["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Puerto_Rico","America/Bogota","America/Mexico_City","Europe/Madrid","UTC"].map(tz=><option key={tz} value={tz}>{tz}</option>)}
            </select>
          </label>
          <div style={{ display:"grid", gap:10 }}>
            {weekdays.map(([day,label]) => <div key={day} style={{ display:"flex",flexWrap:"wrap",alignItems:"center",gap:12 }}>
              <label style={{ minWidth:115 }}><input type="checkbox" name={day+"_enabled"} defaultChecked={Boolean(schedule[day] ?? (["mon","tue","wed","thu","fri"].includes(day) && !prefs))}/> {label}</label>
              <label>Desde <input type="time" name={day+"_start"} defaultValue={schedule[day]?.[0] ?? "09:00"}/></label>
              <label>Hasta <input type="time" name={day+"_end"} defaultValue={schedule[day]?.[1] ?? "17:00"}/></label>
            </div>)}
          </div>
          <div style={{ display:"flex",gap:12,flexWrap:"wrap" }}>
            <label>Silencio desde <input type="time" name="quiet_start" defaultValue={prefs?.quiet_start ?? "18:00"}/></label>
            <label>Hasta <input type="time" name="quiet_end" defaultValue={prefs?.quiet_end ?? "09:00"}/></label>
          </div>
          <p className={s.meta}>Las horas de silencio quedan guardadas como preferencia; los avisos permanecen accesibles en la bandeja.</p>
          <div className={s.actions}><button type="submit" className={s.btn}>Guardar disponibilidad</button></div>
        </form>}
        <h3>Ausencias y días libres</h3>
        <form action={addStaffTimeOff} className={s.form}>
          <div style={{ display:"flex",gap:12,flexWrap:"wrap" }}>
            <label>Desde <input name="starts_on" type="date" required /></label>
            <label>Hasta <input name="ends_on" type="date" required /></label>
            <label>Motivo (opcional) <input name="reason" maxLength={200} placeholder="Vacaciones, descanso…"/></label>
          </div>
          <div className={s.actions}><button type="submit" className={s.btn}>Agregar ausencia</button></div>
        </form>
        {absences.error ? <p role="alert">No se pudieron consultar las ausencias.</p> :
          <ul>{(absences.data ?? []).map(x=><li key={x.id}>
            <span>{x.starts_on} – {x.ends_on} {x.reason ? "· "+x.reason : ""}</span>
            <form action={deleteStaffTimeOff} style={{display:"inline",marginLeft:10}}><input type="hidden" name="id" value={x.id}/><button type="submit">Eliminar</button></form>
          </li>)}</ul>}
      </Panel>
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
