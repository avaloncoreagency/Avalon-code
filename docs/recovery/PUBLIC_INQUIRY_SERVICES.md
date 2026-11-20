# Public inquiry services — 19 noviembre 2026

Refs #47. P2 confirmado: `services` null/escalar/objeto provoca SQLSTATE 22023 en `jsonb_array_elements_text`; el endpoint público debe devolver `invalid` y no una excepción. Reproducido en PGlite con todas las migraciones de main 53e5436. La definición de producción consultada conserva esa expansión sin validación de tipo; no se enviaron solicitudes ni se escribieron filas en producción.

Propuesta: `docs/sql/public-inquiry-services-review.sql`, **review-only**, excluida del replay automático. Valida arreglo y elementos string antes de expandir. Campo omitido y arreglo vacío siguen admitidos; strings desconocidos se descartan como antes. Conserva privilegios, cuotas duraderas/advisory lock, honeypot, deduplicación e inmediata restauración del subject JWT. No cambia RLS ni claves.

Prueba rojo→verde: `NODE_PATH=tests/qa/node_modules node --test tests/public-inquiry.database.cjs`. Ocho valores inválidos, compatibilidad omitido/vacío, cuotas, replay y aislamiento después de RPC. `tests/definer-gates.test.cjs`: control estático adicional, no reemplaza prueba de autorización dinámica.

Estado: SQL implementado y probado aislado; **no integrado en historial de migraciones ni aplicado a un servicio**. Claude revisa contra su esquema vigente antes de convertir en migración incremental. Owner autoriza aplicación por separado y con respaldo. No cerrar #47 hasta verificar SHA + migración aplicada + prueba del entorno autorizado.

Riesgo independiente: el formulario público presenta aviso de privacidad, pero no hay consentimiento versionado exigido en la acción ni en `crm_public_inquiry`; a diferencia de `crm_growth_funnel_submit`, que exige versión vigente. Requiere decisión de contrato y cambio coordinado, no se modifica de forma silenciosa con este arreglo de tipos.

Next action: Claude revisa el SQL candidato y contrato público; Codex aporta prueba aislada; propietarios aprueban cualquier promoción de BD.
