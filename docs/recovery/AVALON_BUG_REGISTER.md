# Registro verificable de defectos

14-nov-2026 · estados de código local; ninguna corrección implica producción. No se usa CLOSED sin aceptación del entorno destino.

| ID | Severidad | Reproducción / causa | Corrección | Evidencia | Estado |
|---|---|---|---|---|---|
| ATT-01 | P1 | RIFF/WAV pasa como WebP; PNG truncado y ZIP de cuatro bytes pasan como imagen/Office | Firma completa; lector ZIP existente con límites/CRC; estructura OOXML y rechazo de macros/embebidos | `attachment-integrity-recovery`, rojo→verde | TESTED local |
| ATT-02 | P2 | Hex dañado se convierte en bytes parciales; descarga no verifica sha256 | Decoder estricto, tamaño y digest antes de devolver bytes | `crm-lead-attachments`, bytes alterados reciben 409 | TESTED local |
| PROD-01 | P1 | Checklist incompleto permite verified y editar criterios después conserva verified | Completar criterios antes de verificar; reabrir antes de editar datos/checklist; UI coherente | `product-verification-recovery`, rojo→verde | TESTED local |
| PROD-02 | P1 | Encargo IA exporta texto libre con patrones de claves y URLs con query privada | Detección heurística bloquea exportación; contexto canónico; query/fragment eliminados | `product-report-recovery` 3 casos | TESTED local |
| PROD-03 | P2 | Un UUID igual en lead y cliente permite mostrar el nombre del lead en la ficha canónica | Tipar el origen de nombres y claves de grupos; priorizar Cliente 360° | `product-client-identity-recovery`, rojo→verde | TESTED local |
| BRIDGE-01 | P1 | Recibo de v1 devuelve number=3 tras v2/restauración | Consultar la versión sellada exacta, jamás latest para replay | PG service: fallo 3≠1 antes, pasa después; 3 unitarias | TESTED aislado |
| AUD-01 | P2 | Huella v1 puede ignorar cambios en predicados/defaults/grants sobrecargados | Huella v2 y prueba con alteraciones reales de catálogo | `schema-fingerprint.database` | TESTED aislado |
| QA-01 | P2 | Fixture HTTP consulta interfaces restringidas; cleanup espera evento exit ya ocurrido | Bind a 127.0.0.1, cleanup acotado y fallo temprano | Auth y CRM HTTP pasan; prueba de proceso real | TESTED local |
| INFRA-01 | P1 | Preview usa fallback de Supabase producción | Guard intacto; overrides aislados preparados pero no creados sin rama remota | Logs Vercel f3496b2 + error 400 de configuración | REPRODUCED / bloqueado |
| ACL-01 | P2 | anon tiene EXECUTE adicional sobre restore en producción; invoker y owner guard siguen activos | SQL review-only revoca PUBLIC/anon, conserva authenticated, idempotente | Lectura catálogo + `restore-grant.database` | DISCOVERED; propuesta TESTED |
| PUB-01 | P2 | Revisión automática rechaza rama remota por antigua prohibición GitHub | Paquete local y borrador de PR; no se intenta otra vía | Rechazo explícito de create_branch | REPRODUCED / autorización pendiente |
| QA-02 | P1 | Chromium no puede crear socket de singleton; Safari no disponible | Pruebas preparadas; no alterar sandbox ni afirmar capturas | socket/ptrace EPERM | REPRODUCED / entorno bloqueado |

## Límites pendientes del producto

- Product Control automatizado recibe ZIP en inbox, pero sin vínculo crea un producto sin cliente; el owner debe asociarlo. No existe entrega real externa demostrada de extremo a extremo en este candidato.
- Dos paquetes distintos conservan versiones, pero no está demostrada una comparación atómica del digest base durante toda la aceptación. No prometer resolución automática de conflictos.
- Verificación de incidencia es testimonio manual del owner; la aplicación no verifica por sí misma una URL de evidencia ni el funcionamiento del proveedor.
- Detección de secretos y estructura Office es defensa acotada, no antivirus ni detección universal.
- No está probada restauración de backup de datos/Storage remotos. El bundle es respaldo de código, no de clientes.
