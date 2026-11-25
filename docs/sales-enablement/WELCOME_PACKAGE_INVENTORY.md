# Avalon — Employee Welcome Package / Paquete de bienvenida para vendedores

**ID:** AVL-SALES-TEAM-001 C6 · **Versión:** 1.0-draft · **Fecha:** 2026-11-24 · **Estado:** PAQUETE DOCUMENTAL PREPARADO / VALIDACIÓN LEGAL, FINANCIERA, PRODUCTO Y OWNERS PENDIENTE.  
**No contiene contratos de empleo ni políticas salariales aprobadas.** Este inventario es para integración futura dentro del Agent Portal EXISTENTE; no autoriza crear otra biblioteca, cuentas, roles, archivos privados ni mensajes automáticos.

## Carta de bienvenida — Español (BORRADOR INTERNO, NO ENVIADO)
Bienvenido/a a la formación comercial de Avalon Core Agency.

Nuestra prioridad es comprender cada negocio antes de recomendar un producto. Esperamos que hagas preguntas claras, cuides la información y comuniques con precisión lo que está aprobado. Si un servicio, precio o capacidad aún no está autorizado, no lo ofrecerás como disponible. Si una persona pide no recibir mensajes, detendrás el contacto.

Durante tu formación estudiarás nuestra propuesta de valor, los sectores principales, el CRM, la evaluación de oportunidades, las reuniones y el paso a Client Operations. **El acceso al Agent Portal, los clientes asignados y cualquier actividad comercial real requieren autorización y permisos propios.** No se comparten cuentas de Miguel o Samuel.

Gracias por trabajar con responsabilidad, claridad y respeto.

Avalon Core Agency  
[Responsable de incorporación autorizado — PENDIENTE]

## Welcome letter — English (INTERNAL DRAFT, NOT SENT)
Welcome to Avalon Core Agency's sales training.

Our priority is to understand each business before recommending a product. We expect clear questions, careful treatment of information and accurate statements about what has been approved. If a service, price or capability is not authorized, you must not present it as available. If someone asks not to receive messages, stop contacting them.

Your training covers our value proposition, key industries, CRM concepts, opportunity qualification, meetings and handoff to Client Operations. **Agent Portal access, assigned customer records and any real outreach require explicit authorization and your own granted permissions.** Never share Miguel's or Samuel's account.

Thank you for approaching sales with responsibility, clarity and respect.

Avalon Core Agency  
[Authorized onboarding owner — PENDING]

## Inventario de contenido para Claude / Manifest for Agent Portal

**Propuesta de acceso:** Todos son documentos públicos de repositorio **sin información confidencial**; en la interfaz interna solo deberían mostrarse a personal que ya tiene sesión Staff autenticada y permiso acorde a políticas existentes. **No afirmar que el rol, el grant o la sección documental ya existen en producción**. La distribución debe reutilizar mecanismos existentes de Staff/Agent Portal tras aprobación; ningún endpoint/tabla nueva se solicita.

