# HARU — Avalon OS 001 · contrato de producto y aceptación CRM

**Fecha de auditoría:** 2026-11-04 (America/New_York)  
**Repositorio / base inspeccionada:** `avaloncoreagency/Avalon-code` · `main@d2890bbc414de48bf0b77767d05b040f3ed66b64`  
**Graphify:** índice consultado; commit indexado `d2890bb` (coincide con la base inspeccionada).  
**Alcance:** especificación y regresión no destructiva. SIN datos reales, migraciones, despliegues, modificaciones de roles/RLS/Auth ni trabajos de servidor reservados a Claude.  
**Coordinación:** #23 (REN), #40 (Radar/SORA), #47 (release), #98 (sprint); revisar los PRs #128, #92, #83, #104, #100 antes de modificar archivos. Este documento no acredita un despliegue ni un E2E remoto.

## 1. Estado comprobado en código vs. aceptación remota

| Módulo | Evidencia en `main` (código, no validación de sesión real) | Pendiente / riesgo |
|---|---|---|
| Radar / Lead Hunter | `src/lib/crm/radar-{qualification,intelligence,research,search}.ts`, `crm_prospects`, `crm_prospect_needs`, protección de no-contactar y conversión RPC existente | Cobertura/licencia/proveedor en producción NO VERIFICADOS; pruebas de adquisición real, cuota y Cron bajo SORA/Claude; #40 |
| Calificación 1–5 estrellas | `radar-qualification.ts`, `radar-intelligence.ts`, motivos, `stars_override`, confianza separada | Exigir evidencia y motivo de override; un registro de directorio no prueba necesidad; verificar auditoría en DB remota |
| Pipeline (13 etapas) | `20261102180000_crm_pipeline_13.sql`, `crm_stages`, `crm_leads`, UI CRM y tests PostgreSQL sintéticos | Verificar catálogo real/ledger remoto antes de cualquier edición; #128 enlaza los deep links pero sigue DRAFT |
| Ventas y cotizaciones | `crm_confirm_sale` existente; `crm_sales`, `crm_sale_lines`, pagos y catálogo | #128 DRAFT para continuidad del origen; cotizaciones/planes #59/#90 son propuestas en ramas, no asumir integración |
| Clientes 360°, proyectos y órdenes | `crm_clients`, `crm_work_orders`, `os_projects.client_id`, `crm_tasks` (Sales Core) | Evitar segundo cliente por lead; PR #100 detecta riesgo de subtotales por límites 100/200; revisión en curso |
| Calendario compartido | `shared-calendar.ts`, `calendar/{actions,page}.tsx`, migración `20261102220000_shared_calendar.sql`: mes/semana/día, eventos, dos owners, colores y banners | Verificar migración en entorno aislado, recordatorios reales y vínculos profundos; #72/#83 apilados en DRAFT |
| Tareas y avisos | `crm_tasks`, `crm_notifications`, páginas de tareas/actividad | Edición, completar/reabrir, avisos personales mejorados en #104 DRAFT; no reclamar que están publicados |
| Dashboard / KPI | `src/app/admin/workspace/crm/page.tsx`, `src/lib/crm/domain.ts` y `crm_sales_metrics` | Distinguir monto estimado/contratado/cobrado; cohortes y paginación; no sumar datos faltantes ni inventar métricas |
| Uso de IA | `src/components/crm/overview.tsx` muestra registros manuales | Fuentes API de suscripciones/créditos NO conectadas; sin fuente, mostrar «desconocido» y no cero |

**Diferencias a resolver ANTES de editar esquemas:**
1. El encabezado histórico de `20261102180000_crm_pipeline_13.sql` dice «PREPARED ONLY», pero `docs/AVALON_EXECUTION_STATUS.md` registra su aplicación en staging/producción el 2026-11-02. **Esto es una discrepancia de documentación, NO permiso para reaplicar SQL.** SHIN verificará la tabla remota de migraciones y las 13 filas antes de que se cambie nada.
2. `domain.ts::scoreProspect` calcula **completitud de registro 0–100**, mientras la clasificación comercial del Radar es **oportunidad 1–5 estrellas** con evidencias y confianza independiente. UI y KPI deben mantener nombres separados; nunca traducir automáticamente 100 puntos en 5 estrellas.
3. El flujo de `qualifyRadarProspect` combina la aprobación y conversión dentro de la **misma acción explícita del owner** («Calificar y crear tarjeta»). El requerimiento #40 presenta aprobación y transferencia como pasos lógicos distintos. Acordar con SORA si un diálogo de confirmación basta, o si se exige una decisión previa separada; no cambiar la semántica RPC sin revisión.
4. `nurture` tiene posición 12 (después de `lost`) pero tipo `open`. No ocultarla ni contarla como «Perdido» por su ubicación; conservar los IDs y el orden actual hasta decisión explícita.

