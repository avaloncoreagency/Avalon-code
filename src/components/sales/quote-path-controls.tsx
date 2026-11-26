"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { pick, type Lang } from "@/lib/i18n";
import s from "./sales.module.css";
import g from "./quote-path.module.css";

/** Return keyboard and visual focus to the actual next stage after a persisted state transition. */
export function PathResume({ resume, revision, status }: { resume: boolean; revision: number; status: string }) {
  useEffect(() => {
    if (!resume) return;
    const heading = document.getElementById("quote-path-current");
    if (heading) {
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [resume, revision, status]);
  return null;
}

export function PathSubmit({ lang, label, disabled = false }: { lang: Lang; label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={`${s.button} ${s.primary} ${g.cta}`} disabled={disabled || pending} aria-busy={pending}>
    {pending ? pick(lang, "Guardando…", "Saving…") : label}<span aria-hidden="true">{pending ? "…" : "→"}</span>
  </button>;
}

/** The existing owner action remains authoritative; the client only formats the evidence entered by the user. */
export function PathEvidence({ lang, kind, label, action, quoteId, version, disabled = false }: {
  lang: Lang; kind: "sent" | "accepted"; label: string; action: (form: FormData) => Promise<void>;
  quoteId: string; version: number; disabled?: boolean;
}) {
  const t = (es: string, en: string) => pick(lang, es, en);
  const [channel, setChannel] = useState("");
  const [date, setDate] = useState("");
  const [person, setPerson] = useState("");
  const [evidence, setEvidence] = useState("");
  const acceptance = kind === "accepted";
  const filled = Boolean(channel && date && (!acceptance || person.trim()) && evidence.trim().length >= 8);
  const channels = [
    ["email", "Correo electrónico", "E-mail"],
    ["whatsapp", "WhatsApp", "WhatsApp"],
    ["meeting", "Reunión / en persona", "Meeting / in person"],
    ["other", "Otro medio", "Other channel"],
  ];
  const channelLabel = channels.find(x => x[0] === channel);
  const note = [
    channelLabel && `${t("Medio", "Channel")}: ${t(channelLabel[1], channelLabel[2])}`,
    date && `${t("Fecha", "Date")}: ${date}`,
    acceptance && person.trim() && `${t("Aceptó", "Accepted by")}: ${person.trim()}`,
    evidence.trim() && `${t("Evidencia", "Evidence")}: ${evidence.trim()}`,
  ].filter(Boolean).join(" · ");
  return <form action={action} className={g.form} data-path-transition={kind}>
    <input type="hidden" name="quote_id" value={quoteId} />
    <input type="hidden" name="expected_version" value={version} />
    <input type="hidden" name="to" value={kind} />
    <input type="hidden" name="note" value={note} />
    <div className={g.fieldGrid}>
      <label className={s.field}>{t("Medio", "Channel")}
        <select name="path_channel" value={channel} onChange={e => setChannel(e.target.value)} required>
          <option value="">{t("Selecciona el medio", "Choose a channel")}</option>
          {channels.map(x => <option key={x[0]} value={x[0]}>{t(x[1], x[2])}</option>)}
        </select>
      </label>
      <label className={s.field}>{t("Fecha real", "Actual date")}
        <input name="path_date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </label>
    </div>
    {acceptance && <label className={s.field}>{t("Persona que aceptó", "Person who accepted")}
      <input name="path_person" value={person} onChange={e => setPerson(e.target.value)} maxLength={120} required pattern={".*\\S.*"} placeholder={t("Nombre del contacto autorizado", "Authorized contact name")} />
    </label>}
    <label className={s.field}>{t("Referencia o evidencia", "Reference or evidence")}
      <textarea name="path_evidence" required minLength={8} maxLength={650} rows={3} value={evidence} onChange={e => setEvidence(e.target.value)}
        placeholder={acceptance ? t("Ej.: respuesta de aceptación guardada en el expediente.", "E.g. acceptance reply saved in the client record.") : t("Ej.: mensaje enviado y guardado en el expediente.", "E.g. sent message saved in the client record.")} />
    </label>
    <p className={g.hint}>{acceptance ? t("Registra únicamente una aceptación real de esta revisión.", "Only record actual acceptance of this revision.") : t("Registrar un envío no envía mensajes ni correos.", "Recording a send does not send messages or e-mails.")}</p>
    <PathSubmit lang={lang} label={label} disabled={disabled || !filled} />
  </form>;
}
