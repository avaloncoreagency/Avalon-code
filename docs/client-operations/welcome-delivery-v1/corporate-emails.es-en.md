# EM-001 — Biblioteca definitiva de texto corporativo ES/EN (10 eventos)

**Versión editorial:** 1.0 · **Estado:** LISTO PARA REVISIÓN, NO APROBADO NI ENVIADO · **Área:** Client Operations. Los diseños HTML, la firma del propietario autenticado, la outbox y el envío corresponden a **Claude**. Esta página contiene **copy operativo** para reutilizar, no una segunda implementación ni nuevos tipos de evento. El correo nunca se envía sin destinatario legítimo, consentimiento/canal permitido, revisión humana, SMTP o recibo manual comprobado y datos reales confirmados.

## Diccionario de variables y controles comunes

`{{contact_name}}` = contacto autorizado; `{{company_name}}` = empresa; `{{service}}` = servicio del acuerdo; `{{project_ref}}` = referencia privada del proyecto; `{{owner_name}}` / `{{owner_title}}` = nombre/cargo desde identidad autenticada, nunca alias técnico; `{{stage}}` = etapa registrada; `{{next_step}}` = próximo paso confirmado; `{{version}}` = versión exacta; `{{review_items}}` = elementos a revisar; `{{materials}}` = faltantes concretos; `{{secure_channel}}` = canal aprobado (no incluir contraseñas); `{{scheduled_date}}` = fecha confirmada; `{{delivery_url}}` = URL real HTTPS y comprobada; `{{agreement_ref}}` = acuerdo vigente; `{{support_email}}` = contacto verificado en configuración; `{{support_hours}}` = horario aprobado si existe; `{{document_names}}` = adjuntos/referencias realmente disponibles; `{{review_note}}` = nota del owner comprobada; `{{ticket_ref}}` = ticket real; `{{renewal_scope}}` = alcance vigente y alternativa a revisar.

**Nunca sustituir valores faltantes por ficción**. Eliminar frases opcionales sin evidencia y BLOQUEAR envío si falta un dato requerido. El remitente/Reply-To lo obtiene Claude de `avalon_company_settings` con validación SMTP, no de esta página. Ninguna plantilla crea una venta, contrato, factura, proyecto ni aceptación.

## 01 · Welcome Email / Correo de bienvenida

**Tipo:** `welcome` · **Implementación existente:** `renderClientWelcome` en `src/lib/comms/email.ts` · **Variables obligatorias:** `contact_name`, `company_name`, `service`, `owner_name`; `next_step` únicamente si está confirmado. **Adjuntos:** Welcome Package WP-001, onboarding de servicio, checklist de materiales, alcance/SOW vigente y contrato **solo si efectivamente firmado**; factura solo si existe una factura válida.

**ES — Asunto:** Bienvenido a Avalon Core Agency — Comencemos {{service}}

Hola {{contact_name}}:

Nos alegra darte la bienvenida a Avalon Core Agency. Gracias por confiar en nuestro equipo para acompañar a {{company_name}} con {{service}}.

Para comenzar de forma organizada, encontrarás la guía de primeros pasos y el cuestionario correspondiente a tu proyecto. En esta primera fase verificaremos los objetivos, los materiales disponibles, la persona que aprobará revisiones y las dependencias necesarias para trabajar con claridad.

{{next_step}}

Por favor, no compartas contraseñas por correo; coordinaremos cualquier acceso mediante el canal seguro aprobado. Las fechas y condiciones aplicables son las de tu acuerdo vigente.

Gracias por comenzar este camino con nosotros.

{{owner_name}}  
{{owner_title}} · Avalon Core Agency

**EN — Subject:** Welcome to Avalon Core Agency — Let's begin {{service}}

Hello {{contact_name}},

Welcome to Avalon Core Agency, and thank you for trusting our team to support {{company_name}} with {{service}}.

To get started, we have prepared a first-steps guide and the questionnaire for your project. We will confirm goals, available assets, who can approve reviews, and the dependencies required to work clearly and securely.

