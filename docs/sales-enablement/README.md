# Avalon Sales Enablement — Agent Portal Training Package

**Misión:** AVL-SALES-TEAM-001 · **Prioridad:** P1 · **Owner funcional:** SALES & MARKETING · **Versión:** 1.0-draft · **Fecha:** 2026-11-24  
**Estado:** CONTENIDO DOCUMENTAL PREPARADO / EN REVISIÓN · **Agent Portal real:** NO MODIFICADO / INTEGRACIÓN PENDIENTE · **Ventas y campañas:** NO-GO.

## Propósito / Purpose
**ES:** Paquete reutilizable para capacitar a futuros vendedores de Avalon Core Agency: qué servicios se estudian, qué se puede afirmar con evidencia, cómo se califica un negocio, cómo se documenta una oportunidad y cómo se traslada a Client Operations sin inventar ventas.  
**EN:** Reusable training package for future Avalon Core Agency sellers: evidence-grounded service knowledge, qualification, discovery, handoff and daily operations. No live customer outreach or seller provisioning is authorized.

**Aviso obligatorio en interfaz / Required notice:** **“Material de capacitación interno — servicios NO APROBADOS PARA VENTA / Training only — services NOT APPROVED FOR SALE.”**

## Índice canónico / Package contents
| Módulo | Español / English | Documento | Uso |
| --- | --- | --- | --- |
| 00 | ES/EN | [README](README.md) | Inicio y reglas |
| 01 | ES | [Playbook completo ES](PLAYBOOK_ES.md) | Formación de extremo a extremo |
| 02 | EN | [Full Playbook EN](PLAYBOOK_EN.md) | End-to-end seller manual |
| 03 | ES/EN | [Scripts de venta](SCRIPTS_ES_EN.md) | 12 guiones, solo con permiso legal |
| 04 | ES/EN | [Kit de campo](FIELD_KIT_ES_EN.md) | Servicios, FAQ, checklists, objeciones, cotización, CRM |
| 05 | ES/EN | [Roofing/Fencing Sector Kit](../pm-v3/sales/sector-outreach-kit.md) | SM-V3-01, discovery y tres mensajes por industria |
| 06 | ES/EN | [Programa de 7 días](TRAINING_7_DAYS_ES_EN.md) | Ejercicios sintéticos, evaluación y umbrales propuestos |
| 07 | ES/EN | [Operación diaria](DAILY_OPERATIONS_ES_EN.md) | CRM, métricas, reportes, escalamiento, handoff |
| 08 | ES/EN | [Presentación comercial](PRESENTATION_ES_EN.md) | Guion de diez diapositivas, no archivo PPTX |
| 09 | ES/EN | [Welcome Package + inventario](WELCOME_PACKAGE_INVENTORY.md) | Correo de bienvenida, onboarding y datos para Claude |
| Datos | es-ES/en-US | [manifest.json](manifest.json) | Inventario legible por máquina, **sin nuevo sistema de distribución** |

