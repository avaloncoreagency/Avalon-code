# Contrato de datos: actividad de los managers (REN · SHIN · HARU · SORA · KENJI)

Estado: **propuesto para implementación en paralelo**. Propietario del backend: Claude (`src/lib/agents/**`,
`supabase/migrations/**`). Propietario de la representación visual de la Oficina: Codex. Este documento es la única
interfaz entre ambos: Codex puede construir la UI contra estos tipos antes de que el backend se fusione.

## Qué son los managers hoy (honestidad obligatoria)
Los cinco managers son **ejecutores deterministas gratuitos** (`executor_kind: "deterministic"`): código de Avalon que
lee datos reales bajo RLS de propietario y guarda un informe. **No son modelos de IA** ni agentes autónomos. La UI no
debe decir «IA», «pensando», «trabajando 24/7» ni «en línea». Solo puede decir lo que muestra `status`.

## Endpoint de lectura
`GET /admin/workspace/crm/office/manager-activity`  (solo propietarios autorizados; 403 en otro caso; `Cache-Control: private, no-store`)

```ts
type ManagerKey = "ren" | "shin" | "haru" | "sora" | "kenji";
type ManagerStatus = "idle" | "queued" | "running" | "completed" | "failed" | "blocked" | "stale";

type ManagerActivity = {                    // exactamente la interfaz acordada
  manager_key: ManagerKey;
  run_id: string | null;                    // uuid de la última ejecución; null si status = "idle"
  status: ManagerStatus;
  task_title: string | null;
  started_at: string | null;                // ISO-8601 UTC
  finished_at: string | null;
  result_summary: string | null;            // texto plano, <= 2000 caracteres, sin HTML ni enlaces
  evidence_refs: { type: string; id: string; label?: string }[];   // <= 20; ids reales de Avalon, nunca datos del cliente
  error_code: string | null;                // p. ej. "kill_switch", "hourly_limit", "lease_expired"
  updated_at: string | null;
};

type ManagerActivityResponse = {
  managers: ManagerActivity[];              // siempre 5, en el orden ren, shin, haru, sora, kenji
  meta: {
    executor_kind: "deterministic";
    kill_switch: boolean;                   // true = ninguna ejecución arranca
    automatic_enabled: boolean;             // false = no hay ejecuciones programadas (hoy siempre false)
    freshness_hours: number;                // pasado este tiempo, "completed" se muestra como "stale"
    generated_at: string;
  };
};
```

### Reglas de `status`
| status | significado | origen |
|---|---|---|
| `idle` | nunca se ejecutó | sin filas |
| `queued` | encolada, aún sin reclamar | fila |
| `running` | reclamada con lease vigente (4 min) | fila |
| `completed` | terminó con resultado guardado y vigente | fila |
| `failed` | terminó con error (`error_code`) | fila |
| `blocked` | no arrancó por política (`kill_switch`, `hourly_limit`, `daily_limit`) | fila |
| `stale` | **derivado**: `running` con lease vencido, o `completed` más antiguo que `freshness_hours` | calculado |

## Endpoint de acción (solo propietarios, mismo origen)
`POST /admin/workspace/crm/office/manager-run` con `{ "manager_key": "haru" }` → devuelve el `ManagerActivity` resultante.
Doble clic en 5 minutos devuelve la misma ejecución (idempotencia). `POST …/manager-run` con `{ "kill_switch": true|false }`
activa o desactiva el interruptor de emergencia.

## Capacidades permitidas (allowlist; todo lo demás se rechaza)
| manager | capability | qué hace (determinista, solo lectura salvo guardar su informe) |
|---|---|---|
| ren | `operations_plan` | consolida los últimos informes de los otros cuatro, solicitudes pendientes y bloqueos |
| shin | `security_posture` | revisa RLS, privilegios de `anon`, funciones privilegiadas y membresías; nunca declara «seguro» |
| haru | `crm_followups` | seguimientos vencidos, tareas vencidas/bloqueadas, órdenes bloqueadas |
| sora | `radar_review_queue` | prospectos del Radar listos para revisión humana, por estrellas y confianza |
| kenji | `data_quality_cost` | duplicados probables, huérfanos y consumo de cuotas del Radar y de los propios managers |

Ningún manager escribe en el CRM, contacta personas, abre PRs ni usa secretos de proveedores. Solo guardan su informe.

## Qué NO debe hacer la UI
- Mostrar `result_summary` como HTML. Es texto plano.
- Mostrar un manager como «activo» por tener `status = "completed"`: significa «tiene un informe reciente».
- Publicar nada de esto en GitHub: los informes pueden contener identificadores internos del CRM.
