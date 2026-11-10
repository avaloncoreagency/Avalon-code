# Despliegue inicial del proyecto de pruebas de Vercel (T3 y T4b pendientes)

## Situación verificada (2026-11-10)

| Elemento | Estado |
| --- | --- |
| Proyecto de prueba | `avalon-client-bridge-e2e` (`prj_Ln7ik1hsql2BZqBx22ZjcRJOt6DI`), equipo `team_lHTO3wgJm0yAyexxMDmkIFW4`. Protección `all_except_custom_domains`; sin dominios y sin despliegues |
| Credencial del entorno para `api.vercel.com` | Nueva, guardada mediante el formulario seguro. **Solo ve el proyecto de prueba**, no `avalon-core-agency`: está aislada del sitio principal |
| Regla de Vercel | *«The first deployment of a new project is always a production deployment, even without --prod»* (docs, CLI «Deploying from CLI»). Las Previews solo existen cuando ya hay un despliegue de producción |
| Payload del Direct Bridge | La Preview no envía `target`; solo la ruta de producción lo añade, y exige aprobación del owner en la base. El puente rechaza una Preview si el proyecto no tiene producción (`first_deployment_is_production`) |
| Bloqueo | El control de seguridad de la sesión de Claude Code (modo automático) **deniega los despliegues de producción** (`[Production Deploy]`). No se eludió ni se pidió modificarlo |

## Procedimientos admitidos para completar el despliegue inicial

Bastaría uno solo de estos tres:

1. **Lo hace una persona con su cuenta de Vercel**, fuera de la sesión de Claude: la página neutra `index.html` (noindex, sin datos) con `vercel link` y `vercel deploy --prod` sobre el proyecto de prueba. Es una acción humana de una sola vez.
2. **Una sesión de Claude Code con permiso explícito** para ese único comando (regla de permisos de la persona usuaria). Hoy no está concedido, y esta misión pide no solicitarlo.
3. **Vercel crea o habilita el primer despliegue como Preview** para proyectos creados por API, o indica una vía oficial para ello (consulta abajo).

Después de cualquiera de ellos, el resto es solo Preview. Se hace con una ejecución de `scripts/project-bridge/e2e-five-tests.cjs` (T3: Preview de v1; T4b: Preview de v2; restauración ya probada).

## Consulta preparada para Vercel Support

> **Subject:** First deployment of an API-created project without a production deployment
>
> Hello, we deploy static client sites with the REST API (`POST /v2/files` + `POST /v13/deployments`, no Git integration). Team: `team_lHTO3wgJm0yAyexxMDmkIFW4`. Test project: `prj_Ln7ik1hsql2BZqBx22ZjcRJOt6DI`, created via API with Vercel Authentication on all deployments.
>
> 1. Your CLI docs say the first deployment of a new project is always production. Is there a supported way, via the API, CLI or a project setting, to make the **first** deployment of a project a **Preview** (no production deployment, no production alias)?
> 2. If not, is creating one minimal production deployment, protected by `ssoProtection: all_except_custom_domains`, the recommended approach before creating Previews?
> 3. Which token scope is recommended for a server that only creates Previews in a set of client projects of one team (and never touches our main project)?
> 4. We believe our team is on the Hobby plan. Please confirm whether creating Preview deployments for client websites is allowed on our plan, or which plan we need for commercial client work.
>
> Thank you.

## Scripts y evidencia conservados

- `scripts/project-bridge/e2e-five-tests.cjs`: T1–T5; T3 y T4b registran el bloqueo como `BLOCKED` con la respuesta exacta del proveedor.
- `docs/project-bridge/evidence/titan-five-tests.json`: 4 PASS y 2 BLOCKED.
- `docs/dev-bridge/TITAN_STAGE_A.md` y `TITAN_STAGE_A_CLOSING.md`: diagnóstico completo (HTTP y mensajes; sin tokens).
- Página neutra: la misma que en el procedimiento 1 (SHA-256 `6731c1cd…034f9c`), entregada al owner.
