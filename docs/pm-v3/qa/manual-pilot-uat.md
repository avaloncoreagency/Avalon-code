# QA-V3-01 — Guion manual de aceptación del piloto Avalon OS (ES/EN + Safari)

**Departamento propietario:** QUALITY_ASSURANCE (este chat; identidad del operador GitHub no verificada independientemente).  
**Coordinación:** [backlog #303](https://github.com/avaloncoreagency/Avalon-code/issues/303), [admisión #304](https://github.com/avaloncoreagency/Avalon-code/issues/304).  
**Baseline consultado al preparar el guion:** `main@a04d718bba21b7ec4821dcd7b108c982c5e032eb` (2026-11-24). **El ejecutor deberá registrar el SHA FINAL de prueba**, que puede ser distinto.  
**Estado de este documento:** PREPARADO / **15 CASOS NOT_RUN**. No sustituye CI, no acredita Safari físico ni autoriza publicación.  
**Ámbito exclusivo:** aceptación manual del recorrido solicitud → lead → Clients 360 → cotización → contrato → venta → factura/pago, con dos owners y errores. No se modifica ningún test automatizado ni se añade runtime.

## 1. Preflight G0 — no comenzar sin aislamiento

El responsable de CLOUD & SECURITY documenta en un **registro privado**: ID y URL del deployment Preview; SHA completo coincidente con el código y la CI; referencia Supabase de pruebas **distinta de producción**; migraciones y RLS cotejadas; respaldo/restauración de los **datos sintéticos**; identidades owner-A, owner-B y non-owner-C autorizadas; integraciones salientes/cobros reales/SMTP externo apagados; plan de limpieza y responsable; permiso de ejecución. Las capturas/evidencias privadas no se adjuntan a un repositorio público. No colocar credenciales, cookies, tokens, correos o datos reales en Issues.

**STOP inmediato** si Preview apunta a Supabase productivo o Vercel cancela el build con `blocked_unsafe_preview_database`. No desactivar ni sustituir esa protección para pasar este guion. No usar clientes reales, llamadas comerciales, procesadores de pago, contratos vinculantes ni proveedores de IA. Radar, Guardian, recepcionistas y chatbots comerciales siguen suspendidos.

**Fixture exclusivamente sintético:** Empresa-A y Empresa-B, lead-A1 y lead-A2 (mismo cliente, distinta necesidad), cotización Q-A1, contrato C-A1, venta S-A1, factura I-A1 y recibos de formulario R-A1/R-A2. Importe de ensayo opcional: USD 100.00 con un pago de prueba USD 25.00, sin movimiento bancario; **no es precio aprobado de Avalon**. Usar cuentas de prueba en dominios de ejemplo que no entreguen correo externo. `owner-A/B/non-owner-C` son roles de ensayo, no usuarios reales.

## 2. Matriz ejecutable — 15 casos (todos NOT_RUN)

Registrar cada caso en una **copia privada**, sin sobrescribir los estados de esta especificación. Un caso puede ser PASS, FAIL, BLOCKED o NOT_RUN únicamente con evidencia.

| Caso / relación con matriz actual | Prioridad | Actor / pasos manuales en Preview autorizada | Resultado observable para PASS | Estado |
|---|---|---|---|---|
| **M01 — G0 / A-01** | P0 | Responsable confirma URL, SHA, proyecto de BD aislado, CI exacta, dispositivos y credenciales de ensayo. | Coincidencia demostrable de referencias; ningún dato o servicio real conectado; la guardia de Preview permanece activa. | NOT_RUN |
| **M02 — Auth / A-01–A-02** | P0 | Owner-A y owner-B ingresan por separado, navegan CRM/Ventas, cierran sesión y vuelven a entrar; comprobar EN/ES. | Sesiones aisladas y ambos con privilegios de owner válidos; no compartir sesión ni depender del alias del correo para autorizar. | NOT_RUN |
| **M03 — Acceso negativo / A-03–A-04** | P0 | Sin sesión y con non-owner-C, intentar abrir fichas, endpoints y documentos sintéticos solo para owners; probar IDs de Empresa-B. | Denegación en servidor/API/RLS sin datos sensibles, incluso por URL directa; no confundir ocultar un botón con proteger acceso. | NOT_RUN |
| **M04 — Solicitud válida / INB-01–02** | P0 | Desde formulario público enviar una solicitud sintética completa en ES; repetir con otro fixture en EN; volver a la bandeja como owner. | Confirmación corresponde a un recibo persistido; idioma y texto completos; no crea venta, pago ni contrato automáticamente. | NOT_RUN |
| **M05 — Entrada negativa / INB-03–10** | P0 | En el entorno aislado probar campos inválidos, honeypot, intento repetido y ruta pública directa **solo según procedimiento aprobado por Seguridad**. | Validación segura, límite/antibot no eludible y ningún recibo espurio; formulario legítimo sigue operando. **Sin test de seguridad aprobado: BLOCKED.** | NOT_RUN |
| **M06 — Mensajes repetidos / INB-14** | P0 | Enviar R-A1 y R-A2 con mismo correo ficticio y mensajes diferentes; abrir ambos en la bandeja y recargar. | Dos recibos con sus textos recuperables y un prospecto canónico cuando corresponda; no se pierde el segundo texto ni se hereda una etiqueta promocional errónea. | NOT_RUN |
| **M07 — Pipeline / A-05–A-08** | P0 | Convertir/crear lead-A1, editar notas, mover por estados; probar «Ganado» sin venta verificada y «Perdido» sin motivo. | Persistencia y trazabilidad; operaciones inválidas rechazadas; sin historial falso ni duplicados por doble toque. | NOT_RUN |
| **M08 — Clients 360 / A-09–A-10** | P0 | Asociar A1 a Empresa-A y crear A2 en otra etapa; abrir y refrescar ambas oportunidades con owner-B; inspeccionar Empresa-B. | Un cliente con dos oportunidades independientes, estatus propios, sin mezcla entre empresas ni venta inventada. | NOT_RUN |
| **M09 — Cotización y cálculo / A-17–A-18** | P0 | Elaborar Q-A1 con modelos fijo, mensual, comisión e híbrido usando importes sintéticos; guardar, revisar, volver y editar borrador. | Centavos correctos, detalle de costos de terceros separado, condiciones no aprobadas marcadas como propuestas y versiones trazables. | NOT_RUN |
| **M10 — Control de edición/eliminación de quote** | P1 | Como owner-A editar un borrador; solicitar eliminar con diálogo de confirmación; cancelar una vez; repetir con non-owner-C. | Solo owner autorizado modifica/elimina; cancelar no borra; versión ya aceptada no se cambia silenciosamente. | NOT_RUN |
| **M11 — PDF y marca / A-19** | P1 | Previsualizar y descargar PDF de Q-A1 en ES/EN, comparar total/versión; revisar logo oficial y diseño marfil/beige; imprimir desde navegador autorizado. | Descarga no equivale a envío; PDF legible, marca correcta, sin datos internos o recortes, con totales y versión idénticos a la cotización. | NOT_RUN |
| **M12 — Contrato / A-20–A-21** | P0 | Crear borrador C-A1 desde versión aceptada; revisar cláusulas y previsualizar; intentar venta sin evidencia sintética de firma. | No se inventa firma, consentimiento ni aprobación legal; venta bloqueada hasta verificación explícita; documento/versiones relacionados con Empresa-A. | NOT_RUN |
| **M13 — Venta e idempotencia / A-11–A-12** | P0 | Con fixture de contrato verificado y aprobado solo en entorno de prueba, confirmar S-A1 dos veces bajo latencia/reload; revisar lead-A1 y lead-A2. | Una sola venta, empresa/contrato correctos, solo A1 pasa al estado procedente; A2 permanece en su estado previo. | NOT_RUN |
| **M14 — Invoice, pago y comisión / A-13, A-22–A-24** | P0 | Abrir/descargar invoice I-A1, registrar pago ficticio USD 25 sin verificar, luego verificar y revertir en el flujo de pruebas; intentar comisión antes de verificación. | Invoice imprimible y ligado a S-A1; registro, conciliación y reverso diferenciados; saldos y KPI correctos; no se paga/devenga comisión sin reglas y evidencia aprobadas. | NOT_RUN |
| **M15 — Safari/EN-ES y recuperación / A-25–A-27** | P1 | En iPhone **físico**, repetir controles críticos de M04, M08, M09, M11 y M13 en ES/EN; probar teclado, VoiceOver, safe areas, scroll del lead, orientación, fallo de red/reintento. | Sin scroll atrapado, solapamiento, doble registro, errores de foco o pérdida silenciosa; registrar modelo, iOS, Safari, idioma y captura privada; emulación Chromium NO basta. | NOT_RUN |

## 3. Registro privado de evidencia (plantilla, no completada)

| Campo obligatorio | Registrar al ejecutar |
|---|---|
| ID caso / severidad | `Mxx` / S0–S3 (solo si FAIL) |
| Build | SHA completo, PR/merge, deployment ID y URL de Preview autorizada |
| Backend | Proyecto Supabase de pruebas identificado privadamente y migraciones verificadas |
| Operador | Owner-A / owner-B / QA externo o non-owner-C; evidencia de autorización, no credenciales |
| Dispositivo | Real/emulado, marca/modelo, SO, navegador/versión, ES/EN |
| Resultado | PASS / FAIL / BLOCKED / NOT_RUN + comportamiento observado frente al esperado |
| Evidencia | Identificador de carpeta **privada** de captura/video/log saneado, hora y pasos para reproducir |
| Retest / decisión | SHA corregido, validador independiente, estado del defecto y decisión GO/NO-GO |

**Severidad:** S0 exposición de credenciales/datos o corrupción grave; S1 fallo en aislamiento, seguridad, integridad financiera o estados esenciales; S2 error funcional reversible/UX importante; S3 cosmético. Un S0/S1 sin resolver implica NO-GO.

## 4. Gates antes de cualquier GO

- [ ] G0: Preview y backend inequívocamente aislados, guardia intacta; migraciones/backup verificadas.
- [ ] G1: checks aplicables al **mismo SHA** (Auth, Security/RLS, CRM, Sales, QA independiente), con jobs y logs reales; no comparar SHAs distintos.
- [ ] G2: los 15 casos clasificados con evidencia; P0 PASS sin S0/S1 abiertos. Un BLOCKED no equivale a PASS.
- [ ] G3: Safari físico/ES-EN ejecutado, incluyendo errores y recuperación; nunca sustituir por emulación.
- [ ] G4: revisión de privacidad, contratos, precios y términos por responsables; aprobación explícita de Miguel y Samuel.
- [ ] G5: decisión operativa GO/NO-GO y plan de rollback registrado **antes** de publicación. QA puede recomendar, no ejecutar merge ni deploy.

**Criterio de aceptación documental de esta misión:** esta guía existe en ruta reservada de QA, cubre 15 casos (positivo/negativo, ES/EN, dos owners, iPhone), cita la matriz previa, deja todos NOT_RUN, no crea pruebas de Codex ni datos reales y se entrega por PR **draft**, sin integración.

## 5. Handoff exclusivo a PROJECT MANAGER

**ID:** QA-V3-01 · **Prioridad:** P1 · **Responsable funcional:** QUALITY_ASSURANCE.  
**Entregable:** este guion manual, complementario a [matriz A-01–A-33](../../quality/AVALON_OS_ACCEPTANCE_MATRIX_V1_20261120.md) y [hoja UAT-01–10](../../quality/AVALON_OS_UAT_EXECUTION_RUNSHEET_V1_20261120.md).  
**Dependencias:** CLOUD & SECURITY habilita aislamiento; Codex presenta evidencia CI sin delegar su suite; Product Studio/Finance/Legal validan experiencia y términos; Miguel y Samuel aprueban la sesión y el piloto.  
**Estado de ejecución manual:** NOT_RUN. **Decisión de producto:** NO-GO hasta gates completos.  
**Next action:** PM revisa la reserva y el PR draft de esta guía; asigna una sesión de prueba solo cuando exista Preview segura y propietario de ejecución. Ninguna orden a otro chat se presume recibida automáticamente.
