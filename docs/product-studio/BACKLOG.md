# Backlog de mejora — Product Studio APS v1
**Estado:** PROPUESTO / no autoriza cambios funcionales. **Base auditada:** `main@207ed3a3dc8fdae5dd949a7361733e441c530519`. **Issue:** #274.

## Definición de listo para implementar (DoR)
Una tarea debe indicar: código/fichero dueño; problema observado con reproducción o necesidad formal; usuario y valor; aceptación medible; dependencias; rama y Issue canónico sin conflicto; coste/autorización; plan de prueba y rollback. Sin estos campos → **PENDIENTE**, no prometer arreglo.

## Priorización propuesta
| ID / nivel | Trabajo siguiente | Justificación y aceptación | Dependencia / dueño |
| --- | --- | --- | --- |
| APS-N01 · P0 | Inventariar y clasificar componentes actuales antes de desarrollar otros | Usar [INVENTORY](INVENTORY.md). Distinguir existente en código, verificado funcionalmente y candidato. Cero clones de Product Control. | Product Studio + QA; auditoría inicial de fuente realizada |
| APS-N02 · P0 | Gate de entrega multicliente para la ficha de producto | Ensayar cliente→producto→versión→revisión→aceptación en entorno aislado con datos sintéticos. URL externa `reference_only` no es instalación ni venta. | CLOUD & SECURITY + CLIENT OPERATIONS + QA; [Product Control](../PRODUCT_CONTROL_RELEASE.md) |
| APS-N03 · P0 | Criterio comercial lead/cliente/venta y solicitud pública | Simular solicitud cotización, revisar en inbox, asociar lead si se aprueba; nunca convertir automáticamente a venta o ingreso. | SALES + FINANCE + CRM; sin modificar [PR #245](https://github.com/avaloncoreagency/Avalon-code/pull/245) |
| APS-N04 · P0 | Verificación móvil mínima de producto entregado | Safari iPhone físico: registrar modelo/iOS, 320–430 CSS px según soporte, teclado, zoom, foco, scroll, VoiceOver y flujo clave. Cero P0/P1 abiertos. | QUALITY ASSURANCE; coordinar [PR #276](https://github.com/avaloncoreagency/Avalon-code/pull/276) |
| APS-N05 · P1 | Documentar flujo Website Studio → exportación → producto en Avalon | Comprobar edición, aviso de cambios sin guardar, conflicto, salida, HTML exportado, vínculo Product HUD. No confundir preview local con web publicada. | PRODUCT STUDIO + equipo técnico asignado; fuente ya existe |
| APS-N06 · P1 | Evaluar búsqueda y filtros multicliente | Matriz de 0, 1, 51 y muchos productos con paginación; aclarar búsqueda local vs servidor. Solo proponer fix si falla prueba real. | PRODUCT STUDIO + QA, propietario de Product Control |
| APS-N07 · P1 | QA de formularios públicos y conversiones | Confirmar validación servidor, protección anti-abuso, resultado en inbox autorizado y evento `generate_lead` solo en conversión real definida. | SALES/LEGAL + QA; no enviar solicitudes reales |
| APS-N08 · P1 | Validar la biblioteca de componentes reutilizables | Para cada componente: contrato, tokens, estados, diseño 320–430, accesibilidad, versionado, licencia, tests. Promover a VERIFICADO solo con evidencia. | PRODUCT STUDIO; [COMPONENTS](COMPONENTS.md) |
| APS-N09 · P2 | Auditoría editorial del sitemap | Solicitar decisión comercial sobre landing pages y SEO de `receptionist`/`chatbots` suspendidos, sin activar venta ni borrar contenido unilateralmente. | BUSINESS STRATEGY + SALES + LEGAL |
| APS-N10 · P2 | Kit de entrega y mantenimiento por cliente | Acta + titulares dominio/hosting, cuentas, backups, URL/commit, accesos, licencias, soporte acordado y cancelación/migración. | CLIENT OPERATIONS + CLOUD & SECURITY + LEGAL |

## Ficha del primer piloto (documental, no construido)
**Referencia:** Chino Barber, piloto previsto. **Estado website:** NO CREADO / URL DESCONOCIDA. **Estado comercial:** NO PRESUPONER venta, ingreso ni contrato.

Requisitos y responsables por resolver:
- Objetivo: contacto, reservas, catálogo de cortes o CRM (elegir únicamente tras brief).
- Materiales: marca/logo, horarios, fotografías con permiso, servicios y precios aprobados.
- Propiedad: dominio y titular, hosting, gestión de cuentas y renovaciones.
- Diseño: wireframe inicial desde 390 CSS px, navegación de una mano y formularios accesibles.
- Entrega: preview estable, pruebas Safari, aceptación, costos y soporte acordados.
- Integración: vincular a Clients 360 y Product Control **solo** bajo sesión owner autorizada y con ID válido; no crear una venta ficticia.

**Gate:** sin brief y aceptación no crear ni publicar sitio; no inventar enlace, clientes ni importes.

## Decisiones humanas necesarias
1. Miguel y Samuel: aceptar APS v1 como estándar, aún sin merge.
2. PROJECT MANAGER: elegir exactamente una tarea N02–N08 y asignar un responsable técnico/Issue nuevo tras reconciliar PRs abiertos.
3. CLOUD & SECURITY: autorizar Preview aislado y pruebas de RLS, sin tocar producción.
4. QA: aportar evidencia real de Safari y no reutilizar tests de otras ramas sin comprobar SHA.

## Handback de Product Studio
**Hecho:** auditoría de fuente + documentación bajo `docs/product-studio/`. **NO HECHO:** ejecución de tests, corrección de código, despliegue, migraciones, aceptación iPhone físico. **Next action:** priorizar una tarea y obtener aprobación de ejecución técnica con ownership claro.
