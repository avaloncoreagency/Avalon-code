# AVALON-SALES-001 — SOP operativo del piloto de 30 días

**Estado:** DOCUMENTACIÓN V2 CORREGIDA / NO ACTIVADA · **Issue:** #275 · **Revisión:** 2026-11-22  
**Documento principal:** [AVALON_SALES_001.md](./AVALON_SALES_001.md)  
**Destinatarios:** Miguel y Samuel (owners). **Repositorio público:** nunca agregar contactos reales, información de clientes, teléfonos, correos, reuniones privadas ni contratos.

## 1. Reglas antes de usarlo
- Este SOP guía **trabajo humano manual**. No da permiso para enviar correos, llamar, mandar SMS/DM, importar CSV, contratar servicios, usar Radar o gastar en Ads.
- Previo al primer contacto, LEGAL debe revisar el canal, CAN-SPAM/TCPA/Florida, las reglas de la plataforma, el destinatario y el método de oposición. Un contacto B2B no equivale automáticamente a consentimiento.
- **WP-01 es CANDIDATO / NO SELLABLE**; Lead Capture, CRM y e-commerce están BLOQUEADOS para venta. Cualquier oferta requiere PRODUCT STUDIO, BUSINESS STRATEGY, FINANCE, LEGAL, QA y owners. No prometer resultados, fechas de entrega, servicios de IA ni porcentaje por desempeño.
- En este archivo solamente se muestran **plantillas y datos sintéticos**. Registrar fichas reales únicamente en almacenamiento privado autorizado.
- Ante oposición, marcar **NO CONTACTAR** en el control privado de supresión y cancelar cualquier tarea/siguiente contacto; no asumir que la etapa `lost` del CRM cubre ese propósito.

## 2. Rutina diaria del operador: 45–60 minutos sugeridos

| Minutos propuestos | Actividad | Evidencia de aceptación |
| --- | --- | --- |
| 0–15 | Investigación manual de negocios por sector y zona aprobada | Nombre verificado, web/GBP pública, sector, fecha/fuente |
| 15–25 | Comprobar duplicados y redactar microdiagnóstico | Observación reproducible; hecho vs hipótesis separados |
| 25–35 | Calificar necesidad, decisor, oportunidad y viabilidad | Score comercial **1–5** o NO CALIFICADO; no confundir con Hunter 0–100 |
| 35–45 | Revisar consentimiento, exclusiones y autorizaciones para cada canal | Sin permiso, no ejecutar; **NO CONTACTAR** solo si existe oposición o supresión activa |
| 45–60 | Cuando autorizado: ejecutar **un** contacto personalizado o dar seguimiento acordado; registrar resultado | Fecha, canal, owner, respuesta real, siguiente acción |

El tiempo es una guía de planificación, no una promesa de capacidad. No hay ejecución autónoma.

## 3. Microdiagnóstico de 90 segundos (solo con evidencia pública)

1. **Quién es:** sector, ciudad, servicios publicados y fuente/fecha.
2. **Qué observé:** un hecho concreto y verificable (p. ej., un enlace de solicitud difícil de ubicar en la navegación móvil). No afirmar que una web “falla” sin comprobarlo.
3. **Qué desconozco:** volumen de llamadas, clientes perdidos, ingresos, presupuesto, capacidad del equipo, tasa de conversión.
4. **Pregunta de validación:** ¿cómo se recibe y se sigue actualmente una solicitud?
5. **Hipótesis de solución:** web informativa WP-01 solo tras aprobación. Formularios propios, CRM y automatizaciones son necesidades futuras BLOQUEADAS, no ofertas listas.
6. **Estado:** solo investigación / autorizado para contacto manual individual / no contactar / contacto realizado.

**Ficha sintética de ejemplo:** `TEST-ROOFING-01`, empresa ficticia de techos, observación ficticia “acceso al formulario poco visible”, hipótesis “podría facilitarse la solicitud”, necesidad **DESCONOCIDA**, score comercial 2/5 (ejemplo sintético), autorización **NO OTORGADA**. No copiar a producción.

## 4. Registro privado de 20 investigaciones — esquema, NO lista de leads reales

| Campo | Definición |
| --- | --- |
| Código de control | Identificador interno de investigación, no ID inventado del CRM |
| Empresa / sector / ciudad | Verificados por fuente pública |
| URL pública y fecha de consulta | Página exacta donde se confirmó el dato |
| Observación y evidencia | Una frase factual, separada de la hipótesis |
| Contacto autorizado | Sí/No; canal; quién aprobó; cuándo; fundamento revisado |
| Owner y score comercial | Miguel/Samuel, encaje manual **1–5** o NO CALIFICADO; Hunter 0–100 es completitud |
| Interacción y resultado | Ninguna / se intentó / respuesta real / reunión acordada |
| Próxima acción | Responsable, fecha y consentimiento vigente |
| Exclusión o rechazo | Si el destinatario se opuso, bloquear siguientes contactos |
| CRM | Lead existente y stage **real**, solo después de acceso/autorización |

