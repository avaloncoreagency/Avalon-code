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

## Anexo operativo BS-001A — investigación y preparación comercial
**Actualización de referencia: 2026-11-20.** Todos los precios de proveedores y competidores de esta sección son observaciones de páginas públicas, sujetos a cambios; no constituyen contratos, cotizaciones personalizadas ni precios aprobados por Avalon. Revalidar antes de contratar o enviar ofertas.

### A. Evidencia de mercado — comparables con límites explícitos
| Fuente pública | Precio anunciado consultado | Incluye / advertencia | URL |
| --- | --- | --- | --- |
| Miami Web HQ, Launch | USD 199/mes | Sitio de hasta seis páginas, hosting, SEO básico y actualizaciones; no asumir calidad/plazos equivalentes | https://miamiwebhq.com/pricing |
| Enigma Labs, 5 páginas | USD 100/mes | Hosting, soporte general, perfil de Google y CRM integrado según oferta; alcance diferente | https://www.enigma-labs.com/web-design |
| Website Store Miami, Business Basic | USD 1,100–2,000 de implementación | Hasta cinco páginas; precio estimado sujeto a propuesta individual | https://websitestore.miami/pricing/ |
| Website Store Miami, Business Plus | USD 2,000–3,500 de implementación | Hasta diez páginas; no equivale a marketing gestionado continuo | https://websitestore.miami/pricing/ |

**Interpretación PROPUESTA:** competir por resultados de proceso demostrables (sitio que funciona en móvil, contacto que llega al negocio, entregables/versiones claros, capacitación, soporte con límites y traspaso de accesos), no por afirmaciones de ventas garantizadas. No presentar precios publicitarios de competidores como estadísticas representativas de todo Florida.

### B. Costos y reglas de proveedores — referencias oficiales
| Servicio | Precio/condición pública verificada | Implicación comercial y límite |
| --- | --- | --- |
| Vercel | Hobby USD 0 para uso personal/no comercial; Pro desde USD 20/mes, con cargos de uso y asientos según composición del equipo | Nunca asumir Hobby para un sitio comercial; verificar el plan real y la distribución de costos antes de prometer hosting |
| Supabase | Pro USD 25/mes por organización con USD 10/mes de crédito de cómputo; Micro USD 10/mes por proyecto | Cada proyecto tiene instancia de cómputo; el costo crece por cantidad de proyectos aun si los datos son pequeños |
| Shopify Basic, EE. UU. | USD 29/mes si se factura anualmente o USD 39/mes mes a mes, más tasas pertinentes | Recomendar cuenta y suscripción del cliente con responsabilidad expresa; no confundir compras de tienda con ingresos de Avalon |
| Stripe, pago online doméstico estándar | 2.9% + USD 0.30 por transacción con tarjeta elegible | Presupuestar cobro y ajustes; el precio de cliente/plataforma puede ser distinto |
| Cloudflare Pages | Solicitudes de archivos estáticos gratuitas e ilimitadas; funciones sujetas a límites de Workers | Posible opción para sitios estáticos, **no** sustituto automático de backend, CRM, backups o soporte |
| Google Business Profile | Crear y administrar el perfil no cuesta tarifa de plataforma | Optimización humana es un servicio separable; nunca garantizar ranking |

**Fuentes:** https://vercel.com/pricing ; https://supabase.com/pricing ; https://supabase.com/docs/guides/platform/manage-your-usage/compute ; https://www.shopify.com/pricing ; https://stripe.com/pricing ; https://developers.cloudflare.com/pages/functions/pricing/ ; https://business.google.com/us/business-profile/ .

**Escenario técnico ILUSTRATIVO, no presupuesto ni decisión de arquitectura:** una sola organización Pro con diez proyectos Micro todo el mes implicaría USD 25 de plan + USD 100 de cómputo − USD 10 de crédito = **USD 115/mes**, antes de overages y otros proveedores. La facturación real depende de horas, región, tamaños, addons y créditos aplicables. Separar físicamente proyectos y compartir infraestructura con aislamiento lógico son arquitecturas distintas: Cloud & Security debe aprobar seguridad/privacidad y Finance debe aprobar costo, no decidir solo por la tarifa. Las cuotas y términos de proveedores pueden cambiar.

### C. Fichas comerciales bilingües para revisión, no para publicación
**C1. Website + Lead Capture (sitio de captación)**
- **ES:** “Una web profesional, rápida en móvil y preparada para recibir solicitudes, con entrega y soporte claramente definidos.”
- **EN:** “A professional, mobile-ready website built to receive inquiries, with clear deliverables and support boundaries.”
- Entregables candidatos: hasta tres páginas basadas en contenido aprobado; diseño responsive; formulario con destinatario autorizado y prueba de entrega; títulos/meta; orientación de acceso a dominio; una ronda de revisión. Condiciones finales: según presupuesto aprobado.
- Entradas del cliente: nombre comercial y responsable, dominio/control DNS, logo, servicios, áreas atendidas, fotografías con derechos, textos y contacto autorizado.
- Exclusiones: promesas SEO/ranking, campañas pagadas, fotografías de pago, CRM a medida, múltiples idiomas salvo cotización, cambios ilimitados.
- QA indispensable: iPhone y escritorio, formulario end-to-end, fallos legibles, accesibilidad esencial, métricas verificables, restauración y propiedad/traspaso documentados.

