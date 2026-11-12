# CRM Titan: contrato backend → Codex

| Campo | Valor |
|---|---|
| Responsable backend | Claude Code (backend, base de datos, seguridad, integraciones) |
| Responsable frontend | Codex (UI, experiencia comercial, pruebas de navegador) |
| Rama | `claude/crm-titan-backend` |
| Base exacta | `615ca832dfb085e9d50d9bdc5e26527ec4096787` (HEAD de `claude/crm-intelligence` el 2026-11-12). **Codex debe partir de este mismo commit.** |
| PR | Contra `claude/crm-intelligence`. No se fusiona automáticamente. |
| Issue canónico | #144 (`owner:miguel`) |
| Migración | `supabase/migrations/20261112090000_crm_titan_backend.sql` (aditiva) |
| Estado de producción | **Sin aplicar.** Aplicada solo en la base aislada `wupvuwmqfcvmjqycmnvg` (rama Supabase sin datos de producción) |

Este documento es la fuente del contrato. Una interfaz figura como **Disponible** solo si se verificó con pruebas en PGlite (todas las migraciones, RLS real) **y** en la base aislada. Ninguna figura como disponible en producción.

---

## 1. Matriz de dependencias

| Pieza | Depende de | Estado |
|---|---|---|
| `claude/crm-titan-backend` | `claude/crm-intelligence` @ `615ca83` → PR #160 → `integration/avalon-v1` (PR #159) → `main` | #159 y #160 **no fusionados** (decisión del owner; alerta alta de CodeQL pendiente en #159) |
| Migración `20261112090000` | Todas las anteriores, incluida `20261111100000_crm_intelligence` | Probada en PGlite y en la base aislada |
| Funnel público (anónimo) | Migración + **aprobación del owner** para `docs/sql/growth-funnel-public-grant.sql` | Cerrado por defecto |
| Finanzas en Clientes 360° | Migración + cambio de Codex en la página (ver §3.3) | Backend disponible; la página aún usa la comparación de correo |

**Archivos tocados por backend (propiedad de Claude):**
- `supabase/migrations/20261112090000_crm_titan_backend.sql`
- `src/lib/sales/client-finance.ts` y `src/lib/sales/client-finance-server.ts` (nuevo)
- `src/lib/crm/intel/duplicates.ts`
- `src/lib/crm/radar-search.ts`
- `src/app/admin/workspace/crm/lead/actions.ts` (solo el bloque de duplicados de Quick Add)
- `src/app/admin/workspace/crm/radar/runs/route.ts`
- `src/app/f/[slug]/actions.ts` (server action del funnel)
- `docs/sql/*`
- Pruebas: `tests/crm-titan.*`, `tests/growth-funnel.database.cjs`, `tests/radar-geoapify.test.cjs` (expectativa de fallos registrados) y `tests/os.test.cjs` (lista de RPC revisadas)

**No se tocó nada de Codex:** componentes TSX, CSS, páginas visuales, `templates.ts`, `industries.ts` ni pruebas de navegador.

---

## 2. Capacidades (nuevo)

```ts
// src/lib/sales/client-finance-server.ts
getCrmCapabilities(db: SupabaseClient): Promise<CrmCapabilities>
type CrmCapabilities = { owner: boolean; financeView: boolean; commissionApprove: boolean; source: "database" | "unavailable" }
```

- Origen: RPC `crm_my_capabilities()`, de tipo SECURITY INVOKER y solo para `authenticated`.
- Lee `agency_memberships` y `crm_private.finance_access`.
- **Nunca compara correos.** No concede permisos nuevos: `finance_view` es exactamente la lista privada que ya existía.
- Ante cualquier error falla cerrado (`source: "unavailable"`, todo en `false`).

Respuesta sintética (base aislada, owner QA sin acceso financiero):

```json
{ "owner": true, "finance_view": false, "commission_approve": true }
```

**Estado:** Disponible (PGlite + base aislada).

---

## 3. Clientes 360° · finanzas

### 3.1 Servidor

```ts
loadClientFinance(db, clientId, caps?): Promise<ClientFinanceResult>
type ClientFinanceResult =
  | { allowed: false; reason: "no_capability" | "unavailable" }
  | { allowed: true; summary: FinanceSummary; source: "sql_aggregate" | "paged_rows" }
```

