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
6. Leer auditoría en `staff_permission_events` (tabla owner-only; la interfaz v1 todavía no presenta el ledger).

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
