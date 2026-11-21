# Avalon Client Operations — Gates de aceptación y handoff operativo (ES)

**Documento:** AVALON-OPS-GATES-001 · **Versión:** 1.0 propuesta · **Issue:** #271 · **Ámbito:** websites, e-commerce y CRMs.
**Estado:** PROPUESTO. No acredita implantación, aceptación, certificación legal, prueba en Safari ni publicación de ningún proyecto.
**Confidencialidad:** esta plantilla está en un repositorio público. No insertar nombres de clientes, teléfonos, direcciones, contratos, cifras reales, capturas privadas, credenciales ni URLs internas.

## 1. Objetivo y decisiones que NO deben confundirse

Operar una relación de cliente con pasos verificables, sin duplicar CRM, tareas, contratos ni órdenes.

- **Cliente / ficha** (`crm_clients.id`): identificar empresa. No implica venta.
- **Lead / oportunidad** (`crm_leads.stage_id`): representa avance comercial. No equivale a proyecto ni cobro.
- **Venta** (`crm_sales` y líneas): depende del gate comercial y confirmación del servidor; nunca se inventa para vincular un producto.
- **Orden de trabajo** (`crm_work_orders`): derivada de la línea vendida cuando aplique; debe preservar idempotencia.
- **Proyecto** (`os_projects.client_id`): puede existir como borrador si la operación está autorizada. No implica obra terminada.
- **Producto externo** (`settings.operations` / control del producto): URL guardada = referencia, NO despliegue verificado ni entrega.
- **Aceptación**: requiere evidencia y persona facultada; checkbox interno no equivale a firma ni consentimiento.
- **Pago**: independiente de propuesta, contrato, venta, proyecto o entrega. Solo Finance valida cobros.

Estos son vínculos de datos y controles **ya documentados** en #237 y #46, sujetos a revalidación técnica antes de operar.

## 2. Matriz de puertas (gates) y bloqueo obligatorio

| Gate | Responsable propuesto | Prueba mínima exigible | Bloqueo que impide avanzar | Aprobador propuesto |
| --- | --- | --- | --- | --- |
| G0 Calificación | Sales & Marketing | Origen lícito, identidad, necesidad, decisor, autorización de contacto, deduplicación | Contacto no autorizado o identidad ambigua | Responsable comercial |
| G1 Propuesta y contrato | Business Strategy + Legal + Finance | Alcance versionado, exclusiones, precios/servicios terceros aprobados, condiciones y aceptación documentada | Cotización no aprobada, firma pendiente o costo sin dueño | Owner facultado / firmante |
| G2 Onboarding | Client Operations | Checklist aplicable, derechos de uso, materiales, dependencias y canales seguros | Material esencial ausente o uso no permitido | Responsable operativo |
| G3 Kickoff | Client Operations + Product Studio | Proyecto/tareas con responsable, fechas estimadas/confirmadas, riesgos y alcance base | Falta de autorización para producir o dependencia crítica | Owner del proyecto |
| G4 Diseño y producción | Product Studio | Entregables vinculados a versión, revisiones consolidadas y cambios autorizados | Desviación no aprobada de alcance, precio, fecha o uso de datos | Responsable técnico y cliente para cambios |
| G5 QA / UAT | Quality Assurance + cliente | Pruebas con versión exacta, errores priorizados, evidencia UAT y aceptación válida | P0/P1, denegaciones RLS incorrectas, fallo crítico o falta de UAT | QA + aprobador autorizado |
| G6 Publicación / entrega | Responsable técnico + Client Operations | Permiso explícito, entorno correcto, respaldo/rollback, prueba post-release, manual y accesos | No hay autorización, dominio sin titularidad, entorno inseguro o release sin prueba | Owner y cliente cuando corresponda |
| G7 Soporte y cierre | Client Operations | Tickets, SLA real si contratado, responsables, proveedor/pagador, renovaciones y exportación | Obligación contractual sin dueño, ticket crítico o acceso sin transferir | Owner operativo |

**Regla:** Gate = `PASÓ` únicamente con evidencia válida; si no hay evidencia, usar `PENDIENTE` o `DESCONOCIDO`. Una recomendación no habilita una operación irreversible.

## 3. Evidencia mínima y lugar de registro

**La evidencia de cada proyecto debe almacenarse de forma privada**, con permisos apropiados. En este repositorio solo son públicos los nombres de documentos generales y referencias a Issues sin información del cliente.

