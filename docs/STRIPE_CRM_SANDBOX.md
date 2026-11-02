# Avalon Core Agency — Stripe dentro del CRM (Sandbox, NO producción)

## Entrega preparada en la rama del PR #44

- CRM > **Facturas**: `/admin/workspace/crm/invoices` (listado filtrable).
- CRM > Ventas > ficha de venta: facturas vinculadas, importe, estado y botón de crear borrador.
- CRM > Clientes 360°: historial de facturas por cliente y enlaces a la venta.
- Un borrador de factura de prueba se crea con el **saldo real no cobrado** de la venta USD; el importe se reserva en la DB con bloqueo de fila. Solo 1 factura pendiente por venta.
- API Stripe server-only usando una clave **test**; claves live se rechazan y `VERCEL_ENV=production` también se rechaza.
- La operación solo puede ser iniciada por propietarios reales con Auth + membresía. El email de cliente en Sandbox debe ser sintético (`example.invalid`, `example.test`, `example.com`, etc.).
- Crear borrador `auto_advance=false` **no envía correo ni cobra**. El envío está desactivado a menos que `STRIPE_ALLOW_TEST_SEND=true` y el propietario pulse enviar.
- Los registros `crm_stripe_invoices` y `crm_stripe_events` tienen RLS y lectura para owners; escritura únicamente desde RPCs restringidos.
- El webhook público `POST /api/stripe/webhook` es la **única** excepción al middleware de sesiones; valida HMAC con timestamp y cuerpo RAW, rechaza eventos live y usa la cuenta/clave de pruebas.
- RPC de conciliación: registra `invoice.payment_succeeded` en `crm_payments` solo si identificadores, moneda, importe y saldo son compatibles; la base de datos deduplica `event.id` en la misma transacción. No toma una página de éxito como prueba de pago.
- `invoice.paid` **no** se contabiliza como cobro: también ocurre al registrar pagos manuales fuera de Stripe. Sin `invoice.payment_succeeded` se queda pendiente de revisión.
- Si Stripe avisa antes de que la factura quede enlazada en el CRM, el webhook devuelve error temporal y se reintenta; no se pierde silenciosamente el evento.
- Eventos de reembolso, crédito o disputa se marcan `needs_review` para gestión humana; **no se debe considerar completamente conciliado un reembolso hasta implementar asientos reversos**.
- Stripe Tax automático NO está activado.

## Configuración pendiente, siempre en PREVIEW y DB aislada

1. Preparar una base de Supabase distinta de la producción, aplicar la cadena completa de migraciones incluida `20261102203000_stripe_crm_invoices.sql`; comprobar RLS y probar usuarios sintéticos.
2. En el proyecto Vercel **solo para Preview**, crear variables *Sensitive* sin publicarlas en Git ni en chats:
   - `STRIPE_SECRET_KEY`: restricted API key `rk_test_...` de Sandbox (si no es posible, `sk_test_...` solo temporalmente y con acceso mínimo).
   - `STRIPE_SANDBOX_ONLY=true`.
   - `SUPABASE_SERVICE_ROLE_KEY`: clave privada **de la base de datos de pruebas**, nunca de producción, usada exclusivamente en el webhook de servidor.
   - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: deben apuntar a la base de pruebas para este Preview.
   - `STRIPE_WEBHOOK_SECRET`: signing secret del endpoint webhook del **Sandbox**.
   - `STRIPE_ACCOUNT_ID`: ID de la cuenta Sandbox vinculada, para validar Connect events cuando Stripe incluye `event.account`.
   - `STRIPE_ALLOW_TEST_SEND`: omitida por defecto; solo marcar `true` para una prueba de envío autorizada.
3. Usar un alias Preview estable para configurar en Stripe Sandbox el endpoint `https://<preview-host>/api/stripe/webhook`, suscribiendo:
   `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.finalized`, `invoice.sent`, `invoice.voided`,
   `invoice.marked_uncollectible`, `credit_note.created`, `charge.refunded`, `charge.dispute.created`.
   Nota: si el evento no incluye el ID de factura, se registra como *unlinked* para revisión, no se modifica ningún cobro. La vista **Facturas** muestra la cola de eventos marcados para revisión.
4. Crear venta **SINTÉTICA** en USD y cliente de prueba con email reservado (`buyer@example.invalid`). Crear el borrador y comprobar que se genera **una única** factura y una sola línea.
5. Habilitar temporalmente el opt-in de envío en Preview, autorizar explícitamente el envío de prueba; verificar Hosted Invoice Page.
6. Simular pago Stripe usando exclusivamente medios de prueba y verificar que llegue `invoice.payment_succeeded`; comprobar `crm_stripe_invoices.status=paid`, relación `payment_id`, un solo `crm_payments`, y total cobrado no superior al total contratado.
7. Simular un `invoice.paid` sin `invoice.payment_succeeded` y comprobar que **no** aumenta el dinero cobrado. Luego reenviar el mismo evento firmado y comprobar que NO aparecen pagos duplicados. Simular fallo y reembolso para verificar alertas de revisión. Mantener pagos de producción desactivados.

## Resultado de lectura de Stripe Tax (Sandbox, 2026-11-02)
- `tax.settings.status=pending`, sin `head_office` configurada.
- `tax.registrations`: lista vacía.
- Por seguridad **no** se cambió Tax Settings, no se añadió registro ni se activó `automatic_tax`.
- Antes de habilitar impuestos: validar obligaciones legales con asesor fiscal, registrar jurisdicciones correctas, seleccionar tax codes para cada servicio (AI Agency, marketing, web/CRM), y probar un Tax Calculation que indique `taxability_reason` esperado. Stripe no registra automáticamente al negocio con la autoridad fiscal por solo activar Tax.

## Restricciones y tareas restantes
- No mezclar facturas de producción en la DB de Sandbox.
- Al pasar a producción hará falta revisión de protección de secretos, permisos restricted live, rollout, migración revisada, política de recuperación, y pruebas completas de pagos, reembolsos y disputas. **Esta rama todavía no está lista para fusionarse.**
- Pendiente: manejo contable de **reembolsos/neto** mediante asientos reversos, conciliación de pagos fuera de Stripe, facturación recurrente/planes si procede, y PDF/plantillas finales con marca Avalon.
- `STRIPE_SANDBOX_ONLY` es un requisito de seguridad, no un botón para activar producción.
- El proyecto usa la integración de Stripe **Invoicing + Hosted Invoice Page** (no un checkout paralelo que pueda duplicar cargos).

## Fuente técnica
- https://docs.stripe.com/invoicing/integration
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/tax
- https://docs.stripe.com/keys-best-practices
