# Avalon Office — ejecución sin nuevos costos (GitHub público)

## Qué se implementó
La Oficina de Avalon tenía cinco managers definidos como "offline" y las automatizaciones de ChatGPT no estaban conectadas a la aplicación. Este PR ofrece **un comprobador técnico gratuito** y honesto sin nuevas bases Supabase, variables secretas, modelos IA ni servicios de pago:

- Una única GitHub Action horaria: `.github/workflows/office-managers-free.yml`, ejecutada **solo cuando el repositorio continúe público**, con runner estándar `ubuntu-latest`.
- Un ejecutor de Node sin dependencias: `scripts/office-manager-free-github.cjs`. Usa el `GITHUB_TOKEN` efímero asignado por GitHub Actions. Consulta PRs, issues y resultados de workflows, y actualiza **un único issue** [#108](https://github.com/avaloncoreagency/Avalon-code/issues/108) con cinco resultados verificables, sin datos de clientes.
- REN revisa prioridades, PRs y borradores; SHIN PRs de autenticación/seguridad y fallos CI; HARU CRM y ventas; SORA Radar e IA; KENJI workflows fallidos y regresiones.
- La Oficina consulta el issue público **solo después de verificar un owner** mediante `GET /admin/workspace/crm/office/manager-work/github-history/api`. No necesita token de GitHub ni migración de Supabase. Los resultados están fechados; tras más de **90 minutos sin ejecutar** el manager aparece como `stale`, no falsamente "activo".
- La pantalla de Oficina enlaza una estación de comprobaciones manuales de CRM, protegida por `getOwnerSession` y RLS, sin cambios de datos. **No hay cola de ejecución libre**: las órdenes libres de la Oficina siguen registradas, pero no se procesan.
- Tests sin red verifican cinco resultados, recuperación del issue, control owner, fallos y ausencia de secretos.

## Activación: permanece bloqueada hasta una aprobación de merge
Los cron de GitHub Actions **solo funcionan desde la rama principal**, así que una rama/PR draft no ejecuta cron. Tras revisar [PR #102](https://github.com/avaloncoreagency/Avalon-code/pull/102), obtener el CI del SHA exacto y autorizar el merge, el cron `19 * * * *` podrá comenzar automáticamente en `main`. También puede usarse `workflow_dispatch` para una prueba manual sin esperar una hora. Sin merge autorizado no hay ejecuciones automáticas reales.

## Condiciones de costo y seguridad
- No crea proyectos ni ramas Supabase: **cero infraestructura adicional**.
- GitHub informa que los runners estándar en repositorios **públicos son gratuitos**. La condición del workflow exige `github.event.repository.private == false`; si el repositorio pasa a privado, el job se omite en lugar de consumir minutos facturables. No usar larger runners, Codespaces ni APIs de IA de pago.
- El workflow usa `permissions: contents: read, issues: write, pull-requests: read, actions: read`; **no necesita secretos ni credenciales nuevas**. Solo puede editar la ficha de estado #108, tras comprobar título y marcador inalterados. No modifica el código ni hace merge.
- Los comentarios/registro de #108 son **públicos**, por eso solo incluyen conteos de PRs/issues/CI, números públicos y timestamps. Prohibido introducir datos de clientes, tokens, direcciones de correo o notas internas confidenciales.
- GitHub puede retrasar o saltar cron; si pasan 90 minutos, la Oficina muestra "Sin actividad reciente". La cuenta podría restringir el uso de Actions por políticas de repositorio; en ese caso queda una señal de error, no una simulación de éxito.
- El workflow tiene `timeout-minutes: 3` y no ejecuta compilaciones completas cada hora, para evitar gasto innecesario de recursos.

## Lo que todavía NO es
Esto entrega **trabajo técnico automatizado y verificable** (revisión reproducible de estado Github y tests del runner). **No son cinco programadores autónomos Codex/Claude** capaces de escribir código y crear PRs cada hora. Para eso hace falta un ejecutor de IA/código con permisos y presupuesto; no existe una forma garantizada de proveerlo ilimitadamente sin consumir recursos y sin la aprobación de acceso correspondiente.

## Aceptación
- [ ] CI 5/5 success de SHA final; pruebas del nuevo runner y ruta de historial.
- [ ] GitHub Action manual `workflow_dispatch` (tras merge autorizado) produce exactamente un reporte en #108 con fecha y cinco resultados.
- [ ] Owner de Avalon ve esos cinco resultados desde Oficina; usuario sin owner obtiene 403.
- [ ] Segundo intento dentro de una hora actualiza la misma issue sin comentarios duplicados.
- [ ] Hora sin ejecución cambia estado a "stale"; fallos de GitHub no dejan falso "completado".
- [ ] Ningún proyecto Supabase nuevo, ni migración remota, ni clave secreta, ni llamada IA pagada.
