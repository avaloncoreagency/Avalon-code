# Radar: fuente cartografica autorizada y modo de respaldo

## Problema observado (2026-11-02)

La captura del propietario muestra mosaicos de OpenStreetMap con 403 Access blocked. El codigo de main@55e96e9 elegia automaticamente tile.openstreetmap.org si faltaba NEXT_PUBLIC_AVALON_MAP_TILES. Ademas, el header Referrer-Policy: no-referrer de la app impide enviar el Referer que los servidores comunitarios exigen a las paginas web.

Atencion: algunos mosaicos de bloqueo son imagenes HTTP 200; tileerror no detecta esos casos. Documentacion oficial:
- https://operations.osmfoundation.org/policies/tiles/
- https://wiki.openstreetmap.org/wiki/Blocked

## Contrato del parche (solo rama aislada)

- Sin NEXT_PUBLIC_AVALON_MAP_TILES valida, no se solicitan mosaicos al servidor comunitario. Leaflet mantiene cuadrícula local, marcadores, centro, radio y resultados, y permite abrir el mapa oficial mediante clic voluntario.
- El proveedor configurado debe tener plantilla HTTPS con {z}, {x}, {y} y sin credenciales embebidas. Se rechaza especificamente el endpoint comunitario de OSM que produjo el bloqueo.
- Para una fuente aprobada, cada imagen del mapa usa referrerPolicy=strict-origin-when-cross-origin para enviar solo el origen del sitio, sin la ruta del CRM. La politica global de seguridad no-referrer no se cambia.
- Si un mosaico falla o no completa la carga inicial dentro de ocho segundos, la capa externa se retira y la cuadrícula queda operativa.
- Atribucion de datos OSM permanece. El proveedor cartografico externo puede exigir atribucion adicional; comprobar licencia y condiciones antes de activarlo.

## Para volver a mostrar calles y edificios

El propietario debe seleccionar un proveedor cartografico autohospedado o licenciado que acepte uso comercial, terminos y presupuesto. Configurar su URL como NEXT_PUBLIC_AVALON_MAP_TILES solo en el entorno aprobado. Las variables NEXT_PUBLIC son visibles al navegador: solo se permiten claves publicas restringidas por dominio, nunca secretos. Ningun proveedor de pago ni configuracion remota se activa mediante este parche.

La busqueda de empresas OSM/Overpass y su licencia son independientes del mapa base. Este cambio no activa cron, barridos automaticos, llamadas comerciales ni fuentes externas.

## Verificacion pendiente

1. Ejecutar npm ci, node --test tests/radar-map-tiles.test.cjs, npm run lint, npm run typecheck, npm run build.
2. En pantalla de 320 y 390 px sin proveedor, verificar cero peticiones a tile.openstreetmap.org, ausencia de cuadros 403, estado claro y controles accesibles.
3. Con proveedor autorizado simulado, confirmar solo Referer de origen, atribucion exigida, renderizado de marcadores y radio al terminar Leaflet, y degradacion ante errores de carga.
4. Validar Preview con base Supabase genuinamente aislada, cuando este autorizada. CI verde no equivale a validacion de login humano o disponibilidad de servicio externo.

Estado: patch revisable en rama aislada. Sin merges, cambios de Vercel, Supabase, datos reales, credenciales o servicios de pago.

## Geolocalización: hallazgo y mitigación sin cambiar permisos

El botón «Usar mi ubicación» es una acción explícita del propietario y no debe recopilar coordenadas automáticamente. La cabecera global actual `Permissions-Policy: geolocation=()` la deshabilita. Esta rama ahora detecta el rechazo de políticas cuando el navegador lo expone y explica que el usuario debe buscar una ciudad o tocar el mapa. Si el permiso está disponible en el futuro, la solicitud usa timeout de 12 segundos y evita búsquedas de alta precisión. **Esto no habilita geolocalización** ni modifica cabeceras globales: cualquier habilitación en una ruta administrativa requerirá revisión de SHIN sobre privacidad/seguridad y pruebas de consentimiento.

El filtro también rechaza subdominios arbitrarios y alias con punto final de `tile.openstreetmap.org` para que configuraciones erróneas no reintroduzcan la fuente bloqueada.
