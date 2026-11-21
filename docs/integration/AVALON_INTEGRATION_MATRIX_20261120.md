# Avalon OS: matriz de integración de los 11 departamentos (2026-11-20)

- Base verificada: `origin/main@207ed3a`.
- Fuentes: GitHub (PR abiertos y ramas), Supabase solo en lectura, CI de los SHA exactos.
- Estados: `IMPLEMENTED_IN_BRANCH`, `CI_VERIFIED`, `PREVIEW_VERIFIED`, `OWNER_ACCEPTED`, `MERGED`, `PRODUCTION_VERIFIED`, `BLOCKED` y `NOT_IMPLEMENTED`.

## Verificación conjunta de los 16 PR departamentales

- Cada rama se fusiona sin conflictos de texto con `main`.
- Fusionadas **todas juntas** en un árbol de prueba local (sin publicar), `tsc` queda limpio y pasan 775 de 776 pruebas.
- **Hallazgo:** #277 (gate del Orchestrator) y #260 (planes de departamento) son incompatibles semánticamente. El test de #277 prohíbe consumidores de `mission-plan` en tiempo de ejecución sin la puerta de propietario y recibo confiable, y #260 añade `department-templates.ts`, que lo importa.
- **Orden propuesto:**
  1. #287 (recibos firmados).
  2. La puerta de propietario.
  3. Relajar el gate de #277 de forma explícita.
  4. #260.
  No fusionar #260 y #277 juntos tal como están.

## A. Matriz por departamento

| Departamento | PR / documentos | Qué existe | Qué integré | Estado | Pendiente o aprobación |
|---|---|---|---|---|---|
| Cloud & Security | #265 | Reconciliación de privilegios y test de `search_path` de RPC (2 archivos de código y 1 test) | P0.2: Turnstile en el servidor para el formulario público y rol `avalon_intake` (rama `claude/quote-antibot-20261120`) | #265: `IMPLEMENTED_IN_BRANCH`, combinación OK. #289: `IMPLEMENTED_IN_BRANCH` (E2E local OK) | Activar claves Turnstile y el SQL del rol, con autorización |
| CRM | #269, #236, #245 | Triage orientativo de spam (#269); edición de leads (#236, ya cubierto por #241 y #255); RPC cliente→lead (#245, idéntico a una migración aplicada) | #269 integrado en #288 y aplicado **a cada mensaje**; P0.1 historial de mensajes y revisión reversible | #288: `CI_VERIFIED` | Aplicar la migración `20261120160000` en producción: autorización y respaldo |
| QA | #276, #259 | Matriz de aceptación v1.2 (docs); release gates por SHA (#259, con código) | Se usaron como referencia para los criterios de P0.1 y P0.2 | `IMPLEMENTED_IN_BRANCH` | Fusión por su propietario |
| Orchestrator | #277, #260, AVL-108 | Gate contra activación insegura (#277); planes de departamento sobre el ejecutor existente (#260) | Nada: conflicto semántico documentado arriba | `BLOCKED` por el orden de integración | Decisión de orden; ejecución externa desactivada |
| Guardian | #261, #267, #287 | Diagnóstico offline (#261), verificación de recuperación (#267), recibos firmados (#287) | Nada todavía: los tres combinan sin conflicto | `IMPLEMENTED_IN_BRANCH` | Primer piloto con incidentes sintéticos |
| Legal | #278, LEGAL-003…007, Issue #286 | Seguridad de texto en el PDF de contratos (código y test) | No reimplementado: combina limpio | `IMPLEMENTED_IN_BRANCH` | Revisión jurídica de los términos (#286), fuera del alcance de Claude |
| Finance | #284, FIN-003…008 | Separa saldo registrado, beneficio y MRR activo (1 archivo de código y 1 test) | Nada: combina limpio | `IMPLEMENTED_IN_BRANCH` | Precios y márgenes: decisión de los propietarios |
| Sales & Marketing | #279, SALES-002…004 | Playbook bilingüe (docs) | No requiere código. Sin campañas ni contacto | Documentación | Aprobación de ofertas y precios |
| Business Strategy | #280, BS-001…006 | Gobierno de precios y preparación para los diez primeros clientes (docs) | No requiere código | Documentación | Decisión de precios |
| Client Operations | #281, CO-004…009 | SOP, checklists y gates (docs) | No requiere código todavía | Documentación | CO-DEC-01…06 (decisiones de los propietarios) |
| Product Studio | #282, APS v1 | Estándares de producción y QA en iPhone (docs) | No requiere código | Documentación | Ninguna técnica |
| Knowledge | #268 | Knowledge Engine v1 (docs) | No requiere código | Documentación | Custodia de información privada |

## B. Cambios de esta sesión

### #288: historial de mensajes y revisión de spam
- Rama `claude/inquiry-preservation-20261120`, SHA `56cd809`, Refs #23 y #266.
- Contenido:
  - migración solo de revisión `20261120160000`;
  - API e interfaz de la bandeja;
  - pruebas: 5 de base de datos, E2E de la bandeja y compatibilidad con el esquema de producción.