| ID | Documento (ruta en GitHub) | Versión | Idioma | Audiencia | Aprobación de contenido | Requisito de acceso al mostrarlo en Agent Portal |
| --- | --- | --- | --- | --- | --- | --- |
| AG-SAL-00 | [README.md](README.md) | 1.0-draft | ES/EN | Todo vendedor e instructor | EN REVISIÓN | Sesión Staff válida + grant autorizado |
| AG-SAL-01 | [PLAYBOOK_ES.md](PLAYBOOK_ES.md) | 1.0-draft | ES | Vendedores ES, instructores | EN REVISIÓN | Sesión Staff válida + grant autorizado |
| AG-SAL-02 | [PLAYBOOK_EN.md](PLAYBOOK_EN.md) | 1.0-draft | EN | Vendedores EN, instructores | EN REVISIÓN | Sesión Staff válida + grant autorizado |
| AG-SAL-03 | [SCRIPTS_ES_EN.md](SCRIPTS_ES_EN.md) | 1.0-draft | ES/EN | Vendedores, supervisores | REQUIERE REVISIÓN LEGAL Y OWNERS | Sesión Staff válida + grant; **no envío integrado** |
| AG-SAL-04 | [FIELD_KIT_ES_EN.md](FIELD_KIT_ES_EN.md) | 1.0-draft | ES/EN | Vendedores, instructores | EN REVISIÓN | Sesión Staff válida + grant autorizado |
| AG-SAL-05 | [sector-outreach-kit.md](../pm-v3/sales/sector-outreach-kit.md) | 1.0-draft | ES/EN | Vendedores de roofing/fencing | REQUIERE LEGAL Y OWNERS | Sesión Staff válida + grant; **sin campañas** |
| AG-SAL-06 | [TRAINING_7_DAYS_ES_EN.md](TRAINING_7_DAYS_ES_EN.md) | 1.0-draft | ES/EN | Instructores, vendedores | UMBRAL Y PROGRAMA PENDIENTES DE OWNERS | Sesión Staff válida + grant; no emitir certificados automáticamente |
| AG-SAL-07 | [DAILY_OPERATIONS_ES_EN.md](DAILY_OPERATIONS_ES_EN.md) | 1.0-draft | ES/EN | Vendedores, supervisores | REQUIERE FINANCE / LEGAL / OWNERS | Sesión Staff válida + grant; acceso CRM independiente |
| AG-SAL-08 | [PRESENTATION_ES_EN.md](PRESENTATION_ES_EN.md) | 1.0-draft | ES/EN | Instructores, vendedores | REQUIERE BRAND / PRODUCT / LEGAL / OWNERS | Sesión Staff válida + grant; **no publicarlo como deck comercial** |
| AG-SAL-09 | [WELCOME_PACKAGE_INVENTORY.md](WELCOME_PACKAGE_INVENTORY.md) | 1.0-draft | ES/EN | Instructor, dueño/operaciones | EN REVISIÓN | Sesión Staff válida + permiso de incorporación, sujeto a validación |

**Estado del inventario ≠ permiso técnico real.** Ningún archivo está “APPROVED FOR LIVE SALES”. Las rutas son referencias versionadas a documentos; las invitaciones, permisos por vendedor y la lectura privada corresponden a Agent Portal y sus custodios.

## Incorporación del vendedor — procedimiento / Seller onboarding SOP
| Paso | Actividad ES / EN | Responsable sugerido | Criterio de aceptación |
| --- | --- | --- | --- |
| 0 | Confirmar existencia de relación contractual/laboral y políticas aprobadas / Verify approved contractual or employment terms | Owners + Legal/HR | Evidencia privada, NO incluida en GitHub |
| 1 | Confirmar identidad y necesidad legítima de acceso / Confirm legitimate identity and need | Owner autorizado / Staff custodian | No crear acceso sin invitación autorizada |
| 2 | Enviar bienvenida por el canal aprobado / Send approved welcome message | Owner o responsable designado | Mensaje real registrado solo cuando sea enviado; este borrador NO |
| 3 | Conceder acceso individual / Grant individual access | Custodio de Agent Portal (Samuel/owner designado) | Cuenta y grant reales verificados, nunca credenciales compartidas |
| 4 | Presentar índice y políticas / Review index and policies | Instructor asignado | Checklist de lectura y preguntas, no simple click ficticio |
| 5 | Formación días 1–7 / Complete seven-day training | Instructor | Evidencia de ejercicios, evaluaciones ES/EN |
| 6 | Revisión de evaluación y faltas críticas / Score evaluation | Instructor + owners | Umbral ratificado y 0 faltas críticas |
| 7 | Autorizar alcance comercial y fuentes / Authorize allowed tasks, accounts and channels | Owners + Legal + Staff admin | Permisos y catálogo SELLABLE reales; en NO-GO, solo aprendizaje |
| 8 | Primera revisión supervisada / First supervised review | Supervisor | Caso sintético/privado aprobado, sin contacto real si no habilitado |
| 9 | Handoff y control de vigencia / Confirm documents and updates | PM + custodio de portal | Versión y retiro de documento antiguo verificados |