**C2. CRM + Pipeline (solo tras validación comercial de QA y seguridad)**
- **ES:** “Organiza prospectos, oportunidades y seguimiento en un flujo que tu equipo pueda usar.”
- **EN:** “Keep prospects, opportunities, and follow-ups organized in a workflow your team can use.”
- Entregables candidatos: descubrimiento, campos definidos, pipeline aprobado, importación limitada y validada, formación, pruebas de roles y manual.
- Entradas: responsables, pipeline actual, muestra permitida de campos sin exponer datos en repositorios, reglas de acceso, plazos de retención y criterios de deduplicación.
- Exclusiones: integraciones no verificadas, automatización masiva de mensajes, IA generativa no conectada, soporte ilimitado y migraciones ambiguas.
- Estado inicial: **BLOCKED** hasta evidencia de aislamiento entre clientes, RLS, backups/recuperación, hosting compatible y QA móvil.

**C3. Marketing Operations (gestión humana y alcance controlado)**
- **ES:** “Gestionamos un canal de marketing, medimos los contactos válidos y revisamos los resultados contigo.”
- **EN:** “We manage one marketing channel, track qualified inquiries, and review the results with you.”
- Entregables candidatos: diagnóstico, plan mensual, una plataforma/canal autorizado, reporte con origen y período, recomendaciones de optimización, reunión breve.
- Entradas: cuenta publicitaria del cliente, permiso de acceso delegable, inversión publicitaria aprobada y separada, materiales autorizados y definición de lead válido.
- Exclusiones: gasto publicitario incluido, ventas garantizadas, llamadas o mensajes autónomos, base B2C sin consentimiento y atribución sin datos.
- Estado inicial: **MANUAL PILOT**, nunca prometer integración o campañas antes de autorizar accesos y presupuestos.

**C4. E-commerce (solo tras evaluación y pruebas)**
- **ES:** “Ponemos en marcha una tienda con catálogo y checkout probados, dentro de un alcance acordado.”
- **EN:** “We set up a scoped storefront with tested catalog and checkout workflows.”
- Entradas: inventario y variantes, imágenes/derechos, envíos, devoluciones, impuestos, pasarela y titularidad de cuentas.
- No vender como READY sin prueba de compras/reembolsos sintéticos, seguridad, obligaciones fiscales evaluadas y soporte posventa definido.

**Regla:** estos textos son propuestas para revisión. Ningún servicio ni precio puede publicarse o enviarse sin aprobación y readiness real.

### D. Formulario privado de decisión de precio (campos, NO datos reales en GitHub)
1. SKU/código canónico y versión en catálogo; industria, alcance y exclusiones.
2. Estado técnico con evidencia, dependencias del proveedor, límites de licencias y quién paga cada cargo.
3. Precio de instalación PROPUESTO, precio recurrente PROPUESTO, plazo, depósitos/hitos, impuestos, monedas y descuentos.
4. Horas de diseño, desarrollo, QA, gestión, soporte y contingencia; costo/hora interno autorizado en registro **privado**.
5. Costos directos mensuales, costos variables de cobro, adquisición atribuible y capacidad de dos propietarios.
6. Margen de implementación y recurrente, costo de salida y escenarios de horas +25% / +50%; si falta información: N/D.
7. Revisión FINANCE (fecha/evidencia), LEGAL (fecha/evidencia), QA/Cloud (SHA/entorno), aprobación Miguel/Samuel (fecha/versión).
8. Estado resultante: DRAFT / INTERNAL REVIEW / OWNER APPROVED / SELLABLE / PAUSED. La versión propuesta no se convierte en precio aprobado automáticamente.

**Ejemplo matemático sintético (NO precio ni costo Avalon):** un trabajo vendido en USD 1,000 con USD 500 de costos directos y cobro con tarjeta al 2.9% + USD 0.30 dejaría USD 470.70 de contribución antes de overhead, equivalente a un margen de **47.07%** en ese cálculo simplificado. Con objetivo hipotético de 55%, la tarifa mínima sería aproximadamente **USD 1,188.36**, con las mismas hipótesis: (500 + 0.30) / (1 − 0.55 − 0.029). Impuestos, reembolsos, adquisiciones y costos fijos podrían modificar el resultado; nunca utilizar este ejemplo como cotización.