| Artefacto | Ejemplo de evidencia válida (no inventada) | Fuente / almacenamiento |
| --- | --- | --- |
| Alcance y contrato | Versión firmada o aceptación bajo mecanismo aprobado por Legal | Archivo privado de contratación |
| Materiales y permisos | Archivo aportado y derecho de uso confirmado | Carpeta privada con permisos |
| Hitos y tareas | Estado real guardado y responsable asignado | CRM / gestión de proyectos existente |
| Revisión de cliente | Aprobación explícita de una versión identificable | Registro privado autorizado |
| QA | Salida de pruebas, SHA exacto, defecto y resultado | CI/QA autorizado; capturas privadas si contienen datos |
| Producto publicado | URL real aprobada + comprobación HTTPS y versión desplegada | Cuenta autorizada de publicación |
| Aceptación de entrega | Documento o mecanismo aprobado por Legal, fecha y persona autorizada | Archivo privado contractual |
| Soporte | Ticket, responsabilidad, prueba de corrección y cierre | Registro seguro de incidencias |

**Formatos de estado:** VERIFICADO (hay prueba), PROPUESTO (diseño no aprobado), PENDIENTE (acción/decisión identificada), DESCONOCIDO (dato no consultado o evidencia ausente).

## 4. Tarjeta de decisión GO / NO-GO (copiar al sistema privado)

```text
CASO / proyecto: [referencia privada]
Gate: [G0-G7]
Alcance y versión: [ref privado]
Estado: [VERIFICADO | PROPUESTO | PENDIENTE | DESCONOCIDO]
Evidencia: [enlace seguro o referencia interna]
Faltantes / defectos: [resumen]
Costo o dependencia externa: [conocido/aprobado | desconocido | N/A]
Responsable: [rol y persona autorizada]
Decisión: [GO | NO-GO | GO CONDICIONAL sin operaciones irreversibles]
Aprobador facultado: [rol]
Fecha / próxima revisión: [fecha verificada o por confirmar]
```

**GO CONDICIONAL:** permite investigación, planificación o borradores no productivos; no permite publicar, cobrar, contratar, alterar permisos ni migrar datos sin autorización separada.

## 5. Control de cambios y revisiones

1. Registrar `CR-ID` con proyecto, versión base, solicitud, solicitante, fecha y alcance.
2. Clasificar como **defecto frente a lo contratado** o **nuevo alcance**; nunca cobrar automáticamente defectos por resolver.
3. Product Studio evalúa viabilidad, seguridad, cronograma y dependencias.
4. Business Strategy / Finance calculan costo y margen **solo con valores autorizados**, Legal revisa anexos cuando proceda.
5. Cliente y owner facultados aceptan el cambio si altera compromiso contractual.
6. El equipo técnico ejecuta únicamente después de la aprobación, en rama/control de cambios correspondiente.
7. QA verifica la versión modificada; Client Operations registra entrega y evita doble facturación o trabajo repetido.

**Ficha CR:** `CR-ID | baseline | diferencia | defecto/mejora | impacto tiempo/costo/datos | decisión | quién aprobó | evidencia exacta | validación | estado`.

**No aprobar por silencio.** Cambios que impliquen cookies, dominio, secretos, roles, SQL, cobros, retención o producción tienen bloqueos adicionales de seguridad y negocio.

## 6. Guía de uso por los owners (cuando la UI esté validada)

1. Abrir Clients 360 y **comprobar** el cliente canónico. Ante duplicados, revisar IDs y documentos; no unir fichas por nombre.
2. Consultar leads y ventas como registros **independientes**; no cambiar a `won` para hacer que aparezca un producto.
3. Desde el cliente, preparar un producto de tipo website/e-commerce/CRM. Si todavía no está construido, usar borrador sin URL cuando esté disponible y autorizado; no inventar dirección.
4. Asociar la orden de trabajo existente cuando proceda; no crear un segundo sistema para replicar tareas.
5. Registrar proyecto, alcance, responsables y dependencias; preparar revisiones.
6. Usar Product HUD solo para seguimiento y controles guardados; checklist manual no equivale a ejecución automática.
7. Registrar la URL HTTPS real **solamente** cuando exista y esté autorizada. Verificar por separado publicación, funcionalidad y aceptación.
8. Registrar soporte y mantenimiento contratado; las mejoras de Guardian siguen sujetas a pruebas y autorización.

**Advertencia:** esta secuencia es una guía propuesta. No prueba que todas las acciones sean cómodas o funcionen en la UI actual. Validar contra PRs activos, Preview aislada y sesiones autorizadas; en iPhone físico aún no hay aceptación demostrada.

