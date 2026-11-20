# Avalon Core Agency — Business Strategy BS-001
**Documento de gobierno comercial | v1.0 | 2026-11-20 | PROPUESTO, NO APROBADO**

**Responsable de revisión:** Miguel y Samuel. **Registro:** [Issue #273](https://github.com/avaloncoreagency/Avalon-code/issues/273). **Referencia de revisión:** `main@207ed3a3dc8fdae5dd949a7361733e441c530519`.

> Este documento es una política propuesta, no un catálogo activo ni una autorización para cotizar, facturar, modificar ofertas o contactar prospectos. El repositorio es público: no agregar datos de clientes, costos internos reales, salarios, acuerdos privados ni valores confidenciales.

## Resumen ejecutivo
**Objetivo:** diez clientes pagadores iniciales con entregas reproducibles, precios aprobados por owners, límites de alcance, cobranza trazable y capacidad suficiente, sin activar servicios no verificados. **Horizonte de planificación PROPUESTO:** 120 días a partir de la aprobación del lanzamiento, no desde la creación de este archivo. **Alcance:** websites, e-commerce, CRM y marketing para pymes. **Dependencias:** Finance & KPIs, Legal & Compliance, Product Studio, Cloud & Security, Quality Assurance y Project Manager.

**Posicionamiento PROPUESTO:** soluciones digitales y operaciones comerciales de extremo a extremo para pymes; evitar competir solamente por precio o prometer ingresos, conversiones, disponibilidad y funcionalidades de IA sin evidencia.

## Hallazgos verificados en código/documentación (no prueba de producción actual)
1. `docs/crm/COMMERCIAL_CORE_360.md` describe Quoting Studio, catálogo `crm_service_catalog`, versiones de propuestas y contrato enlazado. Declara siete servicios en `draft` y ningún precio `approved` en su checkpoint; **revalidar el estado real** antes de afirmar que sigue igual.
2. `docs/commercial-foundation/INTEGRATION_MAP.md` asigna catálogo a Service Factory #54/#48, Solution Planner a #59 y procesos comerciales a los modelos CRM existentes. No crear una segunda fuente de precios, clientes, ventas ni comisiones.
3. `docs/commercial-foundation/KPI_DICTIONARY.md` distingue contratos, facturas, cobros, comisiones, costos verificados y volumen de ventas ajeno a Avalon. Reutilizar esas definiciones.
4. `docs/commercial-foundation/SALES_PLAYBOOK.md` ya define discovery, propuesta, contrato, onboarding y entregas; esto complementa, no reemplaza, ese procedimiento.
5. Issues #48 y #50 establecen catálogo y puertas de preparación comercial. Su existencia **no** demuestra servicio sellable ni pruebas hosted aprobadas.

## Matriz de ofertas — propuesta para revisión
| Familia | Perfil objetivo | Entregables sujetos a especificación | Restricciones antes de vender |
| --- | --- | --- | --- |
| Website + captación | Contratistas, barberías, servicios locales | Sitio responsive, formulario, SEO técnico básico, entrega y mantenimiento definidos | Dominio, hosting comercial lícito, QA móvil y flujo de leads verificables |
| Website avanzado | Pymes con mayor contenido y múltiples páginas | Arquitectura de páginas, analítica, integraciones autorizadas y revisiones acotadas | Contenido, consentimiento/cookies aplicables, estimación de horas |
| E-commerce | Retail con catálogo, impuestos y logística propios | Tienda y checkout de proveedor validado, carga inicial delimitada, pruebas sintéticas | Plan comercial, pasarela, shipping, tax, PCI/privacidad y política de devoluciones aprobados |
| CRM Essentials | Negocios con procesos comerciales manuales | Contactos, pipeline, seguimiento, migración controlada y formación | Aislamiento por cliente, RLS, permisos, soporte y restauración probados |
| CRM Custom | Empresas con necesidades fuera del estándar | Discovery pagado, especificación versionada, hitos, QA y cambios por orden aprobada | Factibilidad/product readiness, presupuesto de horas y estimación de mantenimiento |
| Marketing Local | Negocios con capacidad real de atender leads | Plan, gestión humana limitada, métricas verificables y reporte | Cuentas, consentimientos, presupuesto publicitario, límites de gasto y atribución |

**No vendibles por defecto:** AI Receptionists, chatbots comerciales, Radar y funciones que dependan de OpenRouter o proveedores no validados. Mantener suspensión actual. Los pilotos deben rotularse **MANUAL PILOT**, no READY.

## Regla única de aprobación de precios
- Estados estrictamente separados: **PROPUESTO** (idea interna), **REVISIÓN FINANCIERA**, **REVISIÓN LEGAL**, **APROBADO POR OWNERS**, **SELLABLE TRAS QA**, **SUSPENDIDO/RETIRADO**.
- La aprobación comercial exige registro fechado de ambos propietarios o un esquema de delegación explícitamente aprobado; propuesta interna o celda en este documento **nunca** significan autorización.
- El precio mostrado al prospecto debe originarse en la oferta aprobada de `crm_service_catalog` o en una excepción aprobada y versionada, no en un precio del presente documento.
- Mantener por separado: implementación, fee recurrente, publicidad de terceros, licencias directas del cliente, costos de pasarela, impuestos aplicables y comisión por rendimiento.
- Descuentos y trabajo fuera de alcance requieren nuevo cálculo de margen, responsable y aprobación. Las revisiones, soporte, tiempos de respuesta y transferibilidad de activos deben ser explícitos.
- Los precios y rangos numéricos usados en talleres internos son solo escenarios sintéticos; no representan tarifas vigentes.

## Modelo de costos y rentabilidad — contrato de cálculo
Para cada oferta registrar **por separado**: horas estimadas de discovery, diseño, desarrollo, QA, gestión de proyecto, revisiones, lanzamiento, soporte mensual, administración, costo horario interno aprobado, proveedores, comisiones de cobro, contingencia, costo de adquisición y costo de salida/traspaso. Registrar quién paga licencias y publicidad.

- **Costo directo estimado** = horas directas × costo/hora interno aprobado + servicios directos atribuibles + contingencia directa.
- **Margen bruto estimado** = (precio neto de ingresos propios − costo directo estimado) / precio neto de ingresos propios; si falta un factor obligatorio, informar **N/D**.
- **Contribución estimada** = ingresos propios − costos variables directos − adquisición atribuible.
- **Margen realizado** exige gastos reales y reconocimiento de ingresos trazables. Nunca inferirlo de una propuesta ni presentarlo como ganancia neta.
- **MRR** se calcula sobre obligaciones recurrentes activas atribuibles a Avalon; no equivale a efectivo cobrado. **Caja** exige pagos conciliados.
- Costo del trabajo de los fundadores **no es cero** aunque no se cobre nómina. Registrar sensibilidad ante sobrecostos de horas.
- Aplicar política de precios mínimos basada en objetivo de margen revisado por FINANCE & KPIs; si el margen cae por debajo del umbral aprobado, no aceptar sin excepción documentada.
- No sumar valor de obras/ventas realizadas por el cliente a ingresos Avalon; solo una comisión devengada y sustentada corresponde a ingresos propios, y **comisión cobrada** requiere liquidación conciliada.

## Modalidades de cobro y límites
1. **Instalación + servicio mensual:** predeterminado PROPUESTO. Hitos de pago, entregables y soporte definidos; costos de terceros separados.
2. **Suscripción que financia una implementación:** solo tras validar riesgo de cancelación anticipada, capital de trabajo, titularidad del sitio, plazos y régimen de salida con LEGAL.
3. **Híbrido con comisión:** cuota de gestión para cubrir trabajo y porcentaje negociado solo sobre base elegible verificable. Requiere fuente de leads, identidad única, ventana de atribución, cierre real, cobro, exclusiones, devoluciones, disputas, auditoría y fecha de liquidación. Sin esos controles: **PENDIENTE / no ofertar**.
4. **Comisión pura:** desaconsejada en primera fase; requiere excepción fundada, capacidad auditada del cliente y aprobación legal/financiera.

**Nunca** tratar una cotización aceptada como venta cobrada. Respetar el flujo ya existente de Quoting Studio, contrato, ventas, facturas y pagos. No crear una segunda implementación.

## Matriz de preparación de lanzamiento por SKU
| Comprobación | Evidencia exigida | Estado si falta |
| --- | --- | --- |
| Producto real | Demo y pruebas de aceptación en entorno autorizado | BLOCKED |
| Seguridad y tenencia | Autorización, aislamiento entre clientes, RLS, backup/restauración | BLOCKED |
| Proveedor/licencias | Plan comercial permitido, responsable de pagos, cuotas y costos | BLOCKED |
| Costo y precio | Horas, tarifa interna, costos externos, margen y firma de aprobación | DRAFT |
| Contrato | Alcance, cambios, propiedad, privacidad, soporte, cancelación y cobro | BLOCKED |
| Operación | Checklist onboarding, responsable, capacidad, QA y soporte | MANUAL PILOT |
| Evidencia de aceptación | Prueba final móvil/escritorio + entrega/revisión registrada | MANUAL PILOT |

**READY** requiere **todos** los controles superados con evidencia. Un test local o CI verde no demuestra por sí mismo aceptación en hosting, Safari real ni disponibilidad comercial.

## Segmentación y calificación
- **Prioridad PROPUESTA A:** roofing, fencing, HVAC y servicios del hogar; preguntar capacidad semanal, ticket medio, margen, responsable de leads, tiempo de respuesta, cobertura geográfica y competencia local.
- **Prioridad PROPUESTA B:** barberías, salones y servicios con citas; preguntar reservas, capacidad, no-shows, herramientas actuales y presupuesto.
- **Prioridad PROPUESTA C:** retail pequeño; evaluar calidad del catálogo, logística, devoluciones, preparación fiscal y márgenes.
- Calificación mínima: autoridad de decisión, problema verificable, urgencia, capacidad de atender demanda, presupuesto, readiness técnico y requisitos de consentimiento. **DESCONOCIDO** nunca se convierte automáticamente en aprobado.

## Plan de primeras diez cuentas — escenario PROPUESTO, no forecast
**Días 1–15 (desde autorización):** validar 1–2 ofertas READY, materiales demo sintéticos, modelo financiero, términos legales, checklist de producción y pipeline manual. Chino Barber es **piloto potencial**, website aún no creado; no asignarle ingresos, URL ni estado de cliente pagador.
**Días 16–45:** contactos personales y recomendaciones autorizadas; entrevistas y diagnóstico; ningún scraping, campaña masiva ni Radar.
**Días 46–90:** aprender de proyectos entregados y aprobados, medir horas de producción, tasa de aceptación y soporte; conservar casos de éxito **solo con permiso**.
**Días 91–120:** ampliar el producto con mejor contribución y repetir canales con evidencia; no perseguir cantidad a costa de capacidad operativa.

**Embudo de planificación, no dato real:** identificados → conversaciones permitidas → diagnósticos → propuestas enviadas → contratos válidos → clientes pagadores. Revisar cada semana volumen, ratios por cohorte, tiempo hasta cierre, CAC, margen estimado vs real, ticket, MRR, impagos, capacidad disponible y satisfacción. Si faltan datos: **N/D**, no cero inventado.

## Riesgos, dependencias y aprobaciones
- **Finance & KPIs:** validar costos/hora, overhead, impuestos, flujo de caja, CAC y umbrales. No hay precios ni márgenes aprobados aquí.
- **Legal & Compliance:** contratación, entidad jurídica, cláusulas, derecho sobre materiales, comisiones, atribución, uso de datos, cumplimiento de publicidad, cancelación y cobro.
- **Product Studio / Cloud & Security / QA:** certificar prestación real, licencias de hosting, aislamiento, backups, monitoreo, evidencia en dispositivos y soporte.
- **Sales & Marketing:** preparar guiones y seguimiento manual; no contactar prospectos sin autorización.
- **Project Manager:** consolidar decisiones, dependencias y prioridades sin asumir sincronización automática entre chats.
- **Miguel y Samuel:** aprobar por escrito servicios, precios, estándares de margen, capacidad máxima y autorización de lanzamiento.

## Próximas tres acciones
1. Finance & KPIs completa el cálculo privado con costos reales y define los límites de margen.
2. Legal & Compliance y QA devuelven gates de venta y la lista de ofertas que aún no pueden lanzarse.
3. Owners aprueban o rechazan catálogo, términos y capacidad; Project Manager planifica la captación solo después del gate.

## HANDOFF AL PROJECT MANAGER
**Registro:** BS-001 / GitHub #273. **Estado:** PROPUESTO, documento de revisión pública sin datos confidenciales. **Cambios solicitados:** ninguno a runtime/CRM/Quoting Studio. **Dependencias canónicas:** #48, #50, `crm_service_catalog`, `docs/crm/COMMERCIAL_CORE_360.md`, `docs/commercial-foundation/{INTEGRATION_MAP,SALES_PLAYBOOK,KPI_DICTIONARY}.md`. **Aceptación:** revisar este documento con FINANCE, LEGAL y QA, documentar decisiones de owners, y solo luego encargar cualquier cambio a la implementación comercial existente. **No afirmar:** pricing aprobado, clientes adquiridos, producción validada, campañas enviadas, ni ganancias realizadas.
