/**
 * UI-only feedback for the internal client workspace introduced in PR #101.
 * Never display raw PostgreSQL, Supabase or user-supplied error messages.
 * Existing Sales feedback remains the fallback for unrelated CRM actions.
 */
const MESSAGES: Record<"ok" | "error", Readonly<Record<string, readonly [string, string]>>> = {
  ok: {
    workspace_saved: [
      "Expediente actualizado. Los cambios quedaron guardados.",
      "Client dossier updated. Your changes were saved.",
    ],
  },
  error: {
    workspace_invalid: [
      "Revisa los campos del expediente: hay datos incompletos o no válidos.",
      "Check the dossier fields: some information is incomplete or invalid.",
    ],
    workspace_pending: [
      "El expediente todavía no está disponible en este entorno. No se pudo confirmar el guardado.",
      "The dossier is not available in this environment yet. The save could not be confirmed.",
    ],
    workspace_save_failed: [
      "No se pudo confirmar el guardado. Revisa la conexión y vuelve a cargar el expediente antes de reintentar.",
      "The save could not be confirmed. Check the connection and reload the dossier before retrying.",
    ],
  },
};

export function workspaceFeedback(
  type: "ok" | "error", lang: "es" | "en", code: string,
): string | null {
  const messages = MESSAGES[type];
  if (!Object.hasOwn(messages, code)) return null;
  return messages[code][lang === "es" ? 0 : 1];
}
