# Avalon — Operación comercial diaria / Daily Sales Operations

**ID:** AVL-SALES-TEAM-001 C5 · **Versión:** 1.0-draft · **Fecha:** 2026-11-24 · **Estado:** procedimiento documentado, NO ACTIVADO · **Audiencia:** vendedor autorizado, supervisor, Finance & KPIs, Client Operations.

## 1. Rutina del día / Daily rhythm
**ES:** Las franjas siguientes son una guía de gestión, **no un horario de empleo, cuota ni SLA aprobado**. Solo se aplica cuando el vendedor tiene permiso real y existe un producto autorizado.
**EN:** These are suggested operating blocks, **not an approved employment schedule, quota or SLA**. Apply only when the agent has proper access and permitted services.

| Bloque / Block | Español | English | Evidencia / Evidence |
| --- | --- | --- | --- |
| Inicio / Start | Revisar asignaciones propias, clientes permitidos, oposición/no contacto y agenda aprobada | Review assigned records, authorized accounts, opt-outs and permitted agenda | Lista de acciones propias, nunca datos de terceros |
| Investigación / Research | Observar fuentes públicas, verificar identidad y duplicados | Review public sources, verify identity and duplicates | URL/fuente/fecha; hipótesis separada |
| Preparación / Prepare | Formular preguntas y revisar el gate del canal y producto | Draft questions and check channel/product approval | Propuesta interna NO ENVIADA |
| Interacción / Interaction | Solo contactos/citas expresamente autorizados y respetuosos | Only explicitly authorized calls/meetings | Fecha/canal/resultado verdadero |
| Registro / Log | Guardar evento real en ruta privada con permiso concedido | Log real events in permitted private system | Evento, owner, próxima acción, bloqueo |
| Revisión / Review | Comparar etapas, necesidad, próxima fecha y cadencia autorizada | Check stages, need, due next action and consent | Trabajo pendiente, sin marcadores ficticios |
| Cierre del día / End | Resumir resultados y bloqueos a supervisor, sin PII en reportes públicos | Summarize facts and blockers, no PII in public reports | Reporte verificable/N/D |

**Tiempo sugerido:** 10–15 min de revisión, luego investigación/preparación según carga permitida, 10–15 min al cierre; no usarlo para imponer actividad o mensajes antes de autorización.

## 2. Qué se registra / Activity taxonomy
| Evento | Cuándo se registra / When | NO equivale a / Not equivalent |
| --- | --- | --- |
| researched | Revisión pública verificable | Leads contactados / Contacted leads |
| contact-authorized | Permiso individual de canal y revisión legal | Contacto ejecutado / Actual contact |
| contact-attempted | Intento manual permitido con resultado conocido | Respuesta / Reply |
| replied | Respuesta real del interlocutor | Lead calificado / Qualified |
| meeting-scheduled | Cita realmente acordada | Reunión celebrada / Held |
| meeting-held | Sesión efectivamente realizada | Propuesta enviada / Sent quote |
| qualified | Score 1–5 con evidencia y estado de aprobación | Hunter 0–100 |
| quote-draft | Documento en preparación | Quote-sent |
| quote-sent | Propuesta **aprobada** enviada, con fecha/canal reales | Contrato firmado |
| contract-confirmed | Condiciones y aceptación verificadas en flujo legal | Cobro confirmado |
| sale-confirmed | Flujo comercial autorizado valida venta | Pago o comisión pagada |
| paid-reconciled | Finance confirma pago | Venta del negocio del cliente |
| handoff-accepted | Client Operations acusa recepción | Proyecto entregado |

**Evento NO disponible en la app:** no inventar que el CRM lo implementa; registrar solo lo permitido por la herramienta privada aprobada y reportar gap al supervisor. No escribir libremente PII o información médica en notas.

## 3. Revisión del pipeline / Pipeline review
**Sistema canónico:** trece etapas detalladas, cinco columnas visuales. El vendedor no inventa otro embudo ni mueve por todas las etapas para “hacer que funcione”.

