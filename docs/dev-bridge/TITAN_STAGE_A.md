# Avalon Titan: Fase Cero y Etapa A (2026-11-10)

- **Entorno:** Supabase aislado `wupvuwmqfcvmjqycmnvg`; app local `next start` con el mismo build que la Preview.
- **Producción:** `ltbwzcrxeuczdhhtbqgm` no se tocó (22 migraciones, sin tablas nuevas).
- **Identidades:** todas sintéticas (`@avalon-test.invalid`). Owner A y Owner B (autorizado) y un usuario sin membresía. Ningún dato real.

## Fase Cero: inventario verificado (no hallazgos heredados)

Estados:
- **FUNCIONAL:** probado de extremo a extremo contra el backend aislado.
- **PARCIAL:** funciona en parte o depende de algo externo.
- **NO VERIFICADO:** el código existe, pero no se probó en esta misión.
- **NO IMPLEMENTADO.**

| Componente | Estado | Evidencia |
| --- | --- | --- |
| Auth y owners (`agency_memberships`, RLS) | FUNCIONAL | Login y cierre de sesión reales con dos owners; usuario ajeno y anónimo denegados (`titan-two-owners.json`, 15 de 15) |
| Biblioteca y Direct Bridge (importación, versiones inmutables, restauración, almacenamiento privado, auditoría) | FUNCIONAL | `phoenix-evidence.json` (21 de 21), `titan-five-tests.json` |
| Website Designer: Studio Nova, páginas, historial y restauración por página | FUNCIONAL | 14 de 14 y 15 de 15 |
| Website Designer → Biblioteca (versión estática nueva) | FUNCIONAL | Nuevo en esta etapa; T1, T2 y T4 |
| Publicación en Vercel de sitios de cliente (`deployStatic`, API oficial, sin GitHub) | PARCIAL | El código existe y se probó contra Vercel real el 2026-11-08. Hoy está **bloqueado por el alcance del token** (T3) |
| Preview de Avalon OS sin GitHub (`acx preview`) | FUNCIONAL | Mainline #7 `READY` en Preview, con `/admin/login` 200 |
| Code Exchange (desarrollo sin GitHub) | FUNCIONAL | E2E de dos entornos 17 de 17; reconstrucción limpia con 406 de 406 |
| CRM Creator y AI Chatbots (Studios Nova) | FUNCIONAL (configuración) | 13 de 13. **IA del chatbot no conectada** |
| CRM (pipeline de 13 etapas), Client 360, calendario y Radar | NO VERIFICADO en esta misión | Hubo pruebas en misiones anteriores. El fallo del Radar con búsquedas por ZIP **no se reprodujo todavía** (Etapa C) |
| AI Receptionist (voz) | NO IMPLEMENTADO como servicio real | Solo configuración; sin proveedor de voz contratado |
| E-commerce (Stripe Test Mode) | NO VERIFICADO | Etapa D |
| Managers y Oficina 3D | NO VERIFICADO; prioridad baja | Sin cambios, como pide la misión |
| Edge Function `avalon-radar-worker` (`verify_jwt` desactivado) | Revisada: aceptable | Exige el token de trabajo `x-avalon-radar-job`, lo compara por hash en tiempo constante y falla en cerrado |
| Plan de Vercel | **Riesgo** | Un despliegue `BLOCKED` por «colaboración en equipo Hobby» indica **plan Hobby**, que no admite uso comercial. Hay que confirmarlo y cambiar de plan antes de servir a clientes |
| Sede del Code Exchange | **Riesgo** | Vive en una rama de prueba de Supabase. Hace falta una sede permanente aprobada |

## Etapa A: las cinco pruebas del puente (`scripts/project-bridge/e2e-five-tests.cjs`)

