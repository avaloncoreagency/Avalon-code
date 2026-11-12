# Avalon Security Recovery — checkpoint actualizado · 2026-11-12

**Alcance:** Security Command Center, permisos PostgreSQL, CI, Preview aislado y preparación de integración.
**Estado:** código corregido en PR #165 (sobre `main`), sin modificaciones de seguridad en producción por este PR.

## 1. Reconciliación con integraciones recientes

- PR #159 (`integration/avalon-v1`) y PR #160 (`claude/crm-intelligence`) se fusionaron el 12 de noviembre. Por eso se creó una rama nueva directamente desde `main`, en vez de fusionar el antiguo PR #163.
- PR #165 contiene el registro R-01..R-25, distinción entre pendientes y controles implementados, pruebas y documentación. La rama anterior permanece como referencia histórica.
- GitHub ahora tiene **31 archivos de migración** en `main`; Supabase producción reporta **26 versiones** aplicadas. En muchos casos el nombre y el timestamp difieren (por ejemplo, `manager_execution`, `radar_scheduler_core`). No se puede declarar migración segura por comparar solo los números: hace falta reconciliar contenido y dependencias, evitando reaplicar operaciones equivalentes.
- `main` contiene `crm_intelligence`, `crm_titan_backend`, `crm_titan_documents`, `growth_funnel_public`, `radar_search_runs` y otras migraciones que todavía **no se han verificado como aplicadas con ese contenido**.

## 2. Comprobaciones reales de Supabase (solo lectura)

- Todas las **71 tablas públicas** revisadas tenían RLS activo; ninguna tenía permiso directo SELECT para `anon`.
- Dos tablas RLS sin políticas, `crm_private.finance_access` y `public.crm_radar_worker_config`, están intencionalmente denegadas a `anon` y `authenticated`.
- En `public` hay **37 funciones SECURITY DEFINER**. `anon` puede ejecutar cuatro: `crm_public_inquiry` (cotizaciones públicas con límites), `crm_ai_public_control` (control operacional de solo lectura), `os_bridge_api_open_import` y `os_bridge_api_import_status` (protección por token).
- El rol `authenticated` puede ejecutar 36 funciones privilegiadas; distintas familias validan ownership o scopes de token. Esta revisión de código **no equivale a pruebas dinámicas** con un usuario ajeno.
- Advertencias todavía abiertas: `pg_net` instalada en `public`; protección de contraseñas filtradas desactivada; funciones privilegiadas accesibles (algunas diseñadas así). No ejecutar REVOKE indiscriminado.
- La función pública de cotización requiere validación de campos y límite SQL; se conserva, para no romper entradas de clientes.

## 3. CI y Preview

- En la rama anterior, el workflow Security pasó Dependency audit, Dependency review, CodeQL y Security regression tests; el Preview quedó READY usando una rama aislada de Supabase.
- La nueva rama `chatgpt/security-recovery-main-20261112` está basada en `main` después de las fusiones.
- Para esta nueva rama se configuraron `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` exclusivamente en Preview y con valores de la rama aislada; sin modificar Production.
- El estado de CI y el deployment exactos del PR #165 se deben verificar en GitHub y Vercel tras el último commit. No extrapolar resultados del PR #163.

## 4. Control de salida antes de fusionar

- CI de la rama exacta: security, auth, os modules, lint, TypeScript, build y pruebas relevantes.
- Comprobar login y permisos con ambas cuentas owner; probar usuario sin membresía y MFA AAL1 / AAL2 en entorno aislado.
- Revisar los cuatro RPC anónimos y las familias CRM, Bridge, Code Exchange con pruebas negativas: token inválido, usuario extraño, token revocado, operaciones no permitidas.
- Verificar configuración de `main` para PR obligatorio/revisión y controles de seguridad. La API de reglasets devolvió lista vacía; branch protection devolvió 403 (no autorizado), así que el estado de protección clásica es **no verificable**.
- Activar `leaked-password protection` desde Supabase Auth cuando los owners autoricen y el plan lo permita; ejecutar nuevamente los advisors.
- Resolver el mapa de 31 archivos de migraciones versus 26 aplicadas, y probar las migraciones restantes en aislamiento antes de aplicarlas en producción.
- Verificar firewall y backups en sus paneles; la API del firewall devolvió 404 y por eso el resultado sigue siendo **UNKNOWN**.
- No fusionar a producción como sustituto de estas pruebas; la web pública debe permanecer operativa.

## 5. Lo que no se cambió

Sin cambios a tablas, datos de clientes, passwords, roles Auth, RLS de producción, credenciales, firewall, branches ajenas, planes de pago o configuración Production. La aplicación no debe mostrar números inventados como «seguridad verificada».