**Escala vigente:** 1 = sin encaje/rechazo; 2 = encaje hipotético; 3 = necesidad expresada; 4 = decisor y prioridad compatibles con **SKU aprobado**; 5 = solicitud de propuesta con SKU, alcance y condiciones **aprobados**. Si faltan datos: NO CALIFICADO. WP-01 NO SELLABLE: no asignar 4/5 como si se pudiera cotizar. NO CONTACTAR es una restricción independiente y no equivale a score bajo.

**Control de duplicados:** antes de registrar una empresa, comprobar en el CRM privado el negocio y los identificadores que existan; no asumir que el nombre normalizado identifica sin ambigüedad a una entidad. No crear clientes para leads sin una relación aprobada.

**Lote inicial:** investigar 8 roofing, 6 fencing y 6 barberías, **distribución propuesta**. Evaluar calidad y tasa de respuesta antes de ampliar. Los 20 registros reales no viven en GitHub ni en documentación pública.

## 5. Secuencia de aprobación por oportunidad

`Investigación manual -> evidencia -> revisión de duplicado -> elegibilidad de canal -> aprobación individual -> mensaje personalizado -> interacción registrada -> siguiente acción`

**Puntos de detención obligatoria:**
- No existe destinatario o identidad empresarial verificada.
- Falta permiso, base adecuada o revisión legal del canal.
- El negocio se opuso, solicitó detener contacto o tiene supresión activa.
- La promesa comercial exige una funcionalidad sin pruebas, precio no aprobado o porcentaje sin contrato.
- La cuenta o producto del prospecto requiere datos sensibles/privados.
- El CRM no está disponible: conservar nota privada mínima y no declarar que se guardó una oportunidad.

## 6. Registro comercial y compatibilidad con el CRM canónico

**Comprobado por inspección de fuente en `main@ff8191d23c99e3e4230f0d6e224230821c94aa43`:** `src/lib/crm/domain.ts` y `pipeline-groups.ts`.

| Concepto operativo | En Avalon | Limitación a respetar |
| --- | --- | --- |
| Prospecto B2B real | `crm_leads` con audiencia adecuada si el campo existe y se confirma | No confundir `crm_prospects` / Hunter con clientes |
| Etapa | `crm_leads.stage_id` | 13 etapas detalladas, 5 grupos visibles; no crear 7 nuevas |
| Próxima acción | `crm_leads.follow_up_at` o tarea autorizada | Fecha de seguimiento ≠ permiso de comunicación |
| Notas y seguimiento | `crm_activities` (`pending`, `completed`) | Nota completada ≠ prueba de llamada o email |
| Cita | `crm_events` (`scheduled`, `completed`, `cancelled`) | Agendada ≠ celebrada |
| Puntaje | Hunter `scoreProspect()` = completitud 0–100 | No confundir con encaje comercial 1–5 |
| Acuerdo/venta | `crm_sales`, proceso de confirmación existente | Sin venta no marcar ganado por heurística |
| Cobro | `crm_payments` | Contratado ≠ facturado ≠ cobrado |
| Baja de contacto | Control privado de supresión aprobado | No confirmado como campo nativo; no inventarlo |

**Visual actual:** Nuevo: `new/researched/contact-pending`; En conversación: `contacted/replied/qualified/meeting/diagnosed/nurture`; Propuesta: `proposal/negotiation`; Ganado: `won`; Perdido: `lost`. No inferir métricas globales a partir de una página de Kanban paginada.

## 7. Checklist de reunión comercial de 15 minutos

- [ ] Confirmar permiso para conversar, persona que decide y necesidad.
- [ ] Preguntar origen de consultas, proceso de respuesta y seguimiento.
- [ ] Identificar herramientas actuales y qué desean **mantener** (web, reservas, sistemas, dominio).
- [ ] Registrar volumen y presupuesto **solo si el interlocutor lo declara**; no estimar ingresos ajenos.
- [ ] Confirmar urgencia, dependencia técnica, personal disponible y zona atendida.
- [ ] Resumir problema, alcance inicial, exclusiones y próximo paso.
- [ ] Acordar fecha/canal del siguiente contacto; si no hay interés, cerrar respetuosamente.
- [ ] No emitir precio, comisión o contrato como aprobado si falta validación.

