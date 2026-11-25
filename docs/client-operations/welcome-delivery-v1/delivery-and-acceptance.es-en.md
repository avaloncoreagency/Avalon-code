# DEL-001 — Protocolo de entrega y aceptación / Delivery and Acceptance Protocol

**Versión:** 1.0 · **Idiomas:** ES/EN · **Responsable funcional:** Client Operations · **Estado:** PROPUESTO PARA APROBACIÓN / NOT AN EXECUTED CLIENT DELIVERY. Este documento extiende sin duplicar el proceso G0–G7 existente y complementa `src/lib/onboarding/model.ts` `deliveryBlockers()`. No crea declaraciones legales ni sustituye UAT, QA o contratos.

## ES — 1. Principio y niveles de evidencia

**Preparado:** artefacto y documentación están listos internamente, pero no se afirma que exista entrega. **QA verificado:** pruebas técnicas sobre la versión/entorno exactos, sin defectos bloqueantes. **Aceptación del cliente (UAT):** revisión expresamente registrada por persona facultada bajo método aprobado por Legal. **Autorizado para publicar:** permiso separado con plan de reversión y roles. **Publicado:** artefacto disponible en entorno real comprobado. **Entregado:** transferencia real con documento, receptor, accesos privados, versión y registro de confirmación. **Cerrado:** soporte/pendientes y condiciones documentados según contrato. Ninguno se deriva automáticamente de otro ni de una URL.

## ES — 2. Revisión final antes de solicitar QA

- [ ] Comparar alcance versionado, exclusiones y líneas efectivamente contratadas con entregable.

- [ ] Inventariar productos, módulos, dominios, proveedores, integración, licencias y datos.

- [ ] Verificar datos públicos, derechos de imagen/texto/testimonios, privacidad y avisos requeridos.

- [ ] Cerrar revisiones pactadas o registrar pendientes con clasificación y responsable.

- [ ] Confirmar que la base de datos y cuentas de clientes no se mezclen y que no haya credenciales en documentación.

- [ ] Solicitudes de cambio registradas y aprobadas por cliente/owners/Legal/Finance cuando proceda.

- [ ] En caso de defecto crítico de seguridad, checkout/pagos, pérdida de información o aislamiento fallido: **NO-GO**.

## ES — 3. Control de calidad y validación

**QA independiente:** asociar resultado a build/versión/SHA, ambiente y fecha; ejecutar escenarios aprobados (correctos y negativos), móvil, accesibilidad, manejo de errores, autenticación/autorización y aislamiento A/B según producto. Chrome emulado ≠ Safari real. Documentar `NOT_RUN` donde falte prueba. No tolerar defectos P0/P1 como excepciones aceptables.

**UAT del cliente:** presentar versión comprobada con criterios observables y una lista de acciones concretas. Registrar: `versión | criterios | quién revisó y facultad | fecha | aprobado / rechazado / aceptado con excepciones no críticas aprobadas | observaciones | evidencia y canal`. La falta de respuesta nunca equivale a aceptación. Una aprobación condicionada no anula un bloqueo de seguridad.

## ES — 4. Go-live y verificación posterior

Antes de publicar: aprobador técnico y propietario verificados, acceso y dominio correctos, coste y titularidad de proveedores, plan de backup/rollback aprobado, revisión de seguridad/legal cuando aplique, evidencia QA exacta, UAT y **permiso explícito para publicación**. El release se hace únicamente por ejecutor técnico autorizado.

Después: comprobar URL HTTPS realmente activa, TLS, páginas/formularios, pedido sandbox/merchant si aplica, roles/RLS e integraciones contratadas; registrar ambiente, versión y resultado. No confundir preview, build verde, dominio guardado o enlace de sistema con web entregada. **Si falla postrelease, estado BLOQUEADO / incidente técnico**, no declarar entrega.

## ES — 5. Credenciales y transferencia documental

**Credenciales:** nunca por correo común, PDF ni issue. Confirmar receptor facultado y titularidad, crear/invitar acceso delegado por proveedor con mínimo privilegio y expiración/revocación si procede; entregar enlace de activación de corta vida por canal privado acordado, sin revelar tokens públicamente; comprobar inicio de sesión y cambio/revocación de accesos en el proceso del servicio. Registrar solo prueba de entrega y responsable, **no la contraseña**.

**Documentos:** referencia de alcance/contrato aplicable, acta de QA, documento de aceptación, manual específico versionado y verificado, inventario de cuentas/proveedores/pagadores, acceso de administración, mapa de integraciones, límites conocidos, plan de reversión/backup si contratado, canales/condiciones de soporte. Los PDFs específicos solo se emiten desde el sistema privado a un receptor autorizado y se verifican por hash cuando la implementación lo admita.