{{next_step}}

Please do not share passwords by email; we will coordinate any access through the approved secure channel. Dates and service terms are governed by your current agreement.

Thank you for starting this journey with us.

{{owner_name}}  
{{owner_title}} · Avalon Core Agency

## 02 · Material request / Solicitud de materiales

**Tipo editorial, sin evento nativo confirmado:** no crear `kind` nuevo en outbox sin decisión de Claude. **Variables:** `materials`, `secure_channel`, `service`, `project_ref`, `owner_name`. **Adjuntos:** checklist de servicio OB-WEB/ECOM/CRM/MKT y política de accesos.

**ES — Asunto:** Materiales necesarios para avanzar — {{service}}

Hola {{contact_name}}:

Al revisar la preparación de {{service}} para {{company_name}}, identificamos los siguientes elementos pendientes: {{materials}}.

Estos materiales nos permitirán continuar con {{next_step}}. Puedes entregarlos utilizando {{secure_channel}}, verificando que los textos, imágenes y archivos tengan permiso de uso. Si necesitas aclarar el formato de alguno, indícanoslo y lo revisamos contigo.

No envíes contraseñas ni claves privadas. Si algún material todavía no está disponible, avísanos para registrar su dependencia y evaluar el siguiente paso conforme al acuerdo; este mensaje no cambia automáticamente ninguna fecha contractual.

Gracias,  
{{owner_name}} · Avalon Core Agency

**EN — Subject:** Materials needed for the next step — {{service}}

Hello {{contact_name}},

While preparing {{service}} for {{company_name}}, we identified these outstanding materials: {{materials}}.

They are needed for {{next_step}}. Please share them through {{secure_channel}}, confirming you have the right to use the copy, images and files. Let us know if you need clarification about any file format.

Never send passwords or private keys. If something is not yet available, tell us so we can record the dependency and review next steps under the agreement; this note does not automatically change contractual dates.

Thank you,  
{{owner_name}} · Avalon Core Agency

## 03 · Kickoff confirmation / Confirmación de kickoff

**Tipo:** puede reaprovecharse `onboarding_confirmation` solo con `stageLabel` y `nextStep` reales; cualquier convocatoria de calendario requiere autorización del owner y no se crea aquí. **Variables:** `scheduled_date` opcional si confirmada, `next_step`, `project_ref`, `owner_name`, `service`. **Adjuntos:** alcance aprobado, agenda y roles, cronograma provisional rotulado.

**ES — Asunto:** Confirmación de inicio y próximos pasos — {{service}}

Hola {{contact_name}}:

Confirmamos que la fase de kickoff de {{service}} para {{company_name}} está preparada conforme al alcance registrado. {{scheduled_date}}

Nuestro encuentro o revisión inicial abordará: objetivos prioritarios, responsables de decisiones, materiales pendientes, dependencias y criterios de validación. La siguiente acción acordada es: {{next_step}}.

Compartiremos cualquier compromiso de fecha solo cuando quede confirmado por quienes corresponda. Si alguna prioridad cambió, respóndenos antes de la reunión mediante el canal autorizado.

Saludos,  
{{owner_name}} · Avalon Core Agency

**EN — Subject:** Project kickoff and next steps — {{service}}

Hello {{contact_name}},

The kickoff stage for {{service}} at {{company_name}} is ready according to the recorded scope. {{scheduled_date}}

Our first meeting or review will cover priorities, authorized decision-makers, missing materials, dependencies and validation criteria. Our agreed next action is: {{next_step}}.

We will only confirm binding dates when properly approved. If your priorities have changed, please reply through the authorized channel before the meeting.

Best regards,  
{{owner_name}} · Avalon Core Agency

## 04 · Project progress / Actualización de proyecto

**Tipo nativo:** `progress_update` (`renderLifecycle`), exige nota real del owner y etapa del sistema; progreso `done/total` solo si realmente medido. **Variables:** `stage`, `review_note`, `next_step`; **Adjuntos:** versión presentada o resumen de tareas si disponible.