## 2. Catálogo canónico: 13 etapas y definiciones de embudo

`new` Nuevo lead → `researched` Investigado → `contact-pending` Contacto pendiente → `contacted` Contactado → `replied` Respondió → `qualified` Calificado → `meeting` Reunión agendada → `diagnosed` Diagnóstico realizado → `proposal` Propuesta enviada → `negotiation` Negociación → `won` Ganado → `lost` Perdido → `nurture` Nutrición / seguimiento futuro.

- **Invariantes:** 13 IDs únicos, etiquetas existentes intactas, posiciones 0–12. Etapas `won` y `lost` tienen `kind` terminal; `nurture` sigue abierta. Cualquier cambio estructural requiere ticket, impacto en datos y revisión de SHIN.
- Los avances manuales se auditan por propietario y tiempo; no mover leads automáticamente a `won` por conseguir estrellas. Una venta registrada por `crm_confirm_sale` sí relaciona y cierra el lead de origen.
- **No se deben inferir ventas** de `won`: pipeline ganado puede no equivaler a factura/pago. Usar `crm_sales` y `crm_payments` como fuentes separadas.

## 3. Contrato funcional: ciclo comercial único

| Paso | Acción y objeto persistente canónico | Aceptación / caso de error |
|---|---|---|
| A. Descubrimiento | Fuente autorizada → `crm_prospects.source_ref`; registrar fuente/licencia/fecha. | Misma fuente repetida actualiza o reconoce el prospecto; no crea contacto personal inventado |
| B. Investigación | `crm_prospect_needs`: servicio, estado, evidencia URL o nota de contacto verificada, fecha, método, confianza. | No convertir «web ausente en mapa» en «empresa sin web»; ausencia de evidencia = sin calificar |
| C. Calificación | `stars` 1–5 o null, `stars_reasons`, `confidence`; override manual + motivo auditado. | Estrellas reflejan oportunidades verificadas, no riqueza/personalidad; el owner puede corregir |
| D. Aprobación | Decisión intencional y autorizada de Miguel/Samuel, obedeciendo `do_not_contact`. | Rechazado/DNC: 409, sin `crm_convert_prospect`; no outreach automático |
| E. Transferencia | RPC existente `crm_convert_prospect` → `crm_leads.id`, `crm_prospects.lead_id`, `crm_leads.prospect_id` cuando corresponda. | Nueva tarjeta `new`; retry idempotente; colisión email/nombre = conflicto y opción humana de vincular, NUNCA duplicar |
| F. Seguimiento | `crm_leads.stage_id`, historial, follow-up, reuniones del calendario y tareas. | Ambos owners ven el mismo ID, cambios con autor, fechas y error visible al fallar |
| G. Cotización/venta | Oportunidad → oferta/servicios → confirmación explícita `crm_confirm_sale` con `lead_id` e idempotency key. | Sin confirmación = ninguna venta; reenvío de la misma llave = mismo `sale_id`, totales SQL autoritativos |
| H. Cliente | `crm_clients.origin_lead_id`, contactos verificados y ficha 360°. | La segunda venta del mismo lead reutiliza `client_id`; no copiar por coincidencia laxa de nombres |
| I. Ejecución | `crm_sale_lines` → `crm_work_orders` → `os_projects` → `crm_tasks`; FK a cliente/venta/proyecto. | Una orden por línea de servicio; tareas asignadas, seguimientos trazables; error transaccional no deja registros huérfanos |
| J. Cierre y cobros | `crm_sales` y `crm_payments` con estados y fechas reales. | «Contratado» != «Cobrado»; ingreso recibido solo si existe pago persistido |

**Contrato de interfaz para SORA ↔ HARU:** el Radar entrega un `lead_id` real (UUID), `prospect_id` y evidencia; HARU abre `/admin/workspace/crm/leads?lead=<UUID>` y permite `sales/new?lead=<UUID>`. No usar nombre de empresa como identificador ni confundir `lead_id` con `client_id`. PR #128 trabaja este enlace: no tocar sus 7 archivos.

**Contrato de datos para SHIN:** verificar owner UUID/RLS, restricciones de duplicados, audit trail de override/decisión, relaciones FK e idempotencia; toda modificación SQL o de servidor debe ser suya/Claude y probarse primero con datos sintéticos.

## 4. Calendario compartido: producto aceptable (Google Calendar / TimeTree como referencia funcional, NO copia)

