# Entrega directa para Codex (sin GitHub)

**Base:** mainline #8 del Avalon Code Exchange, commit `408f918982fc…`, rama `gitless/code-exchange`. Gates en verde: tsc, ESLint y 406 pruebas. Restauración verificada desde un directorio vacío.

## 1. Reconstruir (elige una vía)

**A. Con red (recomendada).** Requiere que el entorno de Codex permita el host `wupvuwmqfcvmjqycmnvg.supabase.co` y tenga un token de perfil **agente** (`code:deliver` + `code:pull`), creado por un owner en Avalon → Biblioteca → API para herramientas y guardado como secreto, nunca en el repositorio.

```bash
AVALON_EXCHANGE_URL=https://wupvuwmqfcvmjqycmnvg.supabase.co AVALON_EXCHANGE_KEY=sb_publishable_HCnpr3v_rH7F6i5LxwZjTg_5Mam1fKl \
AVALON_BRIDGE_TOKEN=<secreto del entorno> node acx.mjs sync --dir avalon-os
cd avalon-os && npm ci && npx tsc --noEmit && npm test     # 406 pruebas
```

**B. Sin red (paquete de archivos).** Usa el bundle incluido en este paquete:

```bash
sha256sum -c SHA256SUMS
git init avalon-os && git -C avalon-os fetch ../avalon-mainline-00008-408f918982fc-full.bundle +refs/acx/head:refs/heads/main
git -C avalon-os checkout main && cd avalon-os && npm ci && npm test
git update-ref refs/acx/mainline HEAD      # base declarada de tus entregas
```

**Dependencias fijadas:**
- `package-lock.json`, SHA-256 `9c4c058c…6a14`.
- Node 22 (verificado con 22.23.4).
- Instalar con `npm ci`. No añadas dependencias sin declararlas en la entrega: `package.json` es una ruta sensible y requiere aprobación del owner.

## 2. Qué puede modificar Codex

| Puede modificar (aprobación del integrador) | Requiere aprobación del **owner** (ruta sensible) | No tocar |
| --- | --- | --- |
| `src/components/avalon-ui/**` (Nova UI y builders) | `supabase/migrations/**` | `src/lib/auth/**`, `src/middleware.ts` |
| `tests/nova/**` | `package.json`, `package-lock.json` | Secretos, `.env*`, `.avalon/exchange.json` |
| `docs/nova*/**`, `docs/codex/**` | `scripts/**` | `src/lib/project-bridge/**` sin acuerdo previo (contrato del puente) |
| Archivos nuevos en `src/lib/codex/**` | `next.config.*`, `.github/workflows/**` | Producción `ltbwzcrxeuczdhhtbqgm` y el proyecto Vercel `avalon-core-agency` |

Las rutas sensibles las detecta automáticamente `verify-delivery`, y el integrador **no puede** aprobarlas: lo impide la base de datos.

## 3. Contratos vigentes (ya existen; reutilizar, no duplicar)

- **Direct Bridge** (`docs/project-bridge/PROJECT_BRIDGE.md`):
  - Importación: `os_project_imports` con `idempotency_key`, luego `processImport()`.
  - Versiones inmutables: `os_project_versions` y `os_project_files`, con blobs SHA-256 en el bucket privado `avalon-projects`.
  - Restaurar: `os_project_restore_version`; crea una versión nueva.
  - Exportar: `GET /admin/workspace/library/<id>/export?version=<uuid>`. Devuelve un ZIP con `AVALON_EXPORT.json` que se puede volver a importar.
  - Website Designer → Biblioteca: `saveWebsiteToLibrary`; idempotente por digest del contenido.
  - Guardado del editor: `saveWebsiteStudio`, con control de versión optimista y reintento idempotente.
- **Code Exchange** (`docs/dev-bridge/GITLESS_RUNBOOK.md`, `DELIVERY_CONTRACT.md`):
  - Scopes `code:deliver`, `code:pull` y `code:integrate`.
  - Paquete = bundle + patch + `DELIVERY.json` + `SHA256SUMS`.
  - Mainline lineal, solo de anexado, con pruebas en verde.
- El JSON de recuperación local de Codex **no** es un formato del importador ZIP. Para persistir, usa los contratos de arriba.

## 4. Cómo entregar

```bash
npm run acx -- sync --checkout                 # partir de la última mainline verificada
git switch -c codex/<tema> && …commits…
npm run acx -- deliver --id <tema-0001> --module <modulo> --author codex --notes "qué y por qué"
npm run acx -- my                              # estado e informe de verificación
```

Sin red: añade `--offline <carpeta>` y entrega el ZIP resultante al owner, que se lo pasa al integrador (`acx ingest`).

Si una entrega queda `failed` por conflicto, haz `sync`, aplica rebase y entrega con un id nuevo (no hay reintentos en bucle).

## 5. Pendiente de Codex (no recibido todavía)

`codex/direct-bridge-adapter` (`9f5c3fc`, base `272985f`) no llegó, y su base no existe en este repositorio. Hay que rehacerlo sobre la mainline #8 y entregarlo con `acx deliver`, reutilizando los contratos del punto 3.
