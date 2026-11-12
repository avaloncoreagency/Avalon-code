"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveDiscovery } from "@/app/admin/workspace/crm/lead/actions";
import { conditionMet } from "@/lib/crm/intel/form";
import type { Answer, Answers, Lang, Question, Section } from "@/lib/crm/intel/types";
import s from "@/components/sales/sales.module.css";
import x from "./intel.module.css";

const t = (lang: Lang, es: string, en: string) => (lang === "es" ? es : en);

type Props = {
  lang: Lang; lead: string; industry: string; section: Section; saved: Answers;
  conflicts: string[]; invalid: string[]; justSaved: boolean; owners: Record<string, string>;
};

/**
 * One questionnaire section. Conditional questions show/hide live; only changed answers are sent, each with the
 * timestamp it was loaded with, so the server can refuse to overwrite an answer another owner changed meanwhile.
 * A same-tab emergency copy (sessionStorage) survives network errors; it is never treated as saved.
 */
export function DiscoveryForm({ lang, lead, industry, section, saved, conflicts, invalid, justSaved, owners }: Props) {
  const [local, setLocal] = useState<Answers>({});
  const [draftFound, setDraftFound] = useState(false);
  const [restored, setRestored] = useState<Answers>({});
  const [restoreKey, setRestoreKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const key = `avalon:crm-discovery:v1:${lead}:${industry}:${section.id}`;
  const answers = useMemo(() => ({ ...saved, ...local }), [saved, local]);

  useEffect(() => {
    try {
      if (justSaved && conflicts.length === 0 && invalid.length === 0) { sessionStorage.removeItem(key); return; }
      if (sessionStorage.getItem(key)) setDraftFound(true);
    } catch { /* private mode: no emergency copy */ }
  }, [key, justSaved, conflicts.length, invalid.length]);

  const snapshot = () => {
    const f = formRef.current; if (!f) return;
    const data: [string, string][] = [];
    new FormData(f).forEach((v, k) => { if (typeof v === "string" && (k.startsWith("a__") || k.startsWith("s__"))) data.push([k, v]); });
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full or blocked */ }
  };
  const restore = () => {
    try {
      const d = JSON.parse(sessionStorage.getItem(key) ?? "null") as { data: [string, string][] } | null;
      if (!d || !Array.isArray(d.data)) return;
      const byName = new Map<string, string[]>();
      for (const entry of d.data) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || typeof entry[1] !== "string") continue;
        const [k, v] = entry;
        byName.set(k, [...(byName.get(k) ?? []), v]);
      }
      const recovered: Answers = {};
      for (const question of section.questions) {
        const id = question.id;
        const state = byName.get(`s__${id}`)?.[0];
        if (state === "unknown" || state === "na") { recovered[id] = { s: state }; continue; }
        const values = byName.get(`a__${id}`) ?? [];
        if (!values.length) continue;
        const first = values[0];
        let value: unknown = first;
        if (question.type === "yesno") value = first === "yes";
        else if (question.type === "multi") value = values;
        else if (["number", "money", "percent", "rating"].includes(question.type)) {
          const number = Number(first.replace(/[$,\s]/g, ""));
          if (!Number.isFinite(number)) continue;
          value = number;
        }
        recovered[id] = { v: value, s: "answered" };
      }
      // Re-render controlled field state and conditional branches from the same recovered snapshot.
      // Original server answers remain untouched and keep their conflict-check timestamps.
      setLocal(recovered); setRestored(recovered);
      setRestoreKey(k => k + 1); setDraftFound(false);
    } catch { /* corrupt or unavailable emergency copy; server answers remain authoritative */ }
  };
  const track = (q: Question, value: unknown) => setLocal(prev => ({ ...prev, [q.id]: { v: value, s: "answered" } }));
  const trackState = (q: Question, state: string) => setLocal(prev => ({ ...prev,
    [q.id]: state === "unknown" || state === "na" ? { s: state } : { ...((prev[q.id]?.s === "answered" ? prev[q.id] : saved[q.id]) ?? {}), s: "answered" },
  }));

  const visible = section.questions.filter(q => conditionMet(q.when, answers));
  return (
    <form ref={formRef} action={saveDiscovery} className={s.form} onInput={snapshot} onChange={snapshot}>
      <input type="hidden" name="lead" value={lead} /><input type="hidden" name="industry" value={industry} /><input type="hidden" name="section" value={section.id} />
      {draftFound && <p className={s.flash} data-tone="warn" role="status">
        {t(lang, "Hay respuestas sin guardar de un intento anterior en esta pestaña.", "There are unsaved answers from an earlier attempt in this tab.")}{" "}
        <button type="button" className={s.button} onClick={restore}>{t(lang, "Recuperar", "Recover")}</button>{" "}
        <button type="button" className={s.button} onClick={() => { try { sessionStorage.removeItem(key); } catch {} setDraftFound(false); }}>{t(lang, "Descartar", "Discard")}</button>
      </p>}
      {section.intro && <p className={s.flash} data-tone="warn">{section.intro[lang]}</p>}
      <div>
        {visible.map(q => <QuestionField key={`${q.id}:${restoreKey}`} q={q} lang={lang} orig={saved[q.id]} draft={restored[q.id]} conflict={conflicts.includes(q.id)} invalid={invalid.includes(q.id)} onTrack={track} onState={trackState} owners={owners} />)}
      </div>
      <div className={x.stickyBar}>
        <span className={x.meta}>{t(lang, "Se guarda en Avalon solo al pulsar un botón. Puedes dejar preguntas para después.", "Saved in Avalon only when you press a button. You can leave questions for later.")}</span>
        <div className={s.actions}>
          <button type="submit" name="stay" value="1" className={s.button}>{t(lang, "Guardar", "Save")}</button>
          <button type="submit" className={`${s.button} ${s.primary}`}>{t(lang, "Guardar y seguir", "Save and continue")}</button>
          <button type="submit" name="complete" value="1" className={s.button}>{t(lang, "Guardar y marcar completo", "Save and mark complete")}</button>
        </div>
      </div>
    </form>
  );
}

