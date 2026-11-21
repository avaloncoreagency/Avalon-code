# Quality gates APS v1 (propuestos)
**Estado inicial:** todos los casos PENDIENTES; un checklist no es prueba ejecutada.
**Severidad:** P0 pérdida de datos/seguridad/cobro indebido/caída crítica; P1 flujo clave bloqueado; P2 defecto relevante con alternativa; P3 cosmético.

| ID | Superficie | Caso y salida esperada | Evidencia mínima | Gate |
| --- | --- | --- | --- | --- |
| Q01 | iPhone | 320/375/390/430 px CSS, vertical/horizontal, sin overflow | captura + device + ruta + SHA | P1 |
| Q02 | iPhone | teclado visible, safe-area, CTA y controles táctiles utilizables | vídeo/captura de Safari real | P1 |
| Q03 | Accesibilidad | teclado, VoiceOver, focus, zoom, contraste, reduced motion | pasos manuales + resultados | P1 |
| Q04 | Website | enlaces, canonical, robots, sitemap, contenido móvil equivalente | URLs + revisión | P2 |
| Q05 | Formulario | válido/inválido/reintento/duplicado; recepción confirmada | recibo sintético/redactado + servidor | P0 |
| Q06 | E-commerce | variante, precio, inventario, impuestos/envío, checkout sandbox | recibo de sandbox sin PII | P0 |
| Q07 | CRM | lead/cliente/venta/producto distinguidos; edición sin duplicados | IDs sintéticos + assertions | P0 |
| Q08 | Multi-tenant | usuario B no puede leer/modificar entidad A ni por API | tests negativos con roles separados | P0 |
| Q09 | Producto Avalon | URL vs instalación, ZIP pendiente vs publicado, versión, vínculo Client 360 | evidencia UI/API owner autorizada | P0 |
| Q10 | Rendimiento | LCP/INP/CLS cuando existan datos de campo; lab diferenciado | reporte fechado, red/equipo | P1 |
| Q11 | Seguridad | secrets, permisos, validación servidor, RLS y restricciones de archivos | resultados de security QA | P0 |
| Q12 | Entrega | licencias, accesos, dominio, backups, soporte, aceptación y rollback | acta + responsables | P1 |

## Procedimiento
1. Fijar SHA completo, PR, Issue, URL de entorno autorizado y proyecto ficticio/anonimizado.
2. Ejecutar checks automáticos `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` cuando esté disponible el worktree. Registrar resultados reales; CI de otro SHA no cuenta.
3. Navegador sintético no acredita Safari físico. Para iPhone indicar modelo, versión iOS/Safari, pasos, captura y si se utilizó dispositivo real.
4. Verificar permisos negativos (Auth/RLS/IDOR) en staging aislado, sin datos reales; no eludir la puerta que bloquea Preview conectado a Supabase productivo.
5. Comprobar ownership de dominio, URL externa y contratos sin copiar secretos al issue público.
6. Crear ticket con reproducción, expected/actual, severidad, owner y evidencia; corregir en PR separado si pertenece a otra rama.
7. Aprobar solo con P0/P1 en cero, excepciones P2/P3 registradas y autorización comercial/técnica. QA automático, hospedaje READY y deploy no equivalen a aceptación funcional.

## Registro de resultados
| Caso | Estado | SHA | Entorno/dispositivo | Evidencia | Responsable |
| --- | --- | --- | --- | --- | --- |
| Q01–Q12 | PENDIENTE | SIN EJECUTAR | SIN EJECUTAR | Ninguna | Por asignar |

Para matrices existentes usar [QA independiente](../independent-qa/REPORT.md) y [runbook multicliente](../independent-qa/MULTICLIENT_RUNBOOK.md). No duplicar suites de Codex ni la rama #233 de Samuel.
