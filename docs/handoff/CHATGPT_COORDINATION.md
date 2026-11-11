# Avalon OS: reporte de coordinación (Claude Code → ChatGPT)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-11 |
| Repositorio | `avaloncoreagency/Avalon-code` |
| Alcance vigente (decisión del owner, 2026-11-11) | Solo Miguel y Samuel. Managers, empleados, motores y Oficina 3D quedan fuera de alcance por ahora; su código se conserva en sus ramas |
| Fuente de verdad | El repositorio de GitHub: commits, PR y los documentos de `docs/`. Este reporte no sustituye a esos documentos |

## 1. Estado en una línea

**Integración y CRM:**
- Hay una rama de integración (`integration/avalon-v1`) con todo el trabajo útil para v1.
- Encima está **CRM Intelligence** (`claude/crm-intelligence`).
- Ambas tienen CI propio, con PR [#159](https://github.com/avaloncoreagency/Avalon-code/pull/159) (→ `main`) y [#160](https://github.com/avaloncoreagency/Avalon-code/pull/160) (→ integración).
- El owner autorizó fusionarlas. Ver §8 para el estado exacto de la fusión.

**Producción:**
- **Supabase producción no se ha modificado.** Las migraciones nuevas **no** están aplicadas en producción.
- **Vercel Preview está bloqueado a propósito** (ver §6).

## 2. Ramas, PR y commits

| PR | Rama | Base | Contenido |
|---|---|---|---|
| #159 | `integration/avalon-v1` | `main` | #156 + #157 (incluye #132) + Radar por ejecución + #143 + #154 + #155 + correcciones de CI y seguridad |
| #160 | `claude/crm-intelligence` | `integration/avalon-v1` | CRM Intelligence completo + documentación |
| #156 | `claude/pause-nonessential-workflows` | `main` | Pausa de workflows (incluido en #159) |
| #157 | `claude/gitless-direct-bridge` | #132 | Direct Bridge, Biblioteca, Website Designer y Code Exchange (incluido en #159) |
| #158 | `claude/engine-registry` | #157 | Registro de 10 motores. **Fuera de alcance**, no integrado |
| #149, #150 | — | — | Managers y HQ 3D. **Fuera de alcance**, no integrados |

**Commits clave:**

| Commit | Rama | Cambio |
|---|---|---|
| `54fb126` | — | Radar: cada búsqueda guarda sus resultados (`run_id`) |
| `c2c8721` | Integración | CI verde (runners `ubuntu-24.04`) y Code Exchange desactivado por defecto |
| `f5ddee9` | Integración | Endurecimiento de seguridad tras CodeQL |
| `9b6ac35` | CRM Intelligence | Backend |
| `62204f1` | CRM Intelligence | UI |
| `7774f83` | CRM Intelligence | Documentación |

## 3. Qué se construyó (resumen técnico)

### 3.1 Direct Bridge, Biblioteca y Website Designer (#157, ya integrado)

**Biblioteca versionada:**
- `os_projects` → `os_project_versions` (inmutables) → `os_project_files` (SHA-256, bucket privado `avalon-projects`).
- Importar ZIP (lector seguro), exportar ZIP (con hashes verificados), vista previa aislada, restaurar como versión nueva.

**Website Designer:**
- `saveWebsiteStudio`: versión optimista y reintento idempotente.
- `saveWebsiteToLibrary`: snapshot por digest.

**AI Chatbots y CRM Creator:** guardan en `os_projects.settings` (`saveNovaStudio`).

**Code Exchange (CLI `acx`):** se usaba para intercambiar código con Codex sin GitHub.
- Hoy está **desactivado por defecto** (migración `20261111090000`, solo `revoke` a `anon`, reversible), porque Codex ya no participa y GitHub está restaurado.
- Reactivarlo es devolver `EXECUTE` a `anon` sobre las 9 funciones `os_code_*`.

**Verificado** en la base aislada `wupvuwmqfcvmjqycmnvg` (2026-11-09/10):
- Dos owners: 15/15.
- Exportar/importar: 5/5.
- Direct Bridge: 4 pruebas en PASS y 2 bloqueadas por Vercel.

### 3.2 Radar / Lead Hunter

- **Causa raíz** de los «resultados viejos al buscar otro ZIP»: las búsquedas no guardaban qué negocios encontraban y la bandeja recargaba todo el histórico.
- **Corrección:**
  - `crm_radar_run_places` y el descriptor de búsqueda en `crm_radar_runs` (historial).
  - `places?run=<uuid>`, la ruta `/radar/runs` y una UI acotada a la última búsqueda.
  - Geocodificación: coordenadas resueltas en local, modo código postal y sin caché de respuestas vacías.
- **#143:** la conversión automática exige una aprobación previa y verificable de un owner.
- **Pendiente:** la prueba real «buscar 33311 y luego 33009» necesita la clave del proveedor y un entorno desplegado.

### 3.3 CRM Intelligence (#160)

Documento completo: `docs/CRM_INTELLIGENCE.md`.

**Rutas:**
- `/admin/workspace/crm/desk`: Mesa comercial y Quick Add.
- `/admin/workspace/crm/lead/[id]`: Deal Review con las pestañas `summary`, `recs`, `terms`, `contract` y `history`.
- `/admin/workspace/crm/lead/[id]/discovery`: cuestionario por industria.

**Tablas nuevas** (migración `20261111100000_crm_intelligence.sql`, aditiva):
- `crm_lead_assessments`, `crm_lead_assessment_revisions`, `crm_lead_scores`.
- `crm_lead_recommendations`, `crm_commercial_terms`.
- `crm_contracts`, `crm_contract_events`.
- Columnas nuevas en `crm_leads`.

**Lógica pura** en `src/lib/crm/intel/`:

| Archivo | Contenido |
|---|---|
| `templates.ts` | Cuestionarios versionados: general + HVAC Florida + Barbería + Smoke Shop |
| `scoring.ts` | Puntuación `score-1`, con riesgo legal separado |
| `recommendations.ts` | Recomendaciones |
| `duplicates.ts` | Detección de duplicados |
| `form.ts` | Lógica del formulario |

**Regla dura en la base de datos:** ningún lead entra en una etapa `won` sin un contrato `verified_signed`.
- `crm_confirm_sale` y `crm_convert_lead_to_client` heredan la regla.
- Tras aplicarla en producción, una venta desde un lead necesita un contrato verificado.

## 4. Contratos que ChatGPT/Codex deben respetar

1. **No** crear un segundo CRM, una segunda biblioteca ni tablas de guardado paralelas. Reutilizar las tablas y acciones descritas arriba.
2. **Toda escritura** pasa por acciones de servidor con `ownerForAction()` o por RPC revisadas. `tests/os.test.cjs` mantiene la lista blanca `REVIEWED_RPCS`.
3. **RLS solo para owners** en tablas nuevas. `anon` revocado. Nada de `service_role` en `src` (lo comprueba un test).
4. **Migraciones:**
   - Siempre aditivas y probadas con PGlite (`tests/*.database.cjs` aplica todas las migraciones).
   - **Nunca** aplicarlas en producción sin la aprobación expresa del owner.
5. **Estados honestos:**
   - No simular ejecuciones ni inventar cifras, ROI ni conversiones.
   - Lo desconocido se muestra como «sin datos», no como 0.
6. **Formularios con React 19:** tras una acción, React reinicia el formulario. Hay que devolver los valores y remontar el formulario (ver `sale-form.tsx` y `quick-add.tsx`).
7. **Commits:** se atribuyen a la sesión de Claude. No se escriben secretos ni datos de clientes en el repositorio.

## 5. Pruebas (locales; no demuestran que producción funcione)

| Suite | Resultado |
|---|---|
| `npm test` | 437/437 en CRM Intelligence y 425/425 en integración |
| PGlite, todas las migraciones y RLS real | 29 suites, 58/58 |
| `tests/crm-intelligence.browser.cjs`: build de producción → puente REST → PGlite → Chromium, en escritorio, iPhone 13, iPhone SE y en inglés | PASS |
| `tests/sales.browser.cjs` | PASS en 3 de 4 ejecuciones. Hay un error #418 de hidratación intermitente sin resolver (defecto D10) |
| Lint, TypeScript y `next build` | OK |

**Cómo reproducir:**

```bash
npm ci && npm ci --prefix tests/qa
npm test
NODE_PATH=./tests/qa/node_modules node --test tests/*.database.cjs
npm run build
NODE_PATH=./tests/qa/node_modules CRM_INTEL_BROWSER=1 node --test tests/crm-intelligence.browser.cjs
```

## 6. Bloqueos y decisiones pendientes del owner

| # | Tema | Detalle | Quién |
|---|---|---|---|
| 1 | Vercel Preview | Todos los Preview fallan: el entorno Preview apunta a la base de **producción** y `next.config.ts` lo bloquea (correcto). Hay que poner las variables de Preview hacia una base aislada | Owner |
| 2 | Plan de Vercel | Hobby no permite uso comercial; Pro cuesta $20 por desarrollador al mes | Owner |
| 3 | Migraciones en producción | `project_bridge`, `code_exchange`, `code_exchange_disabled`, `radar_search_runs`, `radar_owner_approval`, `ai_engine`, `crm_intelligence`, … Hay que aplicarlas una a una con revisión | Owner |
| 4 | Supabase Auth | Activar la protección de contraseñas filtradas | Owner |
| 5 | `pg_net` en `public` | Moverla a otro esquema | Owner |
| 6 | Revisión jurídica | Licencias DBPR, comisiones o referencias, publicidad de tabaco/nicotina, consentimiento y conservación de datos | Owner o abogado |
| 7 | CodeQL en #159 | 1 alerta alta y 7 medias que no se pudieron leer desde la sesión. Se endureció lo probable (zip slip, ReDoS); revisar la pestaña Security → Code scanning | Owner |

## 7. Registro de defectos

El registro completo está en `docs/AVALON_V1_STATUS.md`.

| Estado | Defectos |
|---|---|
| Resueltos | D1 (CI y Playwright), D3 y D4 (Radar), D5 (Code Exchange expuesto a `anon`), D6, D7 (el formulario de ventas perdía datos), D8 (Quick Add), D9 (Ganado sin contrato) |
| Abiertos | D2 (Preview), D10 (#418 intermitente), D11 (Auth), D12 (`pg_net`) |
| Sin verificar en esta operación | E-commerce Designer, AI Communications y una auditoría automática de accesibilidad |

## 8. Fusión autorizada por el owner (2026-11-11)

El owner pidió «integrar y fusionar todo».

Procedimiento seguido:
1. Fusionar #160 en `integration/avalon-v1`.
2. Fusionar #159 en `main`, con commit de merge para conservar el historial.

Al fusionar en `main`, Vercel construirá producción desde `main`. Mientras las migraciones del §6.3 no estén aplicadas, las pantallas nuevas mostrarán «migración no aplicada» en lugar de fallar. Nada se aplica a la base de producción automáticamente.

**Resultado de la fusión:** ver la línea final añadida a este documento.

## 9. Siguiente trabajo recomendado (en orden)

1. Decidir los bloqueos 1–4 del §6; los dos primeros desbloquean Preview.
2. Aplicar las migraciones en producción con revisión y verificar con los dos owners reales:
   1. Login.
   2. Quick Add.
   3. Diagnóstico.
   4. Contrato.
   5. Venta.
3. Prueba real del Radar (33311 → 33009) en un entorno desplegado.
4. Verificar E-commerce Designer y AI Communications (sin ampliar alcance).
5. Investigar D10 (#418).
6. Especializar los cuestionarios de las 10 industrias restantes (añadir secciones en `templates.ts` y subir la versión).
