# Avalon OS: auditoría de seguridad

**Fecha:** 2026-11-02 · **Rama:** `security/avalon-hardening` · **Revisión siguiente:** mensual, o después de cualquier cambio en autenticación, base de datos o integraciones.

> Este documento no afirma que Avalon OS sea 100 % seguro. Registra lo que se revisó, las pruebas que lo respaldan y lo que queda pendiente. No contiene credenciales ni instrucciones de explotación.

## 1. Alcance y método

**Qué se revisó:**
- El código real de `main` (`a3cd13d`) junto con la corrección de login de Codex (`fix/avalon-password-login`, `b9a6af4`).
- La base de datos de producción de Supabase (`ltbwzcrxeuczdhhtbqgm`), revisada en modo solo lectura.
- El proyecto de Vercel `avalon-core-agency`.
- La configuración del repositorio en GitHub.

**Qué no se revisó:**
- El CRM de Samuel (PR #6). No está fusionado y no se modificó.
- El Dev Bridge (PR #10). Requiere su propia revisión antes de fusionarse.

**Referencias**, en las versiones vigentes verificadas el 2026-11-02:
- OWASP Top 10:2025 y OWASP ASVS 5.0.0.
- OWASP API Security Top 10 (2023).
- NIST CSF 2.0 y NIST SP 800-63-4, versión final.
- CIS Controls v8.1.
- Guías oficiales de Supabase, Next.js, Vercel y GitHub.

**Cómo se revisó:**
1. Lectura de todo el código de autenticación, sesiones, middleware, acciones de servidor y rutas.
2. Consultas de solo lectura a PostgreSQL: RLS, permisos, funciones `SECURITY DEFINER`, privilegios por defecto y Storage.
3. Asesores de Supabase.
4. API de GitHub: protección de ramas, Dependabot y escaneo de secretos.
5. Resultados de `npm audit` en CI.
6. Pruebas automatizadas nuevas.

## 2. Resumen ejecutivo

| Severidad | Encontrados | Corregidos en este PR (pendiente de validar en Preview) | Bloqueados (requieren acción de los dueños) | Abiertos o aceptados |
|---|---|---|---|---|
| Crítico | 0 | — | — | — |
| Alto | 3 | 2 (R-01, R-03) | 1 (R-02) | — |
| Medio | 6 | 4 (R-04, R-06, R-07, R-09) | 1 (R-08) | 1 (R-05) |
| Bajo | 4 | — | 1 (R-13) | 3 (R-10 abierto, R-11 y R-12 aceptados) |
| Informativo | 3 | — | — | 3 |

**Lo que ya estaba bien y se verificó:**
- La identidad se verifica con `auth.getUser()` en el servidor. La autorización usa la tabla `agency_memberships` y no depende de `user_metadata` ni del correo.
- Las tablas tienen RLS. Todas las tablas `os_*` y `agency_memberships` lo tienen activo, y `anon` no tiene ningún permiso.
- Solo existe una función `SECURITY DEFINER` y tiene `search_path` vacío.
- No hay buckets ni Edge Functions.
- No hay clave `service_role` en la aplicación.
- Los callbacks de autenticación redirigen a un origen fijo e ignoran `next` y `returnTo`.
- Las acciones de servidor vuelven a verificar al propietario en cada llamada.
- Las eliminaciones exigen confirmación en el servidor y quedan auditadas.
- GitHub ya tiene activos el escaneo de secretos y la protección de push.

## 3. Registro de riesgos

La fuente única del registro es `src/lib/security/findings.ts`, que también se muestra en `/admin/security`.

| ID | Sev. | Hallazgo | Evidencia | Corrección | Prueba | Estado |
|---|---|---|---|---|---|---|
| R-01 | Alto | Faltaban cabeceras de seguridad: no había protección contra clickjacking ni `nosniff`, y no había CSP ni Permissions-Policy. | Respuestas de producción sin `X-Frame-Options` ni CSP. | `src/lib/security/headers.ts` y `next.config.ts`. | `tests/security.test.cjs` y una prueba de integración HTTP. | Implementado, pendiente de validar en Preview |
| R-02 | Alto | `main` no tiene protección: un *push* directo despliega producción. | API: `branches/main/protection` responde 404 y no hay rulesets. | Ruleset recomendado en la sección 6. | — | **Bloqueado**: requiere un administrador |
| R-03 | Alto | El login con contraseña no tenía un límite propio de intentos. | `src/app/login/actions.ts` | `src/lib/security/rate-limit.ts`: límite por IP y por cuenta en login, recuperación, contraseña y MFA. | Pruebas unitarias e integración (el intento 9 nunca llega a Supabase). | Implementado |
| R-04 | Medio | Las cookies de sesión eran legibles por JavaScript y duraban 400 días. | Valores por defecto de `@supabase/ssr`. | `src/lib/supabase/cookies.ts`: `HttpOnly`, `Secure`, `SameSite=Lax`, solo host, 12 h de inactividad. | Pruebas unitarias e integración (`Set-Cookie`). | Implementado |
| R-05 | Medio | Hay 14 vulnerabilidades moderadas en dependencias. | `npm audit` en CI. | El CI bloquea las altas y críticas, y Dependabot actualiza semanalmente. | `.github/workflows/security.yml` | Abierto |
| R-06 | Medio | Los privilegios por defecto de `public` dan ALL a `anon` y `authenticated` en tablas nuevas. | Consulta a `pg_default_acl`. | Una prueba de CI exige RLS y `revoke` a `anon` en toda tabla nueva. | `tests/security.test.cjs` | Implementado |
| R-07 | Medio | No había MFA para los propietarios. | — | TOTP de Supabase, opcional. Con un factor verificado se exige AAL2. | Pruebas unitarias e integración (redirección a `/admin/mfa`). | Implementado; falta la activación por los dueños |
| R-08 | Medio | La protección contra contraseñas filtradas está desactivada. | Asesor de Supabase: `auth_leaked_password_protection`. | Activarla en el panel (incluida en el plan Pro). | Volver a ejecutar el asesor. | **Bloqueado**: requiere un dueño |
| R-09 | Medio | No había Dependabot, CodeQL ni auditoría de dependencias en CI. | API: Dependabot desactivado. | `.github/dependabot.yml` y `security.yml`. | Ejecución del workflow. | Implementado; las alertas las activa un administrador |
| R-10 | Bajo | Las acciones de CI están fijadas por etiqueta, no por SHA. | `.github/workflows/*.yml` | Fijarlas por SHA. | — | Abierto |
| R-11 | Bajo | La acción de Google OAuth existe aunque el botón está oculto. | `src/app/login/actions.ts` | Sin impacto: siempre se exige membresía. | Integración (cuenta Google sin membresía → rechazada). | Aceptado |
| R-12 | Bajo | Supabase limita por la IP del servidor de Vercel, compartida por todos. | Arquitectura. | El límite propio corta el abuso antes de llegar a Supabase. | — | Aceptado |
| R-13 | Bajo | Los ajustes de Auth no se pueden comprobar con las herramientas disponibles. | Sin API de configuración de Auth. | Lista de verificación manual en la sección 5. | — | **Bloqueado**: requiere un dueño |
| R-14 | Info | Hay backups diarios (plan Pro), pero nunca se probó una restauración. | Plan de la organización: `pro`. | `RESPALDOS_Y_RECUPERACION.md` | — | Abierto |
| R-15 | Info | La CSP completa todavía permite `'unsafe-inline'`. | `headers.ts` | Plan de nonces, sección 4. | — | Abierto |
| R-16 | Info | No hay aislamiento por cliente: hoy solo existen propietarios. | RLS de `os_*`. | Diseño en la sección 7. | `tests/sql/os_modules_rls.test.sql` | Aceptado |

## 4. Controles implementados en este PR

### Cabeceras HTTP (R-01, R-15)

Se aplican en todas las rutas. Producción ya recibía HSTS de Vercel, y ahora queda explícito en el código.

**Obligatorias desde ya:**
- CSP mínima: `frame-ancestors 'none'; object-src 'none'; base-uri 'self'`.
- `X-Frame-Options: DENY` y `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: no-referrer`.
- `Permissions-Policy`, que niega cámara, micrófono, ubicación, pagos y otros accesos.
- `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy`.
- `Strict-Transport-Security: max-age=63072000`, sin `includeSubDomains` ni `preload`.

**En modo informe** (`Content-Security-Policy-Report-Only`): la CSP completa. Restringe todo a `'self'`; permite `form-action` hacia Supabase y Google para OAuth, e incluye `upgrade-insecure-requests`.

**Plan de despliegue de la CSP:**
1. Desplegar en Preview y revisar la consola del navegador en login, dashboard, cada módulo, descargas y MFA.
2. Observar producción durante una semana.
3. Pasar a nonces con `middleware` y `headers()`.
4. Convertir la CSP completa en obligatoria.

### Autenticación y sesiones (R-03, R-04, R-07)

- **Las contraseñas las gestiona exclusivamente Supabase Auth.** No hay tablas propias de contraseñas ni criptografía casera.
- **El registro es solo por invitación.** El enlace debe verificarse con `verifyOtp`, y la cookie de flujo está firmada con HMAC, dura 15 minutos y es `HttpOnly`. Fijar una contraseña no concede permisos.
- **Protección contra enumeración de cuentas:**
  - Una contraseña incorrecta y una cuenta que no existe producen el mismo error.
  - La recuperación siempre muestra "si la cuenta existe…".
  - Cuando se bloquea por exceso de intentos, la recuperación muestra la misma pantalla.
- **Límites de intentos.** Son por instancia del servidor; un límite global requiere un almacenamiento compartido y la aprobación de los dueños.

  | Acción | Por IP | Por cuenta o usuario |
  |---|---|---|
  | Login | 20 / 15 min | 8 / 15 min |
  | Recuperación | 5 / h | 3 / h |
  | Fijar contraseña | 10 / 15 min | — |
  | Código MFA | — | 5 / 15 min |
  | Registro de MFA | — | 10 / h |

- **Cookies de sesión:** `HttpOnly`, `Secure` en producción, `SameSite=Lax` y solo host. Caducan tras 12 h de inactividad; se renuevan cuando Supabase rota el token mientras hay actividad.
- **Fijación de sesión:** Supabase emite tokens nuevos en cada inicio de sesión. El callback de OAuth no reutiliza una identidad previa (PKCE).
- **Cierre de sesión:** `signOut()` usa el alcance global de Supabase, que revoca los *refresh tokens* de todas las sesiones, y borra las cookies.
- **MFA:** el plan completo está en [`MFA.md`](./MFA.md).
- **Autorización en el servidor:**
  - El middleware protege `/admin/*` y `/api/*`.
  - Cada página privada llama a `requireOwner()`.
  - Cada acción y cada ruta llaman a `ownerForAction()` o `getOwnerSession()`.
  - RLS es la autoridad final.

### Supabase (R-06)

- Una prueba de CI revisa todas las migraciones. Cada tabla debe:
  - activar RLS;
  - revocar los permisos de `anon`;
  - no conceder nada a `anon`;
  - si usa `SECURITY DEFINER`, fijar `search_path = ''`.
- **No se aplicó ninguna migración en este PR.**

### Cadena de suministro (R-05, R-09)

- **`dependabot.yml`:** revisa npm y GitHub Actions cada semana.
- **`security.yml`** se ejecuta en cada PR, en cada push a `main` y los lunes. Incluye:
  - `npm audit`, que bloquea vulnerabilidades altas o críticas en dependencias de producción;
  - *dependency review* en los PR;
  - las pruebas de seguridad;
  - CodeQL con `security-extended`.
- **Permisos mínimos:** `contents: read`, y `security-events: write` solo para CodeQL. Sin `pull_request_target` y con `persist-credentials: false`.

### Security Command Center

`/admin/security` solo muestra datos reales:
- verificación en vivo de las cabeceras de producción;
- configuración de Auth;
- MFA y nivel AAL de la propia cuenta;
- eventos auditados y eliminaciones de los últimos 7 días;
- datos del despliegue;
- el registro de hallazgos.

Lo que la aplicación no puede leer (CI, Dependabot, backups, asesor de Supabase) aparece como **No verificado**, con un enlace al panel donde se puede comprobar.

## 5. Lista de verificación manual de Supabase Auth (R-08, R-13)

Se comprueba en Supabase, proyecto `ltbwzcrxeuczdhhtbqgm`, sección Authentication:
- [ ] **Sign In / Providers → Email.** "Allow new users to sign up" desactivado y "Confirm email" activado.
- [ ] **Passwords.** Longitud mínima de 12, requisitos de complejidad y **Leaked password protection** activada.
- [ ] **URL Configuration.**
  - Site URL: `https://avaloncoreagency.com`.
  - Redirect URLs exactas: `/admin/auth/callback`, `/admin/auth/confirm` y `/admin/reset-password`, sin comodines.
- [ ] **Rate Limits.** Revisar los límites de inicio de sesión y de correo; no deben ser más permisivos que los actuales.
- [ ] **Multi-Factor.** TOTP habilitado (viene activo por defecto).
- [ ] **Sessions** (plan Pro). Valorar una duración máxima de 7 días y un tiempo de inactividad de 12 h.
- [ ] **Advisors.** Seguridad sin advertencias.

## 6. GitHub: ruleset recomendado para `main` (R-02)

Se configura en Settings → Rules → New branch ruleset, apuntando a la rama predeterminada:
- Exigir *pull request* con 1 aprobación y descartar aprobaciones viejas cuando llegue un push nuevo.
- Exigir que pasen estos checks:
  - `checks` (Avalon Auth Review CI)
  - `RLS and triggers on isolated PostgreSQL`
  - `Dependency audit`
  - `Security regression tests`
  - `CodeQL`
- Bloquear *force push* y el borrado de la rama.
- Activar *Dependabot alerts* y *Dependabot security updates* en Settings → Code security.
- Valorar exigir commits firmados.

## 7. Protección de proyectos de clientes (R-16)

**Hoy:**
- Solo los propietarios acceden, y ven todos los proyectos.
- Los roles `admin` y `operator` no tienen acceso: la aplicación falla cerrada.
- Los proyectos no se borran, se archivan.
- Las páginas, productos y contenidos se borran con confirmación y queda auditoría.
- Las páginas web guardan versiones y se pueden restaurar.

**Antes de dar acceso a empleados o clientes:**
1. Crear la tabla `os_project_members (project_id, user_id, role)`.
2. Las políticas RLS deben exigir pertenencia al proyecto, no solo `is_owner()`.
3. Guardar los secretos de integraciones por proyecto en Supabase Vault, nunca en `settings`.
4. Exigir doble confirmación y un rol `manage` para publicar o eliminar.
5. Añadir pruebas SQL de aislamiento: un usuario del proyecto A no puede leer, modificar ni borrar datos del proyecto B.

## 8. Matriz de cumplimiento de controles

Leyenda:
- ✅ **Implementado y probado.**
- 🟡 **Implementado, pendiente de validación** en Preview o producción, o de que lo usen los dueños.
- ⏳ **Pendiente.**
- ⛔ **Bloqueado** por permisos o herramientas.
- — **No aplicable.**

| Control | Referencia | Estado |
|---|---|---|
| Identidad verificada en servidor; autorización por membresía | ASVS V8 / A01 | ✅ |
| RLS en todas las tablas, `anon` sin permisos | ASVS V8 / API1 | ✅ (prod verificado) |
| Guardia de CI para tablas nuevas | CIS 16 | 🟡 |
| Contraseñas gestionadas por el proveedor | 800-63B | ✅ |
| Registro público deshabilitado | ASVS V6 | ⛔ verificación manual (R-13) |
| Confirmación de correo | ASVS V6 | ⛔ verificación manual |
| Recuperación sin enumeración | ASVS V6 | ✅ |
| Limitación de intentos | ASVS V6 / API4 | 🟡 (por instancia) |
| Protección contra contraseñas filtradas | 800-63B | ⛔ R-08 |
| MFA TOTP opcional y AAL2 aplicado | 800-63B / ASVS V6 | 🟡 |
| MFA obligatorio | 800-63B | ⏳ (ver `MFA.md`) |
| Cookies `HttpOnly`, `Secure`, `SameSite` | ASVS V7 | 🟡 |
| Expiración por inactividad | ASVS V7 | 🟡 |
| Cierre de sesión revoca tokens | ASVS V7 | ✅ |
| Callbacks sin redirecciones abiertas | ASVS V5 / A01 | ✅ |
| Protección CSRF de Server Actions | ASVS V4 | ✅ (verificación de `Origin` de Next.js) |
| Anti-clickjacking, `nosniff`, Permissions-Policy | ASVS V3 | 🟡 |
| HSTS | ASVS V12 | ✅ (Vercel) |
| CSP obligatoria completa | ASVS V3 | ⏳ R-15 |
| Validación de entradas y salida escapada | ASVS V1/V5 / A03 | ✅ (pruebas unitarias) |
| CSV sin inyección de fórmulas | ASVS V1 | ✅ |
| Respuestas privadas `no-store` | ASVS V14 | ✅ |
| Errores sin detalles internos | ASVS V16 | ✅ |
| Sin secretos en el repositorio | CIS 3 | ✅ (prueba y escaneo de GitHub) |
| Sin claves privilegiadas en el frontend | — | ✅ |
| Auditoría de dependencias | CIS 16 / A06 | 🟡 |
| Análisis estático (CodeQL) | CIS 16 | 🟡 |
| Protección de rama y checks obligatorios | CIS 16 | ⛔ R-02 |
| Actions fijadas por SHA | SLSA | ⏳ R-10 |
| Separación de variables Preview/Production | — | ✅ (Vercel) |
| Backups diarios | CSF RC | ✅ (plan Pro) |
| Restauración probada | CSF RC | ⏳ R-14 |
| Respuesta a incidentes documentada | CSF RS | ✅ `RESPUESTA_A_INCIDENTES.md` |
| Guardas de seguridad para IA | OWASP LLM | ⏳ diseño en `SEGURIDAD_IA.md` (aún no hay IA conectada) |
| Storage / subida de archivos | ASVS V5 | — (no existe) |
| SSRF | A10 | ✅ (la única petición saliente va a un origen fijo) |

## 9. Pruebas

| Prueba | Qué demuestra | Dónde corre |
|---|---|---|
| `tests/security.test.cjs` (17 casos) | Limitador, cookies, cabeceras, MFA y AAL, cobertura de autorización en páginas, acciones y rutas, redirecciones, secretos, guardia de migraciones y permisos de workflows | Local y CI |
| `tests/auth.integration.cjs` | Contra Next.js real y Supabase simulado: cabeceras, atributos de `Set-Cookie`, MFA obligatorio con factor, bloqueo del intento 9, propietario, no miembro, *refresh*, cierre de sesión | CI |
| `tests/sql/os_modules_rls.test.sql` | RLS, permisos, triggers y auditoría en PostgreSQL 16 aislado | CI |
| `tests/os.test.cjs` y `tests/membership-migration.test.cjs` | Validación de dominio, exportaciones y migración de membresías | Local y CI |

**Pruebas que no se pudieron ejecutar, y por qué:**
- **Login real con TOTP de Miguel y Samuel:** requiere sus teléfonos.
- **Simulación de RLS con usuarios sintéticos en Supabase real:** el entorno canceló la consulta que inserta en `auth.users`. Se cubre en CI con PostgreSQL.
- **`npm audit` local:** el registro de npm no es accesible desde este entorno. Corre en CI.
- **Pruebas activas contra producción:** se excluyeron por política. No se hicieron pruebas de carga ni ataques.

## 10. Bitácora de checkpoints

| # | Riesgos | Cambios | Pruebas | Resultado | Residual | Siguiente |
|---|---|---|---|---|---|---|
| S-1 | Auditoría de código, base de datos, GitHub y Vercel | — | Consultas de solo lectura y API | 16 hallazgos, 0 críticos | — | Corregir los altos |
| S-2 | R-01, R-03, R-04, R-07 | Cabeceras, limitador, cookies, MFA | 38 casos locales en verde | — | Límite por instancia; CSP en modo informe | CI y Preview |
| S-3 | R-05, R-06, R-09 | Dependabot, `security.yml` y guardia de migraciones | CI | Ver el PR | Las alertas las activa un administrador | Documentación |
| S-4 | — | Command Center y documentación | Integración | Ver el PR | R-02, R-08 y R-13 los resuelven los dueños | Revisión y aprobación |
