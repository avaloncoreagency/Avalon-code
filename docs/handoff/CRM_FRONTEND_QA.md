# CRM Command Center — aceptación frontend

Fecha: 2026-11-16 · America/New_York. Base inspeccionada: `c9a3fec80422c435d6a3de36b7309947cd32ccd5`. Rama propia: `codex/command-center-20261116`. Referencias: #23, #179, #191. El HEAD y los resultados remotos exactos figuran en la PR de esta rama.

## C0 · Inventario y aislamiento

No se reconstruye el CRM. Se conservan tablas, las 13 etapas, acciones/RPC, validación de contratos, membresías y RLS. El contrato `CRM_BACKEND_CONTRACT.md` contiene instrucciones históricas sobre ramas; se contrastó con el código de main actual, que ya incluye las integraciones anteriores.

- Root CRM abre Leads Pipeline; se preservan `/overview`, `/desk`, `/lead/[id]`, ventas, clientes, calendario y tareas.
- `LeadWorkbench` ya ofrece Quick Add, seguimientos y diagnósticos. `Crm` conserva lista/Kanban, filtros, persistencia por versión y errores del servidor.
- Clientes 360° ya tiene perfil propio, herramientas por ID, proyectos, ventas, documentos, expediente, historial y contratos privados. Se reutiliza.
- Ventas y PDFs contractuales ya existen. Los importes se leen del contrato financiero del servidor; no se reemplazan por cálculos transaccionales del frontend.
- Adjuntos de #179: galería y selección desde notas ya construidas en main; no se crea otra tabla/bucket/receptor.
- Calendario: vistas mes/semana/día, banners y control de conflictos ya implementados. Tareas y Radar tienen recorridos existentes.
- PR #205 reclama `overview.tsx` y créditos; PR #217 reclama bridges. Se excluyen esos archivos, homepage pública, Supabase/migraciones, APIs y acciones del servidor.
- Graphify indexaba `343c57c`, no el HEAD c9a3fec: navegación solamente, fuente de verdad GitHub y archivos actuales.

## C1 · Jornada y navegación

Se añaden a la jornada existente conteos exactos de prospectos pendientes y tareas vencidas, proyectos marcados activos, próximas tres reuniones y métricas de ventas por moneda. Se reutilizan `crm_sales_metrics`, `countRows` y lecturas owner-scoped existentes. Las lecturas independientes empiezan en paralelo con los conteos anteriores. No hay polling ni llamadas pagadas nuevas.

Un error de consulta produce «Sin datos», no cero. El estado interno «activo» se etiqueta expresamente y no prueba disponibilidad del proveedor. Contratado y cobrado son valores distintos; se muestran todas las monedas devueltas sin conversión ni suma entre monedas.

Las cinco áreas diarias quedan visibles sin desplegar herramientas: Pipeline, Ventas, Clientes 360°, Calendario, Tareas. `aria-current` identifica la sección real en lugar de marcar Pipeline en todas. Radar sigue destacado en la jornada. Se conservan accesos secundarios y rutas.

## C2 · Pipeline y lead

Se conserva la transición con versión y confirmación del servidor; no se mueve optimistamente una tarjeta rechazada. La UI Kanban recibe el idioma de la sesión y traduce acciones, prioridades y seguimientos. Los leads sin owner dejan de mostrarse como asignados a «otro propietario». Las etiquetas de etapas y contenido de negocio se conservan tal como están guardados.

Discovery, condiciones, historial, archivos y contrato reutilizan las vistas y acciones existentes. No se modifican scoring, reglas comerciales ni promoción del Radar. La traducción integral de todos los formularios heredados no se declara completada por traducir el tablero.

## C3 · Clientes 360°

Se amplía la navegación interna con Overview, Ventas, Contratos, Actividad, Finanzas (solo con capacidad confirmada) y Tareas, conservando IDs canónicos y acceso a herramientas/documentos.

Se elimina una lectura paginada completa de costos cuyo resultado se descartaba. El resumen financiero autorizado continúa usando `loadClientFinance`; la lista de gastos y sus límites permanecen en el expediente existente. El indicador de resumen parcial depende de `finance.complete`, no de si una lista separada llegó completa. Un error de esa lista no oculta un agregado SQL válido; la lista muestra su propio error. No cambia autorización, RPC ni resultados del backend.

## C4 · Ventas, documentos y #191

Ventas permanece siempre visible; sus rutas/formularios/PDFs privados existentes se conservan. No se ejecutan cobros ni se concede validez legal automática.

