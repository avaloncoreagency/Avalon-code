# Avalon OS — Commercial Core 360

**Auditoría inicial, Quoting Studio y conexión cotización → contrato.**

Base: `main` @ `53e5436` (2026-11-19), verificado contra producción:

- Vercel: `READY` sobre `53e5436`.
- Supabase `ltbwzcrxeuczdhhtbqgm`: `ACTIVE_HEALTHY`.
- Ledger con 44 migraciones, que coinciden por nombre con el repositorio. Las marcas de tiempo difieren por la convención `*_release`.

Esta entrega no toca el portal de empleados ni el PR #233 (Samuel). Tampoco toca Auth, RLS existente, Radar, recepcionistas, chatbots, OpenRouter ni ningún servicio de pago.

---

## 1. Mapa real de lo que ya existía (reutilizado, no duplicado)

| Pieza | Dónde vive | Cómo se usa ahora |
|---|---|---|
| Oportunidad (lead) y etapas | `crm_leads`, Kanban (#240, #241) | Toda cotización pertenece a una oportunidad. |
| Vínculo cliente ↔ oportunidad | `crm_clients.origin_lead_id`; `crm_register_client_with_opportunity`, `crm_ensure_client_opportunity` (#243, en producción) | El cliente de una cotización se **deriva** de ese vínculo; nunca lo envía el navegador. |
| Catálogo | `crm_service_catalog` (Core Engine #221) | Botones del asistente. Solo se precarga un precio si la oferta está `approved`. Hoy **ninguna** lo está (7 servicios en `draft`), así que el propietario escribe cada precio. |
| Términos comerciales acordados | `crm_commercial_terms` | Contract Studio los sigue usando cuando no se viene de una cotización. |
| Contract Studio (4 pasos, PDF inmutable con SHA-256) | `crm_client_agreement_drafts`, `src/lib/contracts/*` (#235, #244) | Se precarga desde la cotización aceptada y guarda `quote_version_id`. |
| PDF sin dependencias | `src/lib/contracts/pdf.ts` | El mismo enfoque (Helvetica WinAnsi, sin librerías) para el PDF de cotización. |
| Ventas, facturas, pagos, comisiones, conversiones atribuidas | Core Engine (#221) + `crm_attributed_conversions` | Sin cambios. Aceptar una cotización **no** crea ninguno de estos registros (probado). |
| Productos borrador por cliente | #246, #247 | Sin cambios en esta entrega. |
| Botón «Crear lead» arriba del pipeline | `src/components/crm/crm.tsx` (`#crm-create-lead`) | Ya cumple el punto 3.2. El dashboard ahora enlaza directo. |

## 2. Implementado en esta entrega

### Avalon Quoting Studio — `CRM → Cotizaciones`

**Migración aditiva** `supabase/migrations/20261119210002_crm_quoting_studio.sql`. **Aplicada en producción el 2026-11-19** con aprobación explícita del propietario (ledger `20261119210002_crm_quoting_studio`, 45 migraciones). Verificado:

- RLS activo en las 3 tablas;
- `anon` sin acceso y sin escritura directa para `authenticated`;
- trigger presente;
- `crm_quote_summary()` leído como propietario dentro de una transacción con rollback (0 cotizaciones; no se escribieron datos de prueba).

Advisors: las mismas 6 funciones `anon` ya clasificadas. Las funciones definer ejecutables por `authenticated` pasan de 48 a 51, que son exactamente las 3 RPC nuevas, todas solo para propietarios.

Tablas nuevas:

- `crm_quotes`: número único `Q-AAAA-NNNN`, oportunidad, cliente derivado, estado, versión actual, vigencia, `request_key` para idempotencia y `version` como bloqueo optimista.
- `crm_quote_versions`: revisiones **append-only**. Separan en dos columnas el `content` (lo que ve el cliente) y el `internal` (costos, margen y notas de Avalon). Los totales se calculan **en SQL** con `numeric` exacto.
- `crm_quote_events`: cada cambio de estado, con su actor y su nota.

Permisos y estados:

- Sin `INSERT`, `UPDATE` ni `DELETE` para nadie. Solo `SELECT` para propietarios vía RLS.
- Las escrituras pasan por 3 RPC `SECURITY DEFINER` que verifican `crm_private.is_owner()`: `crm_quote_create`, `crm_quote_revise` y `crm_quote_transition`. Además, `crm_quote_summary()` es `SECURITY INVOKER`.
- Estados: Borrador → Revisión interna → Aprobada → Enviada → Aceptada / Rechazada / Vencida, además de Reemplazada.
  - No se puede saltar pasos.
  - Enviar, aceptar, rechazar o reemplazar exige una nota escrita (evidencia).
  - Una comisión «por acordar» puede enviarse, pero **no** aceptarse.
  - Una cotización vencida no se acepta.
  - Lo enviado no se edita: cualquier cambio exige una cotización nueva.
- `crm_client_agreement_drafts.quote_version_id`: un trigger solo permite enlazar la versión **actual** de una cotización **aceptada** de la **misma empresa**. No se cambió ninguna política RLS.

**Modelos de cobro**, cada uno con su forma estricta, validada en TypeScript **y** en SQL:

- Precio fijo.
- Suscripción mensual.
- Comisión por resultados. Incluye:
  - porcentaje;
  - base;
  - evento que la genera;
  - ventana de atribución;
  - evidencia;
  - liquidación;
  - exclusiones;
  - reembolsos y contracargos;
  - vencimiento.
- Híbrido, con cada componente separado.

Los costos de terceros se muestran aparte y **nunca** se suman como ingreso de Avalon.

**Asistente en 5 pasos**:

1. Prospecto (precargado desde lead y Clients 360).
2. Servicios y precios.
3. Modelo de cobro.
4. Alcance y condiciones, más la información interna.
5. Revisión con errores claros.

Totales en vivo, ES/EN, y en iPhone los pasos se desplazan en horizontal.

**PDF premium** (Letter, ES/EN):

- Portada azul marino con el resumen de inversión.
- Páginas interiores blancas.
- Tabla con importes alineados.
- Totales, modelo de cobro, condiciones de la comisión, vigencia y próximos pasos.
- Número de página en cada hoja.

Seguridad del PDF:

- El renderer **solo acepta** `QuoteContent`, así que la información interna no puede llegar por tipo. Las pruebas lo confirman a nivel de bytes.
- Integridad SHA-256 verificada antes de cada render.
- La descarga solo se permite para la versión actual aprobada, enviada o aceptada; la vista previa siempre.
- Descargar **no** marca la cotización como enviada.
- Respuestas `private, no-store`, CSP con sandbox y nombre de archivo consistente (`Avalon-Quote-Q-2026-0001-v2.pdf`).

**Puntos de entrada**:

- Pestaña «Cotizaciones» en la navegación principal del CRM.
- Botones en la ficha del lead, en Clients 360 y en Ventas.
- Contador «Cotizaciones» en la visión general de Clients 360.
- Acción rápida y KPI en el Dashboard: abiertas, enviadas, vencidas y aceptadas sin contrato.

### Cotización aceptada → Contract Studio

«Crear contrato desde cotización» abre Contract Studio con datos de la versión aceptada:

- alcance, entregables y exclusiones;
- hitos y dependencias;
- costo inicial y mensualidad exactos;
- comisión redactada;
- costos de terceros, correo y dirección;
- servicios mapeados al contrato;
- referencia «Based on accepted quote Q-… vN».

El propietario completa lo legal que la cotización no cubre: parte contratante real, condado, aceptación, revisiones y plazo. Nada se firma ni se crea ninguna venta.

## 3. Activación y dependencias manuales

| Qué | Dependencia | Acción necesaria | Riesgo |
|---|---|---|---|
| Quoting Studio en producción | Migración `20261119210002_crm_quoting_studio.sql` | **Hecho**: aplicada y verificada el 2026-11-19. | — |
| Precios precargados | Ofertas del catálogo en `approved` | Aprobar precios en Configuración → Catálogo (decisión del propietario). | Ninguno. Mientras tanto se escriben a mano. |
| Envío por correo | No hay integración de correo | Hoy: descargar PDF y luego «Registrar envío manual». | Ninguno; no se finge un envío. |

## 4. Revisión de los PR solicitados

| PR | Estado real | Recomendación |
|---|---|---|
| #245 (vinculación cliente–lead, review-only) | Su SQL es **idéntico** a la migración ya aplicada `crm_client_opportunity_registration`, y la acción `ensureClientOpportunity` ya está en `main` (#243). | Cerrar como reemplazado por #243. |
| #236 (crear lead primero y editar fichas) | Integrado por el merge #241 («reconcile editable leads and Clients 360», refs #236). | Cerrar como reemplazado por #241, tras confirmarlo su autor. |
| #90 (vista imprimible sobre Solution Planner #59) | Depende de #59 (no fusionado) y de márgenes estimados. | Reemplazado por Quoting Studio (PDF real, versiones inmutables, sin márgenes en el PDF). Cerrar. |
| #227 (Core Engine UI: facturas, pagos, comisiones) | Rama de Codex, **no** está en `main`. Toca `clients/[id]/page.tsx` y `sales/[id]/page.tsx`. | Siguiente PR recomendado para «Facturas y pagos / Comisiones». Rebasar sobre este PR; el conflicto esperado es una sola línea de `actions` en Clients 360. No lo edité. |
| #205 (AI Credit Center) | Borrador. | Fuera de esta entrega. Integrarlo como sección compacta del Dashboard en un PR aparte, solo con datos de fuentes verificables. |
| #233 (portal de empleados, Samuel) | — | No tocado. |

## 5. Seguridad

**Advisors de Supabase**, verificados el 2026-11-19 sobre producción:

- **6 funciones `SECURITY DEFINER` ejecutables por `anon`**, ya clasificadas en R-17 (`src/lib/security/findings.ts`) e inspeccionadas de nuevo en `pg_proc`:
  - `crm_public_inquiry` y `crm_growth_funnel_submit`: formularios públicos intencionales, con validación, honeypot y límite de frecuencia.
  - `crm_growth_funnel_view`: solo lectura de funnels activos sin cliente; valida el slug.
  - `os_bridge_api_open_import` y `os_bridge_api_import_status`: requieren un token con hash SHA-256, scope, expiración y no revocado. `open_import` también limita por hora.
  - `crm_ai_public_control`: solo lectura de 4 interruptores (kill switch, automático, IA activa, suspendidos). **Debe seguir siendo público**: `scripts/ai-engine/operate.cjs` (GitHub Actions) lo lee con la clave publicable para respetar el kill switch de Avalon y, si no responde, se detiene (fail-closed). Revocar `anon` apagaría el motor de IA. Decisión del 2026-11-19: se mantiene, documentado en R-17.
  - **No se revocó nada a ciegas.**
- **48 funciones definer ejecutables por `authenticated`**: siguen el modelo de R-18. `tests/definer-gates.test.cjs` exige que cada una esté protegida por owner, token o lista blanca. Las 3 RPC nuevas pasan esa prueba.
- **`pg_net` en `public`** (R-19): `extrelocatable=false`. No se mueve sin un proceso soportado.

**Quoting Studio**:

- Ninguna tabla con escritura directa.
- RLS de solo lectura para propietarios.
- `anon` revocado.
- Los no propietarios no ven nada.
- Errores de la base de datos traducidos a una lista blanca de códigos; nada se refleja en la URL.

## 6. Pruebas ejecutadas (en esta rama)

- `node --test tests/quotes.test.cjs` → **10/10**. Cubre: centavos exactos, forma de cada modelo, comisión por acordar, fechas, máquina de estados, JSON canónico, proyección segura para el cliente, PDF válido (xref, Letter, importes, sin datos internos, multipágina, caracteres especiales) y precarga del contrato.
- `node --test tests/quotes.database.cjs` (PostgreSQL real, PGlite) → **1/1**. Cubre:
  - permisos e idempotencia;
  - totales exactos y escritura directa denegada;
  - validación SQL de cada forma;
  - revisiones con bloqueo optimista;
  - máquina de estados y notas obligatorias;
  - enlace a contrato solo si la cotización está aceptada y es de la misma empresa;
  - aceptar no crea venta, factura, pago ni comisión;
  - auditoría;
  - segundo propietario sí, no miembro y `anon` no.
- `node --test tests/quotes.browser.cjs` (Next.js de producción → puente REST → PGlite con todas las migraciones y RLS real, Chromium). Pasa:
  - **autorización**: rutas con 307 sin sesión o sin membresía, 200 para el propietario, 404 si no existe;
  - **asistente**: precio vacío si no está aprobado;
  - **PDF**: sin datos internos;
  - **descarga**: bloqueada en borrador y exige confirmar la revisión;
  - **flujo completo**: revisión → aprobación → envío manual → aceptación → contrato con `quote_version_id` exacto, sin ventas creadas;
  - **iPhone 13**: sin scroll horizontal.
- `npm test` → **685/685**. `tsc --noEmit` limpio. ESLint sin errores (2 avisos previos ajenos). `npm run build` correcto.
- Pruebas existentes de contratos, atribución y vinculación cliente–oportunidad: verdes.

**No verificado**: Safari en un iPhone físico; el visor PDF embebido de Chromium headless (el PDF se verificó por bytes y con `pdftoppm`); el flujo completo en producción, porque crear cotizaciones de prueba ahí significaría escribir datos ficticios en producción, y eso está prohibido. Lo hará el primer uso real de un propietario.

Evidencia visual en `docs/crm/commercial-core-360/`: asistente, cotización aceptada, lista, iPhone y las 3 páginas del PDF.

## 7. Piloto Chino Barber

**Ya se puede** (migración aplicada):

1. Registrar o revisar al prospecto y su oportunidad.
2. Crear la cotización: website y CRM como pago único, mantenimiento mensual y comisión por resultados (porcentaje propuesto o «por acordar»).
3. Revisar el PDF, aprobarlo, descargarlo, registrar el envío manual y la aceptación con evidencia.
4. Generar el borrador de contrato vinculado.
5. Preparar website y CRM como productos borrador (#246/#247).
6. Registrar conversiones atribuidas con el ledger existente, que exige contrato firmado y verificado.

**Falta o es manual**:

- precios reales del catálogo;
- datos legales reales de la parte contratante (Avalon no está constituida);
- firma fuera de la plataforma y verificación del contrato;
- acceso financiero (`crm_private.finance_access`) para los propietarios que deban ver las comisiones.

**Prohibido asumir como completado**: una venta, un contrato firmado, un pago, una URL publicada o un porcentaje acordado sin evidencia escrita. El CRM de Avalon (relación comercial con la barbería) y el CRM de la barbería (sus propios clientes) siguen separados.

## 8. Recomendaciones (por prioridad)

1. **P0 — Hecho:** migración del Quoting Studio aplicada y verificada en producción.
2. **P1 — Integrar #227** (facturas, pagos, comisiones en la interfaz) rebasado sobre esta rama. Completa «Ventas → Facturas y pagos / Comisiones».
3. **P1 — Aprobar las ofertas del catálogo** para que las cotizaciones se precarguen.
4. **P2 — Hecho:** revisado `crm_ai_public_control`; el acceso `anon` es necesario para el kill switch de GitHub Actions y se mantiene.
5. **P2 — Sección compacta de créditos IA (#205)** en el Dashboard, solo con fuentes verificables.
6. **P3 — Integración de correo** (cuando se apruebe un proveedor) para enviar el PDF y registrar el envío automáticamente.
