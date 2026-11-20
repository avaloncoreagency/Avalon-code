# Avalon Product Studio — APS v1 (propuesta)
**Estado:** PROPUESTO / pendiente de aprobación de Miguel y Samuel. **Issue:** #274.
**Propósito:** estandarizar la producción sin crear un segundo CRM, librería, backend ni infraestructura.

## Fuentes existentes (antes de implementar)
- [Cooperación y ownership](../dev-bridge/COOPERATION.md): Issue, owner label, rama, PR y SHA exactos. No sobrescribir trabajo ajeno.
- [Product Control](../PRODUCT_CONTROL_RELEASE.md): portafolios por módulo, `os_projects`, registro URL, versiones ZIP, client_id, source references y estados de entrega existentes. Es la fuente de verdad; no crear otra tabla ni flujo.
- [QA independiente](../independent-qa/REPORT.md), [handoff multicliente](../independent-qa/MULTICLIENT_RUNBOOK.md): evidencia y puertas de aceptación. QA móvil sintético no equivale a Safari físico.
- [Entrega visual](../HIGGSFIELD_TO_AVALON.md): un prompt, un medio generado, un link o CI verde no equivalen a UI instalada y validada.
- [Handoff Dev Bridge](../dev-bridge/HANDOFF_PROTOCOL.md): traspaso verificable por Issue y PR, sin secretos en repositorio público.

## Artefactos de esta carpeta
1. [MANUAL.md](MANUAL.md): arquitectura, etapas, visual, móvil, rendimiento, SEO, seguridad, operación y entrega.
2. [BRIEFS.md](BRIEFS.md): plantilla universal y anexos por producto, cambios y aceptación.
3. [QUALITY.md](QUALITY.md): matriz de pruebas y evidencia; prioridades y criterios de salida.
4. [COMPONENTS.md](COMPONENTS.md): catálogo candidato de componentes y reglas de adopción.
5. [INVENTORY.md](INVENTORY.md): evidencia de funcionalidades existentes en código y pruebas disponibles, sin declarar QA ejecutado.
6. [BACKLOG.md](BACKLOG.md): tareas priorizadas, dueños propuestos, dependencias y criterios de aceptación.

## Principios
- Mobile-first, iPhone como dispositivo crítico de aceptación, sin afirmar QA real sin evidencia.
- Reutilizar lo verificado; estados: PROPUESTO, EXISTENTE SIN VERIFICAR, VERIFICADO, PENDIENTE, BLOQUEADO.
- Un producto referenciado por URL no implica hosting, propiedad, ingreso, despliegue o disponibilidad.
- Producto vinculado a Clients 360 no implica venta ganada: lead, cliente, venta y producto son registros distintos.
- Ningún despliegue, cambio de Auth/RLS, migración, consumo de créditos o publicación implícita.
- Portal de empleados (#233) es responsabilidad de Samuel y queda fuera del alcance.
- Radar permanece suspendido. AI Receptionists/chatbots comerciales no se activan.

## Flujo de revisión
Aprobación de estándar por los owners → adaptación por CLIENT OPERATIONS, CLOUD & SECURITY, QA, LEGAL y FINANCE → backlog de componentes priorizado → implementación técnica en issues propios cuando se autorice → pruebas en entorno aislado y aceptación independiente.
