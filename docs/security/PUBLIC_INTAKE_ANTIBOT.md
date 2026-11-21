# Formulario público — protección antibots (P0.2)

Estado: `IMPLEMENTED_IN_BRANCH`. **Nada está activo en producción** hasta completar los pasos de activación.

## Capas

| Capa | Qué hace | Dónde |
|---|---|---|
| Honeypot + validación + límites por correo y globales (SQL) | Igual que antes; el honeypot responde `ok` sin guardar nada, a propósito | `crm_public_inquiry` |
| Límite por IP (servidor) | 5 envíos por hora y por IP, **antes** de llamar a Cloudflare o a la base | `src/app/quote-actions.ts` |
| Turnstile en el servidor | Siteverify con `action = avalon_quote` y hostname exacto. Cloudflare rechaza tokens caducados o reutilizados (`timeout-or-duplicate`). Un token de login no sirve para enviar una cotización | `src/lib/security/turnstile.ts` |
| Widget | Solo se activa al pulsar «Verificar que soy humano», nunca al abrir la página. Funciona en ES/EN, con teclado y en móvil. Se vuelve a armar tras cada respuesta | `HumanVerification` (`action="avalon_quote"`) |
| Datos del visitante | Si algo falla, el formulario conserva lo escrito (el token nunca se devuelve) | `QuoteState.values` |
| Embudos públicos `/f/[slug]` (FV-001, hallazgo de Codex en #295) | Mismo orden: límite por IP → Siteverify con `action = avalon_funnel` → solo entonces cliente de base y RPC. Rechazado o no verificable = cero llamadas a la base; valores conservados; token nunca reenviado. Un token de login o de cotización no sirve aquí | `src/app/f/[slug]/actions.ts`, `form.tsx` |
| Base de datos (solo revisión) | `anon` pierde `EXECUTE` sobre `crm_public_inquiry` y `crm_growth_funnel_submit` y solo puede llamar a los envoltorios `crm_public_intake` / `crm_public_funnel_intake`, que exigen el token del servidor. La base guarda solo su SHA-256 en `crm_private.intake_tokens`. Sin JWT ni clave privilegiada: es el mismo patrón que `os_bridge_api_*` | `docs/sql/public-intake-role-review.sql`, `src/lib/supabase/intake.ts` |

Sin las claves de Turnstile, el formulario funciona como hoy (estado `disabled`, documentado). Con configuración parcial, falla cerrado y responde «no disponible»; nunca deja pasar.

## Activación (requiere autorización de los propietarios)

1. Configurar en Vercel `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` y `TURNSTILE_EXPECTED_HOSTNAME`. Son las mismas que usa el login, si ya existen. Probar primero en Preview.
2. Generar un token aleatorio de al menos 32 caracteres **fuera del repositorio**. Guardarlo en Vercel como `AVALON_INTAKE_TOKEN`: solo en el servidor, nunca `NEXT_PUBLIC_`. Desplegar.
   Mientras el SQL no esté aplicado, la app llamará a los envoltorios, que aún no existen. Por eso los pasos 2 y 3 van juntos: primero el SQL y el hash en la ventana autorizada, y luego la variable.
3. Con respaldo verificado:
   - aplicar `docs/sql/public-intake-role-review.sql`;
   - insertar `sha256(AVALON_INTAKE_TOKEN)` en `crm_private.intake_tokens`;
   - definir la variable y volver a desplegar.
4. Comprobar:
   - un `POST /rest/v1/rpc/crm_public_inquiry` con la clave anónima devuelve `permission denied`;
   - `crm_public_intake` sin token o con un token incorrecto devuelve `unavailable`;
   - el formulario real sigue guardando.

**Por qué no se usa JWT:** no puede verificarse, sin manejar el secreto JWT privado del proyecto, que Supabase acepte tokens HS256 firmados con un secreto antiguo. Los proyectos con claves de firma asimétricas los rechazan. Este diseño no depende de eso.

**Rotación del token:**
1. Insertar el hash del nuevo token.
2. Cambiar la variable y desplegar.
3. Marcar `revoked_at` en el token anterior.

**Rollback:** ejecutar el bloque *Rollback* del SQL y borrar `AVALON_INTAKE_TOKEN`.

## Pruebas

- `tests/quote-antibot.test.cjs` (6 pruebas): sin humano verificado no se llama a la RPC; la acción tiene que coincidir; hostname; token repetido o caducado; Cloudflare caído falla cerrado; los valores se conservan; el límite por IP se comprueba primero; el widget no se ejecuta solo.
- `tests/intake-role.database.cjs`: antes del SQL existe la vía anónima directa. Después del SQL:
  - `anon` y `authenticated` reciben `permission denied` sobre las funciones internas;
  - un token ausente, corto, incorrecto o revocado devuelve `unavailable` y no guarda nada;
  - el token válido guarda la solicitud;
  - la rotación funciona y los hashes no se pueden leer;
  - el token nunca se guarda junto a la solicitud;
  - el rollback restaura el comportamiento actual.

## Hallazgos de Codex (#295)

- **FV-001** (embudo sin verificación humana en el servidor): corregido en esta rama; 5 escenarios negativos en `tests/quote-antibot.test.cjs`.
- **FV-002** (rol `avalon_intake` reutilizado conserva privilegios) y **FV-003** (compatibilidad HS256): aplicaban al diseño anterior con rol personalizado y JWT (pin `789eb2d`). Desde `5b5942b` el SQL de revisión **no crea ni usa ningún rol ni JWT**; usa envoltorios con token cuyo hash vive en `crm_private.intake_tokens`. Codex debe actualizar los pins para confirmarlo.
- En producción sigue pendiente: aplicar el SQL (autorización separada + respaldo) y configurar claves Turnstile y `AVALON_INTAKE_TOKEN`. Sin claves Turnstile, la verificación queda en estado `disabled` (brecha documentada de despliegue).
