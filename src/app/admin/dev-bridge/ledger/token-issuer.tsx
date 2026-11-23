"use client";
import { useActionState } from "react";
import { issueAgentToken, type TokenState } from "./actions";
import s from "./ledger.module.css";

/** Issues a token for one of the caller's OWN agents and shows it exactly once. It is never stored in plain text. */
export function TokenIssuer({ agent, lang, label }: { agent: string; lang: "es" | "en"; label: string }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(issueAgentToken, {});
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  return <form action={action} className={s.inline}>
    <input type="hidden" name="agent" value={agent} />
    <label>{t("Días de validez", "Valid days")} <input name="days" type="number" min={1} max={90} defaultValue={30} inputMode="numeric" /></label>
    <button type="submit" disabled={pending}>{pending ? t("Generando…", "Generating…") : label}</button>
    {state.error && <p role="alert" className={s.error}>{state.error}</p>}
    {state.token && <div role="status" className={s.secret}>
      <p><strong>{t("Cópialo ahora: no se volverá a mostrar.", "Copy it now: it will not be shown again.")}</strong></p>
      <code>{state.token}</code>
      <p>{t("Configúralo SOLO en el entorno de ese agente:", "Set it ONLY in that agent's environment:")} <code>AVALON_BRIDGE_AGENT_TOKEN</code></p>
    </div>}
  </form>;
}