function QuestionField({ q, lang, orig, draft, conflict, invalid, onTrack, onState, owners }: {
  q: Question; lang: Lang; orig?: Answer; draft?: Answer; conflict: boolean; invalid: boolean; onTrack: (q: Question, v: unknown) => void;
  onState: (q: Question, v: string) => void; owners: Record<string, string>;
}) {
  const [state, setState] = useState<string>(draft?.s ?? orig?.s ?? "answered");
  const name = `a__${q.id}`, id = `q-${q.id}`;
  const off = state !== "answered";
  const active = draft ?? orig;
  const v = active?.s === "answered" ? active.v : undefined;
  let input: React.ReactNode;
  if (q.type === "long") input = <textarea id={id} name={name} rows={3} maxLength={2000} defaultValue={typeof v === "string" ? v : ""} disabled={off} />;
  else if (q.type === "text") input = <input id={id} name={name} maxLength={q.max ?? 200} defaultValue={typeof v === "string" ? v : ""} disabled={off} />;
  else if (q.type === "yesno") input = <div className={x.opts} role="radiogroup" aria-labelledby={id}>
    {[["yes", t(lang, "Sí", "Yes")], ["no", "No"]].map(([val, lab]) => <label key={val}><input type="radio" name={name} value={val} disabled={off}
      defaultChecked={v === (val === "yes")} onChange={() => onTrack(q, val === "yes")} />{lab}</label>)}</div>;
  else if (q.type === "choice") input = <div className={x.opts} role="radiogroup" aria-labelledby={id}>
    {q.options!.map(o => <label key={o.value}><input type="radio" name={name} value={o.value} disabled={off} defaultChecked={v === o.value} onChange={() => onTrack(q, o.value)} />{o.label[lang]}</label>)}</div>;
  else if (q.type === "multi") input = <div className={x.opts} role="group" aria-labelledby={id}>
    {q.options!.map(o => <label key={o.value}><input type="checkbox" name={name} value={o.value} disabled={off} defaultChecked={Array.isArray(v) && v.includes(o.value)}
      onChange={e => { const f = e.currentTarget.form!; onTrack(q, Array.from(f.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)).map(i => i.value)); }} />{o.label[lang]}</label>)}</div>;
  else {
    const prefix = q.type === "money" ? "$" : "", suffix = q.type === "percent" ? "%" : "";
    input = <div className={s.inline}>{prefix}<input id={id} name={name} inputMode="decimal" defaultValue={typeof v === "number" ? String(v) : ""} disabled={off}
      aria-describedby={q.help ? `${id}-help` : undefined} style={{ maxWidth: 220 }} />{suffix}</div>;
  }
  return (
    <div className={x.q} data-required={!!q.required} data-conflict={conflict} data-invalid={invalid}>
      <input type="hidden" name={`present__${q.id}`} value="1" />
      <input type="hidden" name={`o__${q.id}`} value={orig ? JSON.stringify({ v: orig.v, s: orig.s, at: orig.at }) : ""} />
      <span className={x.qLabel} id={q.type === "yesno" || q.type === "choice" || q.type === "multi" ? id : undefined}>
        {q.type === "yesno" || q.type === "choice" || q.type === "multi" ? q.label[lang] : <label htmlFor={id}>{q.label[lang]}</label>}
      </span>
      {q.help && <span className={x.help} id={`${id}-help`}>{q.help[lang]}</span>}
      {input}
      <div className={x.stateRow}>
        {[["answered", t(lang, "Respuesta", "Answer")], ["unknown", t(lang, "No lo sabe", "Unknown")], ...(q.allowNA || !q.required ? [["na", t(lang, "No aplica", "N/A")]] : [])]
          .map(([val, lab]) => <label key={val}><input type="radio" name={`s__${q.id}`} value={val} checked={state === val} onChange={() => { setState(val); onState(q, val); }} />{lab}</label>)}
      </div>
      {conflict && <span className={x.meta} role="alert" style={{ color: "#ffd3dc" }}>{t(lang, "Otro propietario cambió esta respuesta mientras editabas. Se muestra su versión; revisa antes de volver a guardar.", "Another owner changed this answer while you were editing. Their version is shown; review before saving again.")}</span>}
      {invalid && <span className={x.meta} role="alert" style={{ color: "#ffe6b0" }}>{t(lang, "Valor no válido: no se guardó esta respuesta.", "Invalid value: this answer was not saved.")}</span>}
      {orig?.at && <span className={x.meta}>{t(lang, "Guardado", "Saved")} {new Date(orig.at).toLocaleString(lang === "es" ? "es-US" : "en-US")} · {owners[orig.by ?? ""] ?? "—"}</span>}
    </div>
  );
}