## Fuentes de verdad / Authoritative references
1. **Backlog y coordinación:** [Issue #303](https://github.com/avaloncoreagency/Avalon-code/issues/303), [Issue #304](https://github.com/avaloncoreagency/Avalon-code/issues/304) y protocolo de Dev Bridge en [COOPERATION](../dev-bridge/COOPERATION.md).
2. **Ofertas y autorización:** [STABLE V1](../stable-v1/FINAL_INTEGRATION.md), [Playbook Sales V2](../sales-marketing/AVALON_SALES_001.md), [SOP existente](../sales-marketing/EXECUTION_CHECKLIST_001.md).
3. **CRM y métricas:** [Commercial Foundation Playbook](../commercial-foundation/SALES_PLAYBOOK.md), [KPI Dictionary](../commercial-foundation/KPI_DICTIONARY.md), [Campaign Policy](../commercial-foundation/CAMPAIGN_POLICY.md).
4. **Decisión de WP-01:** Business Strategy BS-005/006 en el espacio Avalon; alcance candidato **NO SELLABLE**. El documento no prueba que ahora esté aprobado.
5. **Agent Portal:** PR [#349](https://github.com/avaloncoreagency/Avalon-code/pull/349) DRAFT observado; funciones, permisos, rutas y release siguen sujetos a validación por sus custodios.

Si un código nuevo o decisión aprobada contradice este kit, **no intentar forzar la venta**: detenerse, verificar la fuente/versionado y escalar a PROJECT MANAGER. Un documento o PR abierto no equivale a un GO comercial.

## Camino de capacitación / Training path
**ES:** Día 1 identidad → 2 servicios/ICP → 3 CRM/portal/roles → 4 prospección y permisos → 5 demo/cotización → 6 negociación/cierre → 7 práctica y revisión de 100 puntos. El umbral de 85/100 + cero faltas críticas es **propuesto**, no aprobado.  
**EN:** Day 1 identity → 2 services/ICP → 3 CRM and role grants → 4 lawful outreach → 5 demo/quotes → 6 negotiation/close → 7 synthetic graded practical. Threshold 85/100 and no critical errors is **proposed**, not an approved employment standard.

**Nunca entrenar con credenciales reales de otros usuarios, pacientes, correos/clientes o ventas productivas.**

## C0–C7 Checkpoints
| Fase | Resultado documental | Estado en esta rama | Falta para aceptación funcional |
| --- | --- | --- | --- |
| C0 Recuperación | #303/#304, catálogo STABLE V1, #349 y documentos Sales leídos | VERIFICADO (fuentes inspeccionadas) | Revisiones continuas de SKU/portal |
| C1 Playbook | Guías completas ES y EN | PREPARADO / REVISIÓN | Legal, Strategy, Product, owners |
| C2 Guiones | 12 tipos de comunicación, roofing/fencing, opt-out | PREPARADO / REVISIÓN | Aprobar canal, mensajes, identidad |
| C3 Materiales | Fichas, FAQ, matriz, checklists, presentación guionizada | PREPARADO / REVISIÓN | Diseño visual/branding y uso externo |
| C4 Formación | Siete días, casos sintéticos, rúbrica objetiva | PREPARADO / REVISIÓN | Aprobar evaluación e impartir formación real |
| C5 Operación | SOP, taxonomía de eventos, KPIs y handoff Ops | PREPARADO / REVISIÓN | Finance valida, accesos CRM/Staff y QA |
| C6 Welcome Package | Carta ES/EN, onboarding, inventario diez docs y JSON | PREPARADO / REVISIÓN | Legal/owners y distribución Staff aprobada |
| C7 Handoff | [PR #352](https://github.com/avaloncoreagency/Avalon-code/pull/352) en DRAFT, verificación de 11 archivos, 43 enlaces y manifiesto; checkpoint #304 | **EN REVISIÓN / NO FUSIONADO** | PM admite, revisa CI/QA exacto y decide integración |

**No confundir:** PREPARADO = archivo de contenido leído/confirmado; APROBADO = revisión documentada; INTEGRADO = merge autorizado con SHA y QA; PUBLICADO = deployment comprobado; ENTRENADO = persona evaluada. No se presume ningún paso posterior.

## Aceptación del departamento / Department acceptance
- [x] Manual ES/EN con recorrido completo desde prospecto hasta Client Operations.
- [x] Guiones solicitados y material comercial de consulta sin datos privados.
- [x] Formación de siete días con puntuación y stop rules; no empleados reales evaluados.
- [x] Rutina diaria, métricas auditables sin cuotas ni comisiones inventadas.
- [x] Welcome Package e inventario con versión, idioma, audiencia, aprobación y acceso.
- [x] Ninguna modificación del CRM, Agent Portal, RLS, SQL, staff o producción.
- [ ] Legal/Finance/Business/owners aprobaron claims, contenidos y permisos.
- [ ] Integración documental con revisión del PR y CI, si aplica.
- [ ] Agent Portal acepta/representa docs con grants verificados; NO IMPLEMENTADO AQUÍ.
- [ ] Agentes reales capacitados y certificados; NO EVALUADO.

## Handoff al PROJECT MANAGER
**ID:** AVL-SALES-TEAM-001 / SM-V3-01 · **Departamento:** Sales & Marketing · **Prioridad:** P1.  
**Problema:** futuros vendedores carecían de un paquete coherente, bilingüe, con límites de producto, guiones, entrenamiento, operación y manifiesto de bienvenida.  
**Entregado:** todos los documentos anteriores y manifest.json en rama separada, sin runtime, en [PR #352](https://github.com/avaloncoreagency/Avalon-code/pull/352) DRAFT.  
**Dependencias:** Legal/Compliance (canales/contratos), Finance/KPIs (métricas, comisiones), Business/Product/QA (SKU y demos), Client Operations (entrega), Samuel/Claude/Codex/PM (integración Staff/Agent Portal, con ownership y QA).  
**Criterio:** revisión editorial de diez documentos, ningún contacto/producto no autorizado ofrecido, enlaces válidos, PR documentado con SHA exacto, aprobación de owners por versión.  
**Siguiente acción:** PM revisa paquete y asigna únicamente la incorporación del **inventario** en la distribución existente cuando Agent Portal y permisos estén aceptados; sin construir otro sistema ni fusionar de oficio.

**No realizar campañas ni activar Radar, Guardian, OpenRouter, bots comerciales o proveedores pagados.**