## ES — 6. Capacitación y demostración

Antes de enseñar: preparar agenda basada solo en funciones realmente entregadas. En la sesión autorizada, mostrar tareas frecuentes con datos sintéticos, permitir que el cliente repita los pasos y anotar preguntas/no conformidades. Registrar `fecha | asistentes autorizados | idioma | versión | módulos mostrados | materiales entregados | dudas | resultado | seguimiento`. **Si capacitación no está incluida o se pospone**, indicarlo como PENDIENTE/NO CONTRATADA, no como realizada.

## ES — 7. Correcciones, soporte y cierre

Las observaciones posteriores se clasifican: (a) defecto frente a alcance acordado, (b) uso/soporte incluido, (c) nueva función fuera de alcance, (d) incidencia de tercero, (e) seguridad. Abrir ticket privado con impacto, evidencia y responsable; QA verifica corrección por versión. Cambios de precio/plazo solo por CR aprobado; no cobrar defectos automáticamente. La garantía y mantenimiento son los del contrato firmado; no prometer 24/7, respuesta fija ni renovación automática. Offboarding y revocaciones requieren autorización adicional.

## ES — 8. Acta de entrega reutilizable (registro privado)

```
ACTA DEL-REF: [id real privado]
CLIENT_REF / PRODUCT_REF / PROJECT_REF: [ids canónicos]
TIPO / ALCANCE BASE / CONTRATO Y VERSIÓN: [...] 
ENTORNO / VERSIÓN / SHA / URL REAL: [...] 
EVIDENCIA QA (suites, fecha, responsable): [verificada | NOT_RUN]
DEFECTOS CRÍTICOS: [0 verificados / BLOQUEADO]
UAT CLIENTE: [aprobador facultado, decisión, fecha, evidencia privada]
AUTORIZACIÓN PRODUCCIÓN: [aprobación independiente y fecha]
POSTRELEASE: [comprobación y resultado real]
MANUAL PDF: [versión, idioma, hash/ubicación privada]
ACCESOS: [transferidos por canal seguro, test, revocación, sin secretos]
PROVEEDORES / PAGADORES / LICENCIAS: [identificados]
CAPACITACIÓN: [hecha con evidencia | no contratada | pendiente]
SOPORTE: [referencia contrato, contacto confirmado, owner, horas si aprobadas]
PENDIENTES / EXCEPCIONES: [lista, severidad, responsable, permiso]
RECEPTOR Y RECEPCIÓN: [persona facultada / evidencia]
ESTADO: NOT_READY | QA_VERIFIED | UAT_PENDING | RELEASE_AUTHORIZED | LIVE_VERIFIED | DELIVERED_PENDING_ACCEPTANCE | ACCEPTED | BLOCKED
DECISIÓN Y ALCANCE: [GO / NO-GO y etapa única autorizada]
```

**Estos estados son etiquetas conceptuales del acta, no estados nuevos de base de datos**.

## ES — 9. Criterio objetivo para «ENTREGADO»

Marcar **entregado** únicamente si se cumplen simultáneamente: (1) checklist aplicable completo, (2) QA sin bloqueos y con evidencia exacta, (3) URL real HTTPS cuando la naturaleza del producto la requiera y disponible, (4) manual versión/idioma emitido y verificado, (5) contrato/alcance vinculados **y validez contractual confirmada por Legal**, (6) receptor facultado, (7) publicación autorizada cuando aplica, (8) prueba postrelease, (9) transferencia segura de accesos, (10) inventario de soporte, responsabilidades y pendientes aceptables, (11) UAT/aceptación conforme mecanismo aprobado. **El gate técnico actual no prueba por sí solo todos estos extremos legales; comprobarlos separadamente.**

## ES — 10. Matriz de aceptación por servicio

| Website | E-commerce | CRM personalizado | Marketing |
|---|---|---|---|
| Navegación, formularios/CTA, HTTPS, responsive, copy y consentimientos | Catálogo/variantes, stock, impuestos y políticas del merchant, sandbox checkout, avisos | Pipeline, roles, CRUD, RLS/aislamiento A/B, import/export autorizados, KPI verificados | Creatividad y presupuesto aprobados, consentimiento, publicación real cuando contratada, fuente de KPI e informe con límites |

Ninguna columna autoriza funcionalidades no contratadas. Para Marketing sin producto con URL pública, **la validación del estado entregado requiere un criterio específico del negocio y revisión técnica**; no inventar una URL para superar el gate HTTPS actual.

