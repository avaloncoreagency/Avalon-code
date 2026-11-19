# Radar — pausa recuperada sobre main, 19 noviembre 2026

Refs #23; recupera únicamente guards, flag, UI y pruebas de #228 sobre main 53e5436. No recupera el ledger/UI financiera de #227 ni reemplaza páginas de Claude/Samuel. No generated asset.

Por defecto, `AVALON_RADAR_EXTERNAL_ENABLED` ausente o distinto de `true` bloquea búsquedas, geocodificación, investigación, activación/ejecución de campañas y el código candidato del worker antes de sondas/red/lease. La UI no inicia mapa de proveedor ni investigación automática; los registros existentes siguen legibles. Endpoint owner-only de lectura del estado, sin mutador público. La reactivación requiere configuración de servidor autorizada; no hay flag de navegador.

Pruebas reales locales: 680 unitarias aprobadas, incluidas cinco negativas ejecutables para búsquedas repetidas sin lecturas/escrituras, sin DNS/robots, entradas HTTP y worker con config habilitada que no alcanza la red. Tests históricos de proveedores optan por habilitar el contrato sintético; el E2E legado de Sales hace el mismo opt-in exclusivamente en su proceso aislado para conservar su cobertura. No se eliminan pruebas.

Producción consultada en lectura: cron `avalon-radar-hourly` inactivo. No se modifica el worker v10 ni su config remota. Esta rama no demuestra cero consumo en producción mientras no se publique/active allí. La orden actual no autoriza cambiar esa programación ni el worker remoto. No se llama ningún proveedor pagado.

Estado: implementado y probado local; CI/Preview y revisión pendientes. No fusionar #228 entero sobre main reciente: incluye archivos comerciales antiguos que requieren reconciliación. Este PR es la recuperación focal.

Next action: revisión por propietarios del candidato y CI exacto; cualquier publicación del worker o cambio remoto se autoriza por separado.
