# Avalon OS — Hoja de ejecución UAT para el piloto (v1)

**Fecha de preparación:** 2026-11-20. **Departamento:** Quality Assurance. **Referencia:** Issue #253 / PR #276.
**Matriz fuente:** docs/quality/AVALON_OS_ACCEPTANCE_MATRIX_V1_20261120.md (A-01 a A-33).
**Baseline de aplicación comprobado en main:** 207ed3a3dc8fdae5dd949a7361733e441c530519.
**Estado:** PREPARADO / NO EJECUTADO con usuarios reales; G0 bloqueado por ausencia de Preview aislada validada.

Este documento es una **hoja para registrar aceptación humana**, no otra suite automatizada. Las pruebas de Codex/Claude y el verificador de readiness del PR #259 se reutilizan; no se duplican. No se escriben nombres, teléfonos, correos, capturas con clientes, cookies, JWT, contraseñas, importes reales, URLs privadas ni evidencia confidencial en un repositorio público.

## 1. Checkpoint comprobado

| Evidencia | Observación | Veredicto |
| --- | --- | --- |
| GitHub QA PR #276 | Rama aislada; Auth Review y Security Checks SUCCESS en 2ef0640c | CI de esos workflows verificada; NO equivale a aceptación funcional |
| CI base de aplicación | Sales Core y CRM aislado SUCCESS en dc319983 del PR #262; Sales ejecutó tests/sales.browser.cjs en Chromium sintético | No reabrir React #418 ni Sales E2E sin fallo nuevo y reproducción por SHA |
| Vercel QA | dpl_B1fhGCq7p1iFymZnpmF3yKnbiZPb, CANCELED. Build log: «blocked_unsafe_preview_database» | Suspensión de build **intencional** por guardia; no se debe desactivar |
| Fuente de guardia | scripts/ci/vercel-ignore-build.cjs reconoce la referencia productiva de Supabase y cancela Preview; next.config.ts también la rechaza | Seguridad fail-closed; restaurar aislamiento, no eliminar comprobación |
| Supabase | Proyecto principal ACTIVE_HEALTHY; ledger 48 migraciones. Dos ramas no predeterminadas históricas pertenecen a otros trabajos | Ninguna de esas ramas se reutiliza para esta sesión sin aprobación y cotejo |
| Radar | Stub remoto v11 exige JWT, responde 423; configuración desactivada y sin job Radar en cron.job al momento de la auditoría | Verificación estática/remota suficiente para configuración; no certifica 0 egress/costo por intervalo |
| Dispositivo | Sin ensayo físico en Safari ni iPhone real | NO EJECUTADO |
| Piloto Chino Barber | Website aún no creado ni verificado para vincularlo; no asumir venta, contrato o pagos | NO LISTO PARA OPERACIÓN REAL |

## 2. Gate G0 — autorización de entorno (OBLIGATORIO)

**Estado actual: BLOCKED — no ejecutar las rutas comerciales con fixtures sintéticos en producción.**

Registrar antes de comenzar, en el **registro interno privado**:

- [ ] URL del deployment PREVIEW y ID de despliegue; ambos corresponden al mismo SHA completo candidato.
- [ ] Proyecto Supabase Preview distinto del principal y su referencia comprobada por el responsable de infraestructura; ninguna variable pública/privada apunta a producción por error.
- [ ] Versiones de migraciones y cuerpos reconciliados con el candidato (el número «48» por sí solo no demuestra igualdad).
- [ ] Entorno listo para prueba/rollback con respaldo sintético y restauración validada; cero uso de datos de cliente real.
- [ ] Dos identidades owner de prueba autorizadas y una identidad no-owner aislada; roles/credenciales no se publican.
- [ ] Integraciones de cobro, correo externo, Radar, recepcionistas/chatbots e IA externa inactivas para la prueba.
- [ ] Permiso de pruebas documentado, responsable del entorno, plan de limpieza y gasto limitado; ninguna activación o aprovisionamiento implícito.
- [ ] URL probada manualmente y consola sin error de render/hidratación al inicio, registrando navegador, hora y SHA.

