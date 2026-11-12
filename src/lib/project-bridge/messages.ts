import { reasonText } from "./service";

const KEYS = ["archive_too_large", "archive_uncompressed_too_large", "too_many_entries", "file_too_large", "not_a_zip", "unsupported_upload_type", "path_traversal",
  "absolute_path", "symlink_entry", "encrypted_entry", "compression_ratio_too_high", "duplicate_entry", "rejected_files", "empty_archive", "zip64_not_supported",
  "archive_missing", "retry_limit_reached", "interrupted"];
const EXTRA: Record<string, [string, string]> = {
  rate_limited: ["Límite de importaciones alcanzado (30 por hora, 2 a la vez). Espera unos minutos.", "Import limit reached (30 per hour, 2 at a time). Wait a few minutes."],
  invalid_category: ["Categoría no válida.", "Invalid category."],
  storage_unavailable: ["El almacenamiento privado no está disponible (¿migración aplicada?).", "Private storage is unavailable (migration applied?)."],
  import_not_registered: ["No se pudo registrar la importación (¿migración aplicada?).", "The import could not be registered (migration applied?)."],
  unauthorized: ["Tu sesión expiró. Vuelve a entrar.", "Your session expired. Sign in again."],
  forbidden_origin: ["Solicitud bloqueada por seguridad.", "Request blocked for security."],
  blocked_file_type: ["tipo de archivo bloqueado", "blocked file type"],
  secret_or_system_file: ["archivo de secretos o del sistema", "secret or system file"],
  blocked_directory: ["carpeta no permitida (node_modules, .git…)", "folder not allowed (node_modules, .git…)"],
  content_does_not_match_type: ["el contenido no coincide con la extensión", "content does not match its extension"],
  secret_detected: ["contiene una clave secreta; elimínala antes de importar", "contains a secret key; remove it before importing"],
  file_type_not_allowed: ["tipo de archivo no permitido", "file type not allowed"],
  file_without_extension: ["archivo sin extensión", "file without extension"],
};
export function bridgeMessages(lang: "es" | "en"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of KEYS) out[k] = reasonText(k, lang);
  for (const [k, v] of Object.entries(EXTRA)) out[k] = lang === "es" ? v[0] : v[1];
  return out;
}
export const STATE_LABEL: Record<string, [string, string]> = {
  awaiting_upload: ["Esperando archivo", "Awaiting upload"], received: ["Recibido", "Received"], validating: ["Validando", "Validating"],
  registered: ["Importado y validado", "Imported and validated"], duplicate: ["Duplicado", "Duplicate"], rejected: ["Rechazado", "Rejected"], failed: ["Falló", "Failed"],
  preparing: ["Preparando", "Preparing"], queued: ["En cola en Vercel", "Queued on Vercel"], building: ["Desplegando", "Deploying"], ready: ["Desplegado (verificado)", "Deployed (verified)"],
  error: ["Error de despliegue", "Deployment error"], canceled: ["Cancelado", "Canceled"], blocked: ["Bloqueado", "Blocked"],
};
