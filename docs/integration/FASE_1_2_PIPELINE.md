# Fase 1 (auditoría) y Fase 2 (pipeline y ficha de cliente)

## Base de integración
`release/avalon-os-production-candidate` (PR #19, borrador). Ya reúne el CRM de Samuel, las operaciones de cliente de Miguel, el login por contraseña y las cabeceras. Esta rama parte de ahí. El PR #13 (Centro de Seguridad, MFA, límites de intentos) es complementario y no se mezcla aquí.

## Qué ya funciona (heredado, no se reconstruye)
Leads, Kanban, calendario con detección de conflictos, actividades, prospectos con aprobación previa a la conversión, uso de IA manual, auditoría append-only y RLS por propietario.

## Qué agrega esta fase (migración `20261102120000_crm_pipeline_clients.sql`)
- 13 etapas configurables. Las 8 existentes conservan su `id` y sus leads; solo cambian etiqueta y posición. Las etapas no se borran; no se puede desactivar ni cambiar el tipo de una etapa con leads.
- Cada etapa define días para considerar un lead estancado, probabilidad por defecto y una tarea de seguimiento automática al entrar.
- `crm_lead_health`: vista (con RLS del usuario) con días en etapa y `is_stale`.
- `crm_clients`: ficha de cliente con relaciones por ID estable (lead, prospecto, actividades, eventos).
- `crm_conversions` + `crm_convert_lead_to_client()`: un lead ganado NO se vuelve cliente solo. La conversión exige una decisión (convertir o declinar) con motivo, guarda una copia del lead y es idempotente.
- Corrección de versión: `crm_core` se renombró a `20261102085430` para coincidir con el registro de producción.

## Pruebas
`tests/sql/crm_pipeline.test.sql` se ejecuta en PostgreSQL 16 real (local y CI) y en PGlite. Verificado también con una mutación: sin el guardia de etapas la prueba falla.

## Pendiente de esta fase
Interfaz de la ficha y del flujo de conversión, y editor de etapas. Depende de esta migración. **No se aplica a producción sin la aprobación de ambos dueños.**