**Preguntas sectoriales rápidas:** Roofing — responsable de leads, capacidad semanal, tiempos de respuesta, proceso cotización→contrato, presupuesto publicitario. Fencing — tamaño del equipo, tipos de trabajos, seguimiento de propuestas, presupuesto de marketing, interés en comisión **sin porcentaje asumido**. Barberías — enlace de reserva actual, servicios/horarios, disponibilidad y fidelización. Clínicas — solo flujo de contacto general; privacidad/HIPAA antes de cualquier dato clínico.

## 8. Seguimiento manual, supresión y cierre

- **Día de contacto 0**: registrar interacción real y fecha.
- **Día hábil 3**: primer seguimiento solamente con canal permitido y sin oposición.
- **Día hábil 10**: último seguimiento no solicitado, si legalmente adecuado.
- Después: detener la secuencia; reabrir solo si el prospecto responde o existe otra base válida revisada.
- **Rechazo/opt-out en cualquier momento:** suprimir inmediatamente; registrar evidencia en el sistema privado de contacto; sin nuevos mensajes.
- Ante respuesta positiva: pasar a discovery, acordar cita, preparar propuesta versionada, no automatizar cierre.

## 9. Control semanal del experimento de 30 días
**Plan PROPUESTO / NO ACTIVADO:** hasta **20 negocios** investigados manualmente y hasta **10 entrevistas** aceptadas voluntariamente y autorizadas por Legal/owners. La meta inicial de 80 investigaciones y 40 contactos queda sustituida, nunca se presenta como resultado.

| Semana | Objetivo de investigaciones acumuladas | Tope de entrevistas acumuladas CON permiso | Bloqueo |
| --- | ---: | ---: | --- |
| 1 | 5 | hasta 2 | Sin autorización individual, no contactar |
| 2 | 10 | hasta 4 | Oposición activa: detener seguimiento |
| 3 | 15 | hasta 7 | Sin SKU aprobado, no cotizar |
| 4 | 20 | hasta 10 | Concluir GO / PIVOT / STOP con evidencia |

**Datos reales: DESCONOCIDOS** hasta obtener registros privados completos. Diferenciar investigados, contactados, respuestas, citas celebradas, propuestas enviadas, contratos y pagos. No inventar un CAC cero: FINANCE debe contabilizar tiempo y desplazamientos. Sin autorización no iniciar campañas, Radar, bots ni publicidad.

## 10. Gates de propuesta y entrega

1. **BUSINESS STRATEGY:** WP-01 informativo, NO SELLABLE hasta aprobación de alcance y precios; B/C BLOQUEADOS.
2. **FINANCE & KPIs:** costos completos, margen, CAC, precio y comisión excepcional, sin porcentajes supuestos; venta de cliente ≠ ingreso de Avalon.
3. **LEGAL & COMPLIANCE:** permiso de contacto, condiciones de cancelación/IP/confidencialidad y modelo porcentual.
4. **CLOUD & SECURITY / PRODUCT STUDIO / QA:** hosting, seguridad y Safari/iPhone; no prometer CRM/Lead Capture no certificados.
5. **CLIENT OPERATIONS:** materiales, onboarding, aceptación y mantenimiento.
6. **Miguel y Samuel:** aprobación puntual antes de hacer ofertas vinculantes o enviar comunicaciones.

## 11. Criterios de aceptación verificables de ESTE SOP
- [x] No hay nombres o contactos reales de prospectos.
- [x] No hay instrucciones para scraping, campañas automáticas o activación de Radar.
- [x] Las cinco agrupaciones y 13 etapas coinciden con fuente del repositorio **inspeccionada**, no con prueba en navegador.
- [x] Score comercial manual 1–5, separado de Hunter 0–100; experimento 20/10 condicional.
- [x] Las plantillas no afirman cotizaciones, contratos, resultados ni ingresos aprobados.
- [ ] Owners han aprobado sector y territorio.
- [ ] LEGAL ha aprobado canal y texto final.
- [ ] BUSINESS STRATEGY y FINANCE han aprobado propuestas y criterios de rentabilidad.
- [ ] QA ha comprobado persistencia CRM/consentimiento y Safari/iPhone real cuando sea necesario.

## HANDOFF AL PROJECT MANAGER
**ID:** AVALON-SALES-001 / Issue #275 · **Estado:** SOP V2 CORREGIDO / OPERACIÓN NO-GO. **Entregado:** rutina manual, ejemplo ficticio, score 1–5, consentimiento y supresión separados, piloto 20/10 y gates WP-01. **No ejecutado:** campañas, emails, llamadas, CRM, ventas ni cobros. **Next action:** PM revisa el diff; Business/Finance/Legal/Product/Cloud/QA/Ops validan gates y owners autorizan contacto individual antes de cualquier outreach.
