import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { Panel, Badge } from "@/components/os/ui";
import s from "@/components/os/os.module.css";
import ui from "./staff-profile.module.css";
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
  const profileOk = profileStatus === "saved" || profileStatus === "availability-saved";
  const profileMessage = profileStatus === "availability-saved" ? "Disponibilidad guardada y verificada." : profileStatus === "availability-failed" ? "No se pudo confirmar el guardado de tus horarios. Ningún cambio se ha verificado." : profileStatus === "availability-invalid" ? "Revisa los horarios y la zona horaria seleccionados." : profileStatus === "saved" ? "Cambios guardados." : profileStatus === "invalid" ? "Revisa los datos y horarios." : profileStatus === "failed" ? "No se pudo guardar. Comprueba el estado de la base de datos." : "";
  const provider = typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : "—";
  const passwordEnabled = true;
  return (
    <Suite active="profile">
      <div className={ui.staff}>
        <header className={ui.hero}>
          <div className={ui.heroContent}>
            <span className={ui.eyebrow}>Avalon Core / Staff Hub</span>
            <h1>{profileName}</h1>
            <p className={ui.heroSubtitle}>Tu espacio personal de trabajo. Gestiona tu identidad profesional, coordina tu disponibilidad y protege tu cuenta desde un mismo lugar.</p>
            <div className={ui.identityTags}>
              <span className={ui.identityTag}><strong>{staff?.title || "Cargo por definir"}</strong></span>
              <span className={ui.identityTag}>{staff?.department || "Departamento sin definir"}</span>
              <span className={ui.identityTag}>Cuenta {role}</span>
            </div>
          </div>
          <div className={ui.heroSide}>
            <div className={ui.heroLinks}>
              <Link className={ui.heroLink} href="/admin/workspace/crm/office">Ver Oficina <span aria-hidden="true">↗</span></Link>
            </div>
          </div>
        </header>

        <nav className={ui.quickLinks} aria-label="Secciones del perfil">
          <a className={ui.quickLink} href="#staff-identity">Identidad</a>
          <a className={ui.quickLink} href="#availability">Disponibilidad</a>
          <a className={ui.quickLink} href="#time-off">Ausencias</a>
          <a className={ui.quickLink} href="#identity">Seguridad</a>
        </nav>

        {profileMessage && <p role={profileOk ? "status" : "alert"} data-error={!profileOk} className={ui.notice}>{profileMessage}</p>}
        <div className={ui.mainGrid}>
          <div className={ui.stack}>
            <section className={ui.sectionCard} id="staff-identity" aria-labelledby="staff-identity-title">
              <div className={ui.sectionIntro}>
                <span className={ui.sectionIcon} aria-hidden="true">✦</span>
                <div className={ui.sectionText}>
                  <span className={ui.sectionKicker}>Tu identidad</span>
                  <h2 id="staff-identity-title">Perfil profesional</h2>
                  <p>Esta información aparece en la barra superior y en el directorio de Oficina. No modifica tus permisos de seguridad.</p>
                </div>
              </div>
              {office.error ? <p className={ui.notice} data-error="true" role="alert">No se pudo cargar el perfil de Oficina.</p> : <>
                <MyProfilePhoto userId={user.id} photoHash={staff?.photo_sha256 ?? null} name={profileName}/>
                <form action={saveStaffProfile} className={ui.form}>
                  <div className={ui.fieldGrid}>
                    <label className={ui.field}>Nombre visible
                      <input name="display_name" maxLength={80} required defaultValue={staff?.display_name || displayName(user)} placeholder="Tu nombre profesional" />
                    </label>
                    <label className={ui.field}>Cargo profesional
                      <input name="title" maxLength={80} placeholder="Director de operaciones" defaultValue={staff?.title ?? ""}/>
                    </label>
                    <label className={ui.field}>Departamento
                      <input name="department" maxLength={80} placeholder="Operaciones / CRM" defaultValue={staff?.department ?? ""}/>
                    </label>
                    <label className={ui.field}>Especialidades
                      <input name="specialties" maxLength={330} defaultValue={(staff?.specialties ?? []).join(", ")} placeholder="Diseño, estrategia, ventas"/>
                      <small>Separa cada especialidad con una coma.</small>
                    </label>
                  </div>
                  <label className={ui.field}>Acerca de mí
                    <textarea name="bio" rows={3} maxLength={600} placeholder="Cuenta brevemente en qué trabajas y cómo aportas al equipo..." defaultValue={staff?.bio ?? ""}/>
                    <small>Máximo 600 caracteres.</small>
                  </label>
                  <div className={ui.formFooter}>
                    <p className={ui.help}>Tu equipo verá estos datos cuando consulte tu perfil.</p>
                    <button type="submit" className={ui.primary}>Guardar cambios <span aria-hidden="true">↗</span></button>
                  </div>
                </form>
              </>}
            </section>
            <section className={ui.sectionCard} id="availability" aria-labelledby="availability-title">
              <div className={ui.sectionIntro}>
                <span className={ui.sectionIcon} aria-hidden="true">◷</span>
                <div className={ui.sectionText}>
                  <span className={ui.sectionKicker}>Organización del equipo</span>
                  <h2 id="availability-title">Disponibilidad semanal</h2>
                  <p>Comparte tu jornada con el equipo. Los horarios son informativos y aún no bloquean automáticamente eventos.</p>
                </div>
              </div>
              {availability.error ? <p className={ui.notice} data-error="true" role="alert">No se pudieron cargar los horarios en este entorno.</p> :
              <>
              {!prefs && <p className={ui.notice} role="status">Aún no has guardado tu disponibilidad. Los horarios mostrados son valores iniciales, no horarios confirmados.</p>}
              <form action={saveStaffAvailability} className={ui.form}>
                <label className={ui.field}>Zona horaria
                  <select name="timezone" defaultValue={prefs?.timezone ?? "America/New_York"}>
                    {["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Puerto_Rico","America/Bogota","America/Mexico_City","Europe/Madrid","UTC"].map(tz=><option key={tz} value={tz}>{tz}</option>)}
                  </select>
                  <small>Las horas se interpretan en tu zona horaria seleccionada.</small>
                </label>
                <div className={ui.weekly} aria-label="Horario por día">
                  {weekdays.map(([day,label]) => <div key={day} className={ui.dayRow}>
                    <label className={ui.dayCheck}>
                      <input type="checkbox" name={day+"_enabled"} defaultChecked={Boolean(schedule[day] ?? (["mon","tue","wed","thu","fri"].includes(day) && !prefs))}/>
                      <span>{label}</span>
                    </label>
                    <div className={ui.dayTimes}>
                      <label className={ui.timeLabel}>Inicio
                        <input type="time" name={day+"_start"} defaultValue={schedule[day]?.[0] ?? "09:00"}/>
                      </label>
                      <label className={ui.timeLabel}>Fin
                        <input type="time" name={day+"_end"} defaultValue={schedule[day]?.[1] ?? "17:00"}/>
                      </label>
                    </div>
                  </div>)}
                </div>
                <div className={ui.quietBox}>
                  <div className={ui.quietHeading}>
                    <span className={ui.quietSymbol} aria-hidden="true">☾</span>
                    <div><strong>Horas de silencio</strong><p>Guarda las horas en que prefieres no recibir interrupciones. Los avisos seguirán disponibles en la bandeja.</p></div>
                  </div>
                  <div className={ui.quietRow}>
                    <label className={ui.timeLabel}>Desde <input type="time" name="quiet_start" defaultValue={prefs?.quiet_start ?? "18:00"}/></label>
                    <label className={ui.timeLabel}>Hasta <input type="time" name="quiet_end" defaultValue={prefs?.quiet_end ?? "09:00"}/></label>
                  </div>
                </div>
                <div className={ui.formFooter}>
                  <p className={ui.help}>Tu horario se muestra en Oficina al consultar tu perfil.</p>
                  <button type="submit" className={ui.primary}>Guardar disponibilidad</button>
                </div>
              </form></>}
              <div className={ui.timeOffHeader} id="time-off">
                <h3>Ausencias y días libres</h3>
                <p>Marca vacaciones y fechas en las que no estarás disponible.</p>
              </div>
              <form action={addStaffTimeOff} className={ui.timeOffForm}>
                <div className={ui.fieldGrid}>
                  <label className={ui.field}>Desde<input name="starts_on" type="date" required /></label>
                  <label className={ui.field}>Hasta<input name="ends_on" type="date" required /></label>
                </div>
                <label className={ui.field}>Motivo (opcional)<input name="reason" maxLength={200} placeholder="Vacaciones, descanso o compromiso personal"/></label>
                <div className={ui.formFooter}><p className={ui.help}>También podrás eliminar cualquier ausencia que hayas creado.</p>
                  <button type="submit" className={ui.secondary}>+ Agregar ausencia</button>
                </div>
              </form>
              {absences.error ? <p className={ui.notice} data-error="true" role="alert">No se pudieron consultar las ausencias.</p> :
                (absences.data ?? []).length === 0 ? <p className={ui.empty}>Todavía no tienes ausencias programadas.</p> :
                <ul className={ui.absences}>{(absences.data ?? []).map(x=><li key={x.id} className={ui.absence}>
                  <div><strong>{x.starts_on} — {x.ends_on}</strong>{x.reason && <span className={ui.absenceReason}>{x.reason}</span>}</div>
                  <form action={deleteStaffTimeOff}><input type="hidden" name="id" value={x.id}/><button type="submit" className={ui.remove}>Eliminar</button></form>
                </li>)}</ul>}
            </section>
          </div>
          <aside className={ui.security} aria-label="Cuenta y seguridad">
            <h2 className={ui.securityTitle}>Cuenta y seguridad</h2>
                  <div className={ui.stack}>
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
          <p className={s.meta}>{pick(lang, "El nombre visible se edita en tu perfil profesional. Los permisos dependen únicamente de tu membresía en la base de datos.", "Your display name is edited in your staff profile. Access permissions are based only on database membership.")}</p>
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
          </aside>
        </div>
      </div>
    </Suite>
  );
}
