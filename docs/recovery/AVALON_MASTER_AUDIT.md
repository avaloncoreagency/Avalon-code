# Avalon — Total Recovery, CP0–CP13

Revisión: 14 de noviembre de 2026 · America/New_York. Base remota: `991e72ddd160b0ea5970897bac76d53b669a9fa9`. Rama local: `codex/total-recovery-20261114`. Último código antes de esta documentación: `28aadc9d2bb1da71de8512ebd4238754d5af337e`.

**Veredicto: candidato local, NOT_READY para release.** No se modificaron producción, datos, cuentas, automatizaciones ni proveedores. No se hizo push, merge remoto ni despliegue. Costes, créditos y rendimiento de usuario: no medidos.

## Fuentes contrastadas

- GitHub conectado: main y AGENTS actuales, PR #174/#180 fusionados, #175/#181–#184 abiertos en borrador. Inventario completo de **65 PR abiertos** en `AVALON_PR_RECONCILIATION.md` y JSON de evidencia. Las PR antiguas sin diff revisado quedan pospuestas; ninguna se cerró por inferencias.
- Graphify: índice exactamente en main `991e72d`, recall y rank de seis archivos. Navegación contrastada con código vivo.
- Vercel producción: `dpl_H7AXUpDQEussYDRirHDNXkHjbyuK`, READY, SHA exactamente `991e72ddd160b0ea5970897bac76d53b669a9fa9`. READY no verifica login ni E2E. Los Preview de #181–#184 fallan por el guard que impide usar la base productiva.
- Vercel env: las variables aisladas existen para ramas específicas (Phoenix, Product Control y adjuntos); no cubren las cuatro ramas nuevas. Se verificó una credencial pública de staging sin imprimirla ni guardarla en el repositorio. Intentar crear overrides solo para esta rama devolvió 400 porque la rama remota no existe; no se cambió la configuración.
- Supabase: producción 38 migraciones, staging 39. Solo lecturas de catálogo, historial y Advisors. Base principal ACTIVE_HEALTHY; registro de rama main MIGRATIONS_FAILED conserva fecha 31-oct. No se conoce la causa actual y no se reseteó la rama.
- Catálogo v2: 89 tablas, 1086 columnas, 135 funciones, 112 triggers, 181 políticas, 228 índices. Columnas/tablas/índices/predicados de políticas/triggers coinciden entre producción y staging. Difieren constraints, cuerpos de funciones y ACL. El staging coincide con el candidato en seis secciones; los cuerpos incluyen diferencias de comentarios y las ACL incluyen roles de plataforma, por lo que esas diferencias requieren revisión, no equivalen automáticamente a vulnerabilidades.
- Comparación de EXECUTE por firma en 135 funciones: la única diferencia para anon/authenticated es `os_project_restore_version(uuid,text)`, ejecutable por anon en producción. Es SECURITY INVOKER con guard is_owner; no se demostró acceso indebido. Propuesta de corrección probada solo en PGlite.

## Integración local preservada

Se integraron localmente, sin conflicto y conservando commits, las puntas verificadas: #175 `b165057`, #181 `f3496b2`, #182 `3b2a54e`, #183 `61cdaf4`, #184 `3de4b02`. Esto no fusiona las PR remotas. Las rutas, tablas y sistemas existentes se reutilizan. El archivo del paquete original `732bcd5` no estaba disponible en esta copia: no se reconstruyó ni se mezcló a ciegas con la implementación vigente de #175.

## Checkpoints

| CP | Resultado real |
|---|---|
| 0 | Inventario remoto y checkout aislado; documentación histórica contrastada |
| 1 | Causa Preview confirmada; esquema catalogado; configuración/publicación bloqueadas |
| 2 | Correcciones de adjuntos; Auth/RLS sintéticos; ACL remota solo propuesta |
| 3 | CRM/Radar/pipeline probados en PostgreSQL aislado, incluido 33311→33009 sintético |
| 4 | Rescate local de Cliente 360°, tareas y procedencia comercial; ventas HTTP probado |
| 5 | Rescate #175, filtros e integridad de verificación, reportes y recibos corregidos |
| 6–8 | Communication Hub, productos, Marketing/Funnels: código y SQL aislados; proveedores apagados, navegador incompleto |
| 9 | Rescate #181; managers permanecen apagados, no se ejecutaron en remoto |
| 10 | TypeScript/build y medidas de bundle del compilador; sin benchmark móvil |
| 11 | Pruebas y límites en FINAL_REPORT; navegador bloqueado |
| 12 | Candidato local recuperable; release no autorizado ni certificado |
| 13 | Paquete, hashes, instrucciones y estado honesto; publicación pendiente |

No se certifica el conjunto de Avalon al 100 %. El indicador de validación se define por puertas explícitas en `AVALON_RELEASE_GATES.md`, no por un porcentaje inventado de funcionalidades.
