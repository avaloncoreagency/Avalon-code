"use client";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { coreEngineMessage } from "@/lib/sales/core-engine";
import { pick, type Lang } from "@/lib/i18n";
import s from "./sales.module.css";

export type CoreFeedback = { ok: boolean; message: string };
/** A failed operation keeps the original DOM fields; only a server-confirmed success resets them. */
export function CoreForm({ action, children, label, lang, confirmText }: {
  action: (form: FormData) => Promise<CoreFeedback>; children: ReactNode; label: string; lang: Lang; confirmText?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<CoreFeedback | null>(null);
  const inFlight = useRef(false);
  return <form className={s.form} aria-label={label} aria-busy={pending} onSubmit={event => {
    event.preventDefault();
    if (inFlight.current || (confirmText && !window.confirm(confirmText))) return;
    const form = event.currentTarget, data = new FormData(form);
    inFlight.current = true; setFeedback(null);
    start(async () => {
      try {
        const result = await action(data); setFeedback(result);
        if (result.ok) { form.reset(); router.refresh(); }
      } catch { setFeedback({ok:false,message:coreEngineMessage(null, lang)}); }
      finally { inFlight.current = false; }
    });
  }}>
    <fieldset disabled={pending} style={{border:0,padding:0,margin:0,minWidth:0,display:"grid",gap:12}}>
      {children}
      <button className={s.button} type="submit">{pending ? pick(lang,"Guardando…","Saving…") : label}</button>
    </fieldset>
    {feedback && <p role={feedback.ok ? "status" : "alert"} className={s.flash} data-tone={feedback.ok ? "ok" : "error"}>{feedback.message}</p>}
  </form>;
}