**Comportamiento:**
- Usa la RPC `crm_client_finance_summary(p_client uuid)`:
  - Hace una sola instantánea SQL sobre **todas** las filas, sin tope de 100 ventas ni de 200 gastos.
  - Solo cuenta las ventas `confirmed`; las ventas canceladas se informan aparte.
  - Agrupa por moneda y nunca convierte entre monedas.
  - Devuelve los importes como `numeric` exacto en forma de texto.
- Si la migración no está aplicada (`PGRST202`), recurre a la paginación completa (`loadAllRows`), que marca como parcial lo que esté incompleto.
- Si la base niega el acceso (`42501`), devuelve `allowed:false`.

**Errores:**

| Código | Situación |
|---|---|
| `crm_forbidden` (42501) | No es propietario |
| `finance_forbidden` (42501) | Propietario sin capacidad financiera |
| `client_not_found` (P0002) | Cliente inexistente |

Respuesta sintética de la RPC:

```json
{ "client_id": "…", "complete": true, "source": "sql_aggregate",
  "sales_confirmed": 104, "sales_cancelled": 1, "costs": 203,
  "currencies": [
    { "currency": "EUR", "sales": 3, "costs": 2, "contracted": "150.15", "collected": "50.05", "recurring_monthly": "0",
      "expenses": "-10.00", "profit": "60.05", "cancelled_contracts": 0 },
    { "currency": "USD", "sales": 101, "costs": 201, "contracted": "10110.10", "collected": "3370.37", "recurring_monthly": "20.20",
      "expenses": "223.11", "profit": "3147.26", "cancelled_contracts": 1 } ],
  "as_of": "…" }
```

### 3.2 Tipo para la UI (sin cambios)

`FinanceSummary` de `src/lib/sales/client-finance.ts`, el mismo que ya se renderiza.
- `summaryFromAggregate()` convierte la respuesta de la RPC a céntimos enteros.
- Si un importe no es exacto, `profitCents` vale `null` y `issues` dice por qué.
- `financeNotice()` sigue devolviendo el aviso de "subtotal".

### 3.3 Acción pendiente de Codex (página de Clientes 360°)

En `src/app/admin/workspace/crm/clients/[id]/page.tsx:38` la autorización sigue siendo:

```ts
const financeAllowed = user.email?.toLowerCase() === "<correo fijo del responsable financiero>";
```

Hay que sustituirla por:

```ts
const caps = await getCrmCapabilities(supabase);
const financeAllowed = caps.financeView;
// y para las cifras: const fin = await loadClientFinance(supabase, id, caps);
```

El listado de ventas de la página puede seguir usando `loadAllRows`, porque es una lista y no un total.

En `src/components/sales/client-workspace.tsx:33` los gastos se listan con `.limit(200)`:
- Es correcto como lista, pero la etiqueta debe decir "últimos 200".
- Los totales salen de `finance`, no de esa lista.

**Estado:**
- Backend disponible.
- **Defecto de seguridad abierto hasta el cambio de Codex.** La base ya protege los gastos por RLS; la comparación de correo solo controla lo que se muestra.

---

## 4. CRM Intelligence

### 4.1 Duplicados (Quick Add)

RPC `crm_lead_duplicate_candidates(p_phone, p_email, p_domain, p_name)`:
- De tipo SECURITY INVOKER, solo para owners.
- Devuelve como máximo 50 leads no archivados.
- Hace la búsqueda sobre **todos** los leads (antes se leían hasta 5000 en el servidor).

`quickAddLead` la usa con `duplicateCandidateArgs()` y aplica las reglas exactas de `findDuplicates()`. La respuesta a la UI no cambia:

```ts
type QuickAddState = { error?: string; duplicates?: { id: string; company: string; reasons: ("phone"|"domain"|"email"|"name")[] }[]; values?: Record<string,string> } | null
```

Corregido además: `emailDomain` no recortaba espacios.

**Estado:** Disponible.

### 4.2 Comisiones

**Reglas:**
- `crm_commercial_terms.commission_approved_by` debe ser `auth.uid()` cuando se aprueba o cuando cambian `commission_pct`, `commission_base` o `billing_model`.
- No se puede aprobar en nombre de otro owner.
- Cambiar la comisión obliga a aprobarla de nuevo.
- Las ediciones ajenas a la comisión conservan la aprobación.

