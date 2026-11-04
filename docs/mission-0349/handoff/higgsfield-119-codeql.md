# #119 — check `CodeQL` en rojo: diagnóstico (2026-11-04)

Check run 126630507731: **6 alertas altas + 1 media** nuevas en el código cambiado por #119 (anotaciones leídas por API):

| Archivo:línea | Regla | Qué es realmente |
|---|---|---|
| `scripts/creative-bridge/import-asset.cjs:45,97` | file system race (TOCTOU) | `lstat` → `open`; ya mitigado con `O_NOFOLLOW` + comparación `ino/dev`, pero CodeQL ve el patrón check→use. |
| `scripts/creative-bridge/private-files.cjs:3` | file system race | `statSync` → `readFileSync`. |
| `scripts/creative-bridge/submit.mjs:28` | file system race | `stat` → `readFile`. |
| `tests/creative-media-import.test.cjs:52,55` | file system race | Código de prueba (`unlink`/`write` para simular manipulación): falso positivo; descartar con justificación. |
| `scripts/creative-bridge/submit.mjs:46` (media) | file data en petición saliente | Intencional: el manifiesto firmado se envía al endpoint validado (`/api/creative-bridge/deliveries`, HTTPS, sin query/hash). Descartar con justificación. |

Son CLIs locales del operador, no código de servidor; el riesgo real es bajo, pero el check bloquea el PR.

**Parche propuesto** (`higgsfield-119-codeql-toctou.patch`, archivos de Codex → no se aplicó a su rama): abrir primero y validar el descriptor abierto (`open` con `O_NOFOLLOW` + `fstat`/`handle.stat()`), sin `lstat/stat` previo. Verificado sobre el HEAD de #119 (`aeb5333`): tests `creative-bridge`, `continuity`, `delivery`, `media-import`, `projects-api`, `register` pasan igual antes y después (5, 8, 2, 3, 1, 1). Falta que el CI de CodeQL confirme que las alertas 1–4 desaparecen.