- CI: verde en todos los checks (`CI_VERIFIED`).
- Riesgo: la migración cambia la función pública. Es aditiva y tiene rollback documentado.

### #289: Turnstile en el formulario y rol `avalon_intake`
- Rama `claude/quote-antibot-20261120`, SHA `2903846` (PR #289, borrador).
- Contenido:
  - verificador Turnstile por acción;
  - formulario que conserva los datos si algo falla;
  - SQL de revisión del rol `avalon_intake` y cliente con JWT de 60 s.
- Pruebas: 6 unitarias, 2 de base de datos y E2E de ventas (pasa).
- Documento: `docs/security/PUBLIC_INTAKE_ANTIBOT.md`.

### Hecho antes en esta sesión (fusionado)
- #255: React #418, integración de #227 y #249–#254, pipeline de 5 grupos.
- #262: hibernación completa de Radar.
- En producción, con autorización: 3 migraciones aplicadas y Radar apagado.

## C. Bloqueos P0

1. **Mensajes perdidos (verificado en producción).** La tabla no guardaba el texto: hay 4 envíos de 3 prospectos y uno escribió dos veces; ese segundo mensaje no se puede recuperar.
   - Causa: la tabla de solicitudes no tenía columna de mensaje.
   - Corrección: #288, pendiente de fusión y de aplicar la migración.
2. **RPC anónima directa.** Hoy cualquiera puede llamar `crm_public_inquiry` saltándose el servidor.
   - Corrección: P0.2. Necesita las claves Turnstile, un secreto JWT y aplicar el SQL.
   - `UNKNOWN`: si el proyecto acepta JWT HS256 (podría haber migrado a claves asimétricas).
3. **Preview aislado.** El guard `blocked_unsafe_preview_database` sigue activo y no lo quité.
   - Una Preview con base separada requiere crear o designar un proyecto Supabase de staging, con costo y autorización.
   - La rama de preview de Supabase también está limitada por el plan (límite de ramas).

## D. Preparación comercial

Para vender y entregar el primer website o CRM con seguridad faltan:

- fusionar #288 y aplicar su migración;
- activar P0.2;
- tener precios aprobados (BS y Finance);
- contar con términos contractuales revisados por un profesional (#286);
- recorrer el piloto Chino Barber en una Preview aislada con dos sesiones reales;
- comprobar en Safari, en un iPhone real.

Lo que el flujo ya cubre con datos sintéticos: cotización → contrato → venta → producto borrador → finanzas.

## E. Multicliente

- **Funciona:** CRM interno de una sola agencia, con RLS de propietarios; productos vinculados a cliente; bridge de proyectos con tokens.
- **No demostrado:** aislamiento entre empresas cliente con login propio. No se debe dar acceso de propietario a clientes.
- **Por evaluar con costos:** proyecto por cliente frente a datos compartidos (se necesita verificar los planes Vercel y Supabase).

## F. Orchestrator

- **Hoy:** misiones sintéticas sobre el ejecutor existente, con controles y ejecución externa desactivada.
- **Solo planificación:** asignación a los 11 departamentos (#260), bloqueada por el gate de #277.
- Los chats de ChatGPT no son agentes invocables: no hay conectores no oficiales.

## G. Guardian

- **Hoy:** diagnóstico offline y adaptador de incidencias (#261) y verificación de recuperación (#267), solo en ramas.
- No hay monitoreo 24/7 activo ni ejecutores remotos.
- Ninguna reparación se declara sin evidencia independiente.

## H. Decisiones de Miguel y Samuel

- **Técnicas y de producción:**
  - aplicar la migración `20261120160000`;
  - activar Turnstile y el rol `avalon_intake`;
  - crear el proyecto de staging para Preview;
  - el orden #287 → #260 → #277.
- **Comerciales:** precios WP-01, ofertas y excepciones.
- **Financieras:** márgenes objetivo, costos indirectos, definición de A/R frente a saldo contractual.
- **Jurídicas:** términos (#286), versión del aviso de privacidad (`consent_version`), comisiones en sectores regulados.
- **De producto:** CO-DEC-01…06.

## I. Próximas cinco acciones

1. **Propietarios:** revisar y fusionar #288 y autorizar su migración, con respaldo. Depende de que su CI esté verde.
2. **Propietarios y Claude:** configurar las claves Turnstile en Preview, probar y luego activar en producción; después, el secreto y el SQL de `avalon_intake`. Depende de 1 y de confirmar el soporte de HS256.
3. **Propietarios:** crear o designar el proyecto Supabase de staging para una Preview aislada. Tiene costo y requiere autorización.
4. **Codex o el propietario del Orchestrator:** fusionar #287, implementar la puerta de propietario y luego #260 y el ajuste de #277.
5. **Miguel y Samuel:** recorrer el piloto Chino Barber en esa Preview, en iPhone real y escritorio, con dos sesiones.
