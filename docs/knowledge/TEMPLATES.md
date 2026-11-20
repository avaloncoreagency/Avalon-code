# Plantillas reutilizables de Knowledge & Innovation

**ID:** KNI-TPL-001 · **Versión:** v0.2 · **Custodio propuesto:** Knowledge & Innovation.
**Solidez:** PROPUESTO · **Vigencia:** POR REVISAR · **Aprobación:** BORRADOR · **Clasificación:** PUBLICABLE · **Última revisión:** 2026-11-20.

Estas plantillas son **documentación**, no órdenes ejecutables, contratos aprobados ni sustitutos de revisión por propietarios. Rellenar únicamente con datos autorizados en el sistema de clasificación correspondiente. **No introducir información confidencial en un repositorio público.**

## 1. Registro de decisión (KDEC / ADR)

```markdown
# [ID] — Título descriptivo
- Departamento y custodio:
- Fecha / zona horaria:
- Solidez: PROPUESTO
- Vigencia: POR REVISAR
- Aprobación: BORRADOR
- Clasificación: INTERNO (guardar fuera del repo público si contiene detalles restringidos)
- Fuentes primarias (enlaces seguros, fecha y commit SHA si aplica):
## Problema
## Alternativas evaluadas, incluida no cambiar nada
## Recomendación y justificación
## Costos, riesgos y reversibilidad
## Decisión exacta y alcance (solo completar tras aprobación)
## Aprobador(es), fecha y evidencia explícita
## Dependencias, verificación y próximo evento de revisión
## Sustituye a / sustituido por
```

## 2. Procedimiento operativo (SOP)

```markdown
# SOP-AREA-NNN — Acción y resultado esperado
- Custodio / versión / revisión:
- Solidez / vigencia / aprobación:
- Alcance y quién está autorizado:
- Prerrequisitos y fuentes:
## Disparador
## Pasos numerados (quién hace qué)
## Datos de entrada / salida
## Verificación y criterios de aceptación
## Excepciones, escalamiento y rollback
## Medidas de seguridad y privacidad
## Referencias y cambios de versión
```

**Ejemplo de aceptación:** “La ficha sintética se guarda y vuelve a abrirse en un entorno aislado con dos usuarios de prueba autorizados; usuario no autorizado no ve información.” No declarar PASS sin registro de prueba.

## 3. Registro de investigación o alternativa tecnológica

```markdown
# RES-AREA-NNN — Pregunta concreta
- Investigador / fecha:
- Caso de uso y situación actual:
- Clasificación / límites de datos:
## Hipótesis y criterios
## Evidencias oficiales (URL, fecha consultada, alcance)
## Alternativa A / B / no adoptar
## Seguridad, cuotas, licencias y costo no medido
## Capacidad de reversión / portabilidad
## Prueba mínima segura propuesta (sin realizar)
## Recomendación (PROPUESTA)
## Aprobación y siguiente revisión (PENDIENTE)
```

Si precio, capacidad o normativa dependen del proveedor, consultar fuente oficial actualizada antes de decidir. Una cuota “gratis” no autoriza utilizarla para usos comerciales.

## 4. Incidente y lección aprendida

```markdown
# INC-AREA-NNN — Síntoma y contexto
- Fecha / gravedad / responsable:
- Entorno / SHA / versión:
- Estado: PENDIENTE o VERIFICADO según evidencia
- Clasificación: restringida si contiene datos operativos
## Síntomas observados (sin secretos)
## Reproducción autorizada y evidencia
## Impacto confirmado vs impacto estimado
## Causa raíz (DESCONOCIDO hasta probar)
## Contención y autorización requerida
## Corrección propuesta / PR / tests
## Verificación independiente / rollback
## Qué aprendizaje se incorpora al SOP
## Acciones preventivas, custodio y fecha de revisión
```

Un ticket o log de cliente debe guardarse en un sistema privado, no en GitHub público. Registrar solo un resumen sanitizado y referencia segura.

## 5. Handoff mínimo a PROJECT MANAGER

```markdown
# HANDOFF — KNI-XXX
- Objetivo / alcance:
- Base revisada: main@SHA / fecha / herramientas usadas
- Estado: VERIFICADO / PROPUESTO / PENDIENTE / DESCONOCIDO
- Vigencia de fuentes:
- Cambios reales: rutas, issue y PR
- Evidencia: tests corridos, resultado y entorno
- Pruebas NO ejecutadas:
- Bloqueos, dependencias y riesgos:
- Decisiones reservadas a Miguel y Samuel:
- Siguientes tres acciones, con responsables:
- Next action: [una sola acción reproducible]
```

El handoff no sincroniza por sí mismo otros chats ni concede acceso a otro agente. Debe entregarse explícitamente al coordinador autorizado.

## Controles antes de reutilizar cualquier plantilla

- ¿Existe una versión canónica previa? No crear duplicado.
- ¿Se ha redactado para audiencia pública o privada correcta?
- ¿La fuente tiene fecha, enlace y alcance de verificación?
- ¿Los propietarios aprobaron **esta** decisión o solamente una propuesta de PR?
- ¿Está separado el estado documentado del estado ejecutado y del estado desplegado?
- ¿Se indican incertidumbre, responsable y próximo paso concreto?