**Si falla cualquier casilla de G0: STOP; no simular éxito en ambiente hospedado.**
Responsable de habilitar técnicamente el entorno: CLOUD & SECURITY / autor de infraestructura; QA solo valida evidencia. No pedir ni recopilar secretos en chat o Issue.

## 3. Recorrido UAT manual — ejecutar en este orden

En cada grupo registrar estado PASS / FAIL / BLOCKED / NOT_RUN, timestamp, SHA, plataforma, pasos observados y referencia de evidencia PRIVADA. No completar PASS de forma anticipada.

| Grupo | Casos de la matriz | Acciones a verificar | Evidencia mínima y criterio de salida | Estado |
| --- | --- | --- | --- | --- |
| UAT-01 Auth y permisos | A-01, A-02, A-03, A-04 | Ambos owners abren sesión propia, navegan dashboard/CRM, salen y vuelven; usuario sin acceso intenta SSR/API/descarga; rechazo a vínculos financieros de otro cliente | Acceso paritario de owners; no-owner denegado; cero exposición; resultado por sesión/endpoint | BLOCKED G0 |
| UAT-02 Leads | A-05, A-06, A-07, A-08, A-28 | Crear lead sintético y refrescar; editar contacto; mover entre cinco grupos; Ganado sin contrato bloqueado; Perdido con razón; abrir ficha mediante nombre, historial/nota/archivo, fallo parcial y paginación | Un solo lead; estado real persistido; actor/hora fieles; error no se muestra como historial completo; adjunto no se duplica | BLOCKED G0 |
| UAT-03 Clients 360 | A-09, A-10 | Vincular oportunidad sintética existente; editar cliente y contacto; abrir fichas cruzadas; owner B observa cambios tras recargar | Un vínculo canónico; no venta ficticia; no mezclas de cliente; dos owners sincronizados | BLOCKED G0 |
| UAT-04 Productos / website | A-14, A-15, A-16, A-32 | Añadir website **borrador sin URL** a empresa sintética; inspeccionar ficha; enlace HTTPS solo con origen de prueba autorizado y evidencia; referencia ajena rechazada | Borrador funciona sin URL; ningún producto/publicación/venta se inventa; estado publicado exige evidencia | BLOCKED G0 |
| UAT-05 Cotización / contrato | A-17, A-18, A-19, A-20, A-21 | Recorrer asistente, cuatro modelos, revisiones y errores; inspeccionar preview PDF sin margen interno; descarga no es envío; contrato nace de versión aceptada; venta bloqueada sin verificación de firma sintética | Importes correctos para **fixture de prueba**; versiones íntegramente trazadas; firma no inferida de aceptación/descarga | BLOCKED G0 |
| UAT-06 Ventas / finanzas | A-11, A-12, A-13, A-22, A-23, A-24 | Confirmar venta con contrato sintético verificado; doble envío/recarga; factura/pago parcial/reverso; comisión sin pago verificado rechazada | Una venta y relaciones; contabilidad no duplica ni cruza empresas; reverso y comisión condicionados a evidencia | BLOCKED G0 |
| UAT-07 Errores y recuperación | A-27 | Campos inválidos ES/EN, pérdida de red, sesión caducada y revisión simultánea; reintentar sin duplicar | Mensajes comprensibles; datos no guardados no se muestran como persistidos; entrada recuperable | BLOCKED G0 |
| UAT-08 Safari físico | A-25, A-26 | Probar en iPhone real, teclado, orientación, barra segura, fichas, PDF, adjuntos, VoiceOver y scroll de wizard | Captura/registro con modelo iPhone, iOS, Safari y versión exactos; cero controles inaccesibles | NOT_RUN |
| UAT-09 Radar hibernado | A-29, A-30 | Comprobar que no hay entrada habilitada, cron/config sin ejecución y registros históricos con permisos; revisar salida/consumo por ventana documentada | No llamadas externas al recorrer la UI; logs/costos observados, sin activar Radar | Config OK / end-to-end pendiente |
| UAT-10 Piloto | A-31, A-33 | Ejecutar recorrido sintético extremo a extremo; aparte, revisar pricing/parte legal y autorización del cliente real antes de operar | Owners aceptan evidencia y cláusulas; **Chino Barber real permanece sin operación hasta autorización** | BLOCKED |

**Cobertura:** 33 de 33 criterios A-01…A-33 tienen un grupo de ejecución asignado. Esto NO significa 33 pruebas ejecutadas. Los nombres de empresas y sumas utilizados como fixtures se identifican como simulados, nunca como negocios, cotizaciones o ventas de Avalon.

## 4. Registro de evidencia privado — esquema mínimo

Por cada prueba ejecutada guardar exclusivamente en almacenamiento PRIVADO autorizado:

- ID UAT y A-XX, prueba/revisión, resultado, SHA completo, ID de deployment, ref del entorno, hora con zona.
- Owner de la sesión o alias de tester (sin contraseñas), dispositivo real/versión navegador, idioma, ruta validada y fixture ID sintético.
- Esperado/observado, captura recortada o trace saneado (sin JWT/cookies/PII), y enlace interno a evidencia.
- Fallo: severidad S0-S3, pasos reproducibles, frecuencia, issue dueño del módulo, PR de corrección y retest independiente.
- Aprobación individual de los owners y decisión GO/NO-GO; la marca de QA por sí sola no autoriza despliegue.

**Formato sugerido de línea:** ID | A-XX | RUN/FAIL/BLOCKED | SHA | Deployment ID | entorno | dispositivo | hora | evidencia privada | owner revisor.

## 5. Clasificación de bloqueos — NO son bugs productivos confirmados

| Clave | Estado | Interpretación | Siguiente responsable |
| --- | --- | --- | --- |
| ENV-01 | OPEN / G0 BLOQUEADO | Preview de QA cancelada por bloqueo deliberado ante referencia de DB productiva. No es fallo de compilación | CLOUD & SECURITY: preparar Preview verdaderamente aislada, con aprobación separada |
| ACCEPT-01 | PENDIENTE | Falta ejecución con dos sesiones owner y un outsider, en entorno autorizado | QA + Miguel/Samuel |
| SAFARI-01 | PENDIENTE | Falta iPhone/Safari físico y evidencia reproducible | QA + propietarios |
| BIZ-01 | PENDIENTE | Precios, comisiones, nombre legal de contraparte y contrato para piloto real no aceptados aquí | BUSINESS STRATEGY, FINANCE & KPIs, LEGAL & COMPLIANCE |
| COST-01 | PENDIENTE | Suspensión de Radar confirmada por config/código, pero no observación continua de egress/costo | CLOUD & SECURITY |
| REACT-418 | HISTÓRICO CORREGIDO / VIGILAR | PR #255 + CI posterior indican corrección y Sales E2E verde; no reabrir sin fallo nuevo en SHA de candidato | QA vigila regresión |

## 6. Dictamen y handoff

**Decisión actual: NO-GO para piloto comercial real por ausencia de aceptación hospedada; no porque haya sido confirmado un fallo crítico nuevo.** No ejecutar pruebas sintéticas sobre producción. No forzar despliegues cancelados ni reutilizar ramas ajenas sin permiso. No llamar al CRM del cliente «entregado» porque una ficha o URL se registró.

**Next action para PROJECT MANAGER:** asignar a CLOUD & SECURITY la preparación y evidencia de una Preview aislada (G0). Una vez autorizada, QA registra UAT-01 a UAT-10 y los owners hacen aceptación física en iPhone. Si surge un defecto verdadero, abrir uno solo con reproducción exacta; no duplicar pruebas de Codex/Claude ni editar su runtime.

**Trazabilidad:** https://github.com/avaloncoreagency/Avalon-code/pull/276 · https://github.com/avaloncoreagency/Avalon-code/issues/253.
