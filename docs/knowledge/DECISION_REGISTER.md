# Registro inicial de decisiones y directrices

**Estado del registro:** PROPUESTO, pendiente de ratificación. **Última revisión:** 2026-11-20. Los siguientes son **extractos de instrucciones o pruebas documentales**, no un acta de aprobación conjunta ni un estado de despliegue.

| ID | Directriz / conclusión | Fuente | Solidez | Vigencia y aprobación |
| --- | --- | --- | --- | --- |
| KDEC-001 | Avalon OS gestiona productos externos y evita recrear constructores; el módulo operativo de productos es diferente de este índice documental. | [Control de producto](../PRODUCT_CONTROL_RELEASE.md) y [handoff histórico](../handoff/CHATGPT_COORDINATION.md) | Documentado; implementación específica por verificar | POR REVISAR; ratificación de owners PENDIENTE |
| KDEC-002 | Las entregas requieren versión, cliente canónico y evidencia; registrar producto no significa venta o despliegue exitoso. | [Dev Bridge](../dev-bridge/COOPERATION.md), [Product Bridge](../project-bridge/) | Directriz VERIFICADA como texto, estado operativo DESCONOCIDO | VIGENCIA por confirmar |
| KDEC-003 | Los informes deben registrar SHA exacto; CI, Preview, navegador y producción son verificaciones diferentes. | [Cooperación](../dev-bridge/COOPERATION.md) | VERIFICADO documentalmente | VIGENTE como instrucción técnica |
| KDEC-004 | Mantener Radar suspendido; una futura reactivación necesita autorización expresa. | [Plan de reactivación](../radar/RADAR_REACTIVATION_PLAN.md) y [PR #262](https://github.com/avaloncoreagency/Avalon-code/pull/262) | PR fusionado, código de hibernación documentado; ejecución remota DESCONOCIDA en esta revisión | POR REVISAR en producción; restricción vigente comunicada |
| KDEC-005 | El portal de empleados queda fuera del alcance de esta rama; la coordinación del proyecto lo atribuye a Samuel. | [PR Draft #233](https://github.com/avaloncoreagency/Avalon-code/pull/233) y coordinación actual de los propietarios | Fuera de alcance VERIFICADO por instrucción; PR #233 no acredita despliegue | VIGENTE como restricción hasta nueva asignación |
| KDEC-006 | Recepcionistas y chatbots comerciales no se activan; OpenRouter no se utiliza. | Instrucciones vigentes del proyecto (sin evidencia de aprobación almacenada en este repositorio) | VERIFICADO como instrucción del proyecto; no como estado remoto | VIGENTE hasta instrucción posterior |
| KDEC-007 | Elegir Google Drive como custodia empresarial principal y GitHub como índice técnico con enlaces. | [Propuesta Knowledge](./README.md) | PROPUESTO | BORRADOR, no aprobado |

## Entrada modelo

```text
ID: KDEC-NNN
Título:
Situación: VERIFICADO / PROPUESTO / PENDIENTE / DESCONOCIDO
Vigencia: VIGENTE / HISTÓRICO / SUSTITUIDO / REVOCADO / POR REVISAR
Aprobación: BORRADOR / EN REVISIÓN / APROBADO / RECHAZADO
Contexto y alternativas:
Decisión textual:
Alcance afectado:
Aprobador(es), fecha y evidencia (si no existen: PENDIENTE):
Fuente primaria / SHA / entorno:
Consecuencias / riesgos / reversibilidad:
Responsable de ejecutar / verificar:
Sustituye a / sustituido por:
Próxima revisión:
```

## Regla de actualización

No marcar `APROBADO` porque alguien haya redactado un prompt, aprobado una PR técnica o mencionado algo en una conversación. La autoridad y el objeto de la aprobación deben quedar explícitos. Cuando un documento anterior contradiga una instrucción posterior, conservar ambos, indicar fecha y elevar al PROJECT MANAGER la necesidad de ratificación en vez de editar retroactivamente el historial.
