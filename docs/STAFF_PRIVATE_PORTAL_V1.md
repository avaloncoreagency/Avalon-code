# Avalon Core Agency — Portal privado de empleados (v1)

Estado: **PR de revisión, no desplegado**. Fecha 2026-11-17.

## Roles e interfaces

- **Miguel y Samuel** conservan `agency_memberships.role='owner'`; los propietarios administran permisos desde `/admin/staff` y mantienen el acceso exclusivo al CRM financiero.
- **Empleado** = miembro preaprobado con rol técnico actual `operator`, más una fila `staff_portal_access.active=true`. No se transforma en `owner` ni en `admin` de Supabase. El portal restringido vive en `/staff`.
- No se crea un segundo CRM completo ni se abren las políticas originales de `crm_clients`, `crm_sales`, `office_messages`, etc. La navegación existente en `/admin` continúa owner-only.
- `getStaffState` verifica identidad de Supabase Auth, membership por UUID, activación por fila de base y segundo factor AAL2 cuando está inscrito. El middleware renueva sesiones `/staff/**` sin ampliar `/admin/**` ni `/api/**`.

## Permisos de empleados

Desde el panel de propietarios:
1. Activar/desactivar una cuenta **ya registrada e identificada** como `operator`.
2. Otorgar **crear expedientes privados** y/o **mensajería interna** por empleado.
3. Asignar un cliente concreto con permiso `view` (ver nombre/estado de asignación) o `work` (más creación/edición de expediente propio vinculado a ese cliente).
4. Revocar cliente o empleado sin borrar historial.
5. Supervisar expedientes creados por empleados; los otros empleados jamás los ven.
6. Leer los últimos 40 eventos de auditoría de `staff_permission_events` en la interfaz de dirección (solo propietarios). El historial completo permanece en la tabla protegida.

**Límite deliberado:** un cliente asignado **no abre automáticamente** Cliente 360, ventas, ingresos, gastos, tareas, contactos, archivos o documentos. La fila `staff_client_grants.client_name` es un resumen redactado **capturado al asignar**; el nombre puede quedar desactualizado si el cliente cambia en CRM. La exposición granular de campos del expediente canónico es una fase posterior que requiere revisar cada tabla hija, adjuntos, Storage y RLS.

## Expedientes privados

- `staff_casefiles` registra nombre del expediente, contacto, notas y estado, con propietario `user_id`.
- Visibilidad: solo creador empleado activo y propietarios. Otros compañeros no pueden ver el registro, **incluso cuando comparten el mismo cliente asignado**.
- El empleado puede vincular su expediente a un cliente solamente si tiene una asignación activa `work`. La atribución `user_id` y `linked_client_id` es inmutable.
- Revocar una asignación oculta de inmediato los expedientes vinculados para el empleado. Sus expedientes personales no vinculados siguen accesibles mientras su cuenta esté activa. Revocar al empleado oculta todos sus datos.
- Los propietarios pueden ver casos de todos los empleados, pero no se habilita eliminación física ni exportación masiva.

## Mensajes internos privados

- `staff_private_messages` es **distinta** de `office_messages` (que sigue owner-only).
- Pueden escribir propietarios y empleados activos con permiso `can_message`; el destinatario debe estar en el directorio autorizado y visible.
- Solo remitente y destinatario pueden leer el contenido. **Ser propietario no permite revisar DMs de otros dos empleados**. Se permite marcar leído por destinatario, no editar/eliminar mensajes.
- Revocar el permiso `can_message` retira inmediatamente la lectura y el marcado de mensajes para el empleado, no solo la posibilidad de enviarlos. Revocar el acceso general también oculta todos los DMs.
- Límite de 100 mensajes por remitente y hora; el servidor verifica formato y RLS verifica autorización.
- El directorio `staff_contacts` contiene un nombre limitado y un UUID; nunca expone la ficha completa o datos de clientes.
- No hay email, push, proveedores, automatizaciones, adjuntos ni mensajes de grupo en v1.

## Identidades e invitaciones

