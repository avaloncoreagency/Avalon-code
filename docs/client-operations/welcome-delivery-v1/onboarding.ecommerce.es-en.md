# OB-ECOM-001 — Onboarding de Tienda Online / E-commerce Intake

**v1.0 · ES/EN · Client Operations · Estado editorial: PROPUESTO.** Tipo técnico `ecommerce`; términos comerciales, impuestos, facturación y obligaciones de comerciantes deben pasar por Legal y asesoría contable propia del cliente. No habilitar transacciones ni cobros reales como prueba.

## ES — Preguntas de catálogo y comercio

**Estrategia.** (1) ¿Qué venderás? ¿A quién y en qué mercados autorizados? (2) ¿Será catálogo informativo o compras reales según contrato? (3) ¿Qué categorías, moneda e idiomas se requieren? (4) ¿Quién aprueba los datos del comercio y administra pedidos?

**Datos de producto.** (5) Proporciona hoja de catálogo con `SKU`, categoría, nombre, descripción, precio, moneda, estado, cantidad disponible, imágenes autorizadas, variante/tamaño/color y peso/dimensiones si se usan en envíos. (6) Indica fuente de inventario y quién actualiza stock. (7) Define productos agotados, reservas, descuentos, cupones y devoluciones **solo si están en alcance**. (8) Marca productos regulados para revisión por Legal/proveedor.

**Operación.** (9) Define zonas de venta, opciones de envío, preparación, transporte y responsables de fulfillment. (10) Aporta políticas aprobadas de compra, devoluciones, reembolsos y privacidad. (11) ¿Quién determina y valida impuestos aplicables? **Avalon no inventará tasas ni realizará asesoría fiscal.** (12) ¿Qué correos transaccionales y destinatarios se requieren? (13) ¿Hay sistemas externos existentes para importar inventario/pedidos? Confirmar permisos y alcance antes de conectarlos.

**Pago.** (14) ¿Quién es titular legal de la cuenta del proveedor de pagos? (15) ¿Qué métodos/regiones están realmente autorizados por ese proveedor? (16) ¿Quién paga comisiones, disputas, contracargos y licencias? (17) ¿Quién puede ejecutar pruebas sandbox y aprobar la salida a cobro real? El merchant conserva el control de pagos y los secretos permanecen en plataforma aprobada.

## ES — Materiales y documentos obligatorios

- [ ] Datos legales/públicos del comerciante y persona autorizada.

- [ ] Catálogo completo con SKUs/variantes/precios/moneda/stock; lista de productos excluidos.

- [ ] Fotografías, guías de tamaños y descripciones con permisos.

- [ ] Políticas del comerciante aprobadas por asesor competente (envíos, devoluciones, reembolsos, privacidad, venta).

- [ ] Proveedor de pagos, propietario merchant, métodos aprobados, países y titular de costos verificados.

- [ ] Opciones de envío, tiempos **solo del comerciante**, impuestos/obligaciones definidos por el cliente.

- [ ] Flujo de correos/notificaciones y destino de avisos de pedidos si está contratado.

- [ ] Dominio, hosting, branding, roles y accesos delegados según `OB-WEB-001`.

- [ ] Criterios de aceptación de pago/stock/estado de pedido en sandbox.

- [ ] Responsable de atender pedidos, fraude, disputas, devoluciones y datos personales.

## ES — Pruebas y criterio de entrega

**NO-GO** si falta la titularidad del merchant, el alcance de impuestos o política comercial, existen datos de pago en canales inseguros, o no se ha autorizado el entorno real. Antes de entrega, Product/QA debe demostrar con **cuentas y transacciones sandbox**: variante/precio/stock correctos, cesta cuando esté contratada, intento de checkout autorizado, respuesta aprobada/rechazada, actualización de pedido, notificación y simulación de devolución/reembolso. El cliente valida textos de impuesto, políticas y procesos de fulfillment. **No emitir cargos reales de prueba**. Publicar requiere permiso específico y verificación postrelease.

## EN — Catalog and merchant questions

**Business model.** (1) What will you sell, to which customers and authorized regions? (2) Informational catalog or real checkout as contracted? (3) Required categories, currency and languages? (4) Who approves merchant facts and manages orders?

**Product data.** (5) Provide a catalog sheet with `SKU`, category, name, copy, price, currency, status, stock, licensed images, variant/size/color and weight/dimensions if shipping uses them. (6) Identify inventory source and stock owner. (7) Out-of-stock behavior, reservations, discounts, coupons and returns **only if in scope**. (8) Flag restricted products for Legal/provider review.

**Operations.** (9) Sales regions, shipping methods, fulfillment workflow and responsible people. (10) Approved merchant terms, returns/refunds and privacy policies. (11) Who determines and verifies applicable sales tax? **Avalon does not invent tax rates or give tax advice.** (12) Which transactional emails and recipients are required? (13) Existing inventory/order integrations and their authorized access.

**Payments.** (14) Legal account owner of payment provider? (15) Payment methods/regions actually approved by provider? (16) Who pays transaction fees, disputes, chargebacks and licenses? (17) Who can run sandbox tests and approve real transactions? Merchant owns payment account; secrets remain in an approved system.

## EN — Required materials and records

- [ ] Authorized merchant representative and verified public merchant information.

- [ ] Complete SKU/variant/price/currency/stock catalog plus excluded products.

- [ ] Licensed photos, size guides and product copy.

- [ ] Expert-reviewed merchant policies for shipping, returns, refunds, privacy and sale terms.

- [ ] Payment provider, merchant owner, approved methods/regions and payer of vendor costs.

- [ ] Shipping options, customer-provided delivery windows and client-defined tax obligations.

- [ ] Contracted order notification workflow and approved inbox recipients.

- [ ] Domain, hosting, brand, roles and delegated permissions per Website intake.

- [ ] Sandbox acceptance scenarios for payment, stock and order states.

- [ ] Named owner for orders, fraud, disputes, refunds and personal data.

## EN — QA and acceptance

**NO-GO** without merchant ownership, tax/commercial policies, proper payment-data handling and separate approval for a live environment. Product/QA must demonstrate with **sandbox accounts and payments only**: correct variants, prices and stock, cart when contracted, checkout request, approved/declined response, order-state handling, notifications and simulated refund/return. Merchant approves tax disclosures, policies and fulfillment. **Never use real-charge transactions as tests.** Production release requires distinct permission and postrelease verification.

## Data contract / implementation

Reuse `src/lib/onboarding/model.ts` product `ecommerce` keys `catalog`, `inventory`, `prices`, `variants`, `payments`, `shipping`, `returns`, `tests`, plus common keys. Record invoice/payments separately; do not change merchant charges or provider accounts. **APPROVAL PENDING.**
