# Avalon AI Engine

Capa de inteligencia multi-proveedor para los diez trabajadores digitales de Avalon. **Solo cuotas gratuitas; presupuesto monetario $0.**
Reutiliza el motor de managers existente (`crm_agent_*`, PR #126/#127). No es otro motor de tareas: añade selección de modelo,
cambio automático de proveedor, estado reanudable, memoria y el ejecutor de desarrollo de REN.

## Estado honesto (2026-11-04)
| Pieza | Estado | Evidencia |
|---|---|---|
| Adaptadores GroqCloud, Cloudflare Workers AI, OpenRouter | Implementados | `src/lib/ai-engine/adapters.ts`, pruebas con servidores sintéticos |
| Oracle Cloud | **Preparado, no operativo** | No se enruta hasta `ORACLE_AI_VERIFIED=true` tras verificar instancia Always Free + modelo local |
| Selección por capacidades / calidad / contexto / velocidad / límites | Implementada | `selectModels`, `tests/ai-engine.test.cjs` |
| Cambio automático de proveedor (429, 401/403, 5xx, timeout, cupo) | Implementado | prueba offline + paso «failover forzado» del smoke real |
| Estado persistente y reanudación | Implementado (archivo atómico en el worker; tablas Supabase preparadas) | prueba de caída simulada y reanudación |
| Memoria, objetivos y ejecutores de los 5 managers; 5 puestos reservados inertes | Implementado (código + migración) | `workforce.ts`, `20261106090000_ai_engine.sql`, `tests/ai-engine.database.cjs` |
| REN: tarea de desarrollo autónoma | Pipeline verificado con proveedor **sintético**; **ejecución real pendiente de claves** | `tests/ai-engine-ren.pipeline.cjs` |
| Llamadas reales a los 3 proveedores | **No verificadas todavía** | Las claves no están en GitHub, Vercel ni en este entorno; la red de este entorno bloquea los 3 dominios |

## Cómo garantiza $0
- **OpenRouter:** solo ids `:free` cuyo precio en vivo (`/models`) es 0 en todos los campos; `provider.max_price = 0` en cada solicitud;
  `usage.cost > 0` o HTTP 402 → el proveedor queda **bloqueado** hasta que un humano lo libere. El smoke compara `usage` de la clave antes/después.
- **GroqCloud:** la cuenta debe seguir en el **plan Free** (sin tarjeta). Tope propio: 800 solicitudes y 400k tokens/día.
- **Cloudflare Workers AI:** asignación gratuita de 10.000 neuronas/día; tope propio de **8.000 neuronas estimadas** con la tarifa más alta
  publicada. En plan Free, Cloudflare corta al agotarse; con Workers Paid facturaría el exceso — por eso el tope está por debajo.
- La migración impone `cost_usd = 0` (CHECK) en tareas y libro de uso: un gasto no puede ni registrarse.
- No hay rutas a modelos de pago, recargas ni facturación automática en el código.

## Protección de datos
Solo se envían datos `synthetic`, `public_repo` o `internal_aggregate`. `client_personal` se rechaza (no existe flujo de autorización).
Antes de cada envío se buscan emails (salvo dominios reservados), teléfonos, tarjetas (Luhn), JWT, claves de API, claves privadas y
secretos de Supabase: si aparecen, **no sale nada**. Los endpoints gratuitos pueden registrar prompts; por eso esta regla.
Las claves son secretos de servidor (nunca `NEXT_PUBLIC_*`, comprobado en el guardia y en las pruebas de seguridad).

## Trabajadores
| Clave | Departamento | Objetivos | Ejecutores | IA |
|---|---|---|---|---|
| REN | Dirección y desarrollo | plan diario; tareas de desarrollo de bajo riesgo | `operations_plan` (SQL), worker de desarrollo (rama + PR borrador, requiere revisión) | code+json, calidad ≥3 |
| SHIN | Seguridad | postura de seguridad | `security_posture` (SQL) | reasoning |
| HARU | CRM | seguimientos vencidos = tareas | `crm_followups`, `followup_tasks` (escritura interna) | rápido |
| SORA | Lead Hunter | cola del Radar 4–5★ | `radar_review_queue` | json |
| KENJI | Calidad y costos | calidad de datos; coste IA = 0 | `data_quality_cost`, libro de uso IA | rápido |
| Puestos 6–10 | Próxima incorporación — Equipo de Samuel | — | — | — (la base impide asignarles ejecutores o IA) |

## REN — tarea autónoma
`scripts/ai-engine/ren-dev-task.cjs`: descubre avisos de ESLint de reglas permitidas en `tests/` y `scripts/` (nunca la escena 3D,
`supabase/`, auth ni workflows) → pide la corrección a un modelo gratuito (con failover) como ediciones de línea validadas contra el
archivo → aplica → lint + `node --test` del archivo + `npm test` → si algo falla, **revierte** → rama `ren/auto-*` + **PR borrador**.
Nunca fusiona. Cada paso se guarda; una ejecución repetida reanuda sin repetir llamadas.

## Activación (lo único que requiere a una persona)
Las claves solo existen en las cuentas de los proveedores; Claude no puede leerlas ni debe recibirlas por chat. Introdúcelas en
**GitHub → `avaloncoreagency/Avalon-code` → Settings → Secrets and variables → Actions → New repository secret**:

| Nombre | Valor |
|---|---|
| `GROQ_API_KEY` | console.groq.com → API Keys |
| `CLOUDFLARE_ACCOUNT_ID` | dash.cloudflare.com → Workers AI → «Use REST API» (Account ID) |
| `CLOUDFLARE_API_TOKEN` | mismo sitio → «Create a Workers AI API Token» (permisos Workers AI Read + Edit) |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys (recomendado: límite de crédito 0 en la clave) |

Después, en el PR del AI Engine, la etiqueta `ai-engine:live` ejecuta el smoke real y `ai-engine:ren-run` la tarea real de REN.
Tras fusionar: Actions → «Avalon AI Engine» → Run workflow (`smoke` o `ren`). Interruptor: variable `AVALON_AI_ENGINE_DISABLED=true`.

**Vercel:** no hace falta configurar nada ahora; ninguna ruta de la app llama todavía a proveedores. Cuando la Oficina use IA desde el
servidor, las mismas cuatro variables irán en Vercel → Project `avalon-core-agency` → Settings → Environment Variables (sin `NEXT_PUBLIC_`).

**Supabase:** `20261106090000_ai_engine.sql` está preparada y probada en PostgreSQL (PGlite); **no aplicada** a producción. La IA queda
apagada (`ai_enabled=false`) hasta que un owner la active con `crm_ai_set_enabled(true)`.

## Limitaciones
- Las listas de modelos del catálogo son candidatas; el router solo usa las que la API de cada proveedor confirma en vivo.
- El plan de Groq y de Cloudflare no se puede leer desde la API con estas claves: el $0 depende de que las cuentas sigan en plan gratuito
  (además de los topes propios). OpenRouter sí se verifica (precio en vivo, `max_price`, uso de la clave).
- Las PR creadas por REN con `GITHUB_TOKEN` no disparan otros workflows (regla de GitHub); la evidencia de pruebas es la ejecución del propio REN.
- Graphify no estaba disponible en esta sesión (UNKNOWN); la revisión se hizo sobre el código de `main@d2890bb`.

## Rollback
Variable `AVALON_AI_ENGINE_DISABLED=true` (para todo), borrar los secretos, revertir el PR. Base de datos: no aplicada; si se aplica,
el bloque de rollback está en la cabecera de la migración.