**ES — Asunto:** Actualización de tu proyecto — {{service}}

Hola {{contact_name}}:

Te compartimos el estado registrado de {{service}}. **Etapa actual:** {{stage}}.

**Avance confirmado:** {{review_note}}

**Próximo paso:** {{next_step}}

Si necesitamos una decisión o material de tu parte, te lo indicaremos de forma específica. Cualquier fecha seguirá identificada como estimada o comprometida según el acuerdo; no damos por completada una etapa sin la evidencia correspondiente.

Gracias,  
{{owner_name}} · Avalon Core Agency

**EN — Subject:** Your project update — {{service}}

Hello {{contact_name}},

Here is the recorded status of {{service}}. **Current stage:** {{stage}}.

**Verified progress:** {{review_note}}

**Next step:** {{next_step}}

If a decision or asset is needed from you, we will identify it specifically. Dates remain labeled estimated or contractually committed as appropriate, and we do not mark a stage complete without supporting evidence.

Thank you,  
{{owner_name}} · Avalon Core Agency

## 05 · Approval request / Solicitud de aprobación

**Tipo editorial:** NO hay `kind` nativo específico confirmado. Mantener revisión humana y evidencia de la versión; no convertir silencio o clic de correo en aprobación contractual. **Variables:** `version`, `review_items`, `secure_channel`, `project_ref`; **Adjuntos:** vista de versión, acta UAT o CR según aplique.

**ES — Asunto:** Tu revisión es necesaria — {{service}} · versión {{version}}

Hola {{contact_name}}:

La versión {{version}} de {{service}} está preparada para tu revisión dentro del alcance acordado. Te pedimos verificar: {{review_items}}.

Indícanos de forma consolidada qué está correcto y qué observaciones deseas registrar, utilizando {{secure_channel}}. Cuando se trate de una nueva funcionalidad o costo, evaluaremos una solicitud de cambio antes de continuar.

La ausencia de respuesta no se considerará aprobación. Si la revisión corresponde a la aceptación final, usaremos el mecanismo válido previsto por Legal y el acuerdo vigente; autorizar publicación es una decisión separada.

Atentamente,  
{{owner_name}} · Avalon Core Agency

**EN — Subject:** Your review is needed — {{service}} · version {{version}}

Hello {{contact_name}},

Version {{version}} of {{service}} is available for your review against the agreed scope. Please check: {{review_items}}.

Send consolidated confirmation or comments through {{secure_channel}}. For additional features or costs, we will evaluate a change request before doing the extra work.

Silence is not approval. If this is final acceptance, we will use the legally reviewed mechanism under the agreement; production release is a separate decision.

Sincerely,  
{{owner_name}} · Avalon Core Agency

## 06 · Delivery confirmation / Confirmación de entrega

**Tipo nativo:** `delivery_notice` exige `deliveredOn` y URL HTTPS real; requiere entrega registrada y gate QA/UAT cumplido, sin confundir con correo enviado. **Variables:** `delivery_url`, `scheduled_date` (fecha real de entrega), `version`, `review_items`; **Adjuntos:** acta de entrega/aceptación y manual específico si están emitidos.

**ES — Asunto:** Entrega registrada — {{service}} · {{version}}

Hola {{contact_name}}:

Te confirmamos que se registró la entrega de **{{service}}**, versión **{{version}}**, asociada a {{company_name}}. Puedes consultar el producto entregado en **{{delivery_url}}**.

Adjuntamos o ponemos a tu disposición, por el canal privado acordado, el inventario de documentos y las instrucciones correspondientes a esta versión. Por favor, confírmanos la recepción y comunica cualquier observación vinculada a los criterios de aceptación acordados.

La entrega no amplía automáticamente cobertura, garantía ni servicio de mantenimiento; rige lo indicado en tu acuerdo.

Gracias por trabajar con nosotros,  
{{owner_name}} · Avalon Core Agency

**EN — Subject:** Delivery recorded — {{service}} · {{version}}

Hello {{contact_name}},

