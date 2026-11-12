# Avalon Commercial Foundation — implementación ChatGPT (12 nov 2026)

## Alcance real
Este cambio es **código funcional acotado**, no un despliegue ni una aprobación comercial.

### Implementado en esta rama
- `src/lib/commercial/finance.ts`: cálculo de presupuestos con centavos exactos, costos completos, margen y precio mínimo; simulación de comisiones separando elegibilidad de dinero efectivamente cobrado.
- `src/lib/commercial/routing.ts`: evaluador **puro** de elegibilidad para futuro Lead Router B2C. Rechaza consentimiento ausente, destinatario cambiado, disclosure obsoleto, contrato/licencia/capacidad pendientes y ZIP inválido. **No guarda datos ni distribuye leads**.
- `src/lib/commercial/metrics.ts`: cálculos que distinguen valores verificados de datos ausentes o parciales.
- `/admin/workspace/marketing-hub/commercial`: calculadoras privadas para owners, sin persistencia ni llamadas a proveedores.
- `tests/commercial-foundation.test.cjs`: regresiones sintéticas de finanzas, comisiones, routing, métricas y autorización de página.

### Fuente de verdad y coordinación
- `crm_leads.audience = agency_b2b` pertenece al CRM de Avalon, **no** a homeowners captados para contratistas.
- `crm_growth_funnel_submit` del PR #155 se creó para captación comercial existente. **No se redirigen consumidores B2C a esa RPC**.
- Service Factory (PR #54), Solution Planner (PR #59) y propuestas (PR #90) siguen siendo los puntos de integración para venta real. No se crean SKU paralelos ni se escriben datos de ventas desde la calculadora.
- AI Chatbots / Library Builder (PR #141) es independiente del núcleo de finanzas/routing.
- Precios Starter y Growth anteriores siguen siendo propuestas **sin aprobación**; este cambio no los activa.
- El caso comercial de referencia de una comisión del 5% es ilustrativo y no constituye tarifa de Avalon ni confirmación de cumplimiento jurídico.

### Comprobación
- `node --test tests/commercial-foundation.test.cjs`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

La ejecución de pruebas, sus resultados y la revisión de CI deben registrarse por commit; este documento por sí mismo no demuestra aprobación.

### Pendientes que no pueden declararse completos
1. Aprobación de precios, márgenes, alcance y comisión por los propietarios.
2. Revisión legal de contratos, licencias y contacto a consumidores.
3. Persistencia B2C multi-tenant, aislamiento RLS, consentimiento auditado, reintentos e idempotencia; pruebas de rutas reales.
4. Unión con Service Factory / Solution Planner después de revisar sus PR sin duplicar modelos.
5. Base de conocimiento ejecutable y proveedores conectados para AI Chatbots/Recepcionista.
6. Métricas del dashboard conectadas a hechos verificables, no simulados.
7. Preview contra Supabase aislada, migraciones autorizadas, QA móvil y publicación.

**Producción/main:** intocados por este PR hasta revisión/aprobación.
