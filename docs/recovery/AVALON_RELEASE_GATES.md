# Puertas del candidato local

Indicador de **validación del candidato**, no porcentaje de implementación o eficiencia de Avalon. Doce criterios con igual peso: 8 aprobados / 12 = **66.7 %**. Esta cifra no autoriza una publicación. Las últimas cuatro puertas siguen abiertas; cualquier nuevo fallo invalida la puerta correspondiente.

| Puerta | Resultado | Evidencia |
|---|---|---|
| Instalación bloqueada por lockfile | PASS | npm ci root y QA; versiones fijadas |
| TypeScript | PASS | tsc --noEmit |
| Lint | PASS con avisos | 0 errores, 5 warnings existentes |
| Unitarias | PASS | Conteo final en FINAL_REPORT |
| Dev Bridge | PASS | 28/28 |
| PostgreSQL aislado y seguridad negativa | PASS | 63 existentes + 2 nuevas de catálogo/ACL; servicio reejecutado tras cambio |
| Build de producción local | PASS | next build; no deployment |
| Código recuperable desde directorio vacío | PASS al entregar | Bundle completo, fsck, SHA y clone exacto documentados en paquete |
| Preview aislado en SHA final | BLOCKED | Rama remota rechazada; overrides no creados |
| Navegador escritorio/320/390 y EN/ES | BLOCKED | Chromium EPERM; Safari no disponible |
| Dos owners reales, persistencia remota y recuperación | NOT VERIFIED | No se usaron cuentas reales ni se crearon usuarios |
| Aceptación humana, seguridad final y rollback de datos | PENDING | Revisión de ACL, paquetes concurrentes y respaldo real pendientes |

## Orden seguro

1. Autorizar de forma explícita GitHub para esta misión; publicar solo la rama y una PR en borrador. Nunca push a main.
2. Crear únicamente overrides Preview para esa rama con URL/credencial pública del staging existente; no cambiar defaults globales ni variables productivas. Comparar el catálogo v2 con la cadena del candidato.
3. No repetir migraciones productivas ni asumir equivalencia por nombre. La ampliación de categorías está en staging, pendiente en producción. La propuesta ACL es revisión, no una migración aplicada.
4. Ejecutar CI en el SHA final; preparar Preview aislado, probar sesiones autorizadas y datos sintéticos. No afirmar que el deployment READY completa E2E.
5. Mantener este candidato y las PR fuente en borrador hasta revisión de integración y QA. Cerrar PR redundantes solo tras demostrar cobertura y autorización.

## Rollback

Revertir el candidato de aplicación preservando tablas/buckets/versiones y los commits originales. Ningún SQL de este incremento se aplicó remotamente. No revertir permisos a ciegas: restaurar la ACL capturada solo con aprobación. Las restauraciones de productos deben crear una versión nueva. El bundle conserva código e historia, no datos de negocio ni Storage.
