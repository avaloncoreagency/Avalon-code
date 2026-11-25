# MN-MAINT-001 — Manual de mantenimiento / Maintenance Guide

**v1.0 · ES/EN · PLANTILLA BASE / PENDING LEGAL & COMMERCIAL APPROVAL.** No constituye plan contratado, garantía, SLA, frecuencia de backup ni obligación de soporte; consultar el contrato vigente. Cada producto tendrá su anexo con componentes y proveedores verdaderamente entregados.

## ES — 1. Alcance y propietarios

**Producto:** [referencia] · **Responsable de contenido:** [cliente] · **Responsable técnico asignado:** [avalon o cliente, según acuerdo] · **Proveedor de dominio/hosting/merchant/licencias:** [titular y pagador] · **Contrato de mantenimiento:** [referencia/NO CONTRATADO/DESCONOCIDO] · **Ventana de servicio:** [solo si aprobada] · **Cadencia y retención de respaldo:** [solo si contratadas/verificadas].

## ES — 2. Qué revisar

**Cliente:** confirmar que textos, precios, horarios, catálogo y políticas continúan correctos; administrar sus usuarios y titularidad de cuentas; verificar cargos de terceros directamente con proveedores; comunicar cambios del negocio y bajas de personal.

**Técnicos autorizados, solo si contratados:** revisar estado de dominio/TLS, conectividad de formularios, parches y compatibilidad de componentes, incidentes de seguridad, integraciones, errores reportados, copias/restauración y capacidad. La ejecución y frecuencia requieren contrato, herramientas y permisos reales; no marcar tareas como realizadas por incluirlas en esta lista.

**Finance/Legal:** comprobar pagos, renovaciones, términos y conservación de datos cuando aplique. Ningún cambio al proveedor, cobro, actualización mayor o dominio se autoriza automáticamente.

## ES — 3. Registro de intervención

Formato privado: `MAINT-ID | cliente/producto | fecha de solicitud | componente | síntoma/riesgo | versión actual | copia/verificación previa | dueño | alcance y permiso | acción realizada | prueba de no regresión | nueva versión | rollback posible | aviso autorizado | cierre`. Un ticket resuelto requiere verificación; una inspección sin prueba no equivale a mantenimiento completado.

## ES — 4. Ventanas, cambios y emergencias

Clasificar incidente vs mejora vs cambio de alcance. Si hay posible exposición de datos o interrupción crítica, escalar al equipo humano de seguridad y al owner según su acuerdo; **no afirmar Guardian 24/7**. Preparar respaldo/rollback antes de cambios irreversibles según técnica y contrato. Si un proveedor externo falla, registrar dependencia y comunicar únicamente por canal autorizado. Ninguna garantía, prioridad o tiempo de resolución se presume.

## ES — 5. Renovación y salida

Antes de renovar: confirmar vigencia, propietario/pagador, costos del proveedor, alcance, historial de tickets, pendientes y aceptación expresa de cambios. **No cobrar ni renovar automáticamente desde este manual.** Al cancelar: inventariar archivos, dominios, datos, accesos y obligaciones; coordinar exportación/retención con Legal; revocar permisos solo por operador autorizado y evidencia; no borrar registros unilateralmente.

## EN — 1. Scope and ownership

**Product:** [ref] · **Content owner:** [client] · **Technical accountable person:** [per agreement] · **Domain/hosting/merchant/license vendors:** [owner/payer] · **Maintenance contract:** [reference/NOT CONTRACTED/UNKNOWN] · **Coverage window:** [only if approved] · **Backup/retention schedule:** [only when contracted and verified].

## EN — 2. What to review

**Client:** keep business copy, prices, hours, catalog and policies accurate; manage users, vendor account ownership and staff access; check third-party invoices directly; report company changes.

**Authorized technicians, only when contracted:** check domain/TLS, form connectivity, patches and compatibility, security incidents, actual integrations, reported errors, backups/restores and capacity. Tasks, frequency and permissions depend on the signed scope; a checklist does not imply the work happened.

**Finance/Legal:** validate billing, renewals, contractual terms and retention where applicable. No provider account, charge, major upgrade or DNS change is automatically approved.

## EN — 3. Intervention record

Private template: `MAINT-ID | customer/product | request date | component | symptom/risk | current version | pre-change backup/verification | owner | scope/permission | action performed | regression test | new version | rollback route | authorized notification | closure`. A ticket is resolved only with evidence; inspection without testing is not completed maintenance.

## EN — 4. Windows, changes and incidents

Separate incident, enhancement and out-of-scope change. Suspected exposure or critical outage goes to human security and the owner under the agreement; **Guardian 24/7 is not active**. Plan backup/rollback before irreversible updates where applicable. For external vendor failures, document dependencies and communicate only by authorized channel. Do not invent response times, guarantees or resolution commitments.

## EN — 5. Renewal and offboarding

Before renewal, confirm term, owner/payer, vendor costs, scope, tickets and explicit approval for changes. **No automatic charge or renewal is created by this manual.** For cancellation, inventory files, domains, data, accounts and obligations; coordinate export/retention with Legal; revoke access only by authorized operator with evidence; never delete unilaterally.

## Issue gate

To issue a real maintenance manual: attach signed coverage and SLA if any, actual systems, frequency, owner, rollback process, escalation channel, vendor payer, contractual exit conditions and product-specific evidence. **CURRENT STATUS: EDITORIAL ONLY / NOT CONTRACTED BY THIS PAGE.**