No se crean empleados automáticamente ni se ofrece registro público. Esta primera entrega **solo activa identidades que ya tengan Auth verificada y membresía `operator`**. El flujo seguro de invitación por correo y aprobación posterior descrito en `docs/EMPLOYEE_ACCESS_V1.md` sigue pendiente y requiere su propia implementación y revisión.

## Puertas de aceptación y pruebas

- `npm ci && npm run lint && npm run typecheck && npm test && npm run build`.
- `tests/staff-portal.database.cjs` se ejecuta en CI con PostgreSQL/PGlite y **usuarios sintéticos**. Comprobar owner-only, staff inactivo, cliente asignado/revocado, expediente personal, autor inmutable, DMs entre dos empleados, terceros, MFA, permisos y auditoría.
- Validar migración completa en PostgreSQL aislado antes de planificar producción; comprobar privilegios `anon` vs `authenticated`, vistas/RLS, cifrado en tránsito y pruebas de IDOR/API directas.
- Preview con Supabase **aislado y migrado**, nunca producción; verificar login y MFA de dos owners y dos empleados; viewport móvil y accesibilidad.
- Cerrar sesiones y revocar accesos ante baja. Las decisiones se consultan en cada request; no confiar en JWT/user_metadata de rol ni links de UI.
- No correr migración ni habilitar cuentas reales hasta aprobación explícita de propietarios, recuperación/backup y rollback plan. No se añaden nuevas dependencias ni secretos.

## Riesgos y evolución

El esquema utiliza nombres nuevos y es aditivo, pero los flujos de venta/Cliente 360 existentes son sensibles. Posteriormente: invitaciones de empleados, permisos por módulo (view/edit/manage), campos específicos de Cliente 360, comentarios colaborativos con trazabilidad, búsqueda, paginación, filtros, archivos adjuntos con Storage RLS, notificaciones no invasivas y auditoría visible en admin. La fase de PR no demuestra funcionamiento en Preview sin las pruebas indicadas.


## Avance de recuperación del Preview — 21 nov 2026 (solo rama aislada)

**Entorno:** Supabase `xrtgnmuiyqmtisdrzqcg` (`integration/staff-portal-preview-20261120`), conectado a los overrides Vercel Preview de esta rama. **Producción `ltbwzcrxeuczdhhtbqgm` no fue alterada.**

### Diagnóstico verificado

La rama aislada tenía 13 migraciones históricas registradas, pero carecía de `public.crm_clients` y `public.office_profiles`, **aunque sus versiones históricas de Sales Core y Office constaban en el ledger**. La tabla `supabase_migrations.schema_migrations` contiene marcadores/comentarios, no el DDL necesario para recrear todas las tablas. El historial de Git y el ledger remoto presentan diferencias de versiones y nombres documentadas en `docs/recovery/SUPABASE_RECONCILIATION.md`. No basta con `migration repair` ni con marcar versiones aplicadas.

### Reparaciones ejecutadas exclusivamente en Preview

1. `preview_rehydrate_avalon_sales_core_from_git`: SQL exacto de `supabase/migrations/20261102170000_avalon_sales_core.sql` — **success**.
2. `preview_rehydrate_avalon_office_from_git`: SQL exacto de `supabase/migrations/20261103100000_office.sql` — **success**.
3. `staff_private_portal_preview_validated`: SQL exacto de `supabase/migrations/20261117180500_staff_private_portal.sql` del PR — **success**.

Resultados verificados en la base aislada:
- Existen `crm_clients`, `office_profiles`, `office_messages` y las seis tablas del portal `staff_*`.
- Las seis tablas `staff_*` tienen RLS activo y el rol `anon` no tiene privilegios SELECT.
- Ensayo en una transacción **con rollback** y cuatro identidades sintéticas: dos owners y dos operadores. Se confirmó que el operador A ve su expediente y conversación, el operador B **no** ve el expediente de A pero sí el mensaje dirigido a B, ambos siguen sin ver `crm_clients` por acceso directo, el owner B puede inspeccionar expedientes pero **no** mensajes de terceros, y revocar `can_message` hace ilegible el historial sin revocar expedientes. Todo terminó en **PASS** y la transacción se revirtió.
- **Sin cuentas de prueba persistentes, sin clientes reales y sin activaciones de empleados.**

