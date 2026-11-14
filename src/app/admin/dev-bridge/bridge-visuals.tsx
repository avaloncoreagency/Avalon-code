import type { ReactNode } from "react";
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

/**
 * External navigation derived from provider metadata is never arbitrary HTML.
 * Fail closed for untrusted URLs instead of rendering javascript: links or
 * hostnames that imitate a trusted GitHub/Vercel domain.
 */
export function verifiedProviderHref(value: unknown, source: "github" | "vercel"): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const isGithub = host === "github.com";
    const isVercel = host.endsWith(".vercel.app") || host === "vercel.app"
      || host === "avaloncoreagency.com" || host.endsWith(".avaloncoreagency.com");
    return (source === "github" ? isGithub : isVercel) ? url.href : null;
  } catch {
    return null;
  }
}

/** Keep unverified provider metadata visible as text, never as a clickable URL. */
export function SafeProviderLink({ href, source, children, className }: {
  href: unknown;
  source: "github" | "vercel";
  children: ReactNode;
  className?: string;
}) {
  const verified = verifiedProviderHref(href, source);
  return verified
    ? <a href={verified} className={className} rel="noopener noreferrer">{children}</a>
    : <span className={className ?? s.muted}>{children} · enlace no verificado</span>;
}

/** Display-only mapping: a successful API read is not a security or runtime certification. */
export function BridgeStatus({ state, label }: { state: State; label?: string }) {
  return <span className={`${s.status} ${s[`status_${state}`]}`}>
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
  // An error must never display as a verified provider read, even if an
  // inconsistent snapshot still carries VERIFIED and a recent timestamp.
  const reported = freshness(fact).status;
  const current = reported === "VERIFIED" && fact.error ? "UNKNOWN" : reported;
  // Keep provider errors distinct from a never-checked source. A stale cached
  // result is not a current provider success, even if older data is available.
  // Never render fact.error: it can contain internal diagnostics.
  const failedRead = Boolean(fact.error);
  const state: State = current === "VERIFIED"
    ? (limited ? "pending" : "verified")
    : current === "STALE" ? "pending" : failedRead ? "blocked" : "unknown";
  const label = current === "VERIFIED"
    ? (limited ? "Parcial" : "Lectura verificada")
    : current === "STALE" ? "Desactualizado"
      : failedRead ? "Error de conexión" : "Desconocido";
  const description = current === "STALE"
    ? failedRead
      ? "La consulta falló. Solo hay datos anteriores; el estado actual no está verificado."
      : "Última lectura desactualizada; no confirma el estado actual."
    : current !== "VERIFIED"
      ? failedRead
        ? "No se pudo consultar al proveedor; no hay lectura actual confirmada."
        : "Sin lectura actual confirmada. Comprueba la conexión."
      : name === "github" && limited
        ? "Consulta pública limitada: no verifica CI, conflictos ni handoffs."
        : name === "github"
          ? "Metadatos de Issues, PRs y checks; no prueba el funcionamiento de Avalon."
          : name === "vercel"
            ? "Estados de builds y despliegues; no son pruebas funcionales."
            : "Metadatos de esquema; no se consultan clientes ni credenciales.";
  const sourceName = { github: "GitHub", vercel: "Vercel", supabase: "Supabase" }[name];
  return <article className={s.sourceCard}>
    <div className={s.sourceTop}><strong>{sourceName}</strong><BridgeStatus state={state} label={label} /></div>
    <p>{description}</p>
    <small>Última lectura verificada: <time dateTime={fact.verified_at ?? undefined}>{fact.verified_at ?? "Sin registro"}</time></small>
  </article>;
}

/** Hide cached or failed security metadata rather than display stale RLS flags as current. */
export function VerifiedSourceOnly({ fact, children }: { fact: Fact<unknown>; children: ReactNode }) {
  if (freshness(fact).status !== "VERIFIED" || fact.error) {
    return <p className={s.noticeText} role="status">
      Metadatos no verificados actualmente. No se muestran estados anteriores como si fueran actuales.
    </p>;
  }
  return <>{children}</>;
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
