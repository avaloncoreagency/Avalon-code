# Cierre focal de dependencias — 2026-11-14

Base: PR #195, f7409d1d260a470be69254d7679c6e0da41cc88d. Main verificado: 991e72ddd160b0ea5970897bac76d53b669a9fa9. Referencia: #23. La rama de continuación es propia; no modifica ramas de otros responsables.

## Cambio

La auditoría completa encontró seis alertas moderadas en la cadena de desarrollo typescript-eslint → typescript-estree → minimatch. Advisory oficial: https://github.com/advisories/GHSA-g3hv-75wg-m249 ; versión corregida publicada: 11.0.1.

Se fija `overrides.@typescript-eslint/typescript-estree.minimatch=11.0.1`. Es un cambio mayor transitivo, limitado a ese consumidor: no se sustituye minimatch 3 utilizado por otros plugins. El consumidor usa la exportación nombrada `minimatch(filePath, pattern, {dot:true})`, que conserva la versión elegida. Soporta los Node 22 de CI y añade una dependencia transitiva de desarrollo sin servicios ni costes contratados. El lockfile conserva integridad y versiones; ninguna dependencia de producción se modifica.

Reproducción: `npm ci --ignore-scripts`, `npm audit`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run bridge:test`, `npm run build`. La aceptación exige audit completo cero y esas comprobaciones aprobadas; CI y Preview deben corresponder al nuevo SHA. Los resultados del checkpoint anterior no se atribuyen automáticamente a este cambio. No se usó `npm audit fix --force`.

Validación local ejecutada tras el cambio: audit completo **0**, lint **0 errores/5 avisos existentes**, typecheck **PASS**, unitarias **565/565**, Dev Bridge **28/28**, build **PASS**. También se comprobó la firma real de minimatch mediante el resolvedor del consumidor con patrones coincidentes, no coincidentes y archivos ocultos. Esta validación cubre el tooling actualizado, sin atribuirle pruebas de sesiones remotas.

## Integración preservada

PR #195 reúne #175/#181/#182/#183/#184; #196 es una revisión alternativa de adjuntos ya incluida, no otro parche que aplicar encima. El Preview anterior de f7409d1 y sus ocho workflows están aprobados. El bundle de entrega conserva los originales y se reconstruye desde un directorio vacío.

## Pendientes que no se pueden reemplazar con mocks

- Dos sesiones de ensayo independientes contra staging y un usuario no autorizado: persistencia tras nuevo login, concurrencia, historial y restauración. No hay credenciales QA independientes configuradas en este entorno; no se crean usuarios ni se cambian permisos.
- Revisión autorizada de diferencias de catálogo, ampliación de categorías y propuesta ACL. No se aplica SQL remoto ni se cambia producción.
- Aceptación humana y respaldo de datos/Storage. El bundle respalda código e historia, no datos de clientes. Safari/iPhone físico y rendimiento/costes siguen no medidos.

Rollback del cambio de tooling: revertir únicamente package.json/package-lock.json de este incremento; no afecta datos ni auth. No fusionar otras PR paralelas sin revisar sus HEAD y ownership actuales.
