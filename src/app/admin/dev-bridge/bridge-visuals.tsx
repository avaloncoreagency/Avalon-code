import type { Fact } from "@/lib/dev-bridge/core";
import { freshness } from "@/lib/dev-bridge/core";
import s from "./bridge.module.css";

type State = "verified" | "pending" | "blocked" | "unknown";
const STATUS: Record<State, string> = {
  verified: "Verificado",
  pending: "Pendiente",
  blocked: "Bloqueado",
  unknown: "Desconocido",
};

/** Display-only mapping: a successful API read is not a security or runtime certification. */
export function BridgeStatus({ state, label }: { state: State; label?: string }) {
  return <span className={`${s.status} ${s[`status_${state}`]}`} role="status">
    <span className={s.statusDot} aria-hidden="true" />{label ?? STATUS[state]}
  </span>;
}

export function SourceCard({
  name, fact, limited = false,
}: {
  name: "github" | "vercel" | "supabase";
  fact: Fact<unknown>;
  limited?: boolean;
}) {
  const current = freshness(fact).status;
  const state: State = current === "VERIFIED" ? (limited ? "pending" : "verified") : "unknown";
  const description = current === "STALE"
    ? "Última lectura desactualizada; no confirma el estado actual."
    : current !== "VERIFIED"
      ? "Sin lectura actual confirmada. Comprueba la conexión."
      : name === "github" && limited
        ? "Consulta pública limitada: no verifica CI, conflictos ni handoffs."
        : name === "github"
          ? "Metadatos de Issues, PRs y checks; no prueba el funcionamiento de Avalon."
          : name === "vercel"
            ? "Estados de builds y despliegues; no son pruebas funcionales."
            : "Metadatos de esquema; no se consultan clientes ni credenciales.";
  const sourceName = { github: "GitHub", vercel: "Vercel", supabase: "Supabase" }[name];
  return <article className={s.sourceCard}>
    <div className={s.sourceTop}><strong>{sourceName}</strong><BridgeStatus state={state} label={current === "VERIFIED" ? (limited ? "Parcial" : "Lectura verificada") : "Desconocido"} /></div>
    <p>{description}</p>
    <small>Última lectura verificada: <time dateTime={fact.verified_at ?? undefined}>{fact.verified_at ?? "Sin registro"}</time></small>
  </article>;
}

export function CiStatus({ code }: { code: string | undefined | null }) {
  const status = (code ?? "").toUpperCase();
  const state: State = status === "PASSED" ? "verified" : status === "FAILED" ? "blocked" : status === "PENDING" ? "pending" : "unknown";
  const label = status === "PASSED" ? "CI aprobado" : status === "FAILED" ? "CI falló" : status === "PENDING" ? "CI pendiente" : "CI desconocido";
  return <BridgeStatus state={state} label={label} />;
}

export function BuildStatus({ code }: { code: string | undefined | null }) {
  const status = (code ?? "").toUpperCase();
  const state: State = status === "READY" ? "verified" : ["ERROR", "CANCELED"].includes(status) ? "blocked" : ["BUILDING", "QUEUED", "INITIALIZING"].includes(status) ? "pending" : "unknown";
  const label = status === "READY" ? "Build listo" : status === "ERROR" ? "Build falló" : status === "CANCELED" ? "Cancelado" : state === "pending" ? "En preparación" : "Desconocido";
  return <BridgeStatus state={state} label={label} />;
}

export function Sha({ value, full = false }: { value: string | undefined | null; full?: boolean }) {
  const sha = /^[a-f0-9]{40}$/i.test(value ?? "") ? value! : null;
  if (!sha) return <span className={s.muted}>SHA desconocido</span>;
  return <code className={s.sha} title={sha}>{full ? sha : sha.slice(0, 12)}</code>;
}
