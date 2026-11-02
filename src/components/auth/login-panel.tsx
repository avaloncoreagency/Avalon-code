"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { signIn } from "@/app/login/actions";
import { LanguageSwitch } from "@/components/suite/language-switch";
import type { Lang } from "@/lib/i18n";
import styles from "./login-panel.module.css";

const copy = {
  en: {
    portal: "AI ADMIN PORTAL", welcome: "WELCOME BACK", intro: "Log in to your Avalon Core Agency", portalName: "AI Admin Portal",
    google: "Continue with Google", pending: "Connecting…", email: "Email address", password: "Password", login: "Log in", or: "OR CONTINUE WITH",
    access: "Admin-only access", identity: "Password sign-in", data: "Protected data", note: "Private workspace · Authorized owners only",
    oauth: "Unable to connect to Google. Please try again or contact your administrator.", callback: "Sign-in could not be completed. Please start again.",
    unauthorized: "This account is not authorized to access the admin portal.", invalid: "Unable to sign in. Check your credentials.", disabled: "Password sign-in is not enabled.", throttled: "Too many attempts. Please wait a few minutes and try again.",
    tagline: "AI. PEOPLE. SYSTEMS. A BRIGHTER TOMORROW.", language: "Language",
  },
  es: {
    portal: "PORTAL ADMINISTRATIVO IA", welcome: "BIENVENIDO DE NUEVO", intro: "Accede al portal administrativo de", portalName: "Avalon Core Agency",
    google: "Continuar con Google", pending: "Conectando…", email: "Correo electrónico", password: "Contraseña", login: "Entrar", or: "O CONTINÚA CON",
    access: "Acceso administrativo", identity: "Acceso con contraseña", data: "Datos protegidos", note: "Espacio privado · Solo propietarios autorizados",
    oauth: "No se pudo conectar con Google. Inténtalo de nuevo o contacta al administrador.", callback: "No se pudo completar el acceso. Inicia el proceso de nuevo.",
    unauthorized: "Esta cuenta no está autorizada para acceder al portal administrativo.", invalid: "No se pudo iniciar sesión. Comprueba tus credenciales.", disabled: "El acceso con contraseña no está habilitado.", throttled: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    tagline: "IA. PERSONAS. SISTEMAS. UN MAÑANA MÁS BRILLANTE.", language: "Idioma",
  },
};

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string;  }) {
  const { pending } = useFormStatus();
  return <button className={styles.submit} type="submit" disabled={pending} aria-busy={pending}>
    <span>{pending ? pendingLabel : label}</span><span aria-hidden="true">→</span>
  </button>;
}

function SecurityIcon({ kind }: { kind: "shield" | "lock" | "data" }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    {kind === "shield" ? <><path d="m16 3 11 4v9c0 6-6 10-11 13C11 26 5 22 5 16V7Z"/><circle cx="16" cy="13" r="3"/><path d="M10 23c0-7 12-7 12 0"/></> : kind === "lock" ? <><rect x="6" y="14" width="20" height="15" rx="2"/><path d="M10 14V9a6 6 0 0 1 12 0v5M16 20v4"/></> : <><ellipse cx="16" cy="7" rx="11" ry="4"/><path d="M5 7v18c0 6 22 6 22 0V7M5 13c0 6 22 6 22 0M5 19c0 6 22 6 22 0"/></>}
  </svg>;
}

export function LoginPanel({ error, passwordEnabled, updated, initialLanguage = "es" }: { error?: string; passwordEnabled: boolean; updated?: boolean; initialLanguage?: Lang }) {
  const [showPassword, setShowPassword] = useState(false);
  const [language, setLanguage] = useState<Lang>(initialLanguage);
  const t = copy[language];
  const message = error ? ({ oauth: t.oauth, callback: t.callback, unauthorized: t.unauthorized, invalid: t.invalid, disabled: t.disabled, throttled: t.throttled }[error] ?? t.callback) : null;
  return <main className={styles.scene} lang={language}>
    <LanguageSwitch lang={language} className={styles.languages} onChange={setLanguage} />
    <div className={styles.sideNote} aria-hidden="true">INTELLIGENCE<br />AUTOMATION<br />SCALING<br />A BRIGHTER TOMORROW</div>
    <header className={styles.brand}><div className={styles.wordmark}>AVALON</div><div className={styles.agency}>CORE AGENCY</div><p>{t.portal}</p></header>
    <section className={styles.panel} aria-labelledby="welcome">
      <svg className={styles.emblem} viewBox="0 0 140 130" aria-hidden="true"><defs><linearGradient id="avalon-mark" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#00eaff"/><stop offset=".48" stopColor="#6750ff"/><stop offset="1" stopColor="#fa59ff"/></linearGradient></defs><circle cx="70" cy="64" r="57" fill="none" stroke="#7334d0" opacity=".5"/><path d="M70 12 131 112H99L70 62 40 112H9ZM70 79 91 115H49Z" fill="url(#avalon-mark)"/></svg>
      <h1 id="welcome">{t.welcome}</h1><p className={styles.intro}>{t.intro}<br />{t.portalName}</p>
      {updated && <p role="status">{language === "es" ? "Contraseña guardada. Inicia sesión; el acceso requiere autorización." : "Password saved. Sign in; access requires authorization."}</p>}
      {message && <p className={styles.error} role="alert" id="login-error">{message}</p>}
      {passwordEnabled && <><form action={signIn} className={styles.passwordForm}>
        <label htmlFor="email">{t.email}</label><input id="email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={320} required aria-invalid={error === "invalid" || undefined} aria-describedby={message ? "login-error" : undefined} />
        <label htmlFor="password">{t.password}</label>
        <div className={styles.passwordWrap}>
          <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" maxLength={1024} required aria-invalid={error === "invalid" || undefined} aria-describedby={message ? "login-error" : undefined} />
          <button type="button" className={styles.reveal} aria-controls="password" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
            {language === "es" ? (showPassword ? "Ocultar" : "Mostrar") : (showPassword ? "Hide" : "Show")}<span className="sr-only">{language === "es" ? " contraseña" : " password"}</span>
          </button>
        </div>
        <a className={styles.forgot} href="/admin/forgot-password">{language === "es" ? "Olvidé mi contraseña" : "Forgot password"}</a>
        <Submit label={t.login} pendingLabel={t.pending} />
      </form></>}
      <p className={styles.note}>{t.note}<br /><a href="/admin/signup">{language === "es" ? "Registro por invitación" : "Sign up by invitation"}</a></p>
      <div className={styles.security}>{([['shield', t.access], ['lock', t.identity], ['data', t.data]] as const).map(([kind, label]) => <div key={kind}><SecurityIcon kind={kind} /><span>{label}</span></div>)}</div>
    </section>
    <div className={styles.platform} aria-hidden="true" />
    <footer className={styles.footer}><span>AVALON CORE AGENCY<br />{t.tagline}</span><span aria-hidden="true">SECURE &nbsp; // &nbsp; INTELLIGENT &nbsp; // &nbsp; GLOBAL</span></footer>
  </main>;
}
