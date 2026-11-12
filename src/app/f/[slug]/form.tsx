"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitFunnel, type FunnelSubmitState } from "./actions";
import styles from "../funnel.module.css";

const FEEDBACK: Record<Exclude<FunnelSubmitState["status"], "idle" | "ok">, string> = {
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

export function FunnelForm({ slug, cta, consentVersion = "" }: { slug: string; cta: string; consentVersion?: string }) {
  const [state, action] = useActionState<FunnelSubmitState, FormData>(submitFunnel, { status: "idle" });
  if (state.status === "ok")
    return <div className={styles.success} role="status">
      <h2>Solicitud recibida</h2>
      <p>Gracias. Tu solicitud quedó registrada para revisión. No significa que se haya confirmado una compra o cita.</p>
    </div>;
  return <form action={action} className={styles.form}>
    <input type="hidden" name="slug" value={slug} />
    <input type="hidden" name="consent_version" value={consentVersion} />
    <div className={styles.honeypot} aria-hidden="true">
      <label>No completar este campo<input name="website_url" tabIndex={-1} autoComplete="off" /></label>
    </div>
    <div className={styles.fields}>
      <label>Empresa <input name="company" required minLength={2} maxLength={200} autoComplete="organization" /></label>
      <label>Tu nombre <input name="name" required minLength={2} maxLength={160} autoComplete="name" /></label>
      <label>Correo electrónico <input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label>Teléfono (opcional) <input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
    </div>
    <label>¿Qué te gustaría lograr?
      <textarea name="message" required minLength={10} maxLength={2000} rows={4}
        placeholder="Describe tu proyecto, necesidad o disponibilidad…" />
    </label>
    <label className={styles.consent}>
      <input type="checkbox" name="consent" value="yes" required />
      <span>Acepto que Avalon use los datos que proporciono para revisar esta solicitud y contactarme manualmente sobre ella. No autorizo comunicaciones publicitarias automáticas.</span>
    </label>
    {state.status !== "idle" && <p role="alert" className={styles.error}>{FEEDBACK[state.status]}</p>}
    <SubmitButton label={cta} />
    <p className={styles.note}>Este formulario no realiza pagos, no programa reuniones automáticamente ni activa asistentes telefónicos.</p>
  </form>;
}
