# MN-CRM-001 — Manual de CRM personalizado / Custom CRM Guide

**v1.0 · ES/EN · PLANTILLA BASE, FUNCIONALIDADES POR VERIFICAR.** Adaptar al producto y roles realmente entregados. No afirmar que el CRM comercial interno de Avalon equivale al CRM de un cliente.

## ES — 1. Qué contiene el sistema

**CRM:** [nombre real] · **Cliente/empresa:** [identidad] · **Versión/URL:** [verificadas] · **Ambiente:** [producción comprobada] · **Contrato y alcance:** [ref]. Se documentan entidades entregadas (contacto, oportunidad, tarea, venta, caso, otras), reglas de cada etapa y quién puede modificarlas. Cualquier entidad ausente se elimina del manual del producto.

## ES — 2. Acceso y roles

El administrador del cliente autoriza individualmente cuentas y acceso mínimo. Cada persona usa su cuenta; no compartir credenciales ni exportar datos sin aprobación. Cuando un usuario cambia de puesto o sale de la empresa, el admin revoca el acceso y comprueba que dejó de funcionar. Los permisos se prueban tanto en interfaz como **en servidor/RLS** por QA. Tabla de roles del producto: `rol | entidad | crear/ver/editar/eliminar/exportar | alcance registros | encargado`.

## ES — 3. Proceso diario de trabajo

1. Antes de crear un contacto/empresa, buscar coincidencias y aplicar política de duplicados acordada.

2. Registrar únicamente datos necesarios con procedencia/consentimiento permitido; no crear historias ficticias.

3. Crear o actualizar oportunidad si la funcionalidad fue entregada; elegir etapa de pipeline usando un hecho real y la definición aprobada.

4. Asociar notas/tareas a dueño responsable, fecha válida y siguiente acción, si el producto lo permite.

5. Marcar venta, contrato, factura y cobro como eventos **distintos**; no se deduce pago de una oportunidad ganada.

6. Consultar reportes solo si implementados; revisar fuente, periodo, definición y límites de los KPI.

7. Exportar/importar solo mediante procedimiento aprobado y con autorización del propietario de los datos.

## ES — 4. Errores, seguridad y mantenimiento

Ante error de permisos, no utilizar cuentas ajenas: capturar tipo de acceso, función, hora y mensaje sin datos sensibles, y escalar. Si desaparece una oportunidad, comprobar filtros/estado antes de crear duplicado. Si falla una integración, revisar el estado de fuente y confirmar con QA/IT antes de reintentar importaciones para evitar duplicaciones. Backups, retención, restauración, cambios de roles y mantenimiento se rigen por el alcance del contrato, nunca por una promesa del manual.

## ES — 5. Capacitación y aceptación

**Ejercicios sintéticos por rol**: iniciar sesión; crear/editar con permisos; denegar acción prohibida; transicionar un lead legítimo; bloquear duplicado; emitir informe con fuente; probar export/import en entorno seguro; comprobar empresa A/B aisladas; revocar usuario y confirmar denegación. Registrar resultado UAT por usuario/rol, versión, aprobador y evidencia segura. **NO-GO** si existe acceso entre clientes no autorizado o pérdida de datos.

## EN — 1. System scope

**CRM:** [actual product] · **Client/company:** [verified] · **Version/URL:** [verified] · **Environment:** [live, confirmed] · **Agreement/scope:** [ref]. Only document delivered entities—contacts, opportunities, tasks, sales, cases, others—and the owners and rules for their state transitions. Remove absent features from the issued manual.

## EN — 2. Access and roles

Customer admins approve individual least-privilege access. Users never share credentials or export data without authorization. Remove departing employees promptly and test access revocation. QA validates authorizations in both the interface and **server/RLS**. Product role card: `role | entity | create/read/edit/delete/export | row scope | admin`.

## EN — 3. Daily workflow

1. Search before creating a person or company; follow the approved deduplication policy.

2. Record only necessary information with lawful source/consent; do not create fictional customer histories.

3. Create/update an opportunity only if delivered; move pipeline stages on actual business events and agreed definitions.

4. Assign follow-ups and due dates to authorized owners if task features exist.

5. Treat sale, contract, invoice and payment as **distinct** facts; a won lead is not proof of payment.

6. Use reports only if built; confirm source, period, metric definition and limitations.

7. Import/export solely under authorized data-owner procedures.

## EN — 4. Troubleshooting and care

Never borrow another user's session to bypass a permission error. Capture role, action, time and redacted error message for support. Check filters/stage before recreating apparently missing records. When an integration fails, confirm source status and duplication risk before retrying. Backup, retention, restoration, role changes and maintenance are governed by the actual agreement, not this template.

## EN — 5. Training and sign-off

**Synthetic role-based exercises:** login; permitted create/edit; denied action; valid pipeline transition; duplicate control; traceable report; safe import/export; company A/B isolation; revoke user and verify denial. Record UAT by user/role, exact version, authorized approver and safe evidence. **NO-GO** on unauthorized cross-client access or data loss.

## Tailoring and issue gate

Supply product-specific screenshots, field dictionary, stage map, role matrix, reports, tested integrations, backup/restore proof (if contracted), exact support channel and signed acceptance evidence. No claims for unavailable tools. Versioned PDF issued only by approved private generator; **NOT ISSUED.**
