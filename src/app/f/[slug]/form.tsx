"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitFunnel, type FunnelSubmitState } from "./actions";
import { HumanVerification } from "@/components/auth/human-verification";
import styles from "../funnel.module.css";

const FEEDBACK: Record<Exclude<FunnelSubmitState["status"], "idle" | "ok">, string> = {
  human: "Antes de enviar, pulsa «Verificar que soy humano». Tus datos siguen aquí.",
  invalid: "Revisa los datos, acepta el aviso de privacidad y añade un mensaje de al menos 10 caracteres.",
  throttled: "Recibimos varias solicitudes recientemente. Inténtalo más tarde.",
  unavailable: "No pudimos guardar tu solicitud. No se ha confirmado ningún registro; inténtalo más tarde.",
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={styles.submit} disabled={pending} aria-busy={pending}>
    {pending ? "Registrando solicitud…" : label}
  </button>;
}

export function FunnelForm({ slug, cta, consentVersion = "", turnstileSiteKey }:
  { slug: string; cta: string; consentVersion?: string; turnstileSiteKey?: string }) {
  const [state, action] = useActionState<FunnelSubmitState, FormData>(submitFunnel, { status: "idle" });
  // One-time Turnstile token: re-armed after every answered submission (attempt changes the widget key).
  const [human, setHuman] = useState({ attempt: 0, token: "" });
  const token = human.attempt === (state.attempt ?? 0) ? human.token : "";
  const v = state.values;
  if (state.status === "ok")
    return <div className={styles.success} role="status">
      <h2>Solicitud recibida</h2>
      <p>Gracias. Tu solicitud quedó registrada para revisión. No significa que se haya confirmado una compra o cita.</p>
    </div>;
  return <form action={action} className={styles.form}>
    <input type="hidden" name="slug" value={slug} />
    <input type="hidden" name="consent_version" value={consentVersion} />
    <input type="hidden" name="cf-turnstile-response" value={token} />
    <div className={styles.honeypot} aria-hidden="true">
      <label>No completar este campo<input name="website_url" tabIndex={-1} autoComplete="off" /></label>
    </div>
    <div className={styles.fields}>
      <label>Empresa <input name="company" required minLength={2} maxLength={200} autoComplete="organization" defaultValue={v?.company} /></label>
      <label>Tu nombre <input name="name" required minLength={2} maxLength={160} autoComplete="name" defaultValue={v?.name} /></label>
      <label>Correo electrónico <input name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={v?.email} /></label>
      <label>Teléfono (opcional) <input name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={v?.phone} /></label>
    </div>
    <label>¿Qué te gustaría lograr?
      <textarea name="message" required minLength={10} maxLength={2000} rows={4}
        placeholder="Describe tu proyecto, necesidad o disponibilidad…" defaultValue={v?.message} />
    </label>
    <label className={styles.consent}>
      <input type="checkbox" name="consent" value="yes" required />
      <span>Acepto que Avalon use los datos que proporciono para revisar esta solicitud y contactarme manualmente sobre ella. No autorizo comunicaciones publicitarias automáticas.</span>
    </label>
    {turnstileSiteKey && <HumanVerification key={state.attempt ?? 0} siteKey={turnstileSiteKey} language="es" action="avalon_funnel"
      onToken={t => setHuman({ attempt: state.attempt ?? 0, token: t })} />}
    {state.status !== "idle" && <p role="alert" className={styles.error}>{FEEDBACK[state.status]}</p>}
    <SubmitButton label={cta} />
    <p className={styles.note}>Este formulario no realiza pagos, no programa reuniones automáticamente ni activa asistentes telefónicos.</p>
  </form>;
}
