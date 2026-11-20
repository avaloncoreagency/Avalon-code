"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import styles from "./login-panel.module.css";
import type { Lang } from "@/lib/i18n";

type ChallengeStatus = "idle" | "verifying" | "verified" | "retry";
type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    action: "avalon_login" | "avalon_quote";
    theme: "dark";
    size: "flexible";
    execution: "execute";
    appearance: "always";
    "response-field": false;
    callback: (token: string) => void;
    "error-callback": () => boolean;
    "expired-callback": () => void;
    "timeout-callback": () => void;
  }) => string;
  execute: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

function turnstileClient(): TurnstileApi | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { turnstile?: TurnstileApi }).turnstile ?? null;
}

/**
 * Cloudflare Managed may approve a low-risk browser without showing its own
 * checkbox. This component nevertheless requires a deliberate click BEFORE
 * rendering/executing any challenge. No fake checkbox or client-side bypass:
 * Siteverify in the server action is still the authority.
 */
export function HumanVerification({
  siteKey,
  language,
  onToken,
  action = "avalon_login",
}: {
  siteKey: string;
  language: Lang;
  onToken: (token: string) => void;
  /** Must match the server's verifyHumanToken(action). */
  action?: "avalon_login" | "avalon_quote";
}) {
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<ChallengeStatus>("idle");
  const container = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    // No Turnstile render() or execute() at page load: user must click first.
    if (attempt === 0 || !scriptReady) return;
    const api = turnstileClient();
    const host = container.current;
    if (!api || !host) {
      onTokenRef.current("");
      setStatus("retry");
      return;
    }

    let widgetId: string | null = null;
    const invalidate = () => {
      onTokenRef.current("");
      setStatus("retry");
    };
    try {
      widgetId = api.render(host, {
        sitekey: siteKey,
        action,
        theme: "dark",
        size: "flexible",
        execution: "execute",
        appearance: "always",
        "response-field": false,
        callback: (token) => {
          if (typeof token !== "string" || !token || token.length > 2048) {
            invalidate();
            return;
          }
          onTokenRef.current(token);
          setStatus("verified");
        },
        "error-callback": () => {
          invalidate();
          return true;
        },
        "expired-callback": invalidate,
        "timeout-callback": invalidate,
      });
      if (!widgetId) throw new Error("Turnstile did not create a widget");
      api.execute(widgetId);
    } catch {
      invalidate();
    }
    return () => {
      if (widgetId) {
        try { api.remove(widgetId); } catch { /* no token is trusted without Siteverify */ }
      }
    };
  }, [attempt, scriptReady, siteKey, action]);

  const verify = () => {
    if (status === "verifying" || status === "verified" || scriptFailed) return;
    onTokenRef.current("");
    setStatus("verifying");
    setAttempt((n) => n + 1);
  };
  const es = language === "es";
  const label = status === "verified"
    ? (es ? "Verificación completada" : "Verification complete")
    : status === "verifying"
      ? (es ? "Verificando con Cloudflare…" : "Verifying with Cloudflare…")
      : (es ? "Verificar que soy humano" : "Verify I am human");

  return (
    <div className={styles.turnstile} data-testid="human-verification">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => { setScriptReady(true); setScriptFailed(false); }}
        onError={() => {
          setScriptFailed(true);
          onTokenRef.current("");
          setStatus("retry");
        }}
      />
      <button
        type="button"
        className={styles.verifyButton}
        onClick={verify}
        disabled={status === "verifying" || status === "verified" || scriptFailed}
        aria-controls="avalon-human-challenge"
        aria-describedby="avalon-human-status"
        data-testid="human-verify-button"
      >
        <span aria-hidden="true">{status === "verified" ? "✓" : "◯"}</span>
        <span>{label}</span>
      </button>
      <div
        id="avalon-human-challenge"
        ref={container}
        className={styles.turnstileChallenge}
        hidden={attempt === 0}
        data-testid="turnstile-explicit-container"
      />
      <p id="avalon-human-status" className={styles.turnstileStatus} role="status" aria-live="polite">
        {scriptFailed
          ? (es ? "Cloudflare no pudo cargar. Recarga la página e inténtalo de nuevo." : "Cloudflare could not load. Refresh and try again.")
          : status === "verified"
            ? (action === "avalon_quote"
              ? (es ? "Listo. Ya puedes enviar tu solicitud." : "Done. You can now send your request.")
              : (es ? "Listo. Ya puedes iniciar sesión." : "Done. You can now sign in."))
            : status === "retry"
              ? (es ? "La verificación expiró o falló. Toca para intentar otra vez." : "Verification expired or failed. Tap to retry.")
              : status === "verifying"
                ? (es ? "Completa el desafío de Cloudflare si aparece." : "Complete the Cloudflare challenge if prompted.")
                : (es ? "Toca el botón para comenzar. No se verificará automáticamente." : "Tap the button to start. No automatic verification.")}
      </p>
    </div>
  );
}
