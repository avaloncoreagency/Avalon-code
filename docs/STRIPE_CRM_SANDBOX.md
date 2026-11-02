# Stripe → CRM: fase sandbox (NO producción)

## Estado
Esta rama introduce un **primer flujo de borrador de factura de pruebas** en la pantalla de cada venta confirmada de Avalon CRM. **No** constituye todavía una integración de pagos completa ni una sincronización de cobros.

- Owner verificado por Supabase Auth + membership en acciones de servidor.
- Solo se acepta una Stripe test/restricted key (`rk_test_` preferida, `sk_test_` solo en sandbox).
- Se requiere `STRIPE_SANDBOX_ONLY=true`. Es imposible usar live keys por este adaptador.
- La factura se crea en **draft**, con `auto_advance=false`. Nunca se envía al crearla.
- `STRIPE_ALLOW_TEST_SEND=true` es una segunda autorización explícita para habilitar el botón de envío de una factura de **prueba**; por defecto está oculto.
- Cliente = contacto primario con email; importe = total de venta confirmada, en USD; metadatos en Stripe vinculan los IDs de venta/cliente.
- Idempotency keys deterministas evitan volver a crear cliente, factura o ítem al reintentar.
- URL de detalle de la factura se devuelve en la redirección para ver el borrador sin inventar persistencia de facturas.
- No se habilita Stripe Tax, ninguna suscripción ni cargo real.

## Cómo probar en Preview
1. En un proyecto Preview aislado, agregar variables **sensibles**:
   - `STRIPE_SECRET_KEY`: restricted sandbox API key con permisos mínimos para Customers, Invoices, Invoice Items (y envío cuando se habilite). No compartir por chat.
   - `STRIPE_SANDBOX_ONLY=true`.
   - Dejar `STRIPE_ALLOW_TEST_SEND` ausente inicialmente.
2. Publicar Preview con Supabase de pruebas y migraciones del CRM aplicadas.
3. Abrir una venta sintética confirmada en USD con contacto primario que tenga un email de prueba, y pulsar «Crear borrador de factura Stripe».
4. Verificar en Stripe Sandbox **un solo** customer, **una sola** factura draft y un invoice item con el importe acordado. Reintentar y comprobar idempotencia.
5. Antes de enviar cualquier correo, aprobar y configurar `STRIPE_ALLOW_TEST_SEND=true`, usando exclusivamente una dirección de email de prueba. Verificar estado en Stripe.
6. No activar producción hasta completar los elementos pendientes.

## Imprescindible antes de producción
- **Conciliación:** guardar invoice/customer IDs en tablas protegidas con RLS y restricciones únicas, sin depender del querystring. Mantener historial de facturas visible en CRM/Cliente 360°.
- **Webhook firmado:** validar `Stripe-Signature` con un signing secret y cuerpo RAW; procesar `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, crédito/refund/disputas según canal. Reconocer duplicados con `event.id` UNIQUE y asociación verificada a invoice + sale.
- **Transaccionalidad:** reflejar pagos efectivos exactamente una vez en `crm_payments` sin superar el importe contratado; hacer refund/credit-note reconciliation explícita; separar ingresos contratados y cobrados.
- **Importes:** hacer `amount_due` igual al saldo no cobrado, no al total original, si hay pagos previos. Prohibir doble facturación mientras hay invoice pendiente.
- **Líneas:** derivar line items de `crm_sale_lines`, descuentos y cargos; comparar total de Stripe con total aprobado en CRM.
- **Validaciones:** revisar monedas sin 2 decimales, impuestos manuales existentes, datos de contacto, contratos y cancelaciones.
- **Tax:** inspeccionar Tax Settings, registros activos, tax codes correctos según servicios y origen/destino; consultar asesor fiscal antes de activar `automatic_tax`. Nunca habilitar solo por tener Stripe instalado.
- **Seguridad:** restricted live key solo cuando todo esté probado, webhook signing secret sensible, sin service role en navegador, QA y pruebas de RLS/CI, rollback y auditoría.

Referencia: https://docs.stripe.com/invoicing/integration