**Suscripción que financia un sitio — estrés de cancelación:** en una simulación puramente educativa con USD 395 de implementación inicial, USD 199 cobrados al mes, USD 40 de costo de servicio mensual y 2.9% + USD 0.30 por cobro, el saldo operativo acumulado es −USD 242.07 al mes 1, −USD 89.14 al mes 2 y +USD 63.79 al mes 3, sin CAC ni overhead. Cancelaciones tempranas causan pérdidas. Finance y Legal deben validar recuperación de costo, condiciones de terminación, titularidad y obligaciones antes de ofrecer esta modalidad.

### E. Comisiones: cinco pruebas negativas antes de cualquier contrato
1. ¿La venta venía de un cliente anterior? Si no hay reglas de atribución firmadas y evidencia, no generar comisión automática.
2. ¿Se presupuestó una obra pero todavía no se cobró? El presupuesto no equivale a comisión cobrada.
3. ¿El cliente recibió un reembolso o chargeback? Registrar ajuste/controversia según contrato; no conservar comisión como firme sin análisis.
4. ¿Dos canales reclaman el mismo comprador? Resolver identidad, ventana y prelación con evidencia y revisión humana; no duplicar.
5. ¿Una venta de USD 10,000 del contratista genera 4% de comisión? USD 10,000 es volumen del cliente, no ingreso Avalon; **USD 400 sería comisión teórica**, no devengada ni cobrada hasta superar todos los gates contractuales y financieros.

Sin fuente confiable de atribución y acceso legítimo a datos: **modelo híbrido/comisión PENDIENTE**, ofrecer un servicio fijo acotado o rechazar. No crear registros en producción para simular pruebas.

### F. Plan táctico por semanas — primeros diez clientes
**Denominador de planificación, no pronóstico ni ventas reales:** con supuestos de 33% de negocios identificados que llegan a conversación efectiva, 25% de conversaciones que llegan a propuesta y 33% de propuestas aceptadas, aproximadamente 360 negocios identificados producirían 120 conversaciones, 30 propuestas y 10 cierres. Las tasas no están verificadas; si cae alguna, hay que recalibrar volumen, tiempo o producto. No hay prospección autorizada por este documento.

| Período desde aprobación | Trabajo manual propuesto | Evidencia de salida |
| --- | --- | --- |
| Semanas 1–2 | Validar un SKU listo, costo/contrato, demo sintética, formulario de calificación, capacidad y lista de canales permitidos | Acta READY, caso demostrable sin clientes falsos, checklist firmado |
| Semanas 3–4 | Diagnósticos con contactos obtenidos lícitamente, propuestas de prueba revisadas, medir tiempo por llamada | Registro de oportunidades reales **solo con permiso** en CRM, propuestas con versión |
| Semanas 5–8 | Entregar pocos proyectos en paralelo, revisar costos reales, pedir consentimiento para testimonios/referidos | Entrega/aceptación, horas comparadas, incidencias y soporte |
| Semanas 9–12 | Repetir la oferta con mejor margen y menor dificultad; explorar segunda industria tras capacidad probada | Revisión de tasas por cohorte, costo de adquisición y flujo de caja |
| Semanas 13–17 | Ajustar cierre hasta meta de diez **solo si hay capacidad y demanda**; no regalar trabajo para inflar clientes | Cierres contractuales y pagos conciliados, no promesas comerciales |

**Cadencia PROPUESTA:** revisión semanal de 30 minutos por owners: ofertas vendibles, capacidad abierta, 5 oportunidades más importantes, propuestas pendientes, antigüedad, margen y riesgo. Si la capacidad de entrega llega a cero, detener nuevos compromisos. Indicadores con numerador o denominador no verificado muestran **N/D**. El pipeline existente sigue siendo fuente única.

**Reglas del piloto Chino Barber:** todavía no existe website, URL ni prueba de entrega; mantenerlo como posible piloto sin inventar contrato, ingreso, captación, ventas ni estado de cliente pagador. Antes de empezar, documentar dueño del dominio, alcance, entregables, licencias y presupuesto con aprobación.

### G. Criterios de aceptación de esta fase documental
- Existe un mapa de ofertas reproducible en ES/EN con inclusiones, exclusiones, inputs y gates.
- Los precios publicados de terceros tienen fuente y fecha; no se presentan como tarifa interna ni como derecho contractual.
- Los escenarios financieros están rotulados sintéticos y se separan de costos, tarifas y cobros reales.
- El negocio del cliente no se suma a ingresos Avalon y el modelo de comisión no se habilita por inferencia.
- El plan de diez clientes es un escenario condicionado a autorización, capacidad, readiness y conversiones medibles.
- No se modifica Quoting Studio, CRM, código, licencias, marketing activo ni infraestructura. La revisión humana sigue pendiente.

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
