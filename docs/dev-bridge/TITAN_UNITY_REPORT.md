# Operación Avalon Titan Unity: informe (2026-11-09)

**Base de datos:** solo Supabase aislado `wupvuwmqfcvmjqycmnvg`.
**Producción:** `ltbwzcrxeuczdhhtbqgm` no se tocó.
**GitHub:** no se usó (cuenta suspendida); no hubo `git push`.
**Identidades:** todas son sintéticas (`@avalon-test.invalid`), creadas solo en la base aislada con autorización expresa:
- Owner A.
- Owner B (autorizado hoy).
- Un usuario sin membresía.

## Entrega de Codex (`avalon-direct-bridge-integration(1).zip`): BLOQUEADO

El ZIP **no llegó** a este entorno. En la carpeta de subidas solo está el handoff anterior (`avalon-unity-handoff.zip`). Por eso todavía no se ha verificado su SHA-256 `d84b187b…` ni se ha integrado nada de `codex/direct-bridge-adapter` (`9f5c3fc`).

Además, su base **`272985f` no existe en este repositorio**, así que el `increment.bundle` no se podrá aplicar tal cual. Hay dos salidas:
- Recomendada: Codex ejecuta `acx sync` contra la mainline #7 y entrega con `acx deliver`.
- Alternativa: enviar un bundle completo.

## INTEGRADO (código incorporado)

| Pieza | Commits |
| --- | --- |
| Avalon Code Exchange: migración, RPC, CLI `acx`, UI del owner y tokens con perfiles | `990d438` … `acff297` |
| Corrección `invalid_chunk`: `buildZip` devuelve `Uint8Array`; ahora se convierte a `Buffer` antes del Base64 | `402eb0c` |
| Reintento idempotente del guardado del Website Designer | `c4a4ee4` |
| `owner-token-run`: un owner crea con su sesión un token de vida corta que se revoca solo, sin secretos permanentes | `707120f` |
| Runbook permanente: `docs/dev-bridge/GITLESS_RUNBOOK.md` | `acff297` |

Siguen integrados de antes: Nova 1 y Nova 2, y los Studios de Website, CRM y Chatbot con persistencia real.

## FUNCIONAL y PROBADO (contra el backend real aislado)

| Prueba | Resultado |
| --- | --- |
| **Dos owners**, cuentas y sesiones separadas: A crea → B ve, edita y guarda → A cierra sesión, entra de nuevo y recupera la versión de B → autoría por versión → A restaura v1 como v3 (historial intacto) → B ve la restauración → escritura simultánea con conflicto y sin sobrescritura → reintento tras perder la respuesta: una sola versión → usuario ajeno y anónimo denegados | **15 de 15** (`evidence/titan-two-owners.json`) |
| Gitless con dos entornos independientes (Codex desde un directorio vacío; Claude integrador): sync → 3 entregas → verificación y cuarentena → conflicto detectado sin bucle → cambio sensible aprobado por el owner en la UI → gates → nueva mainline → respaldo → restauración → Codex continúa → revocación inmediata | **17 de 17** (`evidence/titan-gitless-two-envs.json`) |
| Reconstrucción independiente: directorio vacío, solo el exchange, sin remotos Git, `npm ci` limpio | tsc OK, **406 de 406** |
| Website Studio / CRM y Chatbot Studio (regresión) | 14 de 14 / 13 de 13 |
| PGlite del Code Exchange (incluye casos negativos) | Pasa |
| `npm test`, tsc, lint | 406 de 406, 0 errores |

Las pruebas usan cuentas **sintéticas**, no las cuentas reales de Miguel y Samuel. Los navegadores fueron Chromium (perfiles de iPhone y de escritorio), **no Safari**.

## Mainline verificada (Code Exchange)

- #1–#3: primeras pruebas.
- #4: código real.
- #5–#6: ejecución del E2E.
- **#7 `b082465a7436`**: código real, con instantánea completa, 406 pruebas en verde y restauración verificada.

Las mainlines anteriores se conservan; la tabla es de solo anexado.

## PREVIEW (comprobada)

`https://avalon-core-agency-9wdcntiqr-avalon-core-agency.vercel.app`, creada desde la mainline #7 con `acx preview` (sin metadatos Git):
- `READY`, target Preview.
- `/admin/login` responde 200 (comprobado con Vercel).
- Protegida por Vercel Authentication.
- Apunta a la base aislada.

## RESPALDO

- `avalon-mainline-00007-b082465a7436-full.bundle`: SHA-256 en su archivo `.sha256`. Se verificó la restauración con `git init` + `git fetch`; reproduce `b082465`.
- La misma mainline está en el exchange, y cualquier directorio vacío la reconstruye con `acx sync`.

## PENDIENTE

1. Recibir el ZIP de Codex y decidir la ruta de integración: rebase sobre la mainline #7 mediante `acx`, o bundle completo.
2. El escritor remoto del **adaptador de Codex** sobre `os_project_versions` (biblioteca), con `idempotency_key` de `os_project_imports`. Está en la entrega que falta; no se duplicó.
3. Cuentas **reales** de Miguel y Samuel en la base aislada (invitación). Con ellas crean sus tokens en la UI y desaparecen las credenciales sintéticas del flujo.
4. Persistencia del Code Exchange a largo plazo: hoy vive en una rama de Supabase aislada. Para que sea permanente conviene un proyecto dedicado o, con aprobación expresa, producción.
5. Safari real.

## BLOQUEADO

- ZIP de Codex: no recibido.
- Proveedor de IA para el chatbot: no conectado; la interfaz lo dice.

## SIGUIENTE ETAPA

Escritor remoto de la biblioteca (al llegar la entrega de Codex), publicación desde los editores Nova, chatbot con proveedor de IA (requiere aprobación de costes) y migración del exchange a su sede permanente.
