# Respaldos y restauración: procedimiento (Operation Phoenix, CP9)

**Estado: NO VERIFICADO.** No se ha probado ninguna restauración real. El 2026-11-13 los conectores de Supabase y Vercel no respondían (503 y timeout) en la sesión de Claude. No se declarará «BACKUP VERIFIED» hasta haber restaurado de verdad en un entorno aislado.

## 1. Qué hay que comprobar (requiere acceso del owner)

| Recurso | Dónde mirar | Qué anotar |
|---|---|---|
| Respaldos de Supabase | Dashboard → proyecto `ltbwzcrxeuczdhhtbqgm` → **Database → Backups** | Plan (Free: sin respaldos gestionados; Pro: diarios durante 7 días; PITR es un complemento de pago), fecha del último respaldo y retención |
| Archivos privados | **Storage → `avalon-projects`** | Los blobs están direccionados por contenido (`blobs/<sha256>`); el manifiesto de cada versión está en `os_project_files` |
| Versiones de proyectos | Tablas `os_project_versions` y `os_project_files` (inmutables por trigger) | Los proyectos se restauran como versión nueva con `os_project_restore_version` |
| Dev Bridge | Actions → artefactos de `dev-bridge-sync` (ahora solo manual) | Último checkpoint cifrado; **no borrar** artefactos ni secretos |
| Vercel | Proyecto `avalon-core-agency` → Deployments | Despliegue anterior marcado como *rollback candidate*. Vuelta atrás: **Promote to Production** sobre él |

## 2. Respaldo lógico antes de migrar producción (no tiene coste)

Desde una máquina del owner, con la cadena de conexión de Supabase (Dashboard → Connect). **Nunca** pegarla en chats ni en el repositorio.

```bash
pg_dump "$SUPABASE_DB_URL" --schema-only --schema=public --schema=crm_private --schema=os_private -f avalon-schema-$(date +%F).sql
pg_dump "$SUPABASE_DB_URL" --data-only --schema=public --schema=crm_private --schema=os_private -f avalon-data-$(date +%F).sql
```

Guardar ambos archivos fuera del repositorio, en el almacenamiento privado del owner. **Contienen datos de clientes.**

## 3. Prueba de restauración (solo en un entorno aislado; nunca sobre producción)

1. **Destino:** un proyecto de Supabase vacío de pruebas o una rama de base de datos.
2. **Esquema:**

   ```bash
   psql "$TEST_DB_URL" -f avalon-schema-<fecha>.sql
   ```

3. **Datos:** cargar únicamente datos sintéticos. **No** copiar datos reales a staging. Si el owner autoriza una prueba con su volcado real, debe hacerse en un proyecto privado que se elimine al terminar.
4. **Integridad:** ejecutar `scripts/recovery/schema-fingerprint.sql` en el destino y compararlo con la huella de producción:

   ```bash
   node scripts/recovery/compare-fingerprint.cjs prod.json restaurado.json
   ```

   Debe dar 0 diferencias.
5. **RLS:** con un owner sintético y un usuario no autorizado, comprobar las lecturas de `crm_leads`, `os_project_versions` y `crm_client_costs`. El usuario no autorizado debe ver 0 filas o recibir un error de permisos.
6. **Proyectos:** restaurar una versión con `os_project_restore_version` y descargar su paquete.
7. **Registrar el resultado** en este documento: fecha, quién lo hizo, diferencias encontradas y tiempos.

## 4. Vuelta atrás de la aplicación (Vercel)

En Vercel → Deployments → elegir el despliegue de producción anterior → **Promote to Production**. No borra nada y es inmediato.

Las migraciones **no** se deshacen con esto. Son aditivas y la aplicación anterior funciona con el esquema nuevo; la prueba `prod-schema-compat` cubre el caso contrario.