## Guía rápida del primer día / First day quick start
**ES:** (1) Lee [Manual ES](PLAYBOOK_ES.md) y marca servicios NO SELLABLE; (2) estudia [Kit de campo](FIELD_KIT_ES_EN.md); (3) confirma qué cuenta de Staff te pertenece y sus permisos reales; (4) completa el ejercicio del día 1; (5) comunica a tu instructor cualquier material contradictorio. **No llames, escribas ni cotices prospectos.**

**EN:** (1) Read [English playbook](PLAYBOOK_EN.md) and identify NOT SELLABLE services; (2) review [Field Kit](FIELD_KIT_ES_EN.md); (3) confirm your own Staff account and actual access grants; (4) finish day-one practice; (5) flag contradictory materials to the trainer. **Do not contact or quote prospects.**

## Solicitud de incorporación para Claude Code / Agent Portal integration inventory
**Solo inventario y contrato de uso, NO solicitud de construir funciones nuevas:**
- Mostrar exactamente los documentos, idiomas y estados anteriores **si** el portal actual ofrece un mecanismo seguro de biblioteca. Si no existe, clasificar **PENDIENTE INTEGRACIÓN** y no crear una biblioteca duplicada por esta instrucción.
- Usar autenticación/roles y grants del Staff Portal vigente; acceso a un documento no concede acceso a leads, clientes, contratos, precios, comisiones o permisos de contacto.
- La UI debe hacer visible “Documento de capacitación — NO APROBADO PARA VENTA” hasta que exista revisión y acta por versión.
- No utilizar GitHub público como fuente de datos personales ni sincronizar notas comerciales reales.
- Permitir ES/EN sin depender de cuentas nuevas ni múltiples fuentes canónicas.
- Mantener trazabilidad de versión y fecha; cambios posteriores requieren un PR documental revisado; no activar publicaciones automáticas.
- No consumir nuevos créditos ni modificar SQL, endpoints o RLS desde Sales. **Claude/PM decide integración después de validar ownership y seguridad**.

## Aprobaciones pendientes / Approval matrix
| Control | Responsable | Estado |
| --- | --- | --- |
| Claims, alcance y catálogo SELLABLE | Business Strategy + Product + Miguel/Samuel | PENDIENTE |
| Mensajes, consentimiento y canal | Legal & Compliance + owners | PENDIENTE |
| Tarifas, financiación, comisiones y KPIs | Finance & KPIs + owners | PENDIENTE |
| Capacitación y umbral de aprobación | Miguel/Samuel + supervisor designado | PENDIENTE |
| Contratación y documentación de empleo | Legal/HR + owners | PENDIENTE |
| Staff Portal roles, permisos y entrega documental | Samuel / custodio designado, con QA independiente | PENDIENTE |
| Acceso a CRM real en rol vendedor | Custodio técnico + QA + owners | NOT_RUN |
| Envío del welcome email / Welcome email sent | Responsable autorizado | NOT_RUN |

## Aceptación de C6
- [x] Bienvenida ES/EN y procedimiento de incorporación escritos.
- [x] Inventario de diez documentos con versión, idioma, audiencia, aprobación y acceso.
- [x] Restricción explícita de NO crear un segundo distribuidor documental.
- [x] Sin contratos laborales, salarios ni credenciales inventados.
- [ ] Invitaciones o accesos reales creados — NO.
- [ ] Staff Portal integrado/publicado y probado por rol — PENDIENTE.
- [ ] Aprobaciones Legal/owners — PENDIENTE.

**HANDOFF:** inventario listo para revisión por PM/Claude/Samuel. No distribuir a empleados ni afirmar curso impartido sin evidencias.