### Límites importantes que permanecen

- Supabase Branching aún informa `MIGRATIONS_FAILED`; la rama aislada **no** reproduce las 49 migraciones del principal. El rescate manual de 3 esquemas críticos no repara por sí solo el historial de 36 migraciones posteriores ni demuestra compatibilidad de toda Avalon.
- No hay identidades de Auth en esta rama de prueba ni empleados preaprobados con `agency_memberships.role='operator'`. No se pueden validar sesiones de navegador reales hasta establecer un flujo seguro de identidades sintéticas.
- El Preview Vercel `dpl_FtMucxPUHCnV17y8KZDihQVKXDst` está compilado (`READY`), pero **no** debe habilitarse como portal productivo.
- Los asesores de seguridad de Supabase reportan funciones SECURITY DEFINER de Sales Core/Office (preexistentes a este módulo). Revisarlas según sus contratos y pruebas; no cambiar o revocar sus permisos masivamente a ciegas.
- La rama Supabase tiene costo horario autorizado. Detenerla/eliminarla cuando ya no se requiera, después de conservar evidencia.

### Ruta segura de release

1. Resolver la divergencia **histórica** del ledger de Supabase. Para las migraciones antiguas marcadas pero sin tablas, comparar el SQL exacto del repositorio con la estructura actual de producción y preparar un baseline ordenado y reproducible. Para versiones equivalentes que difieren de nombre/fecha, comparar huellas de tablas, políticas, triggers, funciones y extensiones antes de cualquier reconciliación.
2. Verificar el baseline en una base aislada nueva o reconstruida, con `supabase db reset` de desarrollo y tests integrados. Nunca ejecutar `db reset` en producción.
3. Confirmar que todo el esquema está completo, que la rama está sana y que el Preview usa **exclusivamente** URL y publishable key de la rama aislada.
4. Invitar dos identidades sintéticas de prueba mediante Supabase Auth (no insertarlas directamente en `auth.users` para sesiones reales); otorgar membresías `operator` y activar permisos desde owner de prueba.
5. Probar login, MFA, rutas `/staff` y `/admin/staff`, 403/IDOR, revocación inmediata, aislamiento de expedientes y DMs.
6. Exigir respaldo verificable y aprobación de despliegue antes de aplicar la migración de staff al proyecto principal. Producción conserva 2 owners y 0 operadores, sin cuentas reales activadas.


### Segunda recuperación, con sincronización histórica completa

Después del primer rescate, la sincronización alcanzó 31 versiones y detectó otro bloqueo por dos objetos históricos ausentes. Se aplicó **exclusivamente a Preview**:
4. `preview_rehydrate_crm_pipeline_13_from_git`: SQL de `supabase/migrations/20261102180000_crm_pipeline_13.sql` — **success**.
5. `preview_rehydrate_pipeline_board_from_git`: SQL de `supabase/migrations/20261102210000_pipeline_board.sql` — **success**.

Luego se repitió `rebase_branch` y el ledger aislado pasó a **54 versiones: las 49 versiones principales más 5 rescates exclusivos de Preview**. La comparación exacta de versiones confirma `missing_from_preview=[]`. El proyecto Supabase devuelve `ACTIVE_HEALTHY` y completó la fase `FUNCTIONS_DEPLOYED`, aunque el estado de rama aún no se ha observado como `READY`.

Verificaciones adicionales: `crm_attachments` y `crm_lead_assessments` ahora existen; `auth.users` no contiene cuentas de prueba persistentes. Se volvió a ejecutar el ensayo de RLS con cuatro identidades sintéticas y `ROLLBACK`: **PASS** para aislamiento de expedientes, mensajes y revocación de `can_message` después de la sincronización.

Esto **resuelve las dependencias SQL del portal en el Preview existente**, pero no arregla de forma permanente los marcadores del historial original del proyecto principal ni sustituye una prueba E2E real de invitación/inicio de sesión. La reconstrucción reproducible desde una base totalmente vacía, sin aplicar rescates manuales, sigue pendiente de estandarizarse en Git antes de un release productivo.
