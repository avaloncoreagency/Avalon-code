"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { requestRecovery, savePassword } from "@/app/admin/password-actions";
import styles from "./login-panel.module.css";
function Submit({ es }: { es: boolean }) {
  const { pending } = useFormStatus();
  return <button className={styles.submit} disabled={pending}>{pending ? "…" : es ? "Continuar" : "Continue"}</button>;
}
export function PasswordPanel({ mode, valid, error, sent }: { mode: "invite" | "recovery" | "request"; valid: boolean; error?: string; sent?: boolean }) {
  const [es, setEs] = useState(true);
  const [show, setShow] = useState(false);
  return <main className={styles.scene} lang={es ? "es" : "en"}>
    <nav className={styles.languages} aria-label="Language / Idioma"><button aria-pressed={!es} onClick={() => setEs(false)}>EN</button><button aria-pressed={es} onClick={() => setEs(true)}>ES</button></nav>
    <header className={styles.brand}><div className={styles.wordmark}>AVALON</div><div className={styles.agency}>CORE AGENCY</div></header>
    <section className={styles.panel}><h1>{mode === "request" ? (es ? "RECUPERAR ACCESO" : "RECOVER ACCESS") : (es ? "ESTABLECER CONTRASEÑA" : "SET PASSWORD")}</h1>
      {error && <p role="alert">{es ? "No se pudo completar. Comprueba la contraseña o solicita un enlace nuevo." : "Unable to complete. Check your password or request a fresh link."}</p>}
      {sent ? <p role="status">{es ? "Si la cuenta permite recuperación, recibirás un email con instrucciones." : "If the account supports recovery, you will receive an email with instructions."}</p> : mode === "request" ? <form action={requestRecovery} className={styles.passwordForm}><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" maxLength={320} required /><Submit es={es} /></form> : valid ? <form action={savePassword} className={styles.passwordForm}>
        <input type="hidden" name="flow" value={mode} />
        <p>{es ? "Usa al menos 12 caracteres. Establecer una contraseña no concede permisos de administrador." : "Use at least 12 characters. Setting a password does not grant admin permissions."}</p>
        <label htmlFor="password">{es ? "Nueva contraseña" : "New password"}</label><input id="password" name="password" type={show ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={1024} required />
        <label htmlFor="confirm">{es ? "Confirmar contraseña" : "Confirm password"}</label><input id="confirm" name="confirm" type={show ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={1024} required />
        <button type="button" onClick={() => setShow(!show)}>{es ? "Mostrar / ocultar" : "Show / hide"}</button><Submit es={es} />
      </form> : <p>{es ? "Necesitas un enlace de invitación o recuperación válido enviado por el administrador. No hay registro público." : "You need a valid invitation or recovery link sent by your administrator. Public registration is unavailable."}</p>}
      <p><a href="/admin/login">{es ? "Volver al acceso" : "Back to login"}</a></p>
    </section>
  </main>;
}
