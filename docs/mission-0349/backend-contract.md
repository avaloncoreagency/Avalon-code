# Operación 0349 — Contrato backend para Codex

Backend = Claude. Pantallas, componentes, Dev Bridge y Oficina = Codex. Nada de esto está aplicado en producción.

## 1. Vínculo canónico proyecto ↔ cliente (esta rama)
- `os_projects.client_id` es la relación canónica. `settings.operations.client_lead_id` sigue guardándose (historial) pero **la UI no debe usarla como identidad** cuando `client_id` existe.
- Un trigger resuelve `client_id` desde `client_lead_id` si el lead ya tiene cliente (`crm_clients.origin_lead_id`); otro trigger vincula proyectos previos cuando nace el cliente. Nunca sobrescribe un `client_id` existente ni modifica `settings`.
- Para Codex: agrupar proyectos por `client_id` (fallback: `client_lead_id` solo si `client_id` es null). `src/lib/os/client-hud.ts::clientId()` y `project-actions.ts` son archivos compartidos: **propuesta**, no editados aquí.
- Migración: `20261104130000_project_client_canonical.sql` (aditiva; rollback documentado en el archivo).

## 2. Cadena comercial (ya existente, verificada)
`crm_confirm_sale(request jsonb)` es transaccional e idempotente (`idempotency_key`): crea o vincula cliente, contactos, líneas, **una orden de trabajo por línea** (`sale_line_id`), **un proyecto por línea con módulo** (`client_id`), tareas de plantilla y avisos. Líneas → módulo: desarrollo-web→website, tienda→ecommerce, crm-personalizado→crm_creator, recepcionista-ia→receptionist, marketing-mensual→marketing, generacion-leads→(sin proyecto; solo tareas). No hay otra vía de venta: la UI debe llamar este RPC.
Prueba: `tests/backbone-e2e.database.cjs` (cadena completa) y `tests/sales.database.cjs`.

## 3. Managers (PR #120)
`GET /admin/workspace/crm/office/manager-activity` → `{ managers: ManagerActivity[5], meta }`; `POST …/manager-run` con `{manager_key}` o `{kill_switch}`. Tipos en `docs/office/MANAGER_ACTIVITY_CONTRACT.md`. Estados: idle/queued/running/completed/failed/blocked/stale. Ejecutores deterministas; no mostrar «IA».

## 4. IA / chatbots / recepcionista
`getAiAdapter()`, `getMessagingAdapter()`, `getSocialPublisher()` devuelven `null`; todas las integraciones `not_connected` (probado). Sin proveedor, sin credenciales, sin red. La UI debe mostrar «IA no conectada».

## 5. Higgsfield (PR #119)
Canónico; receptor firmado y bibliotecas ya implementados por #119. Estado «conectado» solo tras una entrega real aprobada verificada.

## 6. Dependencias abiertas para Codex
- Mostrar `meta.kill_switch` y los estados de #120 en la Oficina (#122).
- Cliente 360°: aplicar `docs/handoff/CLIENT_FINANCE_UI_INTEGRATION.patch` (#110).
- Autorización financiera por correo en `clients/[id]/page.tsx` (`user.email === …`) → debe ser UUID + membresía (AGENTS.md).
