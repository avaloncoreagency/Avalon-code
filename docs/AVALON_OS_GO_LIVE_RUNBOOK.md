# Avalon OS — runbook operativo de lanzamiento y puesta en marcha

**Estado:** preparación de producción; NO declarar go-live hasta completar pruebas reales.  
**Fuente de verdad:** GitHub `main` + Vercel producción + Supabase producción.  
**Última revisión:** 2026-11-02. No almacenar contraseñas, tokens ni datos de clientes en este documento.

## 0. Alcance y arquitectura

- Web oficial: https://avaloncoreagency.com
- Login administrativo: https://avaloncoreagency.com/admin/login
- Dashboard: https://avaloncoreagency.com/admin/dashboard
- CRM: https://avaloncoreagency.com/admin/workspace/crm
- GitHub: `avaloncoreagency/Avalon-code`; release PR #19 (rama `release/avalon-os-production-candidate` -> `main`).
- PR #15: hardening adicional (MFA y rate limiting) con conflictos de integración; PR #16: guard de Preview; PR #17: normalización de correo. Comprobar estados actuales antes de fusionar.
- Vercel project `prj_tN1ZYrsx5fqoEePYjThsra3MvocP`, team `team_lHTO3wgJm0yAyexxMDmkIFW4`.
- Supabase **producción** `ltbwzcrxeuczdhhtbqgm`; **staging** `kmpmvwbtqaggkjjxfayh`. Nunca mezclar keys ni URL de entornos.
- Owners previstos: Miguel y Samuel; el correo de infraestructura NO es un tercer owner. Usar Auth + `agency_memberships`, no una lista de correos en el cliente.

## 1. Estado confirmado / no confirmado

Confirmado: migraciones de producción `avalon_owner_memberships_rls`, `harden_membership_table_grants`, `avalon_os_modules` y `crm_core`; siete tablas `crm_*` con RLS activo. La release candidate compiló en Vercel Preview y figura READY.  
**No confirmado:** autenticación real de ambos owners, pruebas CRUD end-to-end sobre el dominio, estado de MFA, funcionamiento de proveedores externos, que `main` incluya la release. READY no significa aceptación funcional.  
Advertencia de seguridad pendiente: protección de contraseñas filtradas desactivada en Supabase Auth producción (revisar configuración/plan).

## 2. Puertas de lanzamiento — ejecutar en este orden

### A. Congelar y reconciliar cambios

1. Revisar `git status`, `git fetch --all`, commits de `main`, `integration/avalon-os-unified`, `release/avalon-os-production-candidate`, y PR #15/#16/#17/#19. No rebasear ni forzar pushes sobre trabajo ajeno.
2. Integrar cambios de seguridad del PR #15 con cuidado especial en `next.config.ts`, `src/app/login/actions.ts`, `src/lib/auth/access.ts`: conservar login password, `getAuthorizedMember`, comprobación owner, guard Preview vs Supabase producción y encabezados. Resolver conflictos semánticamente y revisar MFA.
3. Evitar merge doble de la misma corrección; la release candidate ya incluye normalización de correo y encabezados. Verificar mediante diff, no por nombre de PR.
4. Revisar rutas y permisos de todos los módulos. Las integraciones externas no configuradas deben indicar «No conectado», no simular éxito.

### B. CI reproducible