## 7. Ensayo de aceptación con datos sintéticos

**No ejecutar en producción.** Cuando Product Studio + QA autoricen el entorno aislado, preparar dos compañías ficticias sin contactos reales.

- [ ] Dos owners con sesiones separadas; no-owner denegado.
- [ ] A y B con datos sintéticos aislados; cruce de cliente/producto/adjunto/venta bloqueado.
- [ ] Captura prospecto -> ficha -> oportunidad conservando IDs; actualización del estado sin venta falsa.
- [ ] Cotización, contrato y aceptación simulados, identificando `NO FIRMADO` cuando corresponda.
- [ ] Venta sintética con línea de servicio -> una única orden; reintento no genera duplicados.
- [ ] Proyecto borrador sin URL -> preparación, no publicación.
- [ ] URL **sintética y controlada** solo en fixture -> referencia externa sin afirmar entrega.
- [ ] QA y UAT asociados a versión y aprobador correctos.
- [ ] Pruebas de red caída, 409/versiones obsoletas y recuperación del borrador.
- [ ] Móvil Chromium responsive y después iPhone Safari **real** como pruebas distintas.
- [ ] Radar suspendido, sin llamadas externas; recepcionistas/chatbots inactivos.
- [ ] Cierre y soporte sin crear cargo ni correos reales.

**Salida:** resultados por caso, evidencia exacta y defectos pendientes. Ninguna casilla está marcada como completada.

## 8. Coordinación que debe recibir PROJECT MANAGER

| Departamento | Revisión concreta | Resultado solicitado |
| --- | --- | --- |
| PRODUCT STUDIO | Sitemaps, mobile, SEO, checkout sandbox, CRM/RLS, rollback y documentación | Aceptación técnica del gate G3-G6 o correcciones |
| LEGAL & COMPLIANCE | Propuesta/contrato, propiedad intelectual, privacidad, revisiones, aceptación, garantías, SLA, cancelación | Texto y mecanismos aprobados legalmente, sin dar asesoría definitiva |
| BUSINESS STRATEGY | Paquetes vendibles, exclusiones, costos de terceros, soporte | Catálogo y obligaciones comerciales claros |
| FINANCE & KPIs | Separación ventas cliente / ingresos Avalon, cobros, margen, comisión atribuible | Definición y fuentes verificables, sin tocar ledger |
| QUALITY ASSURANCE | E2E sintético, aislamiento, multi-owner, iPhone Safari, recibos por SHA | Evidencia ejecutada, no promesas |
| CLOUD & SECURITY | Dominios, entornos, RLS, acceso delegado, almacenamiento, restauración | Procedimiento de go-live seguro y bloqueos documentados |
| PROJECT MANAGER | Priorización y aceptación interdepartamental | Decisión owner sobre incorporar o mantener SOP en borrador |

## 9. Primer piloto: negocio local con reservas (anonimizado)

**Información suministrada para este caso:** el website aún no está creado. No existe en este documento un dominio verificado, alcance aprobado, precio, contrato, etapa comercial o sesión de cliente comprobada.

**Gate inicial P0 (solo análisis):** identificar condición comercial real y aprobador, comprobar sin modificar si ya existe ficha de prueba, verificar necesidades y documentos faltantes. No construir ni publicar automáticamente. Si se autoriza, Product Studio define un MVP móvil; Legal revisa términos; QA prepara pruebas. No activar reservas, pagos, chatbots ni recepcionistas sin acuerdo y validación.

**GO / NO-GO:** NO-GO para publicación o intervención productiva mientras falten permisos, contrato/alcance aplicable, materiales, QA y aceptación; GO solo para planificación interna no sensible.

## 10. Estado y próximas decisiones

- **VERIFICADO:** existen rutas/modelos de CRM y documentación de productos, checklists humanos y referencias a #237/#46/#49.
- **PROPUESTO:** esta matriz, responsabilidades, ensayos, evaluación de entrega y criterios de aceptación.
- **PENDIENTE:** firmas, precios, SLA, políticas de datos, integración en UI, responsables asignados y plan de ensayo.
- **DESCONOCIDO:** experiencia iPhone real, resultado de pruebas del cliente, operación de cada proveedor y presupuesto efectivo.

**Next action:** revisar esta matriz con PRODUCT STUDIO y LEGAL & COMPLIANCE y registrar aprobación en #271. Ningún acuerdo de documentación autoriza por sí solo desplegar, firmar, cobrar, gastar créditos o procesar datos de un cliente.
