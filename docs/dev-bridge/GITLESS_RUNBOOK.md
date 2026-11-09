# Desarrollo permanente sin GitHub: Avalon Code Exchange

Este flujo sirve para Miguel, Samuel, Codex, Claude Code y los agentes de Avalon. No usa GitHub para compilar, versionar, respaldar, importar ni desplegar.

```
MAINLINE ─► DESARROLLO ─► ENTREGA ─► REVIEW ─► INTEGRACIÓN ─► PRUEBAS ─► NUEVA MAINLINE ─► (respaldo + Preview)
   ▲                                                                                │
   └──────────────────────────────── acx sync ◄───────────────────────────────────┘
```

| Pieza | Dónde está | Qué hace |
| --- | --- | --- |
| Code Exchange | Supabase aislado `wupvuwmqfcvmjqycmnvg`, migración `20261109160000_code_exchange.sql` | Funciona como remoto Git. Guarda paquetes y bundles verificados por SHA-256, las entregas con su estado, la mainline lineal y solo de anexado, y una auditoría |
| `acx` | `scripts/gitless/acx.mjs` (`npm run acx -- <cmd>`) | Cliente sin dependencias (Node 22 y Git) |
| `owner-token-run` | `scripts/gitless/owner-token-run.cjs` | Un owner crea con su sesión un token de vida corta, ejecuta un comando y el token se revoca al terminar |
| UI del owner | Avalon → Biblioteca → «Código sin GitHub» | Muestra la mainline, las entregas y la aprobación de cambios sensibles |
| Tokens | Avalon → Biblioteca → «API para herramientas» | Perfiles: agente, integrador o solo descarga. Duran 90 días como máximo y se revocan al instante |

## Permisos (mínimo privilegio, aplicado en la base de datos)

| Perfil | Scopes | Puede | No puede |
| --- | --- | --- | --- |
| Agente (Codex, managers) | `code:deliver` + `code:pull` | Descargar la mainline verificada, subir paquetes, ver el estado de **sus** entregas | Ver entregas ajenas, aprobar, publicar |
| Integrador (Claude) | `code:integrate` + `code:pull` | Verificar, aprobar entregas **sin** rutas sensibles, integrar, publicar la mainline (con pruebas en verde y padre = cabeza actual) | Aprobar cambios sensibles |
| Owner (sesión de Avalon) | — | Verlo todo, aprobar o rechazar cambios sensibles (migraciones, auth, middleware, workflows, `package.json`, scripts) | — |
| Sin token o anónimo | — | Nada (`28000` / `42501`) | — |

El token puede inyectarlo el proxy del entorno, con la cabecera `X-Avalon-Bridge-Token`. Así el secreto nunca existe dentro del sandbox del agente. La alternativa es `AVALON_BRIDGE_TOKEN`; en ese caso solo se envía su SHA-256.

## Codex (o cualquier agente): configuración única

1. En el entorno de Codex:
   - Permitir salida de red al host `wupvuwmqfcvmjqycmnvg.supabase.co`.
   - Guardar como secreto el token de perfil **agente** que crea un owner en «API para herramientas».
   - Esa es la **única conexión autorizada necesaria**.
2. Empezar de cero, sin GitHub:

```bash
AVALON_EXCHANGE_URL=https://wupvuwmqfcvmjqycmnvg.supabase.co AVALON_EXCHANGE_KEY=sb_publishable_HCnpr3v_rH7F6i5LxwZjTg_5Mam1fKl \
  node acx.mjs sync --dir avalon-os     # acx.mjs se copia una vez; después viene dentro del repo
cd avalon-os && npm ci
```

3. Cada trabajo:

```bash
npm run acx -- sync --checkout                     # partir de la última versión verificada
git switch -c codex/mi-cambio && …commits…
npm run acx -- deliver --id mi-cambio-0001 --module nova-ui --author codex --notes "qué y por qué"
npm run acx -- my                                  # estado e informe de verificación de mis entregas
```

`deliver` ejecuta los gates (tsc, lint y `npm test`) y rechaza la entrega si fallan. El paquete es un ZIP con bundle, patch, `DELIVERY.json` y `SHA256SUMS`, el formato de `DELIVERY_CONTRACT.md`. **Sin red:** `--offline <carpeta>` deja el ZIP, el owner lo entrega al integrador y este lo sube con `acx ingest`.

Si una entrega queda `failed` por conflicto, no se reintenta en bucle. El agente hace `sync`, aplica rebase y entrega con un id nuevo.

## Claude (integrador): un comando por ciclo

```bash
AVALON_OWNER_CREDS=<archivo 0600 con la cuenta de un owner> \
node scripts/gitless/owner-token-run.cjs --profile integrator -- node scripts/gitless/acx.mjs cycle --auto-approve-safe [--preview]
```

`cycle` hace, por orden:
1. **Review:** descarga y verifica el SHA-256, `receive-package` y `verify-delivery` (cuarentena, base, secretos, merge de prueba en un worktree aparte). No ejecuta código del paquete.
2. **Aprobación:** automática solo si no hay rutas sensibles. Las sensibles esperan al owner.
3. **Integración:** una a una, con `merge --no-ff` y gates después de cada una. Si hay conflicto o fallo, se revierte y se marca `failed` con el informe.
4. **Publicación:** bundle incremental, con instantánea completa cada 20 entradas o con `--full`. El servidor exige pruebas en verde y padre = cabeza actual.
5. **Respaldo local:** `.bundle`, `.sha256` y manifiesto.
6. **Restauración:** reconstruye la mainline en un directorio vacío solo desde el exchange y compara el árbol.
7. **Preview (opcional):** Vercel Preview desde `git archive`, contra la base aislada, nunca `--prod`.

## Respaldos y recuperación

- Cada mainline vive en el exchange y en `.avalon-backups/` (o en `--backup-dir`) como `avalon-mainline-<seq>-<commit>[-full].bundle`, más `.sha256` y `.json`.
- Restaurar sin Avalon ni GitHub: `git init avalon && git -C avalon fetch <…-full.bundle> +refs/acx/head:refs/heads/main && git -C avalon checkout main`; después, por orden, `git -C avalon fetch <incremental>.bundle +refs/acx/head:refs/heads/main`. (`git clone` directo del bundle da un repositorio vacío, porque la ref es `refs/acx/head`.)
- Restaurar desde el exchange: `acx sync --dir <vacío>`, con un token de solo descarga.
- Conviene guardar copias fuera de la sesión de Claude (el disco del owner o su unidad) cada vez que se publica una instantánea completa.

## Producción

El exchange y `acx` se niegan a usar el proyecto de producción `ltbwzcrxeuczdhhtbqgm` sin `AVALON_EXCHANGE_PRODUCTION=approved-by-owner`. Ninguna operación de este flujo aplica migraciones ni despliega a producción.
