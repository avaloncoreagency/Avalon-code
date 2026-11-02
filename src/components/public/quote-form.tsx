"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestQuote, type QuoteState } from "@/app/quote-actions";
import { SERVICE_NAMES } from "./services";
import s from "@/app/public.module.css";

const T = {
  es: { company: "Empresa", name: "Tu nombre", email: "Correo", phone: "Teléfono (opcional)", services: "¿Qué necesitas?", message: "Cuéntanos tu proyecto", send: "Solicitar cotización", sending: "Enviando…",
    ok: "¡Gracias! Recibimos tu solicitud. Un especialista de Avalon la revisará y te contactará.", invalid: "Revisa los campos: correo válido y una descripción de al menos 10 caracteres.", throttled: "Ya recibimos varias solicitudes. Inténtalo más tarde o escríbenos directamente.", unavailable: "No pudimos enviar la solicitud ahora. Inténtalo de nuevo en unos minutos.",
    privacy: "Usamos tus datos solo para responder a esta solicitud." },
  en: { company: "Company", name: "Your name", email: "Email", phone: "Phone (optional)", services: "What do you need?", message: "Tell us about your project", send: "Request a quote", sending: "Sending…",
    ok: "Thank you! We received your request. An Avalon specialist will review it and contact you.", invalid: "Please check the fields: a valid email and a description of at least 10 characters.", throttled: "We already received several requests. Please try later or email us directly.", unavailable: "We couldn't send your request right now. Please try again in a few minutes.",
    privacy: "We only use your data to answer this request." },
};

function Submit({ lang }: { lang: "es" | "en" }) {
  const { pending } = useFormStatus();
  return <button className={s.cta} type="submit" disabled={pending} aria-busy={pending}>{pending ? T[lang].sending : T[lang].send}</button>;
}

export function QuoteForm({ lang }: { lang: "es" | "en" }) {
  const [state, action] = useActionState<QuoteState, FormData>(requestQuote, { status: "idle" });
  const t = T[lang];
  if (state.status === "ok") return <p className={s.success} role="status">{t.ok}</p>;
  return <form action={action} className={s.form}>
    <input type="hidden" name="language" value={lang} />
    <div className={s.hp} aria-hidden="true"><label>Website<input name="website_url" tabIndex={-1} autoComplete="off" /></label></div>
    <div className={s.row}>
      <label>{t.company}<input name="company" required minLength={2} maxLength={200} autoComplete="organization" /></label>
      <label>{t.name}<input name="name" required minLength={2} maxLength={160} autoComplete="name" /></label>
    </div>
    <div className={s.row}>
      <label>{t.email}<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label>{t.phone}<input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
    </div>
    <fieldset className={s.services}><legend>{t.services}</legend>
      {Object.entries(SERVICE_NAMES[lang]).map(([k, v]) => <label key={k}><input type="checkbox" name="services" value={k} />{v}</label>)}
    </fieldset>
    <label>{t.message}<textarea name="message" required minLength={10} maxLength={2000} rows={4} /></label>
    {state.status !== "idle" && <p className={s.error} role="alert">{t[state.status]}</p>}
    <Submit lang={lang} />
    <small className={s.note}>{t.privacy}</small>
  </form>;
}
