"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { cancelMfaLogin, verifyMfaLogin } from "@/app/admin/mfa-actions";
import { LanguageSwitch } from "@/components/suite/language-switch";
import type { Lang } from "@/lib/i18n";
import styles from "./login-panel.module.css";

function Submit({ es }: { es: boolean }) {
  const { pending } = useFormStatus();
  return <button className={styles.submit} type="submit" disabled={pending} aria-busy={pending}><span>{pending ? "…" : es ? "Verificar" : "Verify"}</span><span aria-hidden="true">→</span></button>;
}

export function MfaPanel({ error, initialLanguage = "es" }: { error?: string; initialLanguage?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLanguage);
  const es = lang === "es";
  const message = !error ? null : error === "throttled"
    ? (es ? "Demasiados intentos. Espera unos minutos." : "Too many attempts. Please wait a few minutes.")
    : (es ? "Código no válido o caducado. Usa el código actual de tu app de autenticación." : "Invalid or expired code. Use the current code from your authenticator app.");
  return <main className={styles.scene} lang={lang}>
    <LanguageSwitch lang={lang} className={styles.languages} onChange={setLang} />
    <header className={styles.brand}><div className={styles.wordmark}>AVALON</div><div className={styles.agency}>CORE AGENCY</div></header>
    <section className={styles.panel} aria-labelledby="mfa-title">
      <h1 id="mfa-title">{es ? "VERIFICACIÓN EN DOS PASOS" : "TWO-STEP VERIFICATION"}</h1>
      <p className={styles.intro}>{es ? "Introduce el código de 6 dígitos de tu app de autenticación." : "Enter the 6-digit code from your authenticator app."}</p>
      {message && <p className={styles.error} role="alert" id="mfa-error">{message}</p>}
      <form action={verifyMfaLogin} className={styles.passwordForm}>
        <label htmlFor="code">{es ? "Código" : "Code"}</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus aria-describedby={message ? "mfa-error" : undefined} />
        <Submit es={es} />
      </form>
      <form action={cancelMfaLogin}><button type="submit" className={styles.reveal} style={{ position: "static", transform: "none" }}>{es ? "Cancelar y cerrar sesión" : "Cancel and sign out"}</button></form>
      <p className={styles.note}>{es ? "¿Perdiste el acceso a tu app? Pide al otro propietario que siga el procedimiento de recuperación de MFA." : "Lost your authenticator? Ask the other owner to follow the MFA recovery procedure."}</p>
    </section>
  </main>;
}
