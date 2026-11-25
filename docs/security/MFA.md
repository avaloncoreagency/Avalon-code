# Plan de autenticación multifactor (MFA)

**Método:** TOTP de Supabase Auth, es decir, un código de 6 dígitos que genera una app en el teléfono. Es gratuito y no requiere SMS ni otros servicios de pago. Supabase genera y guarda el secreto; Avalon OS no implementa criptografía propia.

## Cómo funciona hoy (opcional)

1. Cada propietario lo activa desde **Perfil → Verificación en dos pasos**: escanea el código QR con su app (Google Authenticator, 1Password, Authy o Microsoft Authenticator) y confirma con el primer código.
2. Desde ese momento, cada inicio de sesión nuevo de esa cuenta termina en `/admin/mfa`. Sin el código, la sesión queda en el nivel AAL1 y no puede ver páginas, ejecutar acciones ni usar la API.
3. Las cuentas sin factor verificado siguen funcionando igual que antes. **MFA no es obligatorio todavía.**
4. Los intentos de código tienen un límite de 5 cada 15 minutos por usuario.
5. Para desactivarlo, la sesión debe estar en AAL2 y hay que marcar una casilla de confirmación.

## Activación progresiva

| Fase | Acción | Criterio para pasar a la siguiente |
|---|---|---|
| 0. Preparación | Revisar este PR en Preview y confirmar que TOTP está habilitado en Supabase (Authentication → Multi-Factor). | — |
| 1. Miguel | Activar TOTP, cerrar sesión, volver a entrar con el código y probar la recuperación (ver abajo). | Entra sin problemas durante 3 días. |
| 2. Samuel | Lo mismo. | Igual que la fase 1. |
| 3. Segundo factor de respaldo | Cada dueño registra la app también en un segundo dispositivo, o guarda la clave manual en un gestor de contraseñas. | Ambos lo confirman. |
| 4. Obligatorio | PR aparte: el middleware exige AAL2 a todos los propietarios y se agrega una política RLS que exige `aal2` en las tablas `os_*`. **Requiere la aprobación de ambos.** | Fases 1 a 3 completas. |

## Recuperación de acceso si se pierde el teléfono

Supabase no genera códigos de respaldo para TOTP, así que la recuperación se apoya en el otro propietario:

1. **Primera opción:** usar el segundo dispositivo o la clave manual guardada (fase 3).
2. **Si no hay respaldo:** el otro propietario entra al panel de Supabase, va a Authentication → Users → [usuario] → Multi-Factor y elimina el factor. Antes debe verificar la identidad de la persona que lo pide por un canal independiente, por ejemplo una videollamada.
3. La persona afectada entra con su contraseña y vuelve a activar TOTP de inmediato.
4. Se registra el evento en la bitácora de incidentes (`RESPUESTA_A_INCIDENTES.md`, caso "Cuenta comprometida o acceso perdido").

> La cuenta de infraestructura (`avaloncoreagency@gmail.com`) es la dueña del proyecto de Supabase. Debe tener su propia MFA en Supabase y en Google, y **no** tiene acceso a Avalon OS.

## Prueba técnica

- `tests/security.test.cjs`: una sesión AAL1 con un factor verificado pasa a estado "mfa" y no se le concede acceso. AAL2 sí tiene acceso.
- `tests/auth.integration.cjs`: un propietario con factor es redirigido a `/admin/mfa` desde el dashboard, el Security Command Center y el login, y la API responde 401.
- **Pendiente:** la prueba real de cada dueño con su teléfono (fases 1 y 2).


## OMEGA: paridad Data API/RPC (candidato, no aplicado remotamente)

La migración `20261125005906_enforce_enrolled_mfa_data_access.sql` conserva MFA opt-in y aplica el factor verificado a los helpers `crm_private.is_owner`, `os_private.is_owner`, `crm_private.staff_active` y a la proyección definer `staff_my_leads`. Sin factor verificado no cambia el acceso; con factor verificado exige AAL2. La membresía y la activación siguen siendo obligatorias. El único broker definer nuevo devuelve un booleano de la propia identidad `auth.uid()`, sin argumento de usuario; no expone `auth.mfa_factors`, usa search_path vacío y revoca PUBLIC/anon.

La lectura de la propia membresía y el propio grant de acceso permanece disponible para resolver login/MFA; no expone leads, mensajes ni finanzas. Las rutas Auth de recuperación y desafío no se modifican. La Edge Function de invitaciones conserva su comprobación de factores verificados y token validado por Auth.

`tests/staff-portal.database.cjs` reproduce el fallo previo de lectura CRM bajo owner AAL1 con factor verificado y comprueba denegación directa/RPC, AAL2, aislamiento, suspensión y privacidad de factores. Es prueba local sintética; no acredita MFA alojado ni aceptación con teléfono físico. La migración requiere autorización específica antes de aplicarse en Preview o producción.

Referencia técnica: https://supabase.com/docs/guides/auth/auth-mfa (enforcement para cuentas inscritas).
