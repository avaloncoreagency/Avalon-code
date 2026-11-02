# Procedimiento de respuesta a incidentes

**Responsables:** Miguel y Samuel. Cualquiera de los dos puede declarar un incidente. Si uno no está disponible, el otro actúa y le informa después.

**Registro:** cada incidente se documenta en un documento privado, nunca en Issues públicos, porque el repositorio es público. Se anota: fecha y hora, quién lo detectó, la clasificación, cada acción con su hora y cómo se cerró.

## Ciclo general

1. **Detectar.** Las fuentes son:
   - las alertas de GitHub (secretos, Dependabot, CodeQL);
   - los errores de Vercel (Observability);
   - los registros de Supabase y sus asesores;
   - las eliminaciones inesperadas en `/admin/security`;
   - el aviso de un cliente.
2. **Clasificar.**
   - **Sev-1:** datos expuestos, una cuenta de propietario comprometida o una clave con privilegios expuesta.
   - **Sev-2:** una vulnerabilidad explotable sin evidencia de abuso, o una caída del login.
   - **Sev-3:** todo lo demás.
3. **Contener.** Detener el daño antes de investigar a fondo (ver los casos más abajo).
4. **Investigar.** Determinar qué pasó, desde cuándo, qué datos y qué clientes se vieron afectados.
5. **Corregir.** Abrir un PR con la corrección y una prueba de regresión, y desplegar por el flujo normal. En un Sev-1 se puede saltar la espera, pero nunca la prueba.
6. **Recuperar.** Restaurar el servicio o los datos (`RESPALDOS_Y_RECUPERACION.md`) y verificar.
7. **Documentar.** Escribir la causa raíz, actualizar `src/lib/security/findings.ts` y avisar a los afectados si corresponde. Notificar a clientes o autoridades depende de la ley aplicable; si hay datos personales afectados, consultar a un asesor legal.

## Casos

### Cuenta de propietario comprometida o acceso perdido
1. Desde el panel de Supabase, en Authentication → Users → [usuario]:
   - **cerrar todas las sesiones** (*sign out user*);
   - restablecer la contraseña;
   - revisar y, si hace falta, eliminar los factores MFA.
2. Revisar `os_audit` (en `/admin/security` o directamente en SQL): qué cambió desde el último acceso legítimo.
3. Revisar la cuenta de Google o del correo asociado y activar MFA ahí también.
4. Nunca dar membresía de propietario a otra cuenta "temporalmente".

### Clave o secreto expuesto
1. **Rotar primero e investigar después:**
   - Supabase → Project Settings → API Keys: generar una clave nueva y revocar la expuesta;
   - Vercel → Environment Variables: actualizar el valor;
   - volver a desplegar.
2. Para `AUTH_FLOW_SECRET`: generar uno nuevo de al menos 32 caracteres aleatorios y volver a desplegar. Los enlaces de invitación que estén en curso dejan de funcionar, y es lo que se busca.
3. Eliminar el secreto del historial de Git si llegó a un commit. Hay que asumir que ya fue copiado: la rotación es lo que protege.
4. Revisar los registros del servicio afectado para detectar si se usó.

### Acceso no autorizado a datos
1. Si la causa es una política RLS, crear de inmediato una migración que la cierre, primero en la rama de pruebas y después en producción con aprobación.
2. Si la causa es el código, revertir el despliegue (ver abajo).
3. Identificar las filas y los clientes afectados a partir de `os_audit` y de los registros de la API de Supabase.

### Pérdida o corrupción de datos
1. Detener las escrituras: archivar el proyecto afectado o, en el peor caso, pausar el proyecto de Supabase con aprobación de ambos.
2. Restaurar desde un backup en un proyecto aislado, comparar y copiar solo lo necesario (`RESPALDOS_Y_RECUPERACION.md`).
3. Las páginas web tienen versiones en `os_website_page_versions`, así que se pueden restaurar desde el editor.

### Despliegue vulnerable o roto
1. **Rollback inmediato:** en Vercel → Deployments, elegir el despliegue anterior que estaba bien y usar *Promote to Production*. Tarda segundos y no toca la base de datos.
2. Revertir el merge en `main` (`git revert -m 1 <merge>`) con un PR.
3. Las migraciones no se revierten automáticamente. Son aditivas; cualquier reversión se revisa a mano.

### Dependencia comprometida
1. Fijar la versión anterior en `package.json` y `package-lock.json` y volver a desplegar.
2. Revisar si la versión maliciosa llegó a ejecutarse en el build de Vercel. Si es así, tratarlo como el caso "Clave o secreto expuesto" y rotar todo.

## Contactos y paneles
- **Supabase:** proyecto `ltbwzcrxeuczdhhtbqgm` (organización Avalon Core Agency).
- **Vercel:** proyecto `avalon-core-agency`.
- **GitHub:** `avaloncoreagency/Avalon-code`, en Security y Settings.
- **Soporte:** el de Supabase y el de Vercel, desde sus paneles. El plan Pro de Supabase incluye soporte por correo.
