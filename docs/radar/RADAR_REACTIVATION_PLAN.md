# RADAR_REACTIVATION_PLAN — Radar en hibernación

**Estado (2026-11-20): Radar está suspendido indefinidamente por decisión de los propietarios.**
Su código, migraciones, tablas, historial y pruebas se conservan. Mientras esté suspendido no aparece en la operación comercial y no puede generar llamadas facturables.

## 1. Cómo está hibernado

| Capa | Mecanismo | Dónde |
|---|---|---|
| Interruptor único (servidor) | `AVALON_RADAR_EXTERNAL_ENABLED` debe ser exactamente `true`. Ausente o con cualquier otro valor, queda apagado. No hay control desde el navegador. | `src/lib/crm/radar-control.ts` (PR #250) |
| Búsquedas / ingesta | `radarEndpoint()` y `searchAndIngest()` devuelven 423 antes de leer la base o llamar a Geoapify/Overpass. | `src/lib/crm/radar-search.ts` |
| Geocodificación | `GET /crm/radar/geocode` devuelve 423 antes de llamar a Geoapify. | `.../radar/geocode/route.ts` |
| Investigación web | `investigateOfficialWebsite()` falla antes de DNS, robots o páginas; `POST /crm/radar/research` devuelve 423. | `src/lib/crm/radar-research.ts`, `.../radar/research/route.ts` |
| Campañas | `run` y reactivar (`status=active`) devuelven 423. | `.../radar/campaigns/route.ts` |
| Worker programado (código) | Si el interruptor no es `true`, responde `paused` antes de sondas, rastreo, *lease* o lotes. | `supabase/functions/avalon-radar-worker/index.ts` |
| Interfaz | `/crm/hunter` muestra una página de suspensión **en servidor** y no carga el componente Radar, así que no hay mapa, *tiles* ni llamadas. Radar no aparece en la navegación, el dashboard, las acciones de Leads ni el alta de leads. | `src/app/admin/workspace/crm/[section]/page.tsx`, `src/components/crm/navigation.tsx` |
| Solicitudes del website | Ya no dependen de Radar: llegan a la bandeja `/crm/inbound` (PR #251). | `src/app/admin/workspace/crm/inbound` |

**Pruebas:**
- `tests/radar-pause.test.cjs` (#250) comprueba que haya cero peticiones a proveedores, cero lecturas y escrituras, y que las rutas HTTP y el worker queden bloqueados.
- `tests/radar-hibernation.test.cjs` comprueba que no haya enlaces activos, que la página de Radar esté bloqueada antes del componente y que exista un único interruptor.

## 2. Arquitectura conservada

- **Migraciones** (ninguna se borra):
  - `20261102190000_radar_core`;
  - `20261103192500_radar_source_research`;
  - `20261103195650_radar_auto_technical_opportunity_tier`;
  - `20261103205000_radar_scheduler_core`;
  - `20261103224500_radar_profile_prequalification`;
  - `20261104140000_radar_rules_decisions`;
  - `20261106100000_radar_owner_approval`;
  - `20261110140000_radar_search_runs`.
- **Tablas (historial intacto):**
  - `crm_prospects` (compartida con la bandeja del website: **no** desactivar);
  - `crm_prospect_approvals`, `crm_prospect_needs`;
  - `crm_radar_campaigns`, `crm_radar_decisions`, `crm_radar_research_reports`, `crm_radar_rule_sets`;
  - `crm_radar_runs`, `crm_radar_run_places`;
  - `crm_radar_worker_config`, `crm_radar_worker_runs`.
- **Código:**
  - `src/components/crm/titan-radar.tsx`, `radar-research-panel.tsx`, `radar-auto-research.tsx`;
  - `src/lib/crm/radar*.ts`;
  - rutas `src/app/admin/workspace/crm/radar/*`;
  - Edge Function `avalon-radar-worker`;
  - `scripts/ops/radar-worker-install.sql` / `radar-worker-disable.sql`.

## 3. Proveedores externos y variables

| Variable | Uso | Riesgo de consumo |
|---|---|---|
| `AVALON_GEOAPIFY_PLACES_KEY` (servidor) | Búsqueda de lugares (Geoapify Places) | Créditos Geoapify por búsqueda |
| `AVALON_GEOCODER_URL` | Geocodificación | Créditos por consulta |
| `AVALON_RADAR_OVERPASS_URL` | Alternativa OSM/Overpass | Cuota y política del servicio |
| `NEXT_PUBLIC_AVALON_GEOAPIFY_MAP_KEY` / `NEXT_PUBLIC_AVALON_MAP_TILES` | *Tiles* del mapa (clave **pública**, restringida por dominio) | Peticiones de *tiles* al abrir el mapa; hoy no se carga |
| `AVALON_RADAR_DAILY_SEARCH_LIMIT` | Tope diario de búsquedas | Control de presupuesto |
| Investigación web (fetch HTTPS, DNS, robots) | Analiza la web oficial del negocio | Sin coste de proveedor; tráfico saliente |

**No eliminar** secretos compartidos: Supabase, service role y claves de otros módulos.

No hay datos verificables de facturación de Geoapify en el repositorio, así que no se estiman costes. Antes de reactivar, revisar el panel del proveedor.

## 4. Recursos remotos en producción (verificado 2026-11-20, solo lectura)

| Recurso | Estado observado | Acción recomendada (requiere autorización) |
|---|---|---|
| `pg_cron` job `avalon-radar-hourly` | Existe, **inactivo** (`active=false`) | Mantener inactivo. Opcional: `cron.unschedule` |
| `crm_radar_worker_config.enabled` | `true` | Poner `false` con `scripts/ops/radar-worker-disable.sql` (reversible) |
| Edge Function `avalon-radar-worker` v10 | **ACTIVE**, `verify_jwt=false`, exige un token cuyo SHA-256 coincida con la config. Esa versión **no** tiene el interruptor de #250 | Redeplegar la versión con el interruptor, o desactivar la función |
| Variable `AVALON_RADAR_EXTERNAL_ENABLED` en Vercel | Ausente (= apagado) | No añadirla mientras esté suspendido |

Con el cron inactivo y la función protegida por token, hoy no hay ejecuciones automáticas. Los dos cambios remotos anteriores son una defensa adicional que **no** se ejecuta sin autorización explícita de un propietario.

## 5. Problemas funcionales conocidos

- Dependencia de *tiles* de terceros: el servidor comunitario de OSM bloquea uso comercial (`radar-map-tiles.ts`).
- Calidad variable de datos OSM/Overture y necesidad de aprobación humana (migración `radar_owner_approval`).
- La investigación web depende de sitios de terceros (robots, timeouts).
- Coste sin tablero propio: no hay vista de consumo de Geoapify dentro de Avalon.

## 6. Mejoras necesarias antes de reactivar

1. Presupuesto mensual explícito y tope diario (`AVALON_RADAR_DAILY_SEARCH_LIMIT`) acordado por los propietarios.
2. Registro de consumo por búsqueda visible en el Dashboard (créditos IA / proveedores).
3. Aprobación humana obligatoria antes de crear leads (ya existe) y revisión de calidad.
4. Desplegar el worker con el interruptor de #250 **antes** de reactivar cualquier cron.

## 7. Pruebas mínimas antes de reactivar

- `tests/radar-pause.test.cjs` y `tests/radar-hibernation.test.cjs` en verde con el interruptor apagado.
- Pruebas de proveedor **simuladas** (`tests/radar-geoapify.test.cjs`, `tests/radar-research.test.cjs`) con el interruptor activado solo en el proceso de prueba.
- E2E del CRM completo sin Radar (Leads, Clients 360, Ventas, Cotizaciones).
- Ninguna llamada real a proveedores en CI.

## 8. Procedimiento de reactivación (requiere autorización escrita de un propietario)

1. Aprobar el presupuesto y el tope diario.
2. Desplegar la Edge Function con el interruptor; confirmar `paused:true` con el interruptor apagado.
3. Definir `AVALON_RADAR_EXTERNAL_ENABLED=true` **solo** en el entorno autorizado (Vercel y Supabase secrets), empezando por Preview.
4. Comprobar que Radar vuelve a aparecer en «Más herramientas del CRM» y que `/crm/hunter` carga el componente.
5. Ejecutar una búsqueda manual pequeña y verificar el consumo en el panel del proveedor.
6. Solo después, si se aprueba, reactivar `avalon-radar-hourly`.

## 9. Procedimiento de reversión

1. Eliminar `AVALON_RADAR_EXTERNAL_ENABLED` (o ponerlo distinto de `true`) en Vercel y Supabase. El efecto es inmediato en el siguiente despliegue o arranque.
2. `scripts/ops/radar-worker-disable.sql`: `enabled=false` y `cron.unschedule('avalon-radar-hourly')`.
3. El historial y los prospectos se conservan; nada se borra.