- **Vistas:** mes, semana, día y agenda operativa; navegación en 320/390px y escritorio, `America/New_York` configurable y correcto DST.
- **Evento:** título, inicio/fin con zona horaria, todo el día, tipo `meeting|appointment|call|follow-up|task|personal`, descripción, lugar/enlace, color de 8 opciones, owner, `attendee_ids`, `lead_id` o `client_id`, estado y versión para evitar sobrescrituras.
- **Visibilidad y colaboración:** Miguel/Samuel pueden ver el calendario compartido; vista «Mío/Todos»; choque de disponibilidad comprobado por los participantes UUID reales, no por nombre escrito. No se pueden asignar identidades externas como owner.
- **Días especiales:** `crm_calendar_banners` con fecha, título, subtítulo, emoji y uno de seis temas; edición en ambas sesiones, sin inventar eventos.
- **Recordatorios P1 (NO dar por desplegados):** especificar opciones 5/15/60 minutos y 1 día, receptor owner/participante, límite por evento, clave de deduplicación, cancelación al modificar/borrar, notificación interna persistente y estado de entrega/reintento. No prometer email/push sin canal conectado. Reutilizar avisos existentes si SHIN valida el contrato.
- **Navegación contextual P1:** evento → ficha exacta del lead, cliente/venta; #72/#83 tienen una implementación DRAFT; reconciliar con main antes de integrar.

**Criterios concretos:** crear reunión Miguel→Samuel; verificarla en ambos calendarios tras recarga, editar por un owner y ver conflicto de versión si el otro edita una copia vieja; impedir doble reserva en el mismo horario; cancelar y liberar slot; verificar hora al cruzar DST; crear y modificar banner compartido; enviar avisos internos **solo después** de instalar motor de recordatorios y probar persistencia.

## 5. Tareas internas: no confundir con incidencias técnicas

- **Entidad:** `crm_tasks` con título, descripción, asignado a (UUID de miembro permitido), creado por, prioridad, fecha de vencimiento, estado, `client_id`, `sale_id`, `work_order_id`, `project_id` cuando correspondan. Desde una orden, obtener FKs exclusivamente de la orden verificada; nunca confiar en IDs enviados sin autorización.
- **Vistas requeridas:** mías, asignadas por mí, vencidas, todas, completadas, archivadas; crear/editar/completar/reabrir; mantener timeline y conflictos de versión. Una tarea completada desaparece de la cola activa pero permanece en historial.
- **Avisos:** creación y reasignación personal a Miguel o Samuel se registra una sola vez para el destinatario; notificación por RLS `recipient_id`. El PR #104 prepara gestión/contador, **pendiente de aceptación E2E**.
- Actualizaciones y errores de software permanecen en **GitHub**, no en `crm_tasks`.

## 6. Definiciones KPI (sin métricas inventadas)

| KPI | Fuente y regla | Precaución |
|---|---|---|
| Descubiertos, investigados, calificados | `crm_prospects` + estado/fecha de eventos persistidos | Mostrar período, alcance y fuente; no inferir conversiones por una calificación automática |
| Leads nuevos y activos | `crm_leads` no archivados por `created_at` | Cohorte declarada; rango temporal inclusivo |
| Conversión de leads ganados | Conteo `stage.kind='won'` / leads de la cohorte × 100 | No equivale a tasa de ventas cobradas |
| Oportunidades abiertas / valor ponderado | `crm_leads.value` y `probability` solo `kind='open'` | «Estimado», nunca ingreso registrado |
| Ventas contratadas | `crm_sales_metrics` / `crm_sales` | Por moneda y período; no sumar monedas |
| Cobrado | `crm_payments` confirmados | No usar `upfront_amount` como si se hubiese pagado |
| Clientes activos | `crm_clients.status='active'` | No equiparar prospecto/lead con cliente |
| Órdenes, tareas vencidas y actividad real | `crm_work_orders`, `crm_tasks`, `crm_timeline` | Conteos reales con fecha, responsable y paginación completa |

**P0 importante:** no mostrar un total de «rentabilidad» derivado de 100 ventas/200 gastos si existen más filas. PR #100 plantea una regresión reproducible (101 ventas, 201 gastos); el UI debe cargar el agregado correcto o mostrar «parcial/no disponible», nunca un subtotal como verdad.

## 7. Matriz de aceptación ejecutable (datos ficticios únicamente)

Los tests existentes **en código** `tests/backbone-e2e.database.cjs`, `tests/crm-flow.database.cjs`, `tests/radar-qualification.test.cjs`, `tests/shared-calendar.test.cjs`, `tests/crm.pipeline.database.cjs` comprueban partes del contrato; sus títulos o PRs no sustituyen la ejecución sobre SHA/entorno objetivo.

