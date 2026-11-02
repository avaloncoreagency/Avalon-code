# Lead Hunter Radar · Fase 1 (manual pilot)

## Qué hace realmente
- Desde `/admin/workspace/crm/hunter` un **propietario verificado** elige zona, servicio y radio (800 m, 1,5 km o 2,5 km). Pulsa **Buscar oportunidades**.
- El servidor realiza una sola consulta acotada de puntos de interés a un proveedor compatible con Overpass. No hay escaneos cron, cuadrículas ni scraping masivo.
- Muestra nombre comercial, sector, dirección parcial, teléfono, correo y web **solo si aparecen publicados en OSM**. Proporciona enlace a la ficha del mapa, fuente y licencia.
- Ordena por **prioridad de revisión** (datos de contacto y si falta web en la ficha del mapa). **No es un detector factual de ausencia de web, CRM, agentes IA o tiendas online**.
- Al pulsar Guardar prospecto llama al CRUD existente de `crm_prospects`, con rol owner, validación y protección ante duplicados. El prospecto queda **pending**, no se convierte automáticamente en cliente o venta.
- En la lista de Lead Hunter, el operador comprueba nombre de responsable/contacto decisor y servicio adecuado; cambia a **approved**; luego pulsa **Convertir en lead**. Esa operación utiliza el procedimiento existente `crm_convert_prospect`, que conserva la relación de procedencia.
- Desde Leads Pipeline el asesor programa llamadas y seguimientos. Las ventas se cierran desde el módulo Ventas ya existente.

## Confiabilidad y datos
- `website` / `contact:website`: si no hay etiqueta, mostrar «web no registrada», **nunca** «no tiene web».
- `phone`, `contact:phone`, `email`, `contact:email`: contactos comerciales públicos **solo cuando existen**.
- Propietarios, decisores y uso de CRM / recepcionistas / ecommerce **no pueden determinarse de los mapas**. Hay que verificar con la empresa de forma lícita; nunca fabricar estos datos.
- El score es un filtro operacional de completitud y oportunidades **por verificar**. No es scoring predictivo, y no utiliza atributos personales/sensibles.
- La interfaz cita «© OpenStreetMap contributors · ODbL» y enlaza la licencia: https://www.openstreetmap.org/copyright.
- No guardar secretos, números personales no publicados o datos sensibles innecesarios. Respetar leyes de privacidad, registros de exclusión telefónica y obligaciones de ventas en cada jurisdicción.

## Reglas del proveedor de datos
- Se utiliza **solo una búsqueda manual de área pequeña**, sin recolección nocturna ni planificadores automáticos.
- El endpoint por defecto `https://overpass-api.de/api/interpreter` es un piloto limitado de baja frecuencia: **no es una infraestructura comercial de alta escala**. La documentación del servidor recomienda un proveedor propio o de pago para uso comercial regular: https://wiki.openstreetmap.org/wiki/Overpass_API.
- `AVALON_RADAR_OVERPASS_URL`: endpoint HTTPS propio o contratado, suministrado mediante gestor seguro para escalar sin depender del servidor comunitario. No aceptar URLs aportadas por usuarios en tiempo de ejecución.
- La aplicación aplica caché por consulta de 15 minutos, pausa de 30 segundos por propietario, un máximo de 120 entidades del proveedor, 50 tarjetas, radios pequeños, timeout de 14 segundos y solo búsqueda manual. **La caché y pausa son por instancia de servidor**: para operación comercial con más tráfico se necesita limitación persistente global y un SLA del proveedor.
- Si la API responde 429, 503 o expira, se informa del problema; **nunca se muestran negocios inventados**.
- No usar la API pública de Nominatim para autocompletar ciudades o barrer zonas. La búsqueda utiliza coordenadas preconfiguradas. Véase https://operations.osmfoundation.org/policies/nominatim/.
- El almacenamiento / exportación de datos OSM está sujeto a ODbL. Revisar requisitos de atribución y compartición antes de distribuir bases derivadas.

## QA para entrega
- `npm run lint && npm run typecheck && npm test && npm run build`.
- `tests/radar.test.cjs` valida radios restringidos, normalización de datos públicos, URLs seguras, calificación transparente y control de acceso.
- `tests/sales.browser.cjs` recorre Radar, Pipeline, Ventas y otros módulos con pantallas 390px / 320px y controla desbordamiento.
- **Verificación externa pendiente** hasta tener Preview aislado y al menos una consulta manual autorizada exitosa. Los tests no garantizan disponibilidad de la API comunitaria.

## Próxima mejora recomendada
- Catálogo de áreas (sin consultas sistemáticas). Integrar proveedor de lugares comercial/autohospedado con licencia para contactos y cobertura a escala.
- Ficha de enriquecimiento manual de cada negocio: decisor, resultado de llamadas, consentimiento y señales verificadas para CRM / IA / ecommerce.
- Deduplicación entre regiones y trazabilidad geográfica por ID de OSM.