## EN — 1. Evidence stages

**Prepared:** internal artifact and documents ready, no delivery claimed. **QA verified:** exact version/environment tested without blocking defects. **Customer UAT:** affirmative review from authorized approver under Legal-reviewed method. **Release authorized:** separate approval, backup/rollback and accountable roles. **Live:** product independently verified in the actual environment. **Delivered:** documented handoff with approved recipient, secure access and versioned materials. **Closed:** agreed support and pending obligations recorded. No stage follows automatically from a URL, CI or another status.

## EN — 2. Final review and QA

- [ ] Compare the exact agreed scope/version, exclusions and actual deliverables.

- [ ] Inventory modules, accounts, domains, vendors, licenses, integrations and data.

- [ ] Verify business facts, image rights, testimonials, consent and notices.

- [ ] Record all revisions and approved change requests; unresolved critical issues are NO-GO.

- [ ] QA evidence tied to exact SHA/build/environment/date; test critical and negative paths, mobile, accessibility, auth, company A/B isolation and recovery where relevant. Browser emulation does not prove physical Safari.

- [ ] Customer UAT on presented version with acceptance criteria, approver, affirmative decision and private evidence. Silence is never approval.

## EN — 3. Release and postrelease

Before production: technical and business approvers, verified domain/account ownership, vendor cost/payer, security/legal review when needed, backup/rollback, exact QA report, customer UAT and **separate written release approval**. Only authorized technicians publish. Afterwards verify HTTPS URL, actual screens/forms, sandbox merchant paths when contracted, permissions, integrations and product version. A stored URL, preview or build alone is not delivery; failed smoke tests block release completion.

## EN — 4. Credential and document handoff

Confirm authorized recipient, use named least-privilege invitations, approved short-lived secure activation and revocation. **Never put passwords, one-time codes or private tokens in PDF, email, issues or public chats.** Test access by authorized owner and record only transfer evidence. Deliver actual agreement/scope reference, QA/UAT receipts, product-specific versioned manual, provider ownership/payer inventory, known limitations, applicable backups/rollback, approved support route and contractual coverage. Use private versioned PDFs and hash verification where implemented.

## EN — 5. Training, corrections and support

Train only on actually delivered features and only when contracted/authorized. Record date, participants, language, version, walkthrough, questions, exercises and evidence; mark not included or pending accurately. Classify later issues as scoped defect, included help, extra change, vendor outage or security. Route tickets to responsible human teams; re-test corrections by version. New costs/schedules require approved CR; defects are not automatically billable. Signed agreement determines warranty, maintenance and renewal.

## EN — 6. Private acceptance record

`DEL-REF | canonical client/product/project ids | type/scope/agreement version | environment/SHA/live URL | exact QA result | critical blockers | customer UAT approver/date/evidence | separate publish approval | postrelease check | private manual language/version/hash | secure access receipt | providers/payers | training evidence | support contract/channel | exceptions | authorized recipient | accepted/blocked decision`.

**Delivered = all required controls verified**, including technical checklist, actual URL when applicable, versioned manual, contract validity, authorized recipient, permissions, UAT, separate release approval, postrelease checks and secure handoff. This is stricter than a checkbox or document generated by itself.

## EN — 7. Service acceptance matrix

**Website:** mobile navigation, forms/CTA, HTTPS, approved copy, privacy. **E-commerce:** catalog/stock, merchant policies and sandbox checkout/notifications. **Custom CRM:** pipeline, role permissions, cross-company denial, safe import/export and sourced KPI. **Marketing:** approved creative/budget, consent, actual publication evidence where contracted, verified KPI source and honest limitations. For marketing packages with no public URL, request an approved technical/business-specific delivery rule: never invent an HTTPS address to bypass a generic gate.

## QA and Legal handoff / blockers

- **VERIFIED in current code:** `src/lib/onboarding/model.ts` `deliveryBlockers()` requires checklist, `qaPassed`, HTTPS `liveUrl`, `manualIssued`, `contractLinked`, `deliveredTo`. **It does not alone prove that a linked contract is signed, customer UAT, release authorization, secure credential transfer, or training.** Those require separate private evidence/Legal review.

- **PENDING TECH DESIGN for Claude:** marketing deliverables without live URL, if offered, need an approved exception/model; this document cannot bypass existing validations.

- **PENDING LEGAL:** method of client acceptance, contract link vs signed validity, limited warranty, SLA, retention and legal status of electronic acceptance.

- **NO TESTS EXECUTED:** this editorial protocol is not a QA run or production approval. Owners and QA must confirm application of each gate before actual client handoff.