**Columna nueva:** `commission_approved_at`. La pone el servidor y no se puede falsificar.

**Error:**

| Código | Mensaje sugerido para la UI |
|---|---|
| `commission_approval_forged` (42501) | "Aprueba tú la comisión: cambió o la aprobó otro propietario." |

**Auditoría:** se registra en `crm_timeline`, con el actor:
- `commission.approved`
- `commission.approval_cleared`

**Estado:** Disponible.

### 4.3 Comprobado sin cambios

Ya cubierto por `tests/crm-intelligence.database.cjs` y verificado de nuevo:
- Guardado parcial y conflictos por pregunta entre Miguel y Samuel (sin sobrescritura silenciosa).
- Historial de revisiones.
- Las 13 etapas.
- Máquina de estados del contrato con evidencia.
- **Ganado exige un contrato `verified_signed`.**

**Compatibilidad con ventas:** `crm_confirm_sale` mueve el lead a Ganado. Sin contrato verificado, la venta falla con `won_requires_verified_contract`, y `src/lib/sales/domain.ts` lo traduce a `sale_contract_required` con un mensaje claro. Los leads que ya estaban ganados no se tocan.

**Sin borrados:** ningún owner tiene `DELETE` sobre leads, términos, contratos, diagnósticos, puntuaciones, ventas, pagos, gastos ni ejecuciones del Radar (probado).

---

## 5. Radar / Lead Hunter

| Interfaz | Contrato |
|---|---|
| `crm_radar_ingest` (misma firma) | Respuesta con `refreshed` (negocio conocido al que se le completaron datos vacíos), `known` (sin cambios) y `status`. `updated` = `known + refreshed`, como antes |
| `crm_radar_run_places.outcome` | `inserted` · `refreshed` · `known` |
| `crm_radar_runs` | Columnas nuevas `provider` (`geoapify` \| `overpass` \| `''`) y `error_code` |
| `crm_radar_record_failure(run_key, search, provider, code)` | Registra una ejecución fallida que cuenta para el tope diario. Es idempotente por clave |
| `GET /admin/workspace/crm/radar/runs` | Añade `provider` y `error_code` a cada ejecución (si la columna falta, devuelve el formato anterior) |
| `searchAndIngest` | Una clave de ejecución ya fallida responde `409` con un mensaje claro, sin reintentar ni gastar créditos |

**Códigos de `crm_radar_record_failure`** (valores fijos; nunca guarda el texto del proveedor):
- `provider_rate_limited`
- `provider_auth`
- `provider_http`
- `provider_timeout`
- `provider_parse`
- `provider_network`
- `provider_too_large`
- `ingest_failed`

**Garantías probadas:**
- Búsquedas por coordenadas, ZIP, dirección y lugar (`query_kind`).
- Resultados acotados por `run_id`.
- Una respuesta tardía con una clave antigua no cambia nada.
- **Secuencia 33311 → 33009:** el negocio compartido aparece como `refreshed` o `known` en la segunda búsqueda, y la primera conserva exactamente sus 3 resultados.
- Conversión con aprobación previa e idempotente: dos owners convierten y se obtiene **un** lead.

**Para Codex:** pinta los resultados de la búsqueda activa usando su `run_id` e ignora las respuestas de búsquedas anteriores.

**No ejecutado:** la búsqueda real contra Geoapify. Requiere `AVALON_GEOAPIFY_PLACES_KEY` en un entorno autorizado. Todo lo anterior es aislado y reproducible.

---

## 6. Funnel Builder → CRM (revisión de seguridad del #155)

El prototipo `docs/sql/growth-funnel-prototype.sql` (que no era una migración) pasa a la migración, con estos cambios:

| Riesgo del prototipo | Corrección |
|---|---|
| La identidad del owner, usada para el insert auditado, seguía activa durante el resto de la llamada | Se restaura `request.jwt.claim.sub` justo después del insert (probado dentro de una transacción) |
| Límite global de 30/h: cualquiera bloqueaba todos los funnels | 30/h por funnel + 120/h global + 3/24 h por correo + 5/h por dispositivo (HMAC de la IP con `AUTH_FLOW_SECRET`; sin secreto, no se envía) |
| Consentimiento sin versión ni procedencia | `consent_version` (se rechaza un texto desactualizado), `referrer_host` y `utm` saneados. No se guarda la IP |
| Un funnel ligado a un cliente metía a **consumidores del cliente (Tipo B)** en el CRM B2B de Avalon | Los funnels con `client_id` no se publican y responden `unavailable` |