**Escenarios P0 que se deben ejecutar/registrar en CI y staging aislado:**
1. Radar importa dos veces `osm:node/9` de «Clínica Orbit Sintética»: exactamente un `crm_prospects`, cero leads hasta aprobación.
2. Sin evidencias: estrellas null y no se genera lead; con necesidades verificadas: estrellas 1–5, motivos y confianza; override manual con motivo/auditoría; DNC bloquea toda transferencia.
3. Miguel aprueba; primer `crm_convert_prospect` crea un lead; segunda llamada devuelve mismo UUID. Colisión con email/empresa existente produce aviso de vinculación, sin duplicados.
4. Samuel avanza ese lead, Miguel ve las modificaciones. Ambos pueden consultar y no-owner no puede leer ni crear.
5. Registrar venta multiserivicio con `lead_id` real; doble clic/retry devuelve mismo `sale_id`, crea un cliente canónico, órdenes/proyectos/tareas con FK; simular error SQL y confirmar rollback sin objetos parciales.
6. Registrar **segunda venta con el mismo lead**: mismo `crm_clients.id`, nueva venta y nuevos trabajos solamente; cero contactos duplicados.
7. Cobro de prueba (sin Stripe ni dinero real) actualiza «cobrado», no antes; cancelación o entrega actualiza orden sin inventar ingreso.
8. Vista en 320/390px, EN/ES, reload, error de DB, timeout, expiración de sesión y ausencia de Preview aislado: mostrar errores reales, no degradar a datos falsos.

**Escenarios P1:** dos propietarios crean/editar/cancelan reunión y banner; conflicto horario y control versión; recordatorios idempotentes cuando estén implementados; tareas cruzadas Miguel↔Samuel con aviso y estado completado tras recarga; 101+ ventas / 201+ gastos sin subtotales engañosos.

**Cómo ejecutar cuando existe checkout con dependencias (no realizado por esta auditoría):**
```sh
npm ci
npm ci --prefix tests/qa
node --test tests/haru-crm-stage-contract.test.cjs
NODE_PATH=./tests/qa/node_modules node --test tests/backbone-e2e.database.cjs tests/crm-flow.database.cjs tests/crm.pipeline.database.cjs
npm test
npm run lint
npm run typecheck
npm run build
```
Luego prueba real HTTP/navegador de `tests/sales.browser.cjs` sobre Preview con Supabase **aislado**; cotejar CI del SHA exacto. Ninguna de estas líneas implica que hayan sido ejecutadas.

## 8. Prioridades y handoffs sin solapamientos

- **P0 / SHIN + Claude + KENJI:** obtener Preview aislado, validar ledger/owner/RLS e idempotencia, ejecutar flujo sintético E2E; resolver CI de #128. Sin Preview seguro no aprobar release (#47).
- **P0 / HARU ↔ SORA:** cerrar UX de Radar→Lead→Venta y segunda venta sin duplicar cliente en #128; revisar contratos #92/#40; confirmar manual approval versus acción combinada. No editar código ajeno reclamado.
- **P1 / HARU ↔ REN:** integrar calendario de #83 con la base actual, asegurar vínculos a lead/cliente; recordatorios internos después de revisión de datos. No mezclar #72 y #83 a ciegas.
- **P1 / HARU ↔ KENJI:** validar #104 (tareas/avisos) y #100 (101/201 truncación), especialmente móvil y errores; revisar KPI completos.
- **P2:** ampliar filtros de embudo, cotizaciones y reportes de cohortes cuando el recorrido P0 y su evidencia estén aceptados.

**Next action:** KENJI ejecuta y enlaza pruebas del PR/HEAD real en una base temporal aislada; SHIN verifica ledger y permisos; SORA coordina evidencia y aprobación del Radar; HARU revisa resultados y corrige **solo** un error de UI claramente no reclamado en una rama nueva. REN registra dependencias en #23. **No merge / no deploy / no datos reales** sin autorización expresa.

**Evidencia / referencias:** [#40](https://github.com/avaloncoreagency/Avalon-code/issues/40), [#47](https://github.com/avaloncoreagency/Avalon-code/issues/47), [#98](https://github.com/avaloncoreagency/Avalon-code/issues/98), [PR #128](https://github.com/avaloncoreagency/Avalon-code/pull/128), [PR #83](https://github.com/avaloncoreagency/Avalon-code/pull/83), [PR #104](https://github.com/avaloncoreagency/Avalon-code/pull/104), [PR #100](https://github.com/avaloncoreagency/Avalon-code/pull/100).