La ejecución baseline local del navegador se bloqueó al arrancar Chromium (socket/ptrace EPERM). No reprodujo #418 y no constituye un resultado verde. El issue #191 sigue abierto: no se atribuye una raíz de hidratación sin mismatch reproducido. La suite mantiene su detector de `pageerror` y agrega navegación en zonas horarias distintas. Un CI verde solo acredita esa ejecución, no demuestra eliminar la intermitencia histórica.

## C5 · Calendario, tareas y Radar

Defecto reproducido: el editor interpretaba `datetime-local` con la zona del navegador. Con navegador Los Ángeles, 2026-11-16 09:30 se convertía a 17:30Z en vez de 14:30Z (Florida). Además, el componente cambiaba automáticamente su zona a la del dispositivo.

Corrección de presentación: Florida (`America/New_York`) es la zona explícita del calendario, inputs, etiquetas y selección inicial del día. Se convierten horas civiles con Intl y comprobación de correspondencia. Horas inexistentes/repetidas en DST generan un error recuperable antes de enviar; nunca se elige una ocurrencia en silencio. Editar otro campo conserva el instante original, incluida su ocurrencia DST y segundos. Para crear una cita nueva en una hora repetida se pide una hora inequívoca: no se implementa todavía un selector de ocurrencia.

El diálogo atrapa Tab/Shift+Tab y devuelve el foco al cerrarse; mantiene Escape y los errores sin perder el borrador. Atrás/adelante sincroniza fecha y vista con la URL. No se cambia el CAS del backend, eventos ni reglas de solapamiento. Tareas y Radar se conservan; no se ejecutan consultas a proveedores reales.

## C6 · Portafolios y onboarding

Se preserva Product Control de main: registrar referencias externas, cliente canónico, versiones, archivos, incidencias, QA y órdenes existentes. No se construyen websites dentro de Avalon ni se activan IA/recepcionistas. La selección de servicios, precios aprobados, contratos y venta mantiene el backend como autoridad. No se inventan tarifas ni se crea un cliente piloto real.

## C7 · Pruebas reproducibles

- `npm ci --ignore-scripts` y QA lockfile existente; sin dependencias nuevas.
- `node --test tests/command-center-time.test.cjs tests/command-center-ui.test.cjs`: zona Florida, DST verano/invierno, fechas inválidas, repetición/gap, conservación de instante, navegación real, EN/ES, owner no asignado, monedas separadas y fuentes no disponibles.
- `npm test`, `npm run bridge:test`, `npm run lint`, `npm run typecheck`, `npm run build`: resultados locales registrados en el checkpoint de PR, sin atribuirlos automáticamente a revisiones posteriores.
- `SALES_BROWSER=1 NODE_PATH=./tests/qa/node_modules node --test tests/sales.browser.cjs`: recorrido completo existente y nueva matriz 320/375/390/430/768/1440 en ventas, Cliente360 y calendario; pipeline EN; navegador viajando en Los Ángeles/Auckland; cita 09:30 Florida y recuperación; foco del diálogo; Atrás; overflow y detector de pageerror conservado. Timeout pasa de 240 a 360 segundos por la matriz adicional, sin omitir aserciones. El recorrido público heredado actualiza dos selectores de campos y el título EN a la homepage actual; conserva el envío y sus comprobaciones, sin modificar la homepage.
- CRM Intelligence y demás workflows existentes siguen siendo necesarios. Capturas y resultados remotos deben estar asociados al HEAD exacto de la PR.

Los fixtures tienen Auth/REST sintéticos + PGlite con migraciones/RLS; no prueban cuentas reales, Supabase remoto, Safari ni iPhone físico. Las anchas de pantalla son emulación Chromium, no dispositivos reales. El frontend público permanece sin cambios.

## C8 · Handoff y límites

El cambio se entrega en rama/PR independiente para integración de Claude. No se modifica main/producción, cuentas, permisos, secretos ni servicios. Rollback: revertir el commit de frontend, sin SQL y sin pérdida de registros/versiones.

Pendientes para aceptación final: revisión de backend actual y entorno aislado por SHA, dos sesiones autorizadas independientes con persistencia remota, Safari/iPhone real, #191 si vuelve a aparecer, prueba de recuperación ante red caída/errores en todos los formularios heredados y revisión de contraste con herramienta automatizada. Comisiones devengadas y saldos solo pueden ampliar su UI cuando exista un contrato financiero verificable; no se calculan a partir de listas truncadas. Rendimiento y gastos reales: no medidos.

Next action: integrador revisa la PR y sus capturas/CI por SHA; completa aceptación de sesiones remotas antes de autorizar release. No cerrar #179 o #191 por inspección estática ni por una captura aislada.
