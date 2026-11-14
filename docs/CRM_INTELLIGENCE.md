# Avalon CRM Intelligence

**Diagnóstico comercial, calificación explicable y gestión compartida**

| | |
| --- | --- |
| **Rama** | `claude/crm-intelligence` (sobre `integration/avalon-v1`) |
| **Fecha** | 2026-11-11 |
| **Alcance** | Prospectos B2B de Avalon («Tipo A») para Miguel y Samuel |
| **Migración** | `20261111100000_crm_intelligence.sql`: aditiva, **no aplicada a ninguna base real** (solo probada en PGlite) |

## 1. Funcionalidades implementadas y verificadas

| Función | Dónde | Verificado por |
| --- | --- | --- |
| **Quick Add**: solo el nombre comercial es obligatorio | Mesa comercial | E2E navegador |
| Aviso de posibles duplicados (teléfono, dominio, correo, nombre); nunca se fusiona nada automáticamente | Mesa comercial | E2E + prueba de librería |
| **Discovery**: cuestionario por industria en secciones cortas; preguntas condicionales; «No lo sabe» y «No aplica»; guardado parcial; progreso real | `/crm/lead/[id]/discovery` | E2E (iPhone 13) + PGlite |
| Protección por pregunta frente a ediciones simultáneas: la respuesta del otro propietario no se sobrescribe y el conflicto se muestra | Discovery | E2E (dos sesiones) + PGlite |
| Copia de emergencia en la pestaña (sessionStorage) si falla la red; nunca se presenta como guardada | Discovery | Revisión de código |
| **Lead Score** 0–100 explicable, con factores y evidencia; lo desconocido no resta; «Datos insuficientes» por debajo del 60 % del peso conocido | Deal Review | 12 pruebas de librería + E2E |
| Riesgo legal separado de la puntuación | Deal Review | Pruebas de librería + E2E |
| Ajuste manual justificado (≥15 caracteres) y auditado | Deal Review | PGlite |
| Recomendaciones por reglas, con problema, evidencia, servicio, beneficio cualitativo, datos faltantes y próxima acción. Se aceptan, descartan o editan | Deal Review › Recomendaciones | E2E + librería |
| **Deal Review**: resumen ejecutivo del lead | Deal Review | E2E |
| Registro después de la llamada (nota, resultado y próximo contacto en un paso) | Deal Review | E2E (iPhone) |
| Asignación de responsable, prioridad y etapa, con versión optimista | Deal Review | E2E + PGlite |
| Condiciones comerciales: propuestas y acordadas por separado. Una comisión acordada exige aprobación explícita | Deal Review › Condiciones | E2E + PGlite |
| Contrato: 8 estados, evidencia, verificación manual y auditoría | Deal Review › Contrato | E2E + PGlite |
| **Bloqueo**: sin contrato «Firmado y verificado» no hay Ganado ni cliente formal | Base de datos | PGlite + E2E de ventas |
| Historial unificado: actividad, diagnóstico, contrato, etapas, puntuación y cambios de datos | Deal Review › Historial | E2E |
| Mesa comercial con conteos reales y filtros | `/crm/desk` | E2E |
| Español e inglés | Todo | E2E en inglés |
| iPhone sin desbordamiento horizontal | Mesa comercial, Discovery, Deal Review | E2E (iPhone 13 y SE) |

## 2. Rutas y pantallas

**Nuevas:**
- `/admin/workspace/crm/desk` (Mesa comercial).
- `/admin/workspace/crm/lead/[id]` (Deal Review, con las pestañas `?tab=summary|recs|terms|contract|history`).
- `/admin/workspace/crm/lead/[id]/discovery`.

**Modificadas:**
- Navegación del CRM: «Mesa comercial» es la primera pestaña. «Oficina» sale de la navegación principal (managers fuera de alcance por ahora); su ruta sigue existiendo.
- Las tarjetas del pipeline enlazan al Deal Review.
- La venta muestra un mensaje claro cuando falta un contrato verificado.

**Reutilizado sin cambios:**
- El pipeline de 13 etapas.
- `crm_activities` (notas, llamadas y seguimientos).
- `crm_attachments`: documentos privados, verificados por firma de archivo, descarga solo para owners con `Content-Disposition: attachment`.
- `crm_audit`, `crm_timeline` y `crm_owner_directory`.
- `crm_confirm_sale` y `crm_convert_lead_to_client`.