**Contrato:**
- `crm_growth_funnel_view(slug)` devuelve `{ slug, title, subheading, cta, template, consent_version }` o `null`.
- `crm_growth_funnel_submit(request)` devuelve `'ok' | 'invalid' | 'throttled' | 'unavailable'`.
- Campos opcionales nuevos de `request`: `consent_version`, `referrer_host`, `utm{source,medium,campaign,content,term}`, `fingerprint`.
- **Para Codex:** la página `/f/[slug]` debe enviar `consent_version` (campo oculto con el valor de la vista) y mostrar el texto de consentimiento de esa versión.

**Exposición anónima: cerrada por defecto.**
- La migración **no** concede `anon`.
- La concesión está en `docs/sql/growth-funnel-public-grant.sql` y requiere la **aprobación explícita del owner**.
- Cuando se apruebe, debe pasar a una migración fechada y actualizarse en el mismo PR la lista de funciones `anon` de `tests/agents-engine.database.cjs`.
- Hasta entonces, el formulario público responde `unavailable` y no escribe nada.

**Garantías probadas:**
- Repetir un envío o hacer doble clic produce un único lead y un único envío.
- No se crean clientes, ventas, citas ni comunicaciones.
- El lead entra en la etapa `new` con `origin = campaign` y `audience = agency_b2b`.

**Limitación honesta:** PGlite usa una sola conexión, así que la concurrencia real no se puede simular. La serialización depende de `pg_advisory_xact_lock` y de las restricciones únicas, que están verificadas.

### Tipo B (contrato futuro, no implementado)

Los consumidores finales de un contratista no entran en `crm_leads`.
- `crm_leads.audience` solo admite `agency_b2b`.
- Los funnels de cliente están bloqueados.

Propuesta: una tabla por cliente en el espacio del proyecto (`os_projects` / CRM Creator), con RLS por cliente y una exportación al CRM del propio contratista. **No se crea hasta que exista una necesidad demostrada.**

---

## 7. Vínculos canónicos cliente → venta → proyecto → tareas

Trigger `crm_tasks_links_guard`:
- Una tarea no puede apuntar a una venta o a un proyecto de **otro** cliente (`task_link_mismatch`, 23514).
- Si falta el cliente, se infiere de la venta o del proyecto.
- Solo actúa sobre escrituras nuevas o cambios de vínculo; las filas antiguas no se reescriben.

**Estado:** Disponible.

---

## 8. Pruebas ejecutadas (commit de este PR)

| Suite | Resultado |
|---|---|
| `npm test` (unitarias) | 442/442 |
| PGlite, todas las suites `*.database.cjs` (todas las migraciones, RLS real) | 30 de 30 archivos en verde (60 pruebas), incluidos `crm-titan.database` (2) y `growth-funnel.database` |
| RLS con dos owners y un usuario no autorizado | Incluido en `crm-titan.database` y `crm-intelligence.database` |
| TypeScript, lint y `next build` | OK (lint: 0 errores, 5 avisos previos) |
| Base aislada `wupvuwmqfcvmjqycmnvg` | Migración aplicada. Prueba REST con un owner sintético: capacidades, duplicados, `finance_forbidden`, fallo registrado, 33311 → 33009 (`refreshed:1`) y `anon` sin acceso al funnel |

---

## 9. Requiere autorización

1. **Producción:** aplicar `20261112090000` en `ltbwzcrxeuczdhhtbqgm`. Es aditiva, pero cambia el comportamiento de comisiones, vínculos de tareas y fallos del Radar.
2. **Funnel público:** aprobar `docs/sql/growth-funnel-public-grant.sql` (exposición `anon` revisada en §6).
3. **Fusión** de #160 y #159 (alerta alta de CodeQL pendiente).
4. **Búsqueda real del Radar:** clave de Geoapify en un entorno autorizado para la prueba real 33311 → 33009.

**Next action (Codex):**
- Partir de `615ca83` más esta rama.
- Sustituir la comparación de correo de Clientes 360° (§3.3).
- Enviar `consent_version` en `/f/[slug]`.
- Pintar `refreshed` / `known` en los resultados del Radar.
- Mostrar `commission_approval_forged` con el mensaje sugerido.
