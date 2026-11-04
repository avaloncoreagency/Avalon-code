# Registro de riesgos — verificación del 2026-11-04

Complementa `docs/security/AUDITORIA.md` (no la reemplaza). Cada fila se **re-verificó** hoy con consultas de solo lectura
(Supabase advisors/migraciones, GitHub API, código en `main` 8a0104d). Nada de esto activa controles por sí mismo: los
elementos «Acción del administrador» **no están activados** hasta que un dueño los ejecute y se vuelva a verificar.
No contiene secretos ni datos de clientes.

| ID | Sev. | Hallazgo | Evidencia (hoy) | Corrección / prueba | Estado | Responsable |
|---|---|---|---|---|---|---|
| R-02 | Alto | `main` sin protección: un push directo despliega producción. Sin CODEOWNERS ni SECURITY.md. | `list_branches` → ramas `protected:false`; `git ls-tree origin/main` sin CODEOWNERS/SECURITY.md. | Ruleset de `AUDITORIA.md §6` + CODEOWNERS. **Acción del administrador** (la API disponible no puede crearlo). | Abierto — no activado | Miguel/Samuel |
| R-08 | Medio | Protección de contraseñas filtradas desactivada. | Supabase advisor `auth_leaked_password_protection` = WARN. | Activar en Auth → Passwords (plan Pro); re-ejecutar advisors. | Abierto — no activado | Dueño |
| R-17 | Info | `crm_public_inquiry` (SECURITY DEFINER) ejecutable por `anon`: es la única entrada pública (formulario de cotización). | Advisor `anon_security_definer_function_executable` count=1; guarda en `tests/security.test.cjs` permite solo esa. | Validada, honeypot y límite SQL (migración `public_inquiry`). Aceptado con prueba. | Aceptado | Claude |
| R-18 | Info | 8 funciones DEFINER ejecutables por `authenticated`. | Advisor `authenticated_security_definer_function_executable` count=8. Verificado en código: `crm_refresh_alerts` y `crm_radar_ingest` exigen `crm_private.is_owner()`. | El motor de managers (PR #120) añade 6 RPC con la misma guarda y pruebas negativas (non-owner/anon → denegado). Revisar las 6 restantes con prueba negativa. | Parcialmente verificado | Claude |
| R-19 | Bajo | `pg_net` instalada en el esquema `public`. | Advisor `extension_in_public` WARN. | Mover a `extensions` requiere migración en producción → **requiere aprobación**. | Abierto | Dueño |
| R-20 | Info | `crm_radar_worker_config` y `crm_private.finance_access` con RLS y sin políticas (acceso solo por RPC definer). | Advisor `rls_enabled_no_policy` INFO ×2. | Diseño intencional «deny-all»; documentado. | Aceptado | Claude |
| R-21 | Medio | **Deriva repo ↔ producción**: producción tiene `radar_scheduler_extensions` y `crm_client_workspace_finance_access`, que no existen con ese nombre en `main`; 5 versiones difieren en sello de tiempo (mismo nombre). | `list_migrations` (18) vs `supabase/migrations` (17 + PR #120). | Reconciliar con el historial de PRs #99/#110 antes de aplicar más migraciones; no aplicar SQL a ciegas. | Abierto | Claude/Codex |
| R-22 | Medio | Un owner puede falsificar un reporte de manager llamando el RPC directamente. | Diseño de `crm_agent_complete` (PR #120). | Atribución `requested_by`; ejecutores deterministas y de solo lectura; documentado. Mitigado, no eliminado. | Aceptado | Claude |
| R-23 | Medio | Rate limiting distribuido: el limitador propio es por instancia (R-03/R-12). | `src/lib/security/rate-limit.ts`; `AUDITORIA.md`. | Requiere almacén compartido (Upstash/Vercel KV) → posible gasto → **requiere aprobación**. | Abierto | Dueño |
| R-24 | Medio | WAF/Firewall de Vercel sin verificar. | `get_firewall_config` requiere `configVersion`; no se obtuvo. | Revisar reglas en el panel; no bloquear usuarios legítimos. | **UNKNOWN** | Dueño |
| R-25 | Info | Repo **público**: el código y los docs son visibles; ocultar URLs no es control de acceso. | Verificado en la misión; ver `AGENTS.md`. | Nada interno (datos de clientes, reportes de managers, media de Higgsfield) va al repo; reportes viven solo en BD con RLS. Decidir si el repo pasa a privado (impacto en CodeQL/Actions gratuitos). | Abierto | Dueños |

R-01, R-03, R-04, R-05, R-06, R-07, R-09–R-16 de `AUDITORIA.md` no se re-verificaron hoy más allá de lo anterior; su estado sigue siendo el de ese documento.

## Pasos exactos para el administrador (no activados)
1. GitHub → Settings → Rules → Rulesets → New branch ruleset sobre `main`: requerir PR, 1 aprobación, status checks (`security`, `crm`, `sales-core`, `os-modules`), bloquear force-push y borrado. Agregar `.github/CODEOWNERS` con ambos dueños.
2. Settings → Code security: activar Secret scanning + Push protection y Dependabot alerts.
3. Supabase → Auth → Providers/Passwords: activar *Leaked password protection*; volver a pedir el advisor.
4. Vercel → Firewall: revisar reglas y modo de ataque; documentar la configuración.
5. Probar una restauración de backup en un proyecto aislado (R-14).
