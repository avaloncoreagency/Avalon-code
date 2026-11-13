# Commercial Foundation — QA acceptance register

Status: **SPECIFIED / NOT EXECUTED as a complete 40-case matrix**. Existing GitHub CI may independently pass subsets; cite exact run SHA per case before marking PASS.

Scope: owner-only B2B now, B2C routing only after isolated backend and legal approvals.

| Case | Scenario | Expected | Priority | Status |
|---|---|---|---|---|
| QA-001 | Login del primer owner | Autenticación autorizada | P0 | NOT_RUN |
| QA-002 | Login del segundo owner | Misma política de acceso | P0 | NOT_RUN |
| QA-003 | No owner | Acceso API/SSR rechazado | P0 | NOT_RUN |
| QA-004 | RLS API | Sin lectura de otro tenant | P0 | NOT_RUN |
| QA-005 | Dos owners editan | Conflicto de versión visible | P1 | NOT_RUN |
| QA-006 | Servicio borrador | No vendible automáticamente | P1 | NOT_RUN |
| QA-007 | Costo desconocido | Margen no disponible | P1 | NOT_RUN |
| QA-008 | Aprobación del servicio | Requiere owner | P0 | NOT_RUN |
| QA-009 | Pago único vs recurrente | No se suman indebidamente | P1 | NOT_RUN |
| QA-010 | Venta sin contrato | Bloqueada en DB | P0 | NOT_RUN |
| QA-011 | Reintentar venta | No duplica resultados | P0 | NOT_RUN |
| QA-012 | Nueva versión de propuesta | Preserva propuesta anterior | P1 | NOT_RUN |
| QA-013 | Crear lead B2B | Audiencia correcta | P0 | NOT_RUN |
| QA-014 | Posible duplicado | Sin fusión silenciosa | P1 | NOT_RUN |
| QA-015 | Discovery parcial | Persistencia adecuada | P1 | NOT_RUN |
| QA-016 | Discovery simultáneo | Protección de cambios | P1 | NOT_RUN |
| QA-017 | Radar ZIP 33311 y 33009 | Sin reutilizar ejecución anterior | P1 | NOT_RUN |
| QA-018 | Radar no aprobado | Conversión denegada | P0 | NOT_RUN |
| QA-019 | Funnel inactivo | Rechazo al envío | P0 | NOT_RUN |
| QA-020 | Consentimiento requerido ausente | No persistir envío | P0 | NOT_RUN |
| QA-021 | Reintento de formulario | Idempotencia | P0 | NOT_RUN |
| QA-022 | Entrada B2C | No aparece en CRM B2B | P0 | NOT_RUN |
| QA-023 | Lead B2C válido | Un solo contratista | P0 | NOT_RUN |
| QA-024 | Cambio A a B | Históricos inmutables | P0 | NOT_RUN |
| QA-025 | Landing antigua | Bloquear destinatario distinto | P0 | NOT_RUN |
| QA-026 | Licencia/contrato/zona inválidos | Sin asignación | P0 | NOT_RUN |
| QA-027 | Comisión sin evidencia | No exigible | P0 | NOT_RUN |
| QA-028 | IA pregunta datos otro cliente | Denegado | P0 | NOT_RUN |
| QA-029 | IA respuesta desconocida | Sin invención | P1 | NOT_RUN |
| QA-030 | Conocimiento revocado | No recuperable | P0 | NOT_RUN |
| QA-031 | Cita sin proveedor | No confirmar | P1 | NOT_RUN |
| QA-032 | Proveedor caído | No simular éxito | P1 | NOT_RUN |
| QA-033 | Prompt injection | No elevar privilegios | P0 | NOT_RUN |
| QA-034 | Campaña sin presupuesto | No publicar ni gastar | P0 | NOT_RUN |
| QA-035 | Meta sin conexión | Estado transparente | P1 | NOT_RUN |
| QA-036 | CPL sin gasto | N/D | P1 | NOT_RUN |
| QA-037 | Duplicados | No inflar KPI | P1 | NOT_RUN |
| QA-038 | iPhone SE / 390px | Sin overflow | P1 | NOT_RUN |
| QA-039 | Español/Inglés | Paridad UX | P2 | NOT_RUN |
| QA-040 | Corte de red/sesión | No mostrar datos no guardados como persistidos | P1 | NOT_RUN |

## Evidence contract
Every executed case needs commit SHA, test command or manually reproducible steps, environment identity, synthetic fixture, observed result and timestamp. Values: PASS, FAIL, BLOCKED or NOT_RUN.
Never convert a static source-code assertion into an end-to-end passing result.

## Release blocks
1. Unresolved P0 or essential P1 in the release scope.
2. Preview shares production database or lacks isolated migrations.
3. Untested RLS/tenancy, especially B2C recipient separation.
4. Unapproved pricing, commission, legal notices or licensed-contractor advertisement.
5. No consent or inappropriate automatic communications.
6. No safe rollback plan for DB-affecting changes.

## Existing verification
Source: `tests/commercial-foundation.test.cjs`, `tests/commercial-catalog.test.cjs`, `tests/commercial-operations.test.cjs`, `tests/commercial-overview.test.cjs`, plus pre-existing suite. Always inspect latest CI; do not infer results from this file.