> **Estado actualizado por ChatGPT · 2026-11-12 (verificación de conectores):** #160 y #159 **ya están fusionados**; `main` apunta al merge `65609bf5` y el despliegue Vercel Production `dpl_HZNmjww4BLT3L8Msi2K1B49wJv5i` figura `READY`. Esto contradice parte del estado histórico más abajo. La base Supabase Production (`ltbwzcrxeuczdhhtbqgm`) está activa y sus migraciones registradas terminan con `code_exchange_with_anon_disabled` (`20261112142022`): **no están registradas las migraciones `radar_search_runs`, `crm_intelligence`, `crm_titan_backend` ni `crm_titan_documents`.** Security Advisor: 4 funciones SECURITY DEFINER ejecutables por anon, 36 por authenticated, `pg_net` en public, protección de contraseñas filtradas desactivada y dos tablas con RLS sin políticas. Son advertencias por evaluar, no vulnerabilidades individualmente confirmadas. En #159 se informaron 8 alertas CodeQL (1 alta/7 medias); los detalles no han sido recuperables por el conector y no se afirma resolución. **Veredicto de V2: NOT_READY para publicar cambios adicionales**; rama separada `chatgpt/crm-intelligence-v2-20261112`, sin aplicar SQL ni cambiar el despliegue. Evidencia: GitHub PR #159/#160, Vercel deployments y Supabase migrations/advisors consultados el 12 de noviembre.

# Avalon OS v1: estado verificado y registro de defectos

**Fecha:** 2026-11-11.

**Ramas:**
- `integration/avalon-v1`, verificada en `c2c8721`.
- `claude/crm-intelligence`, encima, en `62204f1`.

**Regla:** solo se marca como hecho lo que tiene evidencia. Las pruebas locales con PGlite o Chromium **no** demuestran que producción funcione.

**Alcance acordado (2026-11-11):** solo Miguel y Samuel. Managers, empleados, motores y Oficina 3D quedan **fuera** por ahora; su código se conserva en sus ramas.

## Veredicto: **NOT_READY**

Bloqueos críticos que no dependen de código:
1. **No hay despliegue candidato.** Todas las Preview de Vercel fallan a propósito: las variables del entorno Preview apuntan a la base de **producción** y `next.config.ts` lo impide. Requiere decisión del owner sobre la base aislada para Preview.
2. **Las migraciones nuevas no están en producción.** Hay que aplicarlas con aprobación expresa:
   - `project_bridge`
   - `code_exchange`
   - `code_exchange_disabled`
   - `radar_search_runs`
   - `radar_owner_approval`
   - `ai_engine`
   - `crm_intelligence`
   - …
3. **Seguridad de Auth en producción:** la protección de contraseñas filtradas está desactivada. Activarla es un cambio de configuración que requiere aprobación.

## 1. Estado inicial (2026-11-10)

**Repositorio y CI:**
- `main` en `d2890bb` (2026-11-04).
- Unos 70 PR abiertos, la mayoría borradores antiguos.
- CI en rojo: Playwright 1.56.1 no se instala en `ubuntu-latest`, que ya es 26.04.

**Vercel:** todos los despliegues recientes en `ERROR`, con `npm run build exited with 1`. Es el guard de Preview contra producción, no un fallo de código.

**Supabase (producción, solo lectura):**
- 22 migraciones; la última, `20261104172854`.
- Avisos del linter:

| Aviso | Detalle |
| --- | --- |
| Definer ejecutable por `anon` | 1: `crm_public_inquiry`, revisada e intencionada |
| Definer ejecutables por `authenticated` | 20; todas comprueban `is_owner` (auditoría previa) |
| Contraseñas filtradas | Protección desactivada |
| `pg_net` | Instalada en `public` |
| RLS sin políticas | 2 tablas; denegación total intencionada |

## 2–4. PR revisados, integrados y descartados

**Integrados** en `integration/avalon-v1` (**no** en `main`), sin conflictos:

| PR | Contenido |
| --- | --- |
| #156 | CI: pausa de workflows no esenciales |
| #157 | Direct Bridge, Biblioteca y Website Designer; incluye #132: AI Engine y HQ |
| `claude/radar-search-runs` | Radar: búsqueda ↔ ejecución |
| #143 | Aprobación verificable del Radar |
| #154 | Borradores recuperables del Website Designer |
| #155 | Funnels → CRM |

**Encima**, en `claude/crm-intelligence`: CRM Intelligence.

**Excluidos por alcance** (se conservan intactos en sus ramas):

| PR | Contenido |
| --- | --- |
| #158 | Registro de motores |
| #149 | Panel de managers |
| #150 | HQ 3D |

**Sin revisar en profundidad:** los borradores antiguos #5–#141. Muchos están superados por trabajo posterior. **No** se descarta ninguno sin revisarlo.

## 5–9. Cambios, defectos, correcciones y pruebas

### Registro de defectos