We have recorded delivery of **{{service}}**, version **{{version}}**, for {{company_name}}. The delivered product is available at **{{delivery_url}}**.

Through the approved secure channel, we have provided the document inventory and instructions for this exact version. Please confirm receipt and report any observations against the agreed acceptance criteria.

Delivery does not automatically extend support, warranty or maintenance; your agreement controls.

Thank you for working with us,  
{{owner_name}} · Avalon Core Agency

## 07 · Manuals delivered / Envío de manuales

**Tipo nativo existente:** `renderDocumentDelivery`, sin crear un segundo generador. **Variables:** `document_names`, `service`, `version`, `secure_channel`, `owner_name`; **Adjuntos:** PDF versionado con hash/permiso, manual específico + complementos realmente emitidos.

**ES — Asunto:** Tus manuales y documentación — {{service}}

Hola {{contact_name}}:

Ponemos a tu disposición la documentación correspondiente a **{{service}}**, versión **{{version}}**: {{document_names}}.

Guarda estos archivos para futuras consultas y compártelos únicamente con personas autorizadas de tu organización. Los accesos y contraseñas nunca aparecen en estos manuales: cualquier credencial se entrega de manera independiente y segura.

Si una pantalla o función no coincide con tu producto entregado, indícanos la sección concreta para revisar la versión del manual.

Saludos,  
{{owner_name}} · Avalon Core Agency

**EN — Subject:** Your manuals and documentation — {{service}}

Hello {{contact_name}},

We have made the following documents available for **{{service}}**, version **{{version}}**: {{document_names}}.

Keep these files for future reference and share them only with authorized people in your organization. Passwords and access secrets are never included in the guides; credentials are handled separately through a secure process.

If any documented screen or feature differs from your delivered product, let us know the exact section so we can check the manual version.

Best,  
{{owner_name}} · Avalon Core Agency

## 08 · Support / Atención de soporte

**Tipo nativo:** `support_info`, pero el texto siguiente es para orientación de recepción o acuse cuando haya ticket verdadero. **Variables:** `ticket_ref` si existe, `support_email`, `support_hours` solo si aprobadas, `service`, `owner_name`. **Adjuntos:** Manual de soporte MN-SUPPORT-001 y ficha de incidencia sin PII.

**ES — Asunto:** Información de soporte para {{service}}

Hola {{contact_name}}:

Para consultas sobre **{{service}}**, utiliza el canal de soporte autorizado que figura en tu acuerdo: **{{support_email}}**. {{support_hours}}

Al reportar una incidencia, incluye qué ocurrió, la sección afectada, la fecha, el impacto y, si es posible, una captura con los datos sensibles ocultos. No compartas contraseñas o información de pago por correo.

Revisaremos la solicitud según la cobertura aplicable y confirmaremos el siguiente paso. El alcance de mantenimiento y los tiempos de respuesta son exclusivamente los acordados por contrato; este mensaje no establece un SLA nuevo.

Saludos,  
{{owner_name}} · Avalon Core Agency

**EN — Subject:** Support information for {{service}}

Hello {{contact_name}},

For assistance with **{{service}}**, use the approved support channel in your agreement: **{{support_email}}**. {{support_hours}}

When reporting an issue, include the symptom, affected area, date, impact and, if possible, a screenshot with sensitive data hidden. Do not share passwords or payment information by email.

We will review the request within applicable coverage and confirm the next step. Maintenance scope and response times are exclusively those in your agreement; this message creates no new SLA.

Regards,  
{{owner_name}} · Avalon Core Agency

## 09 · Maintenance / Mantenimiento

**Tipo editorial:** sin `kind` nativo separado confirmado. **Solo enviar si existe acuerdo de mantenimiento, revisión real y consentimiento de comunicación.** **Variables:** `service`, `review_note`, `next_step`, `agreement_ref`; **Adjuntos:** manual MN-MAINT-001 adaptado, parte de mantenimiento realmente verificado.

**ES — Asunto:** Revisión de mantenimiento — {{service}}

