# Avalon Knowledge — sucesión de evidencias STABLE V1 (KN-V3-01)

**ID:** KN-V3-01 · **Versión:** v1.0 · **Departamento / custodio propuesto:** Knowledge & Innovation.  
**Solidez documental:** VERIFICADO para existencia/estado de fuentes citadas, no para producción · **Vigencia:** POR REVISAR · **Aprobación:** BORRADOR · **Clasificación:** PUBLICABLE · **Revisión:** 2026-11-22 (America/New_York).  
**Base observada:** `main@ff8191d23c99e3e4230f0d6e224230821c94aa43` · **Dependencia canónica:** [Issue #303](https://github.com/avaloncoreagency/Avalon-code/issues/303), admisión en [#304](https://github.com/avaloncoreagency/Avalon-code/issues/304).

> Registro incremental, **no** segundo backlog, registro corporativo de decisiones ni autorización de despliegue. Una prueba asociada a un SHA no valida automáticamente otra versión. El repositorio es público: no publicar credenciales, cifras comerciales privadas ni información real de clientes.

## Objetivo y alcance

Cerrar discrepancias de vigencia en [índice Knowledge](../../knowledge/README.md) y [catálogo de fuentes](../../knowledge/SOURCE_CATALOG.md), y orientar la consulta del [checkpoint Master Completion](../../master-completion/MASTER_BACKLOG.md) sin cambiar un archivo de otro custodio. No se modifican código, migraciones, permisos, CI, rama de Claude/Codex/Samuel ni producción.

## Evidencia incremental (estado observable en la fecha de revisión)

| ID | Fuente primaria | Hecho documental | Interpretación / límite |
| --- | --- | --- | --- |
| KN-E01 | [PR #268](https://github.com/avaloncoreagency/Avalon-code/pull/268) y `docs/knowledge/*` en `main@ff8191d` | **VERIFICADO:** PR fusionado; índice, catálogo y registros existen en `main` | No significa aprobación corporativa de sus propuestas |
| KN-E02 | [PR #269](https://github.com/avaloncoreagency/Avalon-code/pull/269), [#288](https://github.com/avaloncoreagency/Avalon-code/pull/288) | **VERIFICADO:** clasificador de consultas orientativo fusionado dentro de la integración | No equivale a rechazo automático ni a antibot remoto probado |
| KN-E03 | [PR #300](https://github.com/avaloncoreagency/Avalon-code/pull/300), [commit main](https://github.com/avaloncoreagency/Avalon-code/commit/ff8191d23c99e3e4230f0d6e224230821c94aa43) | **VERIFICADO:** candidato anterior fusionado en `main` | Merge no prueba Preview operativo, aplicación de SQL ni liberación |
| KN-E04 | [PR #301](https://github.com/avaloncoreagency/Avalon-code/pull/301), [CI #44911733504](https://github.com/avaloncoreagency/Avalon-code/actions/runs/44911733504) y [CI #44914077141](https://github.com/avaloncoreagency/Avalon-code/actions/runs/44914077141) | **REPORTADO/CI referenciado:** QA independiente satisfactoria para `ff8191d` y `320a21e`, incluido foco Kanban | Safari físico, entorno hospedado y otras revisiones: **NOT_RUN/BLOQUEADO** según PR |
| KN-E05 | [PR #302](https://github.com/avaloncoreagency/Avalon-code/pull/302), [#312](https://github.com/avaloncoreagency/Avalon-code/pull/312) | **VERIFICADO:** auditoría adicional de privilegio implícito PUBLIC EXECUTE preparada en PR abiertos | No se verificaron ACL de producción ni aprobación de merge |
| KN-E06 | [PR #314](https://github.com/avaloncoreagency/Avalon-code/pull/314), [#316](https://github.com/avaloncoreagency/Avalon-code/pull/316) | **VERIFICADO:** revisión V5 y corrección propuesta del RPC antiguo de atribución siguen abiertas | No atribuir a V5 resultados de QA de V4; gate financiero/SQL separado |
| KN-E07 | [Issue #286](https://github.com/avaloncoreagency/Avalon-code/issues/286) | **VERIFICADO:** revisión jurídica contractual requerida figura abierta | Términos, precios y aprobación de propietarios pendientes |
| KN-E08 | [PR #317](https://github.com/avaloncoreagency/Avalon-code/pull/317) | **VERIFICADO:** trabajo de portal de empleados sigue en PR separado | Exclusivo de Samuel; no integrar desde Knowledge |

Los estados de PR se refieren a la observación de 2026-11-22 y deben comprobarse antes de actuar. En KN-E04 se describe la evidencia aportada por CI/PR, **no** una prueba ejecutada por este departamento.

## Clasificación A–H para Knowledge

| Clase | Elemento | Estado |
| --- | --- | --- |
| A. Implementado y verificado | Índice, SOP, catálogo, glosario y registro de decisiones presentes en `main` | VERIFICADO como archivos |
| B. Implementado sin validación suficiente | Controles V5 y condiciones de entorno posteriores a los SHA aceptados por Codex | PARCIAL |
| C. Pendiente de integración | Este suplemento + actualización del catálogo (rama documental separada) | EN REVISIÓN |
| D. Incompleto | Ratificación de custodia/autoridad corporativa y aprobación editorial | BLOQUEADO |
| E. Error reproducible | Referencias a #268/#269 como no fusionados en catálogo anterior | CORREGIDO EN RAMA, pendiente de merge |
| F. Decisión humana | Legal #286, política de precios y GO/NO-GO; merge/deploy requiere revisión propia | BLOQUEADO |
| G. Duplicado/sustituido | `README.md` anterior a #268; historial de #300; alternativas de scroll #309/#311 | HISTÓRICO / comprobar integración |
| H. Pospuesto | Guardian, Radar, OpenRouter y servicios comerciales restringidos | PAUSADO |

## Sucesión de fuentes y contradicciones

1. **README y Knowledge:** el diagnóstico de `main@207ed3a` sobre falta de login fue sustituido por el [README de `main@ff8191d`](https://github.com/avaloncoreagency/Avalon-code/blob/ff8191d23c99e3e4230f0d6e224230821c94aa43/README.md) y #268. Sigue faltando prueba remota de Auth/RLS, fuera de Knowledge.
2. **Clasificador #269:** ya fusionado; su etiqueta antigua de draft era válida el 20-nov y es histórica tras el 21-nov. El backend de intake y el filtrado de bots requieren revisión específica.
3. **Master Completion:** [`MASTER_BACKLOG.md`](../../master-completion/MASTER_BACKLOG.md) mantiene la afirmación original «None of this is merged», válida solo como snapshot previo al merge de #300. **No se ha editado ese archivo de Claude.** Handoff: añadir un aviso de sucesión por el custodio técnico; el contenido original no debe borrarse.
4. **Backlog PM:** [#303](https://github.com/avaloncoreagency/Avalon-code/issues/303) conserva referencias iniciales de #300 y #301 anteriores a la fusión/QA posterior. Solo Project Manager debe actualizar sus estados; este documento enlaza la evidencia más reciente y no cambia asignaciones.
5. **V5 posterior:** #305/#306/#307 son fuentes de la línea #311/#314; #309 es una corrección alternativa de scroll. No fusionarlas otra vez sin verificación del árbol combinado. #316 propone remediación financiera con su propio SHA y validación pendiente.
6. **Registro de decisiones:** [`DECISION_REGISTER.md`](../../knowledge/DECISION_REGISTER.md) contiene directrices BORRADOR; no elevarlas a APROBADO sin acta de autoridad de Miguel/Samuel.

## Contrato de evidencia, seguridad y próximos eventos

- **Fuente técnica:** `main` + SHA, PR HEAD, archivos cambiados y controles de CI para el mismo árbol.
- **Fuente empresarial:** autoridad y aprobación explícita registradas fuera de datos sensibles. No deducir precios ni contratos de un campo UI o archivo JSON.
- **Fuente de operación:** pruebas de Preview aislado, Safari real y recuperación verificable, diferenciadas de GitHub Actions.
- **Disparadores de revisión:** cambio de `main`, merge de V5, cierre #286, nueva prueba de restore o aceptación móvil, cambio de política de servicios suspendidos.
- **Reserva:** solo `docs/knowledge/README.md`, `docs/knowledge/SOURCE_CATALOG.md` y este documento se proponen para el PR del departamento. El checkpoint de Claude, #303/#304 y los PR ajenos siguen intactos.

## Comprobaciones / limitaciones de esta entrega

**Ejecutado:** lectura de documentos vigentes en GitHub, comparación con PR fusionados/abiertos, correcciones textuales limitadas, inspección del diff y enlaces de la rama. **No ejecutado:** tests de aplicación, E2E, Safari físico, consultas SQL remotas, backup/restore y despliegues.

**Criterio de aceptación documental:** tres archivos de alcance acotado; sin referencias privadas; enlaces relativos válidos; sustituciones de texto obsoleto identificadas; PR draft con SHA exacto y CI no sobreinterpretado. La integración requiere permiso editorial y no sustituye aprobaciones de producción.

## HANDOFF AL PROJECT MANAGER

| Campo | Valor |
| --- | --- |
| ID / Departamento | KN-V3-01 / Knowledge & Innovation |
| Nombre / Prioridad | Sucesión documental de STABLE V1 / P1 |
| Problema | Fuente Knowledge obsoleta frente a PR fusionados, con riesgo de decisiones basadas en snapshots |
| Estado | DOCUMENTADO EN RAMA; CI/merge pendientes |
| Evidencia | `main@ff8191d`, PR #268/#269/#300/#301/#302/#314/#316 |
| Responsable funcional | Knowledge & Innovation; admisión y reserva a confirmar por PM |
| Dependencias | #303/#304 para coordinación; Claude: Master Completion y V5; Codex: QA exacta de V5; owners: aprobaciones |
| Solución | Corrección de catálogo y enlace al registro incremental, sin segundo índice |
| Criterio de aceptación | Diff documental exacto, enlaces existentes, revisión editorial y aprobación explícita |
| Siguiente acción | PM revisa PR draft, confirma custodia, y decide integración sin activar despliegue |

**Next action:** Project Manager verifica el PR y autoriza únicamente la incorporación documental segura tras evaluar efectos de merge/deploy; no marca el proyecto como STABLE V1 por esta entrega.
