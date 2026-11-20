# Avalon OS — Matriz de aceptación funcional y control QA v1

**Fecha:** 2026-11-20 · **Departamento:** Quality Assurance · **Issue de coordinación:** #253 (owner:miguel, module:qa)  
**Baseline de código verificado:** main @ 207ed3a3dc8fdae5dd949a7361733e441c530519 (merge PR #262).  
**Rama de documentación:** qa/avalon-os-acceptance-matrix-20261120.  
**Decisión de release:** NO CERTIFICADO PARA PILOTO REAL hasta completar las pruebas de aceptación alojada, seguridad/aislamiento, iPhone Safari físico y aprobaciones comerciales.

> Documento de criterios y trazabilidad, no constancia de ejecución manual ni certificado de producción. No modifica runtime, bases de datos, CRM, seguridad, tests de Codex ni portal de empleados. Evidencia de cliente real y credenciales se guardan fuera del repositorio público.

## 1. Resumen ejecutivo

**Objetivo:** garantizar que Miguel y Samuel puedan realizar el ciclo comercial lead → cliente → cotización → contrato → venta → producto/website → factura → pago sin pérdida de datos, duplicados, permisos indebidos ni estados falsos, antes de utilizar el piloto Chino Barber.

**Alcance:** login/roles, Leads Pipeline, Clients 360, Ventas, productos y websites, Quoting Studio, Contract Studio, facturas/pagos/comisiones, formularios/errores, movilidad, Radar pausado y aceptación del piloto.

**Fuera de alcance:** modificar el portal de empleados; activar Radar, chatbots, AI Receptionists, motores IA o proveedores pagos; publicar dominios; asumir multitenancy de clientes finales; editar producción; recrear tests ya implementados por Codex/Claude.

**Resultado esperado:** una matriz ejecutable en Preview aislada y una decisión GO/NO-GO firmada por ambos propietarios con evidencia por commit, dispositivo y operación. La CI es una condición necesaria pero NO sustituye validación real.

## 2. Hallazgos verificados y límites

| ID | Hecho observado mediante repositorio / GitHub Actions | Clasificación | Referencia |
|---|---|---|---|
| E-01 | PR #255 está fusionado; contiene el backport de React #418, el verificador postbuild y regresiones de recarga. El reporte del autor documenta 600 recargas sin #418 y Sales E2E 3/3. | VERIFICADO: integración y evidencia reportada; NO equivale a Safari real | https://github.com/avaloncoreagency/Avalon-code/pull/255 ; docs/recovery/REACT_418_ROOT_CAUSE.md |
| E-02 | En PR #262 head dc31998324c7620ea6e83298127cedc3fe16817b, Sales core CI run 44746566466 terminó SUCCESS; el job de navegador ejecutó tests/rest-bridge.http.cjs + tests/sales.browser.cjs, npm test y build. | VERIFICADO: CI Chromium sintético | https://github.com/avaloncoreagency/Avalon-code/actions/runs/44746566466 |
| E-03 | En el mismo head, CRM isolated CI run 44746566481 terminó SUCCESS e incluye tests CRM, quotes y product-delivery. Auth, seguridad y módulos también reportan SUCCESS. | VERIFICADO: workflows, no sesión humana | https://github.com/avaloncoreagency/Avalon-code/actions/runs/44746566481 |
| E-04 | PR #254 está fusionado a través de #255 y cubre QA independiente y límites multicliente; Issue #253 sigue abierto. | VERIFICADO: entrega integrada, aceptación final pendiente | https://github.com/avaloncoreagency/Avalon-code/pull/254 ; https://github.com/avaloncoreagency/Avalon-code/issues/253 |
| E-05 | PR #262 está fusionado. Su documentación reporta worker Radar v11 de hibernación (423), JWT obligatorio y cron inactivo. | VERIFICADO: integración; estado remoto solo reportado por autor, requiere verificación operacional independiente | https://github.com/avaloncoreagency/Avalon-code/pull/262 |
| E-06 | El registro existente de 40 casos indica expresamente SPECIFIED / NOT EXECUTED como matriz integral; los reportes antiguos reflejan SHAs anteriores. | VERIFICADO: no elevar estados históricos a PASS | docs/commercial-foundation/QA_ACCEPTANCE.md |
| E-07 | No se ha presentado evidencia de Safari real en iPhone ni de aceptación hospedada por los dos owners sobre el mismo SHA. | PENDIENTE de ejecutar | docs/independent-qa/MULTICLIENT_RUNBOOK.md |
| E-08 | PR #259 ya propone gates automatizados de preparación/aislamiento, por lo que no deben implementarse nuevamente en esta rama. | VERIFICADO: trabajo paralelo existente, aún pendiente de evaluación | https://github.com/avaloncoreagency/Avalon-code/pull/259 |

**Criterio para React #418 / Sales E2E:** no registrar estos incidentes históricos como “actualmente abiertos” basándose en un reporte viejo. Crear un nuevo defecto solo si el build/Preview en SHA exacto vuelve a producir #418, pageerror, pérdida de UI o un fallo reproducible, con artefacto/log y navegador identificados.

## 3. Taxonomía de estados QA

- **VERIFICADO-CI:** una prueba o job identificable terminó correctamente en un commit exacto; no demuestra sesión real ni Safari.
- **PENDIENTE-MANUAL:** falta escenario en Preview con usuario autorizado y comprobación de persistencia.
- **PENDIENTE-REMOTO:** el repositorio contiene la implementación pero falta contraste con el proveedor operativo.
- **BLOQUEADO:** requisito esencial fallido o sin acceso seguro al entorno necesario.
- **NO-APLICA:** fuera del alcance del piloto actual (por ejemplo, Radar como generador de leads).
- **CERTIFICADO:** todos los gates esenciales aprobados con evidencia y aceptación humana explícita. No utilizar hasta entonces.

## 4. Matriz funcional de aceptación

| Caso | Módulo / prioridad | Prueba y resultado exigido | Reutilizar evidencia existente | Estado |
|---|---|---|---|---|
| A-01 | Login P0 | Miguel entra con su propia contraseña y alcanza Dashboard y CRM; cierre/reingreso sin sesión prestada. | auth integration y Auth Review CI | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-02 | Login P0 | Samuel accede a los mismos módulos con privilegios owner equivalentes; sin contraseña compartida. | auth integration | PENDIENTE-MANUAL |
| A-03 | Permisos P0 | No autenticado y no-owner reciben denegación en SSR, API y descarga; sin fuga de contenido. | auth/RLS suites; independent QA | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-04 | Permisos P0 | Datos de clientes A/B no se pueden cruzar en factura, proyecto, archivos o pagos; no confundir owner CRM con login de cliente final. | independent QA / core-engine DB | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-05 | Leads P0 | Crear lead manual desde la primera acción visible; persistir nombre, teléfono, correo, sector, ubicación y notas tras recargar. | crm-intelligence.browser; sales.browser | PENDIENTE-MANUAL |
| A-06 | Leads P0 | Cinco grupos visibles: Nuevo, En conversación, Propuesta, Ganado, Perdido. Mover una tarjeta directo, con alternativa táctil/teclado y control de versión; histórico no se destruye. | pipeline-board DB; CI CRM | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-07 | Leads P1 | Tocar nombre abre ficha del lead, no Clients 360; historial atribuye actor/hora/cambio; nota+archivo no se duplica al reintentar. | issue #253 y sales browser | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-08 | Leads P0 | No se puede marcar Ganado sin venta/contrato validado; Perdido exige motivo, y las etapas personalizadas no se ocultan. | pipeline DB | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-09 | Clients 360 P0 | Cliente con oportunidad vinculada muestra stage correcto; editar contacto y datos comerciales no produce duplicado ni venta ficticia. | client-opportunity-link.database | PENDIENTE-MANUAL |
| A-10 | Clients 360 P1 | Perfil muestra cotizaciones, contratos, ventas, productos, tareas y finanzas que pertenecen SOLO a ese cliente; cambios por owner B se reflejan a owner A. | sales.browser; core-engine DB | PENDIENTE-MANUAL |
| A-11 | Ventas P0 | Venta exige contrato verificado; al confirmar, genera las relaciones correctas y el lead pasa a Ganado. | sales DB/browser, Core Engine | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-12 | Ventas P0 | Doble clic, refresh, reenviar request o latencia no producen dos ventas, órdenes o proyectos. | sales browser / idempotencia DB | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-13 | Ventas P1 | Venta anulada/ajustada no altera dinero histórico sin evidencia; error evita mostrar “guardado” sin confirmación de servidor. | Core Engine tests | PENDIENTE-MANUAL |
| A-14 | Productos P0 | Desde Clients 360 crear website como Borrador sin URL: guardar referencia, categoría y cliente correctos. | product-delivery DB | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-15 | Productos P0 | Añadir una URL HTTPS posteriormente, verificar propiedad/evidencia; “Publicado y verificado” no aparece antes. | product-delivery tests | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-16 | Productos P0 | Productos no se vinculan a otro cliente por ID manipulado; enlace externo no simula código publicado ni crea venta. | product-bridge / RLS | PENDIENTE-MANUAL |
| A-17 | Cotizaciones P0 | Asistente 5 pasos admite fijo, mensual, comisión e híbrido; totales en centavos exactos, costos de terceros fuera del ingreso Avalon. | quotes.unit/database/browser | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-18 | Cotizaciones P0 | Borrador → revisión → aprobación → envío manual → aceptación/rechazo: guardas, notas y versión inmutable; vencida no se acepta. | quotes.database/browser | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-19 | Cotizaciones P0 | Vista previa PDF antes de descarga; contenido interno/margen no sale en PDF; descargar NO equivale a enviar. | quotes tests y PDF byte checks | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-20 | Contratos P0 | Crear desde versión aceptada de cotización del mismo cliente; preview profesional, campos legales reales y ninguna firma inventada. | quotes.browser / contracts tests | PENDIENTE-MANUAL |
| A-21 | Contratos P0 | Solo contrato firmado y verificado con evidencia habilita venta; la versión/archivo final conserva integridad. | verified-contract helper / sales | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-22 | Facturas P0 | Factura vinculada a contrato/venta correctos; importes, pagos parciales y saldo no duplicados ni por encima del contratado. | core-engine.database | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-23 | Pagos P0 | Pago con evidencia verificada, reverso con razón y referencia bancaria idempotente; reverso no figura como cobrado. | core-engine.database/UI | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-24 | Comisiones P0 | Comisión no devengada sin pago verificado; acordada → devengada → pagada solo con términos firmados y evidencia. | core-engine tests | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-25 | Móvil P1 | Safari físico: 320–430 px, portrait/landscape, áreas seguras, modal, scroll y arrastre/selector de stages utilizables sin zoom forzado. | Cobertura Chromium no certifica Safari | PENDIENTE-MANUAL |
| A-26 | Móvil P1 | Formulario, adjuntos, cámara/archivos y vista previa/descarga PDF accesibles en iPhone; sin tap targets superpuestos. | Capturas Chromium sintéticas | PENDIENTE-MANUAL |
| A-27 | Formularios P1 | Campos inválidos, duplicados, caída de red y sesión expirada muestran error claro ES/EN y conservan entrada no guardada. | unit/browser existing; manual red | PENDIENTE-MANUAL |
| A-28 | Historial P1 | Fallo parcial en consultas no se presenta como historial completo; paginación informa límite; foco vuelve al botón de origen. | PR #255 / independent QA | VERIFICADO-CI / PENDIENTE-MANUAL |
| A-29 | Radar P0 | No hay entrada activa, botón de búsqueda o salida a proveedores; el worker hibernado y cron se validan por evidencia remota, sin reactivar. | radar-hibernation.test; PR #262 | PENDIENTE-REMOTO |
| A-30 | Radar P1 | Registros históricos conservados y accesibles solo según permisos; no se consumen nuevos créditos por ruta suspendida. | PR #262 / plan reactivación | PENDIENTE-REMOTO |
| A-31 | Chino Barber P0 | En Preview aislada crear oportunidad sintética y recorrer toda la cadena sin usar contactos, pagos ni credenciales reales. | PILOT_CHINO_BARBER_CHECKLIST | PENDIENTE-MANUAL |
| A-32 | Chino Barber P0 | Website todavía inexistente debe quedar en Borrador; no inventar URL, venta, firma, aprobación o pago. | product-delivery tests | PENDIENTE-MANUAL |
| A-33 | Chino Barber P0 | Aceptación comercial real exige identidad contractual correcta, precio aprobado, firma, políticas, permiso financiero y owners conformes. | Checklist piloto + legal/finance | BLOQUEADO por decisiones/evidencia |

La frase “VERIFICADO-CI / PENDIENTE-MANUAL” significa cobertura automatizada reportada en los workflows indicados, **NO** que cada paso haya sido aceptado por un humano. La condición CI puede degradarse si el SHA cambia; volver a revisar sobre el candidate head.

## 5. Plan de ejecución sin duplicar Codex

**Fase 0 — Inventario y baseline (QA, lectura):** fijar SHA, branch, entorno, migraciones y PRs activos; levantar referencias actuales. Aceptación: no se usa historial como si fuese CI del candidato nuevo.

**Fase 1 — CI automatizada (aprovechar existente):** comprobar Auth Review, Security, CRM isolated, Sales core, módulos e independent QA. Revisar jobs individuales, no solo “Vercel READY”; comprobar que los pasos de navegador ejecutaron de verdad. No agregar tests que ya cubran estos casos.

**Fase 2 — Preview aislada:** staging Supabase distinto de producción; cuentas sintéticas autorizadas y revocables; verificar dos owners y outsider, recargas, transiciones, cotización→contrato→venta→finanzas, productos borrador/URL, errores y RLS. Guardar evidencia interna sin exponer clientes. No realizar cobros reales.

**Fase 3 — iPhone físico:** ejecutar checklist §7 usando Safari real; grabar dispositivo, iOS, ancho/orientación, URL SHA, pasos y capturas anonimizadas. Chrome móvil emulado solo sirve como preparación.

**Fase 4 — aceptación de negocio y piloto:** owners validan el flujo real en entorno controlado; finanzas confirma precios/comisiones, legal confirma parte contratante y contrato, infraestructura revisa backups/dominios. GO únicamente al cumplir §6.

## 6. Matriz de severidad y gates de liberación

| Nivel | Ejemplos | Plazo de decisión | Gate |
|---|---|---|---|
| **S0 — crítico** | Lectura/escritura fuera de permisos, fuga de datos, cargo no autorizado, datos irreversiblemente perdidos, acceso a producción desde Preview. | Escalar inmediatamente; detener prueba afectada | NO-GO absoluto |
| **S1 — alto** | No inicia sesión un owner, no se confirma venta legítima, venta duplicada, ganada sin contrato, pago/comisión inexacta, Radar llama proveedores suspendido. | Corregir antes de piloto | NO-GO |
| **S2 — medio** | Error recuperable de formulario, historial parcial sin aviso, arrastre imposible sin alternativa, PDF ilegible en móvil. | Corregir o documentar excepción explícita si fuera del camino esencial | Bloquea si afecta el recorrido del piloto |
| **S3 — bajo** | Copia, espaciado o animación secundaria sin pérdida de funcionalidad. | Backlog con responsable | Puede quedar pendiente con aceptación |

**GO para piloto controlado:** no S0/S1 abierto; ningún S2 en flujo esencial; mismos SHAs para build y pruebas; Preview aislada; RLS/identidad revisadas; pruebas ES/EN + Safari físico; restauración/rollback; Radar sin egress; catálogo legal/precios/contratos y autorización final documentada. Si falta prueba, estado PENDIENTE, no PASS.

## 7. Checklist de aceptación en iPhone real

Registrar modelo, versión iOS, versión Safari, fecha, red, idioma, SHA y URL antes de marcar casillas.

- [ ] Login, error de contraseña, recuperación y logout; no sesión cruzada.
- [ ] 320/375/390/430 px representativos (usar dispositivo real disponible; no fingir que un modelo cubre todos).
- [ ] Safe areas arriba/abajo, teclado virtual y zoom; ninguna acción oculta bajo barras Safari.
- [ ] Navegación Dashboard → CRM → Leads → ficha → Clients 360 → Ventas.
- [ ] Crear/editar lead con teclado, autocompletar, guardar y recargar.
- [ ] Mover lead entre grupos no adyacentes usando gesto o alternativa accesible sin scrolling interminable.
- [ ] Abrir timeline; nota, archivo/foto, historial, paginación y cierre con retorno de foco.
- [ ] Cotización de 5 pasos: scroll horizontal del wizard, precios, validaciones y resumen.
- [ ] Preview PDF en Safari, descargar/compartir sin confundir descarga con envío.
- [ ] Crear contrato en borrador y revisar sus páginas; no confirmar firma sin evidencia.
- [ ] Visualizar producto Borrador sin URL y después URL HTTPS de prueba autorizada.
- [ ] Probar red lenta/desconexión y expiración de sesión: datos no confirmados no aparentan haberse guardado.
- [ ] Comprobar orientación horizontal, textos grandes y VoiceOver básico: nombres, orden de foco y acciones alternativas.
- [ ] Cero errores de consola/red relevantes durante el recorrido; adjuntar evidencia depurada.
- [ ] Samuel y Miguel firman aceptación de sus propias sesiones; QA no sustituye esa firma.

## 8. Protocolo de defectos

**ID:** QA-AAAAMMDD-NNN. **Campos obligatorios:** título concreto; severidad S0–S3; escenario A-XX; rama y SHA completo; entorno y Preview URL autorizada; dispositivo/navegador/versiones; prerequisitos con fixture sintético; pasos numerados para reproducir; esperado; observado; frecuencia; timestamp; evidencia de consola/network/imagen redactada; riesgo sobre datos/privacidad; responsable según Issue; estado; fix SHA/PR; regresión ejecutada y resultado; aceptación final por otra persona.

**Estados:** Nuevo → Reproducido → Asignado → En corrección → En retest → Verificado / Reabierto / No reproducible (evidencia) / Fuera de alcance. “No reproducible” no equivale a “corregido”.

**Regla anti-duplicación:** antes de abrir un bug comprobar Issue/PR, la rama propietaria y SHA. P0/S1 se comunica al PROJECT MANAGER y al responsable del módulo; QA adjunta pasos y evidencia, sin reescribir archivos reclamados por Claude, Codex o Samuel. No guardar datos de clientes ni secretos en un Issue público.

**Regla de regresión:** volver a probar exactamente el escenario defectuoso, un negativo de permisos, un flujo adyacente y el uso en iPhone si el cambio afecta UX. Documentar el nuevo SHA. Nunca “resolver” eliminando una aserción, aumentando un timeout sin investigar o silenciando errores de hidratación.

## 9. Riesgos, dependencias y decisiones

**Riesgos activos:**
1. CI verde sintética NO demuestra Preview con Supabase correctamente aislado, dos sesiones humanas, continuidad remota o Safari real.
2. La app es CRM interno de una agencia; no se ha certificado como SaaS con login de clientes finales.
3. El Radar podría quedar mal configurado remotamente pese a que el repo contiene suspensión; validar función/scheduler/egress en proveedor antes de afirmar cero consumo.
4. Precios de servicios, términos de comisión, identidad legal del proveedor y firma todavía requieren decisión humana para cualquier venta real.
5. PR #259 implementa gates complementarios: revisar/aceptar sin crear un segundo sistema de release. PR #233 corresponde al portal de empleados; fuera de alcance.

**Decisiones pendientes de Miguel y Samuel:**
- Identificar Preview aislada aprobada y dos sesiones owner para el recorrido, más un usuario externo de pruebas.
- Aceptar la política S0/S1 sin excepciones y definir quién firma GO/NO-GO y el registro privado de evidencia.
- Aprobar precios, esquema contractual real y eventuales comisiones del piloto; acordar responsable de finanzas/legales.
- Elegir iPhone(s) reales y fecha de prueba sin considerar emulación como aprobación.
- Autorizar cualquier futuro deploy, migración o habilitación; este documento no los ejecuta.

## 10. Entregables preparados y próximas tres acciones

1. **Matriz de 33 casos:** este documento. Conserva y enlaza la matriz de 40 casos históricos sin cambiar sus resultados no ejecutados.
2. **Plan y gates:** fases 0–4, severidad, criterios GO/NO-GO, plantilla de defectos y checklist Safari físico incluidos.
3. **Sin implementación repetida:** referenciar tests/sales.browser.cjs, tests/quotes.browser.cjs, tests/crm-intelligence.browser.cjs, tests/independent-qa/, tests/react-hydration-backport.test.cjs y tests/radar-hibernation.test.cjs, sin reescribirlos.

**Tres acciones siguientes:**
1. PM y QA fijan candidato/Preview aislada y producen hoja de evidencia por A-01…A-33.
2. Miguel y Samuel realizan recorrido end-to-end con usuarios autorizados y pruebas negativas; QA registra defectos con SHA/artefactos y solicita corrección al dueño correspondiente.
3. Repetir en Safari/iPhone real, revisar finanzas/legal/rollback y emitir veredicto GO/NO-GO con firmas; el piloto no debe empezar antes.

## HANDOFF AL PROJECT MANAGER

- **Departamento:** AVALON | QUALITY ASSURANCE
- **Misión:** aceptación funcional v1 + preparación del piloto Chino Barber.
- **Baseline validado:** main@207ed3a3dc8fdae5dd949a7361733e441c530519; PRs #255, #262, #254 fusionados.
- **CI verificada:** Sales run 44746566466 SUCCESS (browser sintético realmente ejecutado), CRM run 44746566481 SUCCESS, otros jobs principales SUCCESS en head dc31998324c7620ea6e83298127cedc3fe16817b. Esto no certifica PRs posteriores.
- **React #418 y Sales E2E:** corregido/verde en la evidencia actual de CI; reabrir solo con reproducción en nuevo SHA.
- **Radar:** suspensión integrada; verificación remota de zero-egress aún solicitada, no reactivar.
- **Entrega:** docs/quality/AVALON_OS_ACCEPTANCE_MATRIX_V1_20261120.md, solo documentación.
- **Trabajo no realizado:** no se ejecutó Safari físico, no se autenticó contra Preview, no se modificó código/DB/proveedores, no se creó cliente/venta/factura/pago real.
- **Estado global:** PENDIENTE DE ACEPTACIÓN / NO-GO para piloto real.
- **Next action:** programar sesión humana en Preview aislada, conservar evidencia confidencial y decidir release conforme a §6.
