# OB-WEB-001 — Onboarding de Sitios Web / Website Intake

**v1.0 · ES/EN · Client Operations · Estado editorial: PROPUESTO.** Tipo técnico existente `website`. Documento aplicable solo cuando el website esté en alcance autorizado; no presupone panel autogestionado, reservas online, SEO avanzado ni publicación. Registrar respuestas privadas bajo cliente canónico, nunca en este modelo.

## ES — Cuestionario de descubrimiento

**Identidad y objetivo.** (1) Nombre comercial exacto que debe mostrarse, (2) sector y público objetivo, (3) acción principal deseada (consulta, llamada, cita, compra informativa), (4) áreas geográficas y lenguas, (5) quien aprueba textos/uso de marca, (6) dirección pública, horario y medios de contacto **solo si autorizados para publicar**.

**Mapa y contenido.** (7) ¿Qué páginas necesitas: Inicio, Nosotros, Servicios, Portfolio, Contacto, Privacidad u otras? (8) Indica servicio/producto por página, ventajas verificables, preguntas frecuentes y llamadas a la acción; (9) aporta textos revisados o autoriza su elaboración contractual; (10) indica tres referencias visuales y qué te gusta/no te gusta; (11) prioriza móvil/accesibilidad/traducciones dentro del alcance; (12) define si necesitas un formulario y quién recibirá los envíos.

**Dominio y alojamiento.** (13) ¿Ya tienes dominio? [sí/no/desconocido] ¿Quién figura como titular y paga renovación? (14) ¿Quién administra DNS, hosting, cuentas y certificados? (15) ¿Autorizarás acceso delegado nominal? (16) ¿Hay correo del negocio asociado al dominio que no deba interrumpirse? (17) ¿Hay un sitio existente del que se deban preservar contenidos, posicionamiento, redirecciones y datos? No transferir dominio o modificar DNS sin aprobación separada.

**Políticas y medición.** (18) ¿Hay aviso de privacidad, cookies/consentimiento, términos o requisitos de accesibilidad a revisar por Legal? (19) ¿Qué herramientas de analítica han sido autorizadas, si alguna? (20) ¿Quién confirma datos, fotos, reseñas y derechos de uso? (21) ¿Se solicita integración externa de reservas, mapas o pagos? Marcar como **no disponible** hasta que Product Studio confirme inclusión y viabilidad.

## ES — Lista de activos y evidencias

- [ ] Logo vectorial (SVG/PDF/PNG de calidad) y colores/tipografías, con permiso de uso.

- [ ] Textos definitivos por página; descripciones de servicios y contacto público aprobados.

- [ ] Fotografías/ilustraciones/videos propios o licenciados, con consentimiento de imagen si aplica.

- [ ] Referencias visuales y orden de secciones; inventario de contenido antiguo para migración si se contrató.

- [ ] Dominio/hosting con titular, pagador, renovaciones y proveedor identificados.

- [ ] Acceso delegado, sin contraseñas enviadas por correo o chat; constancia de quién lo concede y quién revocará.

- [ ] Destinos de formularios y permiso para captar datos; textos de consentimiento de Legal si procede.

- [ ] Idiomas, políticas, requisitos de SEO y analytics realmente incluidos.

- [ ] Nombre y facultades de aprobador; plan de publicación y rollback para técnicos autorizados.

## ES — Plan de kickoff, revisión y aceptación

**Entrada GO:** alcance y versión aprobados, contenidos esenciales disponibles, derechos de uso comprobados, owner y dependencias identificados. **CONDICIONAL:** trabajar solo en estructura/prototipo autorizado si faltan fotos o textos. **NO-GO:** publicar sin dominio autorizado, QA o consentimiento.

**Prueba de aceptación observable (solo si contratada):** navegación entre páginas previstas; legibilidad en móvil; formularios envían al destino de prueba correcto con el consentimiento aplicable; enlaces/teléfonos correctos; contenido y medios autorizados; HTTPS en dominio verificado; requisitos de accesibilidad/SEO del alcance revisados; QA por versión, UAT del cliente y autorización de publicación **separadas**. No declarar mediciones de rendimiento ni posicionamiento sin prueba.

## EN — Discovery questionnaire

**Identity and goal.** (1) Exact public-facing business name, (2) sector and audience, (3) primary desired action (inquiry, call, appointment, informational sale), (4) markets and languages, (5) person authorized to approve copy and brand use, (6) public address, hours and contact details **only when approved for publication**.

**Site map and content.** (7) Required pages: Home, About, Services, Portfolio, Contact, Privacy or others? (8) Service details per page, substantiated benefits, FAQs and calls to action; (9) approved copy or explicitly contracted content drafting; (10) three references and what you do/do not like; (11) mobile, accessibility and localization priorities within scope; (12) form needs and actual receiving inbox/team.

**Domain and hosting.** (13) Existing domain, legal owner and renewal payer? (14) Who controls DNS, hosting, accounts and certificates? (15) Can named delegated access be granted? (16) Any business email that must not be interrupted? (17) Existing website to migrate with content, redirects or SEO preservation? Never transfer a domain or edit DNS without separate authorization.

**Privacy and measurement.** (18) Privacy policy, cookie notice/consent, terms or accessibility requirements for Legal? (19) Which analytics platforms, if any, are authorized? (20) Who verifies business details, photos, reviews and rights? (21) External booking, map or payments requested? Mark **not available** until Product Studio confirms inclusion and feasibility.

## EN — Assets and evidence checklist

- [ ] Vector/print-quality logo, colors and fonts, with documented license.

- [ ] Final copy per page, services and approved public contact details.

- [ ] Properly owned/licensed photos, graphics and videos, plus people-image consent when necessary.

- [ ] Visual references, section ordering and existing content inventory if migration is contracted.

- [ ] Domain/hosting ownership, payer, renewal and vendor details.

- [ ] Named delegated access; no passwords in chat/email; grantor/revocation owner identified.

- [ ] Form destinations and lawful data-capture language reviewed by Legal when applicable.

- [ ] Included languages, policies, SEO and analytics requirements, with exclusions recorded.

- [ ] Authorized approver and technically reviewed release/rollback plan.

## EN — Kickoff, review and acceptance

**GO for planning:** accepted scope/version, critical content, licensing, owners and dependencies confirmed. **CONDITIONAL:** only authorized wireframes/structure if copy or media are missing. **NO-GO:** no publication without domain authorization, QA and required consent.

**Observable UAT (only when in scope):** agreed page navigation; responsive readability; forms reach the approved test destination and show applicable consent; valid links and phone actions; authorized copy/media; HTTPS on verified domain; scoped accessibility/SEO checks; QA tied to exact version, customer UAT, and a **separate production release approval**. Do not claim ranking or performance outcomes without evidence.

## Data contract / no collisions

Use existing `crm_clients.id` and `src/lib/onboarding/model.ts` `website` checklist keys (`logo`, `domain`, `content`, `sections`, `photos`, `forms`, `contacts`, `revisions`, `publish`) plus common keys. This document provides prompts and evidence guidance, **not new database schema**. Prior sources: [operating checklist](https://github.com/avaloncoreagency/Avalon-code/blob/main/docs/client-operations/ONBOARDING_AND_DELIVERY_CHECKLISTS.md). **APPROVAL PENDING.**
