# MN-ECOM-001 — Manual de tienda online / E-commerce Operations Guide

**v1.0 · ES/EN · PLANTILLA BASE, no manual de tienda real.** Debe completarse con panel, merchant, procesos, políticas, límites y pruebas del producto entregado. No describe cobros reales activados ni funciones inexistentes.

## ES — 1. Información del comercio y alcance

**Comerciante:** [empresa] · **URL verificada:** [si disponible] · **Plataforma/panel autorizado:** [nombre real] · **Versión:** [ID] · **Métodos aprobados:** [según proveedor] · **Políticas:** [referencias aprobadas] · **Contrato:** [versión]. El cliente conserva responsabilidad de precios, inventario, impuestos, pedidos, cumplimiento y cuenta merchant conforme a su acuerdo.

## ES — 2. Operación diaria

1. Inicia sesión con cuenta personal en el panel **si realmente se entregó**; utiliza invitación nominal y MFA cuando esté disponible.

2. Comprueba catálogo: SKU, nombre, variante, imágenes y descripción autorizadas.

3. Antes de publicar un cambio, valida precio, moneda, disponibilidad y condiciones de envío.

4. Revisa pedidos recibidos en el sistema real; confirma estado de cobro **con el proveedor merchant**, no con capturas del carrito.

5. Registra preparación, envío, devolución y reembolso conforme a procesos y políticas del comerciante. Si un módulo no existe, solicita soporte; no improvises pasos.

6. Ante inventario o precio inconsistente, pausa internamente la acción afectada y documenta antes de modificar masivamente.

## ES — 3. Pagos, seguridad y conciliación

El proveedor de pagos pertenece al comerciante; los datos de tarjetas se capturan únicamente por el proveedor autorizado, nunca por correo o chat. Cada transacción debe conciliarse con su registro real. Los reembolsos solo los ejecuta personal facultado siguiendo la política aprobada; un estado visual no sustituye la evidencia bancaria. Pruebas previas de compra/reembolso deben hacerse en **sandbox**, no mediante cargos reales no autorizados. Revisar fraude y contracargos con el merchant y su asesor, no prometer resolución automática.

## ES — 4. Mantenimiento y cambios

Actualizar catálogo/stock con respaldo y control de responsable; revisar links, correos de pedidos, categorías y políticas con la frecuencia definida por el negocio. Previo a añadir métodos de pago, zonas, descuentos o integraciones, solicitar CR y revisión de costos, privacidad, Legal y QA. Los gastos de hosting, dominio, app marketplace y comisiones de proveedor se pagan por quien figure en contrato; **no se presume que Avalon los cubra**.

## ES — 5. Incidentes y entrega

Reportar ID no sensible del pedido, hora, síntoma, canal y evidencia redactada. **No enviar PAN/CVV, contraseñas ni datos de pago completos**. Si el checkout falla, escalar a merchant/técnicos; no repetir operaciones con fondos reales. Entrega requiere catálogo y política aprobados, checkout sandbox verificado, permisos, manual adaptado, URL real y aceptación por representante facultado. Soporte: [contrato aplicable].

## EN — 1. Merchant and scope

**Merchant:** [company] · **Verified URL:** [if live] · **Authorized admin platform:** [actual name] · **Version:** [ID] · **Approved payment methods:** [provider-verified] · **Policies:** [approved references] · **Agreement:** [version]. Merchant retains responsibility for prices, stock, tax, orders, compliance and their payment account under the signed terms.

## EN — 2. Day-to-day operation

1. Use an individual account in the admin panel **only if actually delivered**, with delegated access and MFA where available.

2. Check catalog entries, SKUs, variants, licensed images and descriptions.

3. Verify price, currency, availability and shipping rules before publishing changes.

4. Review orders and confirm actual payment **in the merchant provider account**, not merely by cart status.

5. Handle fulfillment, shipping, returns and refunds under your merchant policies. If a module does not exist, request support instead of assuming it is present.

6. For stock or pricing discrepancies, suspend the affected internal action and record evidence before bulk changes.

## EN — 3. Payments and reconciliation

Payment providers belong to the merchant; card data must be captured only through approved providers, not email or chat. Match each charge to the real merchant record. Authorized personnel handle refunds under approved policies; a dashboard status does not replace banking evidence. Run checkout/refund tests in **sandbox only**. Fraud, disputes and chargebacks follow merchant/provider procedures and have no guaranteed outcome.

## EN — 4. Maintenance, updates and support

Maintain catalog and inventory with ownership and a backup plan; verify order emails, links, categories and policies at the agreed cadence. New payment methods, shipping regions, promotions and integrations require a change request plus commercial, legal, privacy and QA review. Domain, hosting, marketplace and merchant fees are payable only as stated in the agreement; Avalon does not assume third-party costs.

## EN — 5. Incident reporting and handoff

Report only a safe order reference, time, symptom and redacted evidence. **Never email card numbers, CVV, passwords or full payment details**. Escalate checkout failures to the responsible merchant/technical team; avoid repeated real-money attempts. Handoff requires approved catalog/policies, verified sandbox checkout, scoped permissions, tailored manual, actual URL and authorized customer acceptance. Support: [applicable agreement].

## Required product-specific completion

Fill actual screen-by-screen paths, roles, merchant provider, exact notification rules, return/refund steps and screenshots only after product QA. Verify secure payment behavior with synthetic transactions; no real client order data in templates. Issue private versioned snapshot (sha256) via existing generator. **NOT ISSUED / PENDING.**