| Prueba | Resultado | Evidencia |
| --- | --- | --- |
| **T1** Crear y guardar | **PASS** | Proyecto `ec69a1cd-…`, versión v1 `ca9d9ad6-…`, `index.html` guardado en almacenamiento privado (IDs reales en la base) |
| **T2** Cerrar sesión y recuperar | **PASS** | Sesión nueva: editor idéntico y SHA-256 de `index.html` idéntico. Volver a guardar sin cambios **no** crea un duplicado (clave = digest del contenido) |
| **T3** Publicar en Preview sin GitHub | **BLOCKED** | Vercel responde `403 forbidden` al token del entorno («Avalon-Claude-30Days»): solo tiene acceso a `avalon-core-agency`. Además, el primer despliegue de un proyecto de cliente debe ser de producción (autorizado: página neutra en el proyecto desechable `avalon-client-bridge-e2e`, ya creado con protección en todos sus despliegues) |
| **T4** Segunda versión y restauración | **PASS** (guardar y restaurar) / **BLOCKED** (publicar v2) | v2 con otro digest. Restaurar v1 crea v3 con **exactamente** el contenido de v1; v1 y v2 se conservan |
| **T5** Seguridad | **PASS** | El usuario ajeno, con su propio JWT, y el anónimo: 0 lecturas, sin descargas, sin edición, sin crear versiones, sin despliegues, sin restauraciones |

**La fase del puente no se declara terminada: faltan T3 y la publicación de T4.**

### El único paso humano pendiente para T3

En Vercel → Account Settings → Tokens, crear un token con **Scope: Avalon Core Agency (todo el equipo)**, o que incluya los proyectos `avalon-client-*`. Después, reemplazar con él el network secret de `api.vercel.com` en el entorno «Avalon code». Con eso, el ciclo es:
1. Página neutra en producción, una sola vez.
2. Preview de v1 y Preview de v2.
3. Restaurar v1.

Todo en un solo comando: `e2e-five-tests.cjs`.

## Costos observados

- Supabase: rama aislada existente; no se crearon proyectos.
- Vercel: un proyecto desechable creado (sin despliegues) y despliegues de Preview de Avalon OS ya registrados.
- No se activaron servicios de pago.

## Diagnóstico del 403 (2026-11-10, sin exponer tokens)

| # | Llamada (token del entorno «Avalon-Claude-30Days», inyectado por el proxy) | HTTP | Respuesta |
| --- | --- | --- | --- |
| 1 | `GET /v2/user` | 404 | `not_found` «User not found»: no es un token personal de cuenta completa |
| 2 | `GET /v5/user/tokens/current` | 404 | `not_found` «Token not found» |
| 3 | `GET /v2/teams/team_lHTO3wgJm0yAyexxMDmkIFW4` | 403 | `team_unauthorized` |
| 4 | `GET /v10/projects?teamId=team_lHTO3…` | 200 | **Solo `avalon-core-agency`**, aunque el equipo tiene dos proyectos |
| 5–7 | `GET /v9/projects/prj_Ln7ik1hsql2BZqBx22ZjcRJOt6DI` (con y sin `teamId`, y por nombre) | 404 | `not_found` |
| 8 | `GET /v9/projects/avalon-core-agency?teamId=…` | 200 | `prj_tN1ZYrsx5fqoEePYjThsra3MvocP` |
| — | `POST /v13/deployments?teamId=…` (proyecto de prueba, producción) | 403 | `forbidden` «You don't have permission to create a Production Deployment for this project» (registrado el 2026-11-10). No se repitió: el clasificador de seguridad bloquea sondas de producción, con razón |
| control | Cabecera `Authorization` inválida explícita | 200 | El proxy reemplaza la cabecera por la credencial guardada: el Bearer se envía bien |
| control | Conector de Vercel (cuenta del dueño): `get_project prj_Ln7…` | 200 | El proyecto existe en el mismo equipo, con protección `all_except_custom_domains` |

**Conclusión:**
- El `teamId` se envía en todas las llamadas.
- El Bearer llega correctamente.
- No hay confusión de proyectos.
- **La credencial está limitada al proyecto `avalon-core-agency`:** no ve ni puede desplegar otros proyectos del equipo. El 403 es de permisos del token, no del código del puente.

**Para cerrar la Etapa A:**
1. Un token con alcance de equipo («Avalon Core Agency»), o con acceso explícito al proyecto `avalon-client-bridge-e2e`, guardado como network secret de `api.vercel.com`.
2. Confirmar el plan de Vercel. Si es Hobby, solo sirve para pruebas técnicas no comerciales. Para clientes, plan Pro o equivalente.

Con ambos puntos resueltos, se ejecuta **una vez** `e2e-five-tests.cjs` para T3 y T4b. Antes de eso va la página neutra de producción ya autorizada, porque Vercel no admite que un proyecto nuevo empiece en Preview.
