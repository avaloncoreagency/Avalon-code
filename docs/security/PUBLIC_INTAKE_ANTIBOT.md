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
| Base de datos (solo revisión) | Quita `EXECUTE` a `anon` sobre las dos RPC de captación y lo concede a `avalon_intake` (NOLOGIN, sin tablas). El servidor firma un JWT de 60 s con ese rol, sin usar una clave privilegiada | `docs/sql/public-intake-role-review.sql`, `src/lib/supabase/intake.ts` |

Sin las claves de Turnstile, el formulario funciona como hoy (estado `disabled`, documentado). Con configuración parcial, falla cerrado y responde «no disponible»; nunca deja pasar.

## Activación (requiere autorización de los propietarios)

1. Configurar en Vercel `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` y `TURNSTILE_EXPECTED_HOSTNAME`. Son los mismos que el login, si ya existen. Probar primero en Preview.
2. Verificar en Supabase que el proyecto acepta JWT HS256 firmados con su secreto. Es `UNKNOWN` si el proyecto ya migró a claves asimétricas: en ese caso, este paso necesita otro diseño.
3. Configurar `AVALON_INTAKE_JWT_SECRET`: solo en el servidor, de al menos 32 caracteres, nunca `NEXT_PUBLIC_`. Desplegar.
4. Con respaldo verificado, aplicar `docs/sql/public-intake-role-review.sql`.
5. Comprobar que un `POST /rest/v1/rpc/crm_public_inquiry` con la clave anónima devuelve `permission denied` y que el formulario sigue guardando.

Para revertir, ejecutar el bloque *Rollback* del SQL y borrar `AVALON_INTAKE_JWT_SECRET`.

## Pruebas

- `tests/quote-antibot.test.cjs` (6 pruebas): sin humano verificado no se llama a la RPC; la acción tiene que coincidir; hostname; token repetido o caducado; Cloudflare caído falla cerrado; los valores se conservan; el límite por IP se comprueba primero; el widget no se ejecuta solo.
- `tests/intake-role.database.cjs` (2 pruebas): antes del SQL existe la vía anónima. Después, `anon` y `authenticated` reciben `permission denied` y `avalon_intake` puede enviar, pero no leer ninguna tabla ni llamar a otra RPC. El JWT es HS256 de 60 s, y con un secreto débil queda desactivado.