```sh
node --version
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Consultar `docs/CRM_IMPLEMENTATION.md` para suites PostgreSQL/Playwright. Ejecutarlas contra un entorno de prueba aislado y registrar resultados, SHA, fecha y URL de logs. No marcar como pasado lo que no se ejecutó.

### C. Base de datos y acceso

1. Revisar historial de migraciones antes de cualquier DDL. `crm_core` YA está en producción: **no volver a aplicarla**.
2. Confirmar en producción tablas, RLS, grants, índices, funciones y políticas owner. Probar como `anon`, usuario sin membresía y owner con sesiones de prueba autorizadas. RLS activo por sí solo no prueba las políticas.
3. Verificar que Miguel y Samuel tengan usuarios Supabase Auth confirmados, credenciales establecidas por canal seguro y membresías owner asociadas a sus UUID reales. Nunca crear usuarios con contraseña compartida ni revelar correos en logs.
4. Confirmar `APP_ORIGIN`, Auth redirect URLs, password provider y configuración SMTP/recovery; verificar reset por enlace y logout.
5. Hacer copia de seguridad y definir restauración antes de cambios destructivos.

### D. Prueba funcional staging

- Login/logout de owner, sesión expirada, no-owner rechazado, reset, OAuth opcional.
- Crear prospecto desde Lead Hunter manual/CSV -> revisar -> aprobar -> convertir exactamente una vez -> ver lead en CRM.
- Mover lead por etapas, editar, añadir actividad, crear evento, guardar, recargar y comprobar persistencia; probar duplicados y conflictos de edición.
- Crear `os_project`, asociar UUID de lead CRM en metadata operations, comprobar enlaces a cliente/proyecto y permisos.
- Responsive móvil/escritorio, navegación, estados vacíos y mensajes de error; no depender de datos falsos.

### E. Publicar dominio real

1. Solo con A-D aprobadas, obtener revisión del PR de release y fusionar en `main` con CI verde; conservar SHA del merge.
2. Verificar en Vercel **Production** URL y publishable key de Supabase producción, `APP_ORIGIN=https://avaloncoreagency.com`, Auth secrets existentes y scopes. No imprimir valores de secretos.
3. Desplegar `main` en Vercel Production; comprobar SHA, estado READY y alias `avaloncoreagency.com` (y `www` si corresponde).
4. Smoke test del dominio: web pública, `/admin/login`, dashboard protegido, CRM protegido, navegación, lectura de stages y una operación CRUD autorizada con registro claramente marcado de prueba y limpieza verificada.
5. Solicitar a Miguel y Samuel iniciar sesión por separado y confirmar su perfil y acceso; registrar aceptación explícita antes de usar datos de clientes reales.
6. Vigilar errores Vercel y Supabase, alertas de seguridad y fallos de autenticación. **GO** solo si todas las comprobaciones pasan.

### F. Reversión

Si falla autenticación, permisos o persistencia, detener ingreso de clientes; revertir Vercel al último deployment Production conocido bueno y restaurar la versión de código correspondiente. **No** revertir migraciones con `DROP` ni borrar datos sin respaldo y plan revisado. Si el esquema es compatible, conservar migración aditiva y corregir código con un hotfix.

## 3. Funcionalidad de negocio y backlog ejecutable

**Fuente central:** CRM para identidad comercial de prospectos/leads; `os_projects` para proyectos de servicio. Relacionar con UUID verificados, no por nombre de empresa. Evitar duplicados. Historial y auditoría.

**Lead Hunter:** ya tiene entradas manuales, importación CSV, revisión/aprobación y conversión transaccional; radar externo en vivo **NO** está conectado. Implementar adaptador de fuente autorizada (API oficial o dataset con licencia), búsqueda por industria/ciudad, procedencia, fecha de captura, deduplicación por dominio/email, scoring explicable, revisión humana, envío a CRM, seguimiento y límites de cuota. No scrapear datos privados ni inventar resultados. No enviar outreach automáticamente.

**Pipeline:** conservar stages existentes en producción; migrar nuevas etapas configurables con migración versionada, mapeo explícito de estados previos, pruebas de integridad y sin sobrescribir registros. Propuesta: Nuevo, Investigado, Contacto pendiente, Contactado, Respondió, Calificado, Reunión, Diagnóstico, Propuesta, Negociación, Ganado, Perdido, Nutrición.

**Web Designer:** catálogo de sitios por cliente/proyecto, URL, repositorio, hosting, tareas y auditoría. Edición de sitios externos solo mediante conectores autorizados y con preview/diff/rollback; no prometer edición universal. **CRM Creator:** proyectos CRM, pipelines, formularios, campos y plantillas versionadas con aislamiento por cliente. **E-commerce:** catálogo administrativo e integraciones oficiales. **AI Receptionist:** configuración, conocimiento, canales, consumo y logs con consentimiento. **Marketing Hub:** campañas, tareas, métricas y aprobaciones antes de publicar. Todos enlazan al cliente/CRM y `os_projects`.

**Perfiles:** idioma ES/EN, preferencias de tema claro/oscuro y acento de color por owner persistido, contraste accesible; nunca un selector de perfiles en login.

**Orden tras go-live:** 1) flujo Lead Hunter -> CRM -> proyecto; 2) pipeline configurable y directorio de clientes; 3) Web Designer y CRM Creator administrables; 4) recepcionista, e-commerce, marketing; 5) radar y conectores autorizados. Cada módulo requiere CRUD real, permisos, pruebas y estados «No conectado» donde aplique.

## 4. Checkpoint / aceptación

Para cada etapa guardar: commit SHA, PR, entorno, pruebas ejecutadas y resultados, riesgos, rollback y próximo responsable. No usar el término «terminado» para pantallas sin backend o proveedores sin conexión. Seguimiento general: GitHub issue #18. El objetivo es un sistema operable, no un número de PRs.
