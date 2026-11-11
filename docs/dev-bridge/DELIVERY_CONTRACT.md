# Contrato de entregas sin GitHub: Avalon Direct Bridge

Este contrato vale para Codex, Claude Code, Higgsfield, los cinco managers (REN, SHIN, HARU, SORA, KENJI), Miguel y Samuel. Una entrega es **código para revisar**: nunca se integra ni se ejecuta automáticamente.

## 1. Qué contiene una entrega

Una carpeta `<id>/` (o un `.zip` de esa carpeta) con estos archivos:

| Archivo | Obligatorio | Contenido |
| --- | --- | --- |
| `<id>.bundle` | sí, salvo que se use un patch | `git bundle create <id>.bundle <base_commit>..<rama>`. Conserva los commits exactos |
| `<id>.patch` | alternativa | `git format-patch --stdout <base>..<rama>`. Los commits resultantes tendrán otro id |
| `DELIVERY.json` | sí | Manifiesto (abajo) |
| `SHA256SUMS` | sí | `sha256sum` de cada archivo de la carpeta |

Se genera con `scripts/project-bridge/make-delivery.sh`.

### `DELIVERY.json`

```json
{
  "id": "nova-ui-0001",
  "author": "codex",
  "module": "nova-ui",
  "version": "1.0.0",
  "base_commit": "<sha de 40 caracteres del commit de Avalon sobre el que se trabajó>",
  "delivery_commit": "<sha de 40 caracteres del último commit entregado>",
  "artifact": { "file": "nova-ui-0001.bundle", "sha256": "<sha256>" },
  "changes": ["src/components/nova/button.tsx", "tests/nova.test.cjs"],
  "dependencies": ["paquete@1.2.3"],
  "tests": { "command": "npm test", "passed": 244, "failed": 0 },
  "review_status": "submitted",
  "evidence": ["capturas o logs dentro de la entrega"],
  "integration_instructions": "Pasos, migraciones necesarias (si las hay) y riesgos conocidos."
}
```

- `author` debe ser uno de: `codex`, `claude_code`, `higgsfield`, `ren`, `shin`, `haru`, `sora`, `kenji`, `miguel`, `samuel`.
- `review_status` lo fija quien entrega: `submitted`, `self_tested` o `needs_review`. Los estados de recepción los pone Avalon (sección 3).
- Los resultados de pruebas declarados se tratan como **declarados, no verificados**, hasta que se ejecutan en Avalon.

## 2. Cómo se envía

**Opción A, API del puente.** Requiere un token creado por un owner en Biblioteca → «API para herramientas».

```bash
AVALON_BRIDGE_TOKEN=avb_… node scripts/project-bridge/send-project.mjs ./nova-ui-0001.zip --url <avalon> --category apps --tool codex
```

El paquete queda en la bandeja privada (`inbox/`). El token no puede leer la biblioteca ni publicar nada, y se revoca al instante.

**Opción B, entrega del archivo.** El dueño copia la carpeta al entorno de integración.

## 3. Cómo se recibe

```bash
node scripts/project-bridge/verify-delivery.mjs <carpeta-de-la-entrega> --report informe.json
```

| Paso | Qué comprueba | Si falla |
| --- | --- | --- |
| 1 | Manifiesto completo y válido | `REJECTED` |
| 2 | `SHA256SUMS` y hash del artefacto | `REJECTED` (archivo alterado) |
| 3 | `base_commit` existe en el repositorio local | `REJECTED` (pedir rebase o el bundle base) |
| 4 | El bundle se importa a `refs/quarantine/<id>`, sin ejecutar nada; su punta es `delivery_commit` y desciende de `base_commit` | `REJECTED` |
| 5 | Archivos cambiados, rutas sensibles (migraciones, auth, seguridad, middleware, workflows, `package.json`, scripts) y secretos en las líneas añadidas | Un secreto provoca `REJECTED`; las rutas sensibles generan un aviso de revisión obligatoria |
| 6 | Archivos compartidos con el trabajo local y merge de prueba en un **worktree separado** | Si hay conflictos, `REJECTED` con la lista |
| 7 | Solo con `--run-tests`: `npm ci --ignore-scripts` y `npm test` dentro de ese worktree desechable | El fallo queda registrado |

El veredicto `READY_FOR_HUMAN_REVIEW` **no integra nada**. La integración la hace una persona, o Claude con aprobación:

```bash
git merge --no-ff refs/quarantine/<id>
```

Después se ejecutan las pruebas completas y se genera un respaldo con `scripts/devops/gitless-backup.sh incr`.

## 4. Reglas

- Ninguna entrega toca producción, aplica migraciones ni cambia secretos.
- Las migraciones incluidas en una entrega se revisan aparte y se prueban primero en una base aislada.
- Nova UI y los constructores visuales son de Codex. Claude no los reconstruye: solo verifica, integra o rechaza con motivo.
- Las entregas rechazadas se registran con su informe JSON y se devuelven al autor con la lista exacta de problemas.

## 5. Verificado (2026-11-09)

- Entrega sintética válida: `READY_FOR_HUMAN_REVIEW`.
- Bundle alterado después de empaquetar: `REJECTED` en el paso 2.
- Entrega con una clave `sk_live_…`: `REJECTED` en el paso 5.
- Entrega que choca con trabajo local en `README.md`: `REJECTED` en el paso 6, con la lista de conflictos.
- Manifiesto incompleto: `REJECTED` en el paso 1.
- En los cinco casos, la rama de trabajo no se modificó.
