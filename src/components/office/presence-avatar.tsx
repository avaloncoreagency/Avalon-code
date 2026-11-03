import type { ReactNode } from "react";
import type { StaffPresence, PresenceReason, PresenceState } from "@/lib/office/presence";
import styles from "./presence-avatar.module.css";

const LABELS: Record<PresenceState, [string,string]> = {
  active: ["Activo","Active"], busy: ["Ocupado","Busy"], inactive: ["Inactivo","Inactive"],
};
const DETAILS: Record<PresenceReason,[string,string]> = {
  available: ["Disponible según tu horario","Available according to your schedule"],
  calendar: ["Evento de calendario en curso","Calendar event in progress"],
  time_off: ["Ausencia programada","Scheduled time off"],
  out_of_hours: ["Fuera del horario habitual","Outside working hours"],
  unconfigured: ["Horario sin configurar","Schedule not set"],
  unavailable: ["No se pudo confirmar la disponibilidad","Availability could not be verified"],
};

/** Avatar overlay: status is an estimate from schedules and calendar, not a login/online signal. */
export function PresenceAvatar({
  presence, size, lang, children,
}: { presence: StaffPresence | null | undefined; size: number; lang: "es" | "en"; children: ReactNode }) {
  const state = presence?.state ?? "inactive";
  const reason = presence?.reason ?? "unavailable";
  const locale = lang === "es" ? 0 : 1;
  const description = `${LABELS[state][locale]} · ${DETAILS[reason][locale]}`;
  return <span className={styles.wrap} style={{width:size,height:size}}>
    {children}
    <span className={styles.dot} data-presence={state} role="img" aria-label={description} title={description}/>
  </span>;
}

export function presenceName(state: PresenceState, lang: "es" | "en") {
  return LABELS[state][lang === "es" ? 0 : 1];
}
