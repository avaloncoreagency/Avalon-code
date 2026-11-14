// Security findings register (source of truth for /admin/security and
// docs/security/AUDITORIA.md). Facts only: each entry records where the risk
// was observed and what evidence closes it. No exploitation details.

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingStatus =
  | "verified"      // implemented and verified with evidence
  | "implemented"   // implemented in code; pending validation in Preview/production
  | "open"          // pending work
  | "blocked"       // needs owner action or permissions we do not have
  | "accepted";     // documented residual risk

export type Finding = {
  id: string; severity: Severity; status: FindingStatus; area: string;
  title: [es: string, en: string]; location: string; fix: [es: string, en: string]; evidence: string;
};

export const REVIEWED_AT = "2026-11-12";

export const FINDINGS: Finding[] = [
  {
    id: "R-01", severity: "high", status: "implemented", area: "Web",
    title: ["Faltaban cabeceras de seguridad (anti-clickjacking, nosniff, CSP, Permissions-Policy)", "Missing security headers (anti-clickjacking, nosniff, CSP, Permissions-Policy)"],
    location: "next.config.ts · src/lib/security/headers.ts",
    fix: ["Cabeceras aplicadas a todas las rutas; CSP mínima obligatoria y CSP completa en modo informe (Report-Only).", "Headers on every route; minimal enforced CSP and full CSP in Report-Only."],
    evidence: "tests/security.test.cjs · comprobación en vivo en /admin/security",
  },
  {
    id: "R-02", severity: "high", status: "blocked", area: "GitHub",
    title: ["No hay ruleset registrado para main; protección clásica no verificable", "No recorded main ruleset; classic branch protection unverified"],
    location: "GitHub → Settings → Rules",
    fix: ["Crear un ruleset: PR obligatorio, 1 revisión, checks requeridos, sin force-push ni borrado.", "Create a ruleset: required PR, 1 review, required checks, no force-push or deletion."],
    evidence: "2026-11-12: GitHub rulesets → []; branches/main/protection → 403 para integración",
  },
  {
    id: "R-03", severity: "high", status: "implemented", area: "Auth",
    title: ["Login por contraseña sin límite de intentos propio", "Password sign-in had no application rate limit"],
    location: "src/app/login/actions.ts · src/app/admin/password-actions.ts · src/lib/security/rate-limit.ts",
    fix: ["Límite por IP y por cuenta (hash) en login, recuperación, contraseña y MFA, con mensaje genérico. Por instancia: un límite distribuido requiere almacenamiento compartido (aprobación).", "Per-IP and per-account (hashed) limits on sign-in, recovery, password and MFA, generic message. Per instance: a distributed limit needs shared storage (approval)."],
    evidence: "tests/security.test.cjs (limitador)",
  },
  {
    id: "R-04", severity: "medium", status: "implemented", area: "Sesiones",
    title: ["Cookies de sesión legibles por JavaScript y con vida de 400 días", "Session cookies readable by JavaScript with a 400-day lifetime"],
    location: "src/lib/supabase/cookies.ts",
    fix: ["HttpOnly, Secure, SameSite=Lax, solo host y caducidad por inactividad de 12 h. Se eliminó el cliente de navegador sin uso.", "HttpOnly, Secure, SameSite=Lax, host-only and 12 h idle expiry. Removed the unused browser client."],
    evidence: "tests/security.test.cjs (cookies)",
  },
  {
    id: "R-05", severity: "medium", status: "open", area: "Dependencias",
    title: ["Vulnerabilidades de dependencias: severidad y cantidad por revalidar", "Dependency vulnerabilities: severity and count require fresh verification"],
    location: "package-lock.json",
    fix: ["CI bloquea severidad alta/crítica e informa el resto; Dependabot propone actualizaciones semanales.", "CI blocks high/critical and reports the rest; Dependabot proposes weekly updates."],
    evidence: ".github/workflows/security.yml · .github/dependabot.yml",
  },
  {
    id: "R-06", severity: "medium", status: "implemented", area: "Supabase",
    title: ["Los privilegios por defecto de public conceden ALL a anon/authenticated en tablas nuevas", "Default privileges in public grant ALL to anon/authenticated on new tables"],
    location: "supabase/migrations",
    fix: ["Prueba de CI: toda tabla nueva en una migración debe activar RLS y revocar a anon.", "CI test: every new table in a migration must enable RLS and revoke anon."],
    evidence: "tests/security.test.cjs (migraciones)",
  },
  {
    id: "R-07", severity: "medium", status: "implemented", area: "Auth",
    title: ["Sin autenticación multifactor para propietarios", "No multi-factor authentication for owners"],
    location: "src/app/admin/mfa · src/app/admin/mfa-actions.ts · /admin/profile",
    fix: ["TOTP de Supabase opcional; con factor verificado, el acceso exige AAL2. Activación por cada propietario.", "Optional Supabase TOTP; with a verified factor, access requires AAL2. Each owner enables it."],
    evidence: "tests/security.test.cjs (MFA) · pendiente prueba real de Miguel y Samuel",
  },
  {
    id: "R-08", severity: "medium", status: "blocked", area: "Supabase",
    title: ["Protección contra contraseñas filtradas desactivada (asesor de Supabase)", "Leaked-password protection disabled (Supabase advisor)"],
    location: "Supabase → Authentication → Passwords",
    fix: ["Activarla (incluida en el plan Pro) y exigir longitud mínima 12.", "Enable it (included in Pro) and require minimum length 12."],
    evidence: "get_advisors(security): auth_leaked_password_protection WARN",
  },
  {
    id: "R-09", severity: "medium", status: "implemented", area: "GitHub",
    title: ["Sin Dependabot, CodeQL ni auditoría de dependencias en CI", "No Dependabot, CodeQL or dependency audit in CI"],
    location: ".github/",
    fix: ["dependabot.yml, workflow de seguridad (audit, dependency review, CodeQL, escaneo de secretos). Activar alertas de Dependabot requiere un administrador.", "dependabot.yml, security workflow (audit, dependency review, CodeQL, secret scan). Enabling Dependabot alerts needs an admin."],
    evidence: ".github/workflows/security.yml",
  },
  {
    id: "R-10", severity: "low", status: "implemented", area: "GitHub",
    title: ["Acciones de GitHub referenciadas por etiqueta y no por SHA", "GitHub Actions referenced by tag, not SHA"],
    location: ".github/workflows/*.yml",
    fix: ["Acciones fijadas por SHA inmutable; actualizar mediante revisión de los commits y CI.", "Actions pinned to immutable SHAs; update through reviewed commits and CI."],
    evidence: "2026-11-12: tests/security-workflow-pins.test.cjs, commit de Security Recovery; validar CI",
  },
  {
    id: "R-11", severity: "low", status: "accepted", area: "Auth",
    title: ["La acción de Google OAuth sigue existiendo aunque el botón está oculto", "The Google OAuth action still exists although the button is hidden"],
    location: "src/app/login/actions.ts",
    fix: ["Sin impacto mientras Google no esté configurado; el acceso siempre exige membresía de propietario.", "No impact while Google is not configured; access always requires owner membership."],
    evidence: "src/lib/auth/access.ts",
  },
  {
    id: "R-12", severity: "low", status: "accepted", area: "Auth",
    title: ["Supabase limita por IP del servidor de Vercel (riesgo de bloqueo temporal del login)", "Supabase limits by Vercel server IP (risk of temporary sign-in lockout)"],
    location: "Supabase Auth rate limits",
    fix: ["El límite propio por IP corta el abuso antes de llegar a Supabase. Revisar los límites en el panel.", "The app's per-IP limit stops abuse before Supabase. Review limits in the dashboard."],
    evidence: "Documentado",
  },
  {
    id: "R-13", severity: "low", status: "blocked", area: "Supabase",
    title: ["Ajustes de Auth no verificables con las herramientas: registro público, confirmación de email, URLs", "Auth settings not verifiable with available tools: public sign-up, email confirmation, URLs"],
    location: "Supabase → Authentication",
    fix: ["Verificación manual con la lista de docs/security/AUDITORIA.md.", "Manual check using the list in docs/security/AUDITORIA.md."],
    evidence: "No verificado",
  },
  {
    id: "R-14", severity: "info", status: "open", area: "Recuperación",
    title: ["Backups diarios (plan Pro) sin prueba de restauración", "Daily backups (Pro plan) without a restore test"],
    location: "Supabase → Database → Backups",
    fix: ["Probar restauración en un proyecto aislado y medir RTO/RPO.", "Test a restore into an isolated project and measure RTO/RPO."],
    evidence: "docs/security/RESPALDOS_Y_RECUPERACION.md",
  },
  {
    id: "R-15", severity: "info", status: "open", area: "Web",
    title: ["La CSP completa aún permite 'unsafe-inline' para scripts", "The full CSP still allows 'unsafe-inline' scripts"],
    location: "src/lib/security/headers.ts",
    fix: ["Observar en Report-Only y migrar a nonces antes de hacerla obligatoria.", "Observe in Report-Only, then move to nonces before enforcing."],
    evidence: "Plan en docs/security/AUDITORIA.md",
  },
  {
    id: "R-16", severity: "info", status: "accepted", area: "Clientes",
    title: ["Aislamiento por cliente: hoy solo existen propietarios con acceso total", "Per-client isolation: only owners with full access exist today"],
    location: "public.os_* · agency_memberships",
    fix: ["Roles admin/operator sin acceso (falla cerrado). Antes de habilitarlos: membresía por proyecto y RLS por proyecto.", "admin/operator have no access (fail closed). Before enabling them: per-project membership and RLS."],
    evidence: "tests/sql/os_modules_rls.test.sql",
  },

  // 2026-11-14 follow-up: Supabase advisors + read-only PostgreSQL privilege and
  // function-definition inspection. Warnings are not by themselves exploitable vulnerabilities.
  {
    id: "R-17", severity: "medium", status: "implemented", area: "Supabase",
    title: ["Funciones públicas con privilegios elevados: revisar excepciones y límites", "Public privileged functions: review exceptions and rate limits"],
    location: "public.crm_public_inquiry · crm_ai_public_control · crm_growth_funnel_view/submit · os_bridge_api_open_import/import_status",
    fix: ["Las consultas públicas y funnels tienen controles de entrada y límites; los dos RPC del puente requieren token y scope, y el control IA devuelve solo interruptores. Mantener pruebas negativas, revisar abuso y no revocar flujos legítimos sin estudiar dependencias.", "Public intake and funnel RPCs validate and throttle requests; both bridge RPCs require scoped tokens, and AI control exposes only switches. Keep negative tests, assess abuse, and check dependencies before revoking required access."],
    evidence: "2026-11-14: Supabase advisor reports 6 anon SECURITY DEFINER functions; read-only pg_proc privileges + pg_get_functiondef inspected. Access is intentional in existing designs; dynamic misuse testing still pending.",
  },
  {
    id: "R-18", severity: "medium", status: "open", area: "Supabase",
    title: ["RPC privilegiadas accesibles a usuarios autenticados: distintos modelos de autorización", "Privileged RPCs callable by authenticated users: mixed authorization models"],
    location: "public.crm_* · public.os_bridge_* · public.os_code_* · public.office_directory",
    fix: ["Las funciones CRM/Office comprueban owner; otras exigen token u os_private.is_owner(). Auditar el contrato individual y probar usuarios sin membresía.", "CRM/Office check owner; others require tokens or os_private.is_owner(). Audit each contract and test non-members."],
    evidence: "2026-11-14: Supabase advisor reports 38 SECURITY DEFINER functions callable by authenticated role. Warning does not prove bypass; exhaustive per-RPC owner/scope checks and non-member tests still pending.",
  },
  {
    id: "R-19", severity: "low", status: "blocked", area: "Supabase",
    title: ["Extensión pg_net instalada en el esquema public", "pg_net extension installed in public schema"],
    location: "Supabase → Database → Extensions",
    fix: ["pg_net indica extrelocatable=false; no ejecutar ALTER EXTENSION SET SCHEMA sin proceso de reubicación soportado y pruebas aisladas.", "pg_net has extrelocatable=false; do not run ALTER EXTENSION SET SCHEMA without supported relocation and isolated tests."],
    evidence: "2026-11-12: pg_extension.extrelocatable=false y advisor extension_in_public",
  },
  {
    id: "R-20", severity: "info", status: "accepted", area: "Supabase",
    title: ["Dos tablas con RLS y sin políticas: denegación directa intencional", "Two tables with RLS but no policies: intentional direct denial"],
    location: "crm_private.finance_access · public.crm_radar_worker_config",
    fix: ["Conservar sin políticas y sin SELECT público; controlar sus operaciones por RPC autorizadas.", "Keep without direct policies or public SELECT; control access through authorized RPCs."],
    evidence: "2026-11-12: RLS=true, policies=0, anon_select=false, auth_select=false en pg_catalog",
  },
  {
    id: "R-21", severity: "medium", status: "open", area: "Migraciones",
    title: ["Historial de migraciones de producción por reconciliar con ramas activas", "Production migration history must be reconciled with active branches"],
    location: "supabase/migrations · Supabase migration history",
    fix: ["Comparar versiones y dependencias antes de aplicar cualquier SQL; no ejecutar migraciones en producción en esta rama.", "Compare versions and dependencies before applying SQL; no production migrations in this branch."],
    evidence: "2026-11-12: main 31 archivos, producción 26 versiones (22 nombres coinciden), Preview aislado 32 (31 de main + chatbot)",
  },
  {
    id: "R-22", severity: "medium", status: "accepted", area: "Managers (fuera de v1)",
    title: ["Los reportes de managers no demuestran ejecución autónoma", "Manager reports do not prove autonomous execution"],
    location: "public.crm_agent_complete · docs/security/REGISTRO_RIESGOS_20261104.md",
    fix: ["Mantener managers fuera de v1; requerir evidencias de ejecutor antes de etiquetar tareas como completadas.", "Keep managers out of v1; require executor evidence before marking tasks completed."],
    evidence: "R-22 del registro 2026-11-04; no revalidado en esta operación",
  },
  {
    id: "R-23", severity: "medium", status: "open", area: "Auth",
    title: ["El rate limit propio está aislado por instancia de servidor", "Application rate limiting is per server instance"],
    location: "src/lib/security/rate-limit.ts",
    fix: ["Diseñar límite distribuido reutilizando infraestructura aprobada; conservar límites de Supabase mientras tanto.", "Design distributed throttling with approved infrastructure; keep Supabase limits as fallback."],
    evidence: "2026-11-12: SlidingWindowLimiter usa Map en memoria",
  },
  {
    id: "R-24", severity: "medium", status: "blocked", area: "Vercel",
    title: ["Configuración del firewall sin verificación concluyente", "Firewall configuration not conclusively verified"],
    location: "Vercel → Security → Firewall",
    fix: ["Revisar el panel y validar reglas sin bloquear tráfico legítimo; guardar evidencia del estado real.", "Inspect dashboard and validate rules without blocking real users; preserve evidence."],
    evidence: "2026-11-12: consulta de configuración activa devolvió 404; estado desconocido",
  },
  {
    id: "R-25", severity: "info", status: "open", area: "GitHub",
    title: ["Repositorio público: decidir política de visibilidad y divulgación", "Public repository: review visibility and disclosure policy"],
    location: "GitHub → Repository settings",
    fix: ["Evitar subir datos de clientes o secretos; evaluar impacto en CI y CodeQL antes de hacerlo privado.", "Never commit client data or secrets; assess CI and CodeQL impact before changing visibility."],
    evidence: "2026-11-12: GitHub get_repo visibility=public",
  },
];

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
