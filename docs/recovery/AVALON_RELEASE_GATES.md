# Puertas del candidato local

Checkpoint actualizado el 2026-11-14, America/New_York. La publicación de ramas ya fue autorizada y ejecutada. Estas puertas describen evidencias concretas, sin atribuir un porcentaje de eficiencia o de finalización a Avalon. El candidato sigue pendiente de aceptación remota y humana.

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
| Preview aislado | PASS en f7409d1 | dpl_Hmvfimyi4w2LSZ6z4BPABiZ1YerE; cualquier nuevo SHA requiere su propio deployment |
| Navegador Chromium escritorio/320/390 y EN/ES | PASS en f7409d1, sintético | CI CRM/ventas/funnel; datos/Auth/REST sintéticos y PGlite. No Safari ni iPhone físico; cada nuevo SHA requiere CI |
| Dos owners reales, persistencia remota y recuperación | NOT VERIFIED | No se usaron cuentas reales ni se crearon usuarios |
| Aceptación humana, seguridad final y rollback de datos | PENDING | Revisión de ACL, paquetes concurrentes y respaldo real pendientes |

## Orden seguro

1. Mantener PR #195 en borrador para revisión; ramas publicadas con autorización. Nunca push a main.
2. Conservar únicamente los overrides Preview de esa rama hacia staging; no cambiar defaults globales ni variables productivas. Comparar el catálogo v2 con la cadena del candidato.
3. No repetir migraciones productivas ni asumir equivalencia por nombre. La ampliación de categorías está en staging, pendiente en producción. La propuesta ACL es revisión, no una migración aplicada.
4. Ejecutar CI en el SHA final; preparar Preview aislado, probar sesiones autorizadas y datos sintéticos. No afirmar que el deployment READY completa E2E.
5. Mantener este candidato y las PR fuente en borrador hasta revisión de integración y QA. Cerrar PR redundantes solo tras demostrar cobertura y autorización.

## Dependencias de desarrollo

El audit completo de f7409d1 detectó seis alertas moderadas derivadas de minimatch 10.2.6 bajo typescript-estree; el audit productivo era cero. La continuación fija únicamente esa dependencia de desarrollo a 11.0.1 mediante override específico. Justificación, compatibilidad y aceptación: `DEPENDENCY_CLOSURE.md`. Un audit limpio no acredita por sí solo la seguridad de toda la aplicación.

## Rollback

Revertir el candidato de aplicación preservando tablas/buckets/versiones y los commits originales. Ningún SQL de este incremento se aplicó remotamente. No revertir permisos a ciegas: restaurar la ACL capturada solo con aprobación. Las restauraciones de productos deben crear una versión nueva. El bundle conserva código e historia, no datos de negocio ni Storage.