**Preguntas diarias ES:** ¿qué registro me pertenece?, ¿hay prohibición de contacto?, ¿cuándo fue el último contacto real?, ¿cuál es la siguiente acción permitida?, ¿qué evidencia justifica score?, ¿está el SKU SELLABLE?, ¿qué bloqueo depende de otro responsable?  
**EN:** Is this record assigned to me? Any do-not-contact? When did a real interaction happen? What is the next permitted action? What supports its qualification? Is the SKU sellable? Who owns the blocker?

**Estados de excepción:** acceso denegado → detener; lead duplicado → revisar identidad; falta de precio/contrato → no cotizar; formulario sospechoso → revisión humana; un mensaje sospechoso no se elimina automáticamente; nota marcada completed no prueba un email/call real.

## 4. Indicadores / KPIs para Finance & KPIs
Estas definiciones se subordinan al [diccionario canónico de KPIs](../commercial-foundation/KPI_DICTIONARY.md). **No hay cuotas aprobadas.**

| KPI | Regla / Formula | Fuente, controles / Source and controls |
| --- | --- | --- |
| Investigados / Researched | Negocios únicos con fuente y fecha / Unique sourced businesses | Registro de investigación; excluir repetidos |
| Contactados reales / Actually contacted | Negocios únicos con interacción autorizada registrada | crm_activities, verificación manual; NO borradores |
| Respuesta / Response rate | Respuestas únicas ÷ contactados de la misma cohorte | Misma ventana y denominador; N/D si falta |
| Calificados / Qualified | Necesidad documentada + validación humana | No equiparar score Hunter o interés genérico |
| Reuniones celebradas / Meetings held | Sesiones realmente completadas | No scheduled/cancelled |
| Propuestas enviadas / Quotes sent | Versiones aprobadas efectivamente presentadas | Draft no cuenta |
| Contratos ganados / Won | Aceptación contractual verificada | No “sí” verbal |
| Conversión / Win rate | Won elegibles ÷ propuestas elegibles o leads según definición Finance | Declarar fórmula y cohorte |
| Contratado / Contracted | Valor validado de contratos | Separar facturación y cobros |
| Cobrado / Collected | Pagos conciliados por Finance | No ingresos de clientes terceros |
| Comisiones devengadas/pagadas | Valores según contrato y libro aprobado | No porcentaje supuesto, no cobrar por anticipo |
| CAC | Costos atribuibles completos ÷ clientes nuevos | Incluir trabajo humano cuando Finance defina método |

**Reglas de visualización:** si falta fuente, N/D; 0 solo con datos completos que acreditan cero. Incluir fecha, zona horaria, período, filtros, responsable y moneda. No mezclar audiencias agency_b2b con contractor_b2c ni el volumen del contratista con ingresos Avalon.

## 5. Reporte de fin de jornada / End-of-day template
**ES — para canal privado de supervisión**  
Fecha/zona: [N/D] · Vendedor: [ID autorizado] · Revisión de permisos: [PENDIENTE]  
Investigados verificados: [N/D] · Contactos autorizados: [N/D] · Ejecutados: [N/D] · Respuestas: [N/D]  
Reuniones celebradas: [N/D] · Propuestas aprobadas/enviadas: [N/D] · Contratos validados: [N/D]  
Oportunidades con próxima acción: [IDs privados] · Bloqueos de SKU/Legal/seguridad: [sin PII]  
Escalado a: [responsable real] · Fecha de seguimiento acordada: [N/D]  
**Sin actividad autorizada:** declarar “sin ejecuciones comerciales”, no inventar cero indicadores de cohortes.

**EN — private supervisor channel**  
Date/time zone: [N/A] · Seller: [authorized ID] · Permissions check: [PENDING]  
Verified researched: [N/A] · Authorized contacts: [N/A] · Actually performed: [N/A] · Replies: [N/A]  
Meetings held: [N/A] · Approved/sent quotes: [N/A] · Verified contracts: [N/A]  
Opportunities due next: [private IDs] · SKU/legal/security blockers: [no PII]  
Escalated to: [real owner] · Next agreed review: [N/A]  
**No approved activity:** report “no commercial execution performed”; don't fabricate zeros from missing CRM sources.

