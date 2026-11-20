"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { requestQuote, type QuoteState } from "@/app/quote-actions";
import { HumanVerification } from "@/components/auth/human-verification";
import { SERVICE_NAMES } from "./services";
import type { ServiceKey } from "./landing/copy";
import s from "@/app/public.module.css";

const T = {
  es: { company: "Nombre de tu negocio, marca u oficio", name: "Tu nombre", email: "Correo", phone: "Teléfono (opcional)", services: "¿Qué necesitas?", message: "¿Qué problema quieres resolver o qué te gustaría mejorar?", send: "Solicitar cotización", sending: "Enviando…",
    ok: "¡Gracias! Recibimos tu solicitud. Un especialista de Avalon la revisará y te contactará.", invalid: "Revisa los campos: correo válido y una descripción de al menos 10 caracteres.", throttled: "Ya recibimos varias solicitudes. Inténtalo más tarde o escríbenos directamente.", unavailable: "No pudimos enviar la solicitud ahora. Tus datos siguen aquí: inténtalo de nuevo en unos minutos.",
    human: "Antes de enviar, pulsa «Verificar que soy humano». Tus datos siguen aquí.",
    privacy: "Si trabajas por tu cuenta, escribe tu profesión en el campo del negocio. Usamos tus datos solo para responder a esta solicitud.", preselected: "Ya marcamos las herramientas que viste. Puedes cambiar la selección." },
  en: { company: "Business, brand or profession", name: "Your name", email: "Email", phone: "Phone (optional)", services: "What do you need?", message: "What problem do you want to solve or improve?", send: "Request a quote", sending: "Sending…",
    ok: "Thank you! We received your request. An Avalon specialist will review it and contact you.", invalid: "Please check the fields: a valid email and a description of at least 10 characters.", throttled: "We already received several requests. Please try later or email us directly.", unavailable: "We couldn't send your request right now. Your details are still here: please try again in a few minutes.",
    human: "Before sending, tap “Verify I am human”. Your details are still here.",
    privacy: "If you work independently, enter your profession in the business field. We only use your data to respond to this request.", preselected: "We selected the tools you explored. You can change your selection." },
};

function Submit({ lang }: { lang: "es" | "en" }) {
  const { pending } = useFormStatus();
  return <button className={s.cta} type="submit" disabled={pending} aria-busy={pending}>{pending ? T[lang].sending : T[lang].send}</button>;
}

export function QuoteForm({ lang, initialServices = [], turnstileSiteKey }: { lang: "es" | "en"; initialServices?: readonly ServiceKey[]; turnstileSiteKey?: string }) {
  const [state, action] = useActionState<QuoteState, FormData>(requestQuote, { status: "idle" });
  // One-time Turnstile token: re-armed after every answered submission (attempt changes the widget key).
  const [human, setHuman] = useState({ attempt: 0, token: "" });
  const token = human.attempt === (state.attempt ?? 0) ? human.token : "";
  const t = T[lang];
  const v = state.values;
  const checked = (k: string) => v ? v.services.includes(k) : initialServices.includes(k as ServiceKey);
  if (state.status === "ok") return <p className={s.success} role="status">{t.ok}</p>;
  return <form action={action} className={s.form}>
    <input type="hidden" name="language" value={lang} />
    <input type="hidden" name="cf-turnstile-response" value={token} />
    <div className={s.hp} aria-hidden="true"><label>Website<input name="website_url" tabIndex={-1} autoComplete="off" /></label></div>
    <div className={s.row}>
      <label>{t.company}<input name="company" required minLength={2} maxLength={200} autoComplete="organization" defaultValue={v?.company} /></label>
      <label>{t.name}<input name="name" required minLength={2} maxLength={160} autoComplete="name" defaultValue={v?.name} /></label>
    </div>
    <div className={s.row}>
      <label>{t.email}<input name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={v?.email} /></label>
      <label>{t.phone}<input name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={v?.phone} /></label>
    </div>
    <fieldset className={s.services}><legend>{t.services}</legend>
      {Object.entries(SERVICE_NAMES[lang]).map(([k, v]) => <label key={k}><input type="checkbox" name="services" value={k} defaultChecked={checked(k)} />{v}</label>)}
    </fieldset>
    {initialServices.length > 0 && <small className={s.note}>{t.preselected}</small>}
    <label>{t.message}<textarea name="message" required minLength={10} maxLength={2000} rows={4} defaultValue={v?.message} /></label>
    {turnstileSiteKey && <HumanVerification key={state.attempt ?? 0} siteKey={turnstileSiteKey} language={lang} action="avalon_quote" onToken={t => setHuman({ attempt: state.attempt ?? 0, token: t })} />}
    {state.status !== "idle" && <p className={s.error} role="alert">{t[state.status]}</p>}
    <Submit lang={lang} />
    <small className={s.note}>{t.privacy}</small>
  </form>;
}
