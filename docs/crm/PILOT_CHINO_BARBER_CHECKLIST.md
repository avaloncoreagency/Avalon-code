# Piloto Chino Barber — checklist de la primera operación comercial real

Todo el flujo funciona **sin Radar**. Las pruebas automáticas usan solo datos sintéticos aislados: PGlite y el *build* de producción contra un puente REST. Nada de lo siguiente está hecho en producción todavía; cada casilla la marca un propietario cuando ocurre de verdad.

## A. Probado con datos sintéticos (CI)

| Paso | Dónde | Prueba automática |
|---|---|---|
| 1. Crear lead | Leads Pipeline → «Crear lead», o Mesa comercial (formulario avanzado con duplicados) | `tests/crm-intelligence.browser.cjs`, `tests/sales.browser.cjs` |
| 2. Editar la ficha | Ficha del lead → «Editar ficha completa» | `tests/sales.browser.cjs` |
| 3. Vincular con un cliente | Clients 360 → registro con oportunidad (`crm_register_client_with_opportunity`) | `tests/client-opportunity-link.database.cjs` |
| 4. Website en borrador sin URL | Clients 360 → «Añadir producto»; etapa de entrega «Borrador» | `tests/product-control.test.cjs`, `tests/product-delivery.database.cjs` |
| 5. Añadir la URL más tarde | HUD del producto → Conexiones; «Publicado y verificado» exige URL HTTPS **y** evidencia | `tests/product-delivery.*` |
| 6. Cotización | CRM → Cotizaciones → asistente de 5 pasos (precio fijo, mensualidad, comisión, híbrido) | `tests/quotes.*` |
| 7. Revisar el PDF | Vista previa y descarga tras la aprobación interna | `tests/quotes.browser.cjs` |
| 8. Contrato | «Crear contrato desde cotización» (guarda la versión exacta) | `tests/quotes.browser.cjs` |
| 9. Venta sintética | Ventas → Registrar venta (exige un contrato verificado para pasar a Ganado) | `tests/sales.browser.cjs`, `tests/helpers/verified-contract.cjs` |
| 10. Estado comercial | El lead pasa a Ganado solo con una venta confirmada | `tests/client-opportunity-link.database.cjs` |
| 11. Registro financiero | Factura, pago verificado, comisión acordada → devengada → pagada (#227) | `tests/core-engine.*`, `tests/support/core-engine-ui.cjs` |
| 12. Vista completa | Clients 360: contactos, cotizaciones, contratos, ventas, productos y finanzas | `tests/sales.browser.cjs` |

## B. Primera operación real — lo que deben hacer los propietarios

- [ ] Registrar Chino Barber con sus datos **reales**: nombre legal, contacto, teléfono y correo.
- [ ] Aprobar en el catálogo los precios que se usarán (Configuración → Catálogo). Sin esto, la cotización lleva precios escritos a mano.
- [ ] Crear la cotización real, enviarla a revisión interna, aprobarla, descargar el PDF y registrar el envío manual con una nota.
- [ ] Registrar la aceptación **solo** con evidencia escrita: quién aceptó, por qué medio y dónde se guardó.
- [ ] Generar el borrador de contrato. Completar la parte contratante **real**: Avalon no es una entidad constituida.
- [ ] Firmar fuera de la plataforma y verificar el contrato en Avalon (método y nota).
- [ ] Registrar la venta. El lead pasa a Ganado automáticamente.
- [ ] Crear el website como **borrador**. Añadir la URL solo cuando exista y marcar «Publicado y verificado» con evidencia.
- [ ] Si hay comisión: acordarla con el porcentaje firmado; registrar conversiones solo con evidencia de cobro.
- [ ] Conceder `crm_private.finance_access` a los propietarios que deban ver las finanzas.

## C. Prohibido asumir como completado

- Ventas, contratos firmados, pagos o URLs que no existan.
- Una cotización descargada no es una cotización enviada, y una aceptada no es una venta.
- El CRM de Avalon (Chino Barber como cliente) y el CRM de la barbería (sus propios clientes) son bases distintas.
- No se activa Radar ni ningún servicio de pago para el piloto.