## 6. Escalamiento / Escalation matrix
| Señal / Trigger | Acción / Action | Responsable esperado / Owner | Urgencia propuesta / Urgency |
| --- | --- | --- | --- |
| Opt-out o contacto inapropiado / Privacy stop | Cesar; preservar evidencia mínima; avisar cumplimiento | Legal/supervisor | **Inmediata / Immediate** |
| Exposición de datos, acceso no autorizado / Data exposure | Detener uso, no copiar datos; reportar incidente | Cloud & Security / supervisor | **Inmediata** |
| Petición de precio, descuento, comisión o financiación / Price/terms | No prometer; revisar modelo y contrato | Finance + Legal + owner | Antes de cotizar |
| Producto no aprobado, demo incompleta / Blocked feature | No enviar propuesta ni demo externa | Product Studio + PM | Antes de presentar |
| CRM/Agent Portal “denied” o inconsistencia / Access issue | No reintentar con identidad ajena; registrar error sin PII | Soporte/PM/Samuel según ownership | Antes de continuar |
| Cliente exige garantías no comprobables / Unsupported guarantee | Explicar límites y escalar si persiste | Owners/Legal | Antes de negociar |
| Contrato firmado, listo para entrega / Approved sale | Transferir expediente mínimo por canal privado | Client Operations | Antes de iniciar proyecto |
| Error de pago/factura / Payment issue | No corregir manualmente importes | Finance/owner | Antes de comunicar cifra |

**No SLA aprobado:** “inmediato” expresa prioridad de seguridad, no un plazo contractual de respuesta. No ejecutar cambios técnicos ni abrir accesos por cuenta propia.

## 7. Handoff a Client Operations / Delivery handoff
**Solo si existe contrato y autorización:** pasar oportunidad canónica, organización, decisor autorizado, SKU/versiones, alcance/exclusiones, fechas confirmadas por Operations, contenidos y licencias, dominio/hosting, herramientas actuales que conservar, riesgos de privacidad, documento contractual de referencia y estado económico confirmado por Finance. Client Operations **acepta o devuelve** el paquete; Sales no declara proyecto iniciado por entregar un mensaje.

**Checklist de aceptación de handoff:**
- [ ] Identidad y owner correctos / Correct business and owner.
- [ ] Oferta, SOW y contrato verificados / Approved scope and signed terms.
- [ ] Capacidad y responsable de ejecución confirmados / Delivery capacity.
- [ ] Materiales autorizados, sin credenciales en texto / Licensed assets; no credentials.
- [ ] Pago y factura referidos sin datos de tarjeta / Payment references without card details.
- [ ] Riesgos y próximos hitos claros / Risks and next milestones.
- [ ] Cliente informado solo por canal autorizado / Approved communication.
- [ ] Operations confirmó recepción / Explicit acceptance.

## 8. Prueba sintética de rutina / Synthetic example (NOT ACTUAL)
**“Negocio Ficticio C”**: se encontró una web pública (investigación), todavía no hay consentimiento para contacto. **Correcto:** registrar fuente y posible hipótesis en espacio privado autorizado, **0 mensajes ejecutados en el ejercicio**, estado sin calificar, ningún seguimiento programado ni venta. Se usa solo para formación, nunca se sube como lead real.

## 9. Aceptación de la operación diaria
- [x] Procedimiento, eventos, KPIs, reporting, escalamiento y handoff definidos.
- [x] Separación de score 1–5 y Hunter 0–100; audiencias B2B/B2C.
- [x] Sin cuotas ni comisión inventada, ni acciones automáticas.
- [ ] Reportes reales creados, empleados autorizados y KPIs validados con Finance — **NOT_RUN/PENDIENTE**.
- [ ] Agent Portal probado físicamente y permisos por rol certificados — **NOT_RUN**.

**HANDOFF:** C5 documental completo; Finance & KPIs debe ratificar fórmulas y owners aprueban políticas antes de operación real.