## 3. Tablas y migraciones

`20261111100000_crm_intelligence.sql` es aditiva: no borra ni renombra nada.

**`crm_leads`, columnas nuevas, todas opcionales:**
- Identificación: `legal_name`, `contact_title`, `google_business_url`, `address`, `city`, `zip`, `specialty`, `service_area`.
- Procedencia: `origin`.
- Diagnóstico y estado: `industry_key`, `next_action`, `last_interaction_at`, `diagnosis_status`, `lead_score`, `lead_grade`, `contract_status`.
- `audience`, fijada en `agency_b2b`.

**Tablas nuevas:**

| Tabla | Para qué |
| --- | --- |
| `crm_lead_assessments` | Una por lead e industria |
| `crm_lead_assessment_revisions` | Solo anexado |
| `crm_lead_scores` | Solo anexado |
| `crm_lead_recommendations` | Recomendaciones y decisiones |
| `crm_commercial_terms` | Propuestas y acordadas |
| `crm_contracts` | Contratos |
| `crm_contract_events` | Solo anexado |

**Funciones:**
- `crm_assessment_save` (invoker; exige owner).
- Triggers:
  - `contract_guard`: mapa de transiciones y evidencia.
  - `won_requires_contract`: el bloqueo.
  - `lead_score_apply`.
  - `lead_last_interaction`.
  - `contract_events`.

**Seguridad:**
- RLS: solo owners en todas las tablas nuevas.
- `anon` sin acceso.
- Sellos de autor y versión en cada escritura, con la auditoría existente.

**Por qué los cuestionarios viven en código** (`src/lib/crm/intel/templates.ts`) y no en tablas:
- Cada respuesta guarda la industria y la versión de plantilla.
- Añadir una industria o una versión no cambia la base de datos y se prueba con tests unitarios.
- Una tabla de definiciones sería un segundo lugar que mantener sin beneficio hoy.

## 4. Cuestionarios disponibles

| Industria | Estado |
| --- | --- |
| Cuestionario general (bloques A–F, ~33 preguntas) | Todas las industrias |
| **HVAC / Florida** | Especializado: legalidad (licencia DBPR, seguros), servicios, ingresos (calcula el beneficio bruto si se conocen todos los costos y lo marca como «calculado»), capacidad, conversión y acuerdo con Avalon |
| **Barbería** | Especializado: negocio, ventas, capacidad y marketing |
| **Smoke Shop** | Especializado, con advertencias: operación (categorías, verificación de edad), finanzas, tecnología, marketing y restricciones |
| **Roofing** | Especializado: servicios y clientes, licencias y seguros por revisar manualmente (registrar no es verificar), reclamaciones de seguros (condicional), zonas, cuadrillas, ticket promedio, costos directos, capacidad semanal, quién responde los leads y tiempo de respuesta (condicional), proceso de cotización a contrato y presupuesto de publicidad |
| **Fencing** | Especializado: materiales y tipos de trabajo, medición, permisos/HOA (condicional), cobertura, cuadrillas y equipo, ticket promedio, costo directo, tiempo de cotización, presupuesto de marketing y comisión propuesta para Avalon (condicional, no acordada) |
| Tattoo, Landscaping, Plumbing, Cleaning, Restaurants, Electrical, General Contractors y Other | Especializados (secciones propias en `industry-specializations.ts`) |

## 5. Reglas de calificación (`score-1`)

**Pesos:**

| Categoría | Puntos |
| --- | --- |
| Rentabilidad | 20 |
| Capacidad | 20 |
| Presupuesto | 15 |
| Conversión | 15 |
| Necesidades y encaje | 15 |
| Compromiso | 10 |
| Datos y medición | 5 |
| **Total** | **100** |

**Clasificación:**

| Clase | Puntuación |
| --- | --- |
| A | 80–100 |
| B | 60–79 |
| C | 40–59 |
| D | 0–39 |
| «Datos insuficientes» | Peso conocido por debajo de 60 |