| ID | Componente | Gravedad | Causa raíz | Solución | Prueba de regresión | Commit | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | CI | P0 | Playwright 1.56.1 no soporta Ubuntu 26.04 (`ubuntu-latest`) | Todos los runners fijados a `ubuntu-24.04` | `ai-engine-workflow.test` | `c2c8721` | Resuelto; pendiente de comprobar en GitHub |
| D2 | Vercel Preview | P0 | El entorno Preview apunta a la base de producción; el guard lo bloquea | — | — | — | **Requiere autorización** |
| D3 | Radar | P1 | Las búsquedas no guardaban qué negocios encontraba cada ejecución; la bandeja mezclaba zonas y recargaba con un cierre obsoleto | `crm_radar_run_places`, `places?run=`, historial y UI acotada | `radar-search-runs.database`, `radar-geocode.test` | `54fb126` | Resuelto (local) |
| D4 | Radar · geocodificación | P1 | Caché de 24 h que también guardaba respuestas vacías; los ZIP se buscaban como texto libre | Coordenadas resueltas localmente, modo código postal, sin caché de vacíos | `radar-geocode.test` | `54fb126` | Resuelto (local) |
| D5 | Seguridad | P1 | Code Exchange exponía 9 funciones definer a `anon` y la postura de seguridad las marcaba como **altas** | Desactivado por defecto (`revoke`, reversible) | `agents-engine`, `agents-managers`, `code-exchange` | `c2c8721` | Resuelto (local) |
| D6 | CI · REN | P2 | Aviso de ESLint real en `e2e-two-envs.cjs` que hacía fallar la prueba de REN | Variable sin uso eliminada | Pipeline de REN | `c2c8721` | Resuelto |
| D7 | Ventas · formulario | P1 | Tras un error del servidor se perdían las líneas y la elección de cliente (React 19 reinicia el formulario) | El formulario se remonta en cada respuesta | `sales.browser` | `62204f1` | Resuelto |
| D8 | CRM · Quick Add | P1 | Mismo efecto de React 19 | Valores devueltos por la acción | `crm-intelligence.browser` | `62204f1` | Resuelto |
| D9 | CRM · contratos | P0 (regla de negocio) | Se podía pasar a Ganado o crear un cliente sin contrato firmado | Trigger `won_requires_contract` | PGlite + E2E | `9b6ac35` | Resuelto (local) |
| D10 | Ventas · hidratación | P2 | Error #418 intermitente (1 de 4 ejecuciones); causa no confirmada | — | — | — | **Pendiente** |
| D11 | Auth | P1 | Protección de contraseñas filtradas desactivada | — | — | — | **Requiere autorización** |
| D12 | Supabase | P2 | `pg_net` en el esquema `public` | Moverla es una migración de producción | — | — | **Requiere autorización** |

### Pruebas (locales, sobre `claude/crm-intelligence` `62204f1`)

| Suite | Resultado |
| --- | --- |
| `npm test` | 437 de 437 |
| PGlite (29 suites, todas las migraciones, RLS real) | 58 de 58 |
| Lint | 0 errores (5 avisos preexistentes) |
| TypeScript | OK |
| `next build` | OK |
| E2E `crm-intelligence.browser` | PASS |
| E2E `sales.browser` | PASS en 3 de 4 (D10) |

## 10–22. Estado por área

| Área | Estado | Evidencia o motivo |
| --- | --- | --- |
| Seguridad | Owners-only con RLS en todas las tablas nuevas; sin `service_role` en `src`; superficie `anon` reducida (D5) | Pruebas de seguridad, PGlite |
| Supabase producción | Sin tocar | — |
| Vercel | Bloqueado (D2). Plan **Hobby**: el uso comercial exige Pro ($20 por desarrollador al mes) | Verificado el 2026-11-10 |
| Biblioteca y Direct Bridge | Funcional en la base aislada el 2026-11-09/10: dos owners 15/15, exportar/importar 5/5. En esta rama: PGlite en verde | Evidencias en `docs/project-bridge/evidence` |
| Website Designer | Persistencia remota, versiones, exportación; borradores recuperables (#154) integrados | PGlite + pruebas del #154 |
| E-commerce Designer | **No trabajado en esta operación**; estado sin verificar | — |
| CRM Creator | Guarda la configuración (`saveNovaStudio`); sin versionado en la biblioteca | — |
| Radar y CRM | Radar acotado por búsqueda (D3, D4). Aprobación verificable (#143). **CRM Intelligence completo** (ver `docs/CRM_INTELLIGENCE.md`) | La prueba real «33311 → 33009» requiere un proveedor con clave y un entorno desplegado: **no ejecutada** |
| Marketing Hub | Funnels opt-in → CRM (#155) integrados; sus pruebas, en verde | `growth-funnel.database` |
| AI Communications | **No trabajado en esta operación** | — |
| Managers, oficina y motores | Fuera de alcance (decisión del owner del 2026-11-11) | — |

## 23. Requiere autorización o gasto

1. Base aislada para Vercel Preview y sus variables (sin coste en Supabase si se reutiliza la rama aislada existente).
2. Plan de Vercel: Hobby frente a Pro, por uso comercial.
3. Aplicar las migraciones en producción, una revisión por migración.
4. Activar la protección de contraseñas filtradas.
5. Mover `pg_net` fuera de `public`.
6. Fusionar `integration/avalon-v1` en `main` y la protección de `main`.

## 24. Defectos restantes por prioridad

| Prioridad | Defectos |
| --- | --- |
| **P0** | D2 |
| **P1** | D11. E-commerce Designer y AI Communications sin verificar. Prueba real del Radar en un entorno desplegado |
| **P2** | D10, D12. Auditoría automática de accesibilidad pendiente |

## 25. Veredicto

**NOT_READY**, por D2, por las migraciones de producción pendientes de aprobación y por las áreas sin verificar. Lo verificado está limitado a pruebas locales y aisladas.
