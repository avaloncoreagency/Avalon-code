# Mantenimiento de seguridad

## Rutina

| Frecuencia | Tarea | Dónde |
|---|---|---|
| Cada PR | Que pasen CI, pruebas de seguridad, CodeQL y auditoría de dependencias; un dueño revisa | GitHub |
| Semanal (lunes) | Revisar los PR de Dependabot y el resultado programado de `security.yml` | GitHub → Pull requests, Actions |
| Semanal | Abrir `/admin/security`: cabeceras, eliminaciones recientes, hallazgos | Avalon OS |
| Mensual | Asesores de seguridad y rendimiento de Supabase | Supabase → Advisors |
| Mensual | Revisar variables de entorno y miembros del equipo en Vercel | Vercel → Settings |
| Mensual | Actualizar `src/lib/security/findings.ts` y `REVIEWED_AT` | Repositorio |
| Trimestral | Prueba de restauración (`RESPALDOS_Y_RECUPERACION.md`) | Proyecto aislado |
| Trimestral | Revisar quién tiene acceso a GitHub, Vercel, Supabase y Google | Paneles |
| Ante cualquier incidente | `RESPUESTA_A_INCIDENTES.md` | — |

## Reglas para cambios nuevos
- **Tablas nuevas:** en una migración versionada, con RLS activo, `revoke` a `anon` y una política por operación. La prueba de CI lo exige.
- **Funciones `SECURITY DEFINER`:** solo si son indispensables, con `set search_path = ''`.
- **Páginas privadas:** `requireOwner()`. **Acciones:** `ownerForAction()`. **Rutas:** `getOwnerSession()`. La prueba de CI lo exige.
- **Secretos:** solo en variables de entorno del servidor de Vercel. Nunca en `NEXT_PUBLIC_*` ni en el repositorio, que es público.
- **Integraciones de pago o de costo variable:** solo con la aprobación de ambos dueños.
- **Cabeceras:** si una integración nueva necesita otro origen (scripts, imágenes, iframes), se añade a `src/lib/security/headers.ts` y se prueba en Preview.

## Pendientes que dependen de los dueños
1. **R-02:** crear un ruleset para `main` (`AUDITORIA.md`, sección 6).
2. **R-08 y R-13:** completar la lista de verificación de Supabase Auth (`AUDITORIA.md`, sección 5).
3. **R-09:** activar Dependency graph, Dependabot alerts y security updates en GitHub → Settings → Code security.
4. **R-07:** activar MFA según `MFA.md`.
5. **R-14:** hacer la primera prueba de restauración.
