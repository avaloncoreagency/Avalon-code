# Avalon — informe de candidato recuperable

14 de noviembre de 2026 · America/New_York. **Desarrollo local probado; release pendiente.** Base `28aadc9d2bb1da71de8512ebd4238754d5af337e` antes del commit documental. El SHA final y los hashes están en HANDOFF.json del paquete.

## Entrega

- Rama de integración `codex/total-recovery-20261114`: conserva y reúne #175, #181, #182, #183 y #184 sobre main `991e72d`. No se fusionó ninguna PR remota.
- Rama pequeña independiente de seguridad `codex/recovery-attachments-20261114`: `b3fad059150ac76a0abb19f1ae8287978ae27888`. Contiene solo la corrección de adjuntos y sus fixtures, basada directamente en main; permite revisión separada. No aplicar ambas ramas como parches duplicados: la integración ya contiene esa corrección.
- Correcciones propias: validación real de Office/WebP/PNG, decoder bytea estricto, hash/tamaño de descargas, criterios de verificación protegidos, filtros de incidencias, encargo IA con contexto y protección de credenciales, identidad canónica de clientes, recibos estables de versiones y huella de esquema ampliada. Fixtures HTTP corregidos para loopback/cleanup.
- Se conserva un único almacenamiento/versionado, CRM, Auth, Communication Hub y HQ. Biblioteca desaparece del sidebar en el candidato #175; rutas técnicas, versiones y archivos siguen disponibles.

## Pruebas realmente ejecutadas

| Nivel / comando | Resultado | Alcance |
|---|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` (root y tests/qa) | PASS | Lockfiles; no ejecución de instaladores de dependencias |
| `npm test` | **565/565** | Unitarias y mocks; incluye regresiones nuevas |
| `npm run bridge:test` | **28/28** | Dev Bridge; no acceso a chats privados |
| `npm run typecheck` | PASS | TypeScript |
| `npm run lint` | 0 errores / 5 avisos previos | No se eliminaron pruebas ni silenciaron reglas nuevas |
| `npm run build` | PASS | Next compilado local, no deployment |
| Todas las `tests/*database.cjs` existentes | **63/63** | PostgreSQL PGlite, migraciones reales, datos sintéticos |
| Nuevas suites catálogo/ACL | **2/2** | Huella con cambios de política/defaults/grants; propuesta ACL idempotente |
| Bridge service reejecutado tras corregir recibo | **2/2** | Import ZIP→v1→v2→restaurar v3→replay exacto v1; blobs simulados |
| Auth HTTP y ventas HTTP | **2/2** | Next real; Auth/REST simulados, PostgreSQL aislado |
| CRM HTTP (modo sin navegador) | **1/1** | Owner/non-owner/anon en tres rutas, inexistente 404 |
| Growth HTTP + navegador | **FAIL** | La parte pública HTTP pasó; no completa envío del navegador por falta de navegador ejecutable permitido |
| Chromium del sistema | **BLOCKED** | Singleton socket / ptrace EPERM. No se debilitaron controles |
| Safari / iPhone físico | NO EJECUTADO | No se afirma emulación equivalente |
| `npm audit --omit=dev --json` | 0 vulnerabilidades reportadas | Inventario del registro, no auditoría universal de seguridad |
| Restauración bundle en directorio vacío | Verificación incluida en paquete | SHA exacto, estado limpio y git fsck; código, no datos de clientes |

Las ejecuciones focales repetidas no se suman como pruebas distintas. Los tests de managers se ejecutaron solo en bases locales sintéticas; no activaron automatizaciones remotas. El CI de las PR fuente no es CI de este candidato final.

## Evidencia y estado remoto

Los HEAD consultados de #181–#184 tienen 5 workflows exitosos cada uno. #175 tiene seis exitosos y un Growth cancelado. El candidato local todavía no tiene CI remoto ni URL de Preview. Producción READY corresponde a `991e72d`; no incluye esta entrega.

Producción y staging difieren en categorías ZIP. Se preserva la bandera de categorías extendidas desactivada por defecto. No se aplicó SQL productivo. La huella v2 detectó una ACL adicional anon de restore en producción; función SECURITY INVOKER con guard owner. SQL review-only y prueba en `proposals/restore-version-execute-review.sql` y `tests/restore-grant.database.cjs`.

## Pendientes exactos

1. **Autorización GitHub explícita para esta misión:** la revisión automática rechazó crear la rama por la instrucción histórica sin GitHub. No se intentó push ni otra API. Sin rama, Vercel rechazó los overrides aislados con 400; no hubo cambio de variables.
2. Publicar candidato en borrador y preparar Preview con staging existente; ejecutar CI sobre SHA exacto y verificar que la base coincide con el contrato de categorías y ACL. No copiar variables de producción.
3. Sesiones de ensayo independientes autorizadas: guardar, volver a entrar, importar v2, restaurar, rechazar tercero y ensayar concurrencia. No se crearon usuarios ni se usaron cuentas reales en esta ronda.
4. QA de navegador 320/390/escritorio y EN/ES en un ejecutor con Chromium permitido; Safari real requiere dispositivo disponible. No hay capturas de este candidato.
5. Backups remotos de datos y Storage, conflicto atómico de dos paquetes, entrega externa real y revisión de proveedores/privacidad antes de activación. No se atribuyen métricas o costes sin medición.

## Uso y reversión

Una vez revisado y desplegado en Preview, cada owner entra con su cuenta y abre el módulo del producto, registra la referencia y cliente canónico, recibe ZIP en el inbox, vincula al mismo producto y procesa una nueva versión. Desde la ficha crea incidencia, checklist y evidencia, descarga un encargo y verifica manualmente la corrección. Reabrir antes de modificar criterios ya verificados. Una URL o status activo no demuestra servicio conectado, pago ni publicación.

No hace falta que Miguel o Samuel ejecuten comandos para conservar esta entrega: el paquete contiene código, historia, pruebas e instrucciones de integración. El integrador reconstruye el bundle en otra carpeta y revisa los cambios; no ejecutar código recibido antes de revisión. El patch oficial por commits puede omitir commits merge: usar el bundle como fuente autoritativa y el diff neto para revisar toda la integración.

Rollback: revertir código con revisión, preservar tablas, bucket y versiones; restaurar productos como versión nueva. Nada de esta sesión requiere rollback remoto porque no se modificó producción.

Next action: autorizar GitHub para `codex/total-recovery-20261114` y abrir una PR en borrador; después completar Preview aislado y aceptación. No afirmar Avalon terminado.