**Reglas:**
- Cada categoría solo puntúa con los datos conocidos. Una respuesta desconocida se excluye y no se cuenta como negativa.
- La rentabilidad usa umbrales por industria: una instalación HVAC y un corte de pelo no son comparables.
- Una capacidad declarada como 0 puntúa 0 y **bloquea** la recomendación de publicidad.
- El riesgo legal es independiente de la puntuación:

| Industria | Bandera | Estado |
| --- | --- | --- |
| HVAC | Licencia sin verificar | `review` |
| HVAC | Licencia inexistente o inválida | `restricted` |
| HVAC | Sin seguros | `review` |
| Smoke Shop | Productos restringidos | `restricted` (nunca se recomiendan Meta ni Google Ads) |
| Smoke Shop | No verifica la edad | `review` |
| Smoke Shop | Pide anuncios pagados | Aviso de revisar las políticas vigentes |

- Las respuestas ocultas por una condición que ya no se cumple no cuentan.
- Cada evaluación se guarda con fecha y versión de reglas; el historial se conserva.

## 6. Trabajo compartido entre Miguel y Samuel

**Lo que ambos ven y cómo queda la autoría:**
- Ambos ven todos los leads de la agencia (RLS de owners).
- Cada lead conserva `owner_id` (responsable), `created_by`, las fechas, la versión y la auditoría de cada cambio.
- Cada respuesta del diagnóstico guarda quién la dio y cuándo.

**Protección frente a ediciones simultáneas:**
- **Datos del lead, condiciones y contratos:** versión optimista. Si el otro guardó antes, aparece «conflicto» y no se sobrescribe nada.
- **Diagnóstico:** fusión por pregunta. Solo se rechaza la pregunta que cambió el otro; el resto se guarda. El conflicto queda en el historial.

**Lo que no hay:**
- No existe sincronización en tiempo real: cada pantalla muestra datos al cargarla y los conflictos se detectan al guardar.
- Filtro «Sin asignar»: no existe porque el CRM exige un responsable en cada lead (`owner_id NOT NULL`). Quick Add asigna por defecto a quien lo crea.

## 7. Bloqueo contractual

| Estado | Requisito para entrar |
| --- | --- |
| Borrador | — |
| Revisión interna | — |
| Enviado a firma | — |
| Firmado · pendiente de verificar | Fecha, firmante y documento privado del mismo lead o referencia externa |
| **Firmado y verificado** | Método de verificación y nota de al menos 15 caracteres. La base de datos registra quién verificó y cuándo, y la evidencia queda congelada |
| Rechazado | — |
| Vencido | — |

Una casilla no es una firma: la aceptación comercial se registra aparte (`accepted_at`) y no habilita nada.

**El bloqueo vive en la base de datos (trigger `crm_leads_won_gate`):**
- Ningún lead **entra** en una etapa de tipo `won` sin un contrato `verified_signed`.
- `crm_confirm_sale` mueve el lead a Ganado, así que una venta desde un lead sin contrato se rechaza **entera** y no crea nada.
- `crm_convert_lead_to_client` exige Ganado, así que hereda la regla.
- Falsificar el estado desde el navegador o con REST directo falla con `contract_transition_invalid`.

**No incluido en esta fase:**
- Generación de contratos legales.
- Firma electrónica avanzada.

Las plantillas no se presentan como documentos legalmente aprobados.

## 8. Pruebas ejecutadas (local, sobre `62204f1`)

