"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, signInWithGoogle } from "@/app/login/actions";
import styles from "./login-panel.module.css";

const copy = {
  en: {
    portal: "AI ADMIN PORTAL", welcome: "WELCOME BACK", intro: "Log in to your Avalon Core Agency", portalName: "AI Admin Portal",
    google: "Continue with Google", pending: "Connecting…", email: "Email address", password: "Password", login: "Log in", or: "OR CONTINUE WITH",
    access: "Admin-only access", identity: "Google sign-in", data: "Protected data", note: "Private workspace · Authorized owners only",
    oauth: "Unable to connect to Google. Please try again or contact your administrator.", callback: "Sign-in could not be completed. Please start again.",
    unauthorized: "This account is not authorized to access the admin portal.", invalid: "Unable to sign in. Check your credentials.", disabled: "Password sign-in is not enabled.",
    tagline: "AI. PEOPLE. SYSTEMS. A BRIGHTER TOMORROW.", language: "Language",
  },
  es: {
    portal: "PORTAL ADMINISTRATIVO IA", welcome: "BIENVENIDO DE NUEVO", intro: "Accede al portal administrativo de", portalName: "Avalon Core Agency",
    google: "Continuar con Google", pending: "Conectando…", email: "Correo electrónico", password: "Contraseña", login: "Entrar", or: "O CONTINÚA CON",
    access: "Acceso administrativo", identity: "Acceso con Google", data: "Datos protegidos", note: "Espacio privado · Solo propietarios autorizados",
    oauth: "No se pudo conectar con Google. Inténtalo de nuevo o contacta al administrador.", callback: "No se pudo completar el acceso. Inicia el proceso de nuevo.",
    unauthorized: "Esta cuenta no está autorizada para acceder al portal administrativo.", invalid: "No se pudo iniciar sesión. Comprueba tus credenciales.", disabled: "El acceso con contraseña no está habilitado.",
    tagline: "IA. PERSONAS. SISTEMAS. UN MAÑANA MÁS BRILLANTE.", language: "Idioma",
  },
};

function Submit({ label, pendingLabel, google = false }: { label: string; pendingLabel: string; google?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={styles.submit} type="submit" disabled={pending} aria-busy={pending}>
    {google && <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22"><path fill="#4285f4" d="M22 12.2c0-.7-.1-1.4-.2-2.2H12v4.2h5.6a4.8 4.8 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.7Z"/><path fill="#34a853" d="M12 22c2.8 0 5.1-.9 6.9-2.5l-3.4-2.6c-.9.6-2 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.7A10.4 10.4 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.2 13.6a6 6 0 0 1 0-3.2V7.7H2.7a10 10 0 0 0 0 8.6Z"/><path fill="#ea4335" d="M12 6.1c1.5 0 2.8.5 3.9 1.5L19 4.5A10 10 0 0 0 2.7 7.7l3.5 2.7C7 7.9 9.3 6.1 12 6.1Z"/></svg>}
    <span>{pending ? pendingLabel : label}</span><span aria-hidden="true">→</span>
  </button>;
}

function SecurityIcon({ kind }: { kind: "shield" | "lock" | "data" }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    {kind === "shield" ? <><path d="m16 3 11 4v9c0 6-6 10-11 13C11 26 5 22 5 16V7Z"/><circle cx="16" cy="13" r="3"/><path d="M10 23c0-7 12-7 12 0"/></> : kind === "lock" ? <><rect x="6" y="14" width="20" height="15" rx="2"/><path d="M10 14V9a6 6 0 0 1 12 0v5M16 20v4"/></> : <><ellipse cx="16" cy="7" rx="11" ry="4"/><path d="M5 7v18c0 6 22 6 22 0V7M5 13c0 6 22 6 22 0M5 19c0 6 22 6 22 0"/></>}
  </svg>;
}

export function LoginPanel({ error, passwordEnabled }: { error?: string; passwordEnabled: boolean }) {
  const [language, setLanguage] = useState<"en" | "es">("en");
  useEffect(() => {
    try { const saved = localStorage.getItem("avalon-language"); if (saved === "es" || saved === "en") setLanguage(saved); } catch { /* Storage is optional. */ }
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const t = copy[language];
  const message = error ? ({ oauth: t.oauth, callback: t.callback, unauthorized: t.unauthorized, invalid: t.invalid, disabled: t.disabled }[error] ?? t.callback) : null;
  return <main className={styles.scene} lang={language}>
    <nav className={styles.languages} aria-label={t.language}>
      {(["en", "es"] as const).map(lang => <button key={lang} type="button" aria-pressed={language === lang} onClick={() => {
        setLanguage(lang); try { localStorage.setItem("avalon-language", lang); } catch { /* Storage is optional. */ }
      }}>{lang.toUpperCase()}</button>)}
    </nav>
    <div className={styles.sideNote} aria-hidden="true">INTELLIGENCE<br />AUTOMATION<br />SCALING<br />A BRIGHTER TOMORROW</div>
    <header className={styles.brand}><div className={styles.wordmark}>AVALON</div><div className={styles.agency}>CORE AGENCY</div><p>{t.portal}</p></header>
    <section className={styles.panel} aria-labelledby="welcome">
      <svg className={styles.emblem} viewBox="0 0 140 130" aria-hidden="true"><defs><linearGradient id="avalon-mark" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#00eaff"/><stop offset=".48" stopColor="#6750ff"/><stop offset="1" stopColor="#fa59ff"/></linearGradient></defs><circle cx="70" cy="64" r="57" fill="none" stroke="#7334d0" opacity=".5"/><path d="M70 12 131 112H99L70 62 40 112H9ZM70 79 91 115H49Z" fill="url(#avalon-mark)"/></svg>
      <h1 id="welcome">{t.welcome}</h1><p className={styles.intro}>{t.intro}<br />{t.portalName}</p>
      {message && <p className={styles.error} role="alert">{message}</p>}
      {passwordEnabled && <><form action={signIn} className={styles.passwordForm}>
        <label htmlFor="email">{t.email}</label><input id="email" name="email" type="email" autoComplete="email" maxLength={320} required />
        <label htmlFor="password">{t.password}</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required />
        <Submit label={t.login} pendingLabel={t.pending} />
      </form><div className={styles.divider}>{t.or}</div></>}
      <form action={signInWithGoogle}><Submit label={t.google} pendingLabel={t.pending} google /></form>
      <p className={styles.note}>{t.note}</p>
      <div className={styles.security}>{([['shield', t.access], ['lock', t.identity], ['data', t.data]] as const).map(([kind, label]) => <div key={kind}><SecurityIcon kind={kind} /><span>{label}</span></div>)}</div>
    </section>
    <div className={styles.platform} aria-hidden="true" />
    <footer className={styles.footer}><span>AVALON CORE AGENCY<br />{t.tagline}</span><span aria-hidden="true">SECURE &nbsp; // &nbsp; INTELLIGENT &nbsp; // &nbsp; GLOBAL</span></footer>
  </main>;
}