Hola {{contact_name}}:

Compartimos una actualización sobre el mantenimiento de **{{service}}** conforme al acuerdo **{{agreement_ref}}**.

**Trabajo o revisión efectivamente documentado:** {{review_note}}

**Siguiente acción identificada:** {{next_step}}

Si se requiere una intervención fuera de la cobertura contratada, te presentaremos el alcance y las condiciones para aprobación antes de ejecutarla. No se han modificado costos, fechas ni accesos por el envío de este mensaje.

Gracias,  
{{owner_name}} · Avalon Core Agency

**EN — Subject:** Maintenance review — {{service}}

Hello {{contact_name}},

We are sharing a maintenance update for **{{service}}** under agreement **{{agreement_ref}}**.

**Work or inspection actually documented:** {{review_note}}

**Identified next action:** {{next_step}}

If a proposed intervention is outside contracted coverage, we will provide its scope and terms for approval before doing any additional work. This message does not change fees, schedules or permissions.

Thank you,  
{{owner_name}} · Avalon Core Agency

## 10 · Renewal review / Renovación

**Tipo nativo:** `renewal_review` exige nota verificada del owner. No reactivar auto-cobro ni renovación. **Variables:** `renewal_scope`, `review_note`, `agreement_ref`, `next_step`. **Adjuntos:** condiciones vigentes/revisadas **solo si Legal las aprobó**, inventario de terceros y renovación si aplicable.

**ES — Asunto:** Revisión de continuidad de {{service}} — Avalon Core Agency

Hola {{contact_name}}:

Se aproxima un momento de revisión de las condiciones de **{{service}}** según el acuerdo **{{agreement_ref}}**. Te compartimos los puntos que requieren decisión: {{renewal_scope}}.

**Contexto registrado:** {{review_note}}

Antes de continuar verificaremos duración, alcance, servicios de terceros, titularidad y cualquier cambio de condiciones que corresponda. **Nada se renueva ni se cobra automáticamente por este mensaje.** Toda nueva obligación requiere tu autorización expresa mediante el procedimiento contractual aplicable.

Saludos,  
{{owner_name}} · Avalon Core Agency

**EN — Subject:** Review of your {{service}} continuation — Avalon Core Agency

Hello {{contact_name}},

The terms of **{{service}}** are due for review under agreement **{{agreement_ref}}**. These are the items for your decision: {{renewal_scope}}.

**Recorded context:** {{review_note}}

Before any continuation, we will confirm duration, scope, third-party subscriptions, ownership and applicable changes. **Nothing renews or is charged automatically because of this message.** Any new obligation requires your express authorization under the applicable contractual process.

Best regards,  
{{owner_name}} · Avalon Core Agency

## Reglas finales de aprobación y pruebas editoriales

- **No duplicar HTML** ni programación de envíos: Claude decide el mapeo a `renderClientWelcome`, `renderLifecycle`, `renderDocumentDelivery` y otros servicios **ya implementados**, conservando snapshots y outbox; plantillas editoriales sin `kind` se mantienen en revisión hasta decisión técnica.

- Todos los diez asuntos y veinte cuerpos bilingües son **COPIA EDITORIAL PENDIENTE DE APROBACIÓN**. Legal debe revisar aceptación, términos de soporte, consentimiento/contacto y renovaciones; Finance debe aprobar costos si se mencionaran.

- **NO ENVIADOS.** Sin SMTP se conserva estado BLOQUEADO; envío manual exige evidencia y aprobación, no se marca enviado por preparar HTML.

- Nunca incluir correos personales no consentidos, teléfono no aprobado, cifras, descuentos, plazos inventados, enlaces de administración sin permisos ni credenciales.

- Los mensajes 06, 07 y 09 requieren evidencia real de entrega/manual/mantenimiento. `renewal_review` necesita nota del owner, no fecha inventada.

- Contacto por defecto leído en código: `avalonagencymh@gmail.com`; usar únicamente la configuración vigente y comprobar disponibilidad antes de enviar.
