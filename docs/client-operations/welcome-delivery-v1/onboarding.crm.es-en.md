# OB-CRM-001 — Onboarding de CRM Personalizado / Custom CRM Intake

**Version 1.0 · ES/EN · Estado PROPUESTO / PENDING APPROVAL.** Los procesos, roles, RLS e integraciones deben definirse según el negocio del cliente y verificarse en entorno aislado. No significa que la solución ni las integraciones solicitadas existan.

## ES — Descubrimiento de procesos

**Contexto y alcance.** (1) Tipo de negocio, unidades/ubicaciones y equipos que usarán CRM; (2) qué problema debe resolver y qué actividad debe registrarse; (3) herramientas actuales; (4) cuántas personas **aproximadas** y sus funciones, sin recoger datos personales aún; (5) fuentes de contactos y bases jurídicas/consentimientos de esos datos; (6) métricas deseadas, sus definiciones y fuente verificable.

**Entidades.** (7) Define qué significa lead, cliente, contacto, oportunidad, venta, proyecto, orden, caso o ticket en tu negocio. (8) Campos necesarios por entidad, obligatorios vs opcionales. (9) Estados y transiciones reales del pipeline con responsables y criterios de cambio; identifica cierres perdidos y duplicados. (10) Reglas de deduplicación sin unir empresas solo por nombre. (11) ¿Existen importaciones/exportaciones, registros históricos, retención o supresión? Indica responsable legal del dataset.

**Permisos.** (12) Describe cada rol (administrador, supervisor, colaborador, lector), acciones permitidas y alcance (toda empresa, sucursal, solo asignados). (13) ¿Quién invita o desactiva usuarios? (14) ¿Qué campos contienen datos sensibles y quién podrá verlos? (15) ¿Qué usuarios de otras compañías **no** deben acceder a datos de este cliente? (16) ¿Cómo se revisarán auditorías/cambios? No compartir contraseñas ni subir archivos de clientes antes de autorización.

**Integraciones/operación.** (17) Apps externas, dueño de las cuentas, permisos y frecuencia de sincronización solicitados. (18) Quién valida errores, duplicaciones y conflictos. (19) Reportes/exportación/respaldo: quién los usa, frecuencia deseada y soporte realmente contratado. (20) ¿Hay automatizaciones pedidas? Marcarlas como SOLICITADAS hasta factibilidad técnica/autorización. No incluir IA comercial, Radar u OpenRouter suspendidos.

## ES — Datos requeridos y plantilla de modelado

- [ ] Mapa de proceso desde recepción hasta cierre y servicio posterior; idealmente ejemplos **ficticios**.

- [ ] Diccionario de entidades/campos y tipos de datos con propietario del tratamiento.

- [ ] Matriz de roles y permisos, aprobación del responsable del cliente.

- [ ] Etapas, reglas de transición y evidencia que habilita cada etapa.

- [ ] Política de duplicados, fuentes, consentimientos, importaciones y limpieza.

- [ ] Fuentes de KPI y definición exacta de cada reporte; nunca inventar resultados.

- [ ] Listado de integraciones con proveedor, titular, scope, permisos, costo/pagador y autorización.

- [ ] Política de exportación, acceso/cambio de personal, retención y seguridad revisada por Legal.

- [ ] Plan de aceptación con datos sintéticos A/B y casos de error.

**Ficha de permiso a completar en privado:** `Rol | Entidad | leer | crear | editar | eliminar | exportar | alcance de registros | aprobador | excepción`. **Ficha pipeline:** `Nombre de etapa | criterio de entrada | responsable | acción permitida | criterio de salida | evidencia | retorno/error`.

## ES — QA/UAT y puerta de entrega

Una etapa funcional solo pasa si el cliente demuestra con **datos sintéticos**: alta/edición/búsqueda sin duplicados no deseados; transición autorizada; informes con definiciones acordadas; denegación de usuarios sin permiso; aislamiento empresa A/B; importación con consentimiento y simulación de rollback; exportación autorizada, errores y recuperación. QA y Cloud deben validar RLS/permisos server-side y no solamente ocultación de botones. No migrar datos reales hasta contar con base, autorización, retención y respaldo verificados. La entrega exige versión, manual adaptado, roles de administración, titularidad, plan de soporte y aceptación específica del cliente.

## EN — Process discovery

**Business and scope.** (1) Business units, sites and teams using the CRM; (2) problems to solve and activities to record; (3) current tools; (4) approximate user count by job function, without collecting personal records yet; (5) lead/contact sources and lawful basis/consent; (6) KPIs, definitions and verifiable sources.

**Entities.** (7) Define lead, client, contact, opportunity, sale, project, order, case or ticket in your workflow. (8) Required and optional fields. (9) Actual stages, owners, entry/exit criteria and lost/duplicate cases. (10) Deduplication that never merges businesses by name alone. (11) Planned imports, exports, retention/deletion and data controller.

**Authorization.** (12) Each role (admin, manager, contributor, viewer), allowed actions and row scope (company, location, assigned only). (13) Who invites and revokes staff? (14) Sensitive fields and authorized viewers. (15) Access that must always be denied across companies. (16) Audit/change tracking requirements. Never share passwords or upload live customer data before authorization.

**Integrations/operations.** (17) Requested third-party systems, account owners, scopes and sync frequency. (18) Handling duplicates, failures and conflicts. (19) Reporting/export/backups and actual maintenance contract. (20) Automations are **REQUESTED**, not available, until feasibility and authorization. Do not include paused commercial AI, Radar or OpenRouter.

## EN — Required records and modeling templates

- [ ] End-to-end workflow map, preferably with **synthetic** examples.

- [ ] Entity/field dictionary, data types and accountable data controller.

- [ ] Approved role-permission matrix and access boundaries.

- [ ] Pipeline stages with transition criteria and evidence.

- [ ] Duplicate and import policy, data sources and consent.

- [ ] Exact KPI formulas and trusted source systems, no fabricated outcomes.

- [ ] Integration inventory: vendor, account owner, scope, permissions, cost/payer and consent.

- [ ] Export, retention, access-change and security policy reviewed by Legal.

- [ ] Synthetic cross-company A/B and negative-authorization test plan.

**Role matrix:** `Role | Entity | read | create | edit | delete | export | row scope | approver | exception`. **Pipeline map:** `Stage | entry event | owner | allowed action | exit event | evidence | error path`.

## EN — QA/UAT and delivery gate

Using **synthetic data**, demonstrate authorized create/edit/search, duplicate prevention, valid stage transitions, reports matching agreed definitions, user denial, company A/B data isolation, permitted import with rollback scenario, approved export and error recovery. QA and Cloud must validate server-side permissions/RLS—not merely hidden UI buttons. No live-data migration without consent, secure baseline, backup/restore and authorized release. Final handoff requires exact version, tailored guide, admin/access ownership, support plan and authorized customer acceptance.

## Implementation contract and exclusions

Map to existing product `crm` checklist keys `roles`, `users`, `pipeline`, `clients`, `data`, `reports`, `automations`, `security` plus common keys. No direct SQL, new user accounts, external integrations, marketing bots or data imports authorized by this text. **EDITORIAL APPROVAL PENDING.**