| Suite | Resultado |
| --- | --- |
| `tests/crm-intel.test.cjs` (librería) | 12 de 12 |
| `tests/crm-intelligence.database.cjs` (PGlite con todas las migraciones y RLS) | PASS. Escenarios 1–12, 16, 19–25 |
| `tests/crm-intelligence.browser.cjs`: build de producción + puente REST + PGlite + Chromium (escritorio, iPhone 13, iPhone SE, inglés) | PASS. Escenarios 1–3, 6–8, 10–17, 19–20, 25, 28 (ventas), 31, 33 |
| `tests/sales.browser.cjs`, actualizado: comprueba el rechazo sin contrato y el éxito con contrato | PASS en 3 de 4 ejecuciones. La restante falló por un error intermitente de hidratación (#418), ver §10 |
| `npm test` | 437 de 437 |
| 29 suites PGlite | 58 de 58 |
| Lint | 0 errores |
| TypeScript | OK |
| `next build` | OK |

**Mapa de los 33 escenarios del prompt:**
- 1–12: PGlite y E2E.
- 13–18: E2E y librería.
- 19–24: PGlite, E2E y la ruta de descarga privada existente.
- 25: E2E y PGlite.
- 26: la red se cae al guardar. Quick Add conserva los datos (E2E). El diagnóstico guarda una copia de emergencia; la cobertura es de código, sin E2E de red caída.
- 27: E2E de recuperación de datos de Quick Add.
- 28: suites de Radar en verde.
- 29: suites del pipeline en verde.
- 30: TypeScript, lint, pruebas y build.
- 31: iPhone.
- 32: estados de carga y botones deshabilitados durante el guardado. Accesibilidad básica: labels, roles y `role=alert`. **No** se pasó un auditor automático de accesibilidad.
- 33: E2E en inglés.

## 9. Errores encontrados y corregidos

1. **Quick Add perdía lo escrito tras el aviso de duplicado:** React 19 reinicia el formulario después de una acción. Corregido devolviendo los valores.
2. **El formulario de ventas perdía las líneas de servicio y la elección de cliente tras cualquier error del servidor** (defecto preexistente). Corregido remontando el formulario en cada respuesta.
3. **Los campos del cuestionario salían sin estilo en iPhone.** Corregido; además usan 16 px, lo que evita el zoom de iOS.
4. **Una respuesta oculta por una condición seguía puntuando.** Ahora se ignora.

## 10. Bloqueos y pendientes reales

**Preview y producción:**
- **No hay Preview:** los despliegues Preview de Vercel fallan porque el entorno Preview apunta a la base **de producción** y el guard de `next.config.ts` lo impide. Hay que configurar las variables de Preview hacia una base aislada (decisión del owner).
- **La migración no está aplicada en ninguna base real.** Aplicarla en producción requiere aprobación expresa. Antes de aplicarla:

| Aviso | Detalle |
| --- | --- |
| Ventas desde un lead | Ya no podrán cerrarse sin un contrato verificado |
| Leads ya ganados | Siguen como están (el bloqueo actúa solo al **entrar** en Ganado) |

**Defectos y revisiones pendientes:**
- **#418 (hidratación) intermitente** en `sales.browser.cjs`: 1 de 4 ejecuciones. Causa no confirmada (probable texto dependiente de la hora). Pendiente.
- **Revisión jurídica pendiente:**

| Tema | Fuente o alcance |
| --- | --- |
| Licencias HVAC | Florida DBPR |
| Modelos de comisión y referencia por industria | — |
| Publicidad de tabaco y nicotina | Meta y Google Ads |
| Consentimiento de comunicaciones | — |
| Conservación de datos | — |

  No se afirma cumplimiento legal.
- **Tipo B** (consumidores de los clientes): no implementado, por diseño. `crm_leads.audience` impide mezclarlos; la conexión futura irá por Marketing Hub y CRM Creator.

## 11. Enlace de Preview

**No existe**, por el bloqueo del §10.

## 12. Cómo empezar (Miguel y Samuel)

1. Entrar en **CRM → Mesa comercial**.
2. **Quick Add:** escribir el nombre del negocio (y, si se tiene, teléfono e industria) y pulsar **Guardar lead**. Si aparece «Posibles duplicados», abrir el existente o confirmar que es otro negocio.
3. En la ficha (**Deal Review**), pulsar **Diagnóstico**, elegir la industria y responder por secciones. Lo que no se sepa se marca como «No lo sabe». Se puede guardar y seguir otro día.
4. Volver al Deal Review y revisar el **Lead Score**, los avisos legales y las **Recomendaciones** (aceptar, descartar o editar).
5. Después de cada llamada, usar **Después de la llamada**: el resultado y el próximo contacto en un solo paso.
6. Rellenar las **Condiciones comerciales** propuestas y, al cerrar, las acordadas. La comisión acordada requiere marcar «Apruebo personalmente».
7. En **Contrato**:
   1. Iniciar el contrato.
   2. Pasarlo a «Enviado a firma».
   3. Subir el documento firmado o indicar la referencia.
   4. Marcarlo «Firmado · pendiente de verificar».
   5. Verificarlo con el método y la nota.
8. Solo entonces mover el lead a **Ganado** o registrar la venta: el cliente formal se crea con la venta, como hasta ahora.
