# Avalon Nova — incremento 1

9 nov 2026 · Rama local `codex/avalon-nova-ui`.
Base local: `8a0104d09a160558998416f13f642003aa13d6f2`.
No se consultó GitHub. El main local no se presenta como HEAD remoto actual.
Graphify describe d2890bb, distinto de esta base: se utilizó solo para navegación.

## Entrega

Kit aislado en `src/components/avalon-ui/`:
NovaSurface, StatusBadge, MetricCard, ProgressMeter, EvidenceLink,
FeedbackPanel, ProjectLibrary, NovaDialog y ActivityTimeline.
CSS Module sin dependencias nuevas; ES/EN; movimiento reducido; controles de
44 px; layout adaptable. La biblioteca filtra y busca en props, abre detalles
con callback o enlaces, y presenta progreso desconocido sin convertirlo a cero.
El diálogo usa la modalidad nativa del navegador para foco y Escape.

`nova-demo.tsx` contiene fixtures DEMO y acciones locales; no realiza llamadas.
No hay ruta pública o privada nueva. No se conecta todavía a módulos operativos,
constructores, managers ni datos persistentes. No es otro editor ni un puente.
Las seis bibliotecas y sus constructores permanecen para incrementos posteriores.

## Contratos y seguridad

Los consumidores pasan proyectos, métricas, estados y evidencia mediante props.
`NovaProject.progress=null` significa no medido; valores finitos se acotan a 0–100.
La procedencia y el cálculo del porcentaje corresponden al consumidor.
`running` solo debe proceder de una ejecución real verificada.
Los textos son escapados por React. Enlaces: ruta relativa del mismo origen o
HTTPS sin credenciales; schemes inseguros y URLs protocol-relative se omiten.
El backend debe validar permisos antes de entregar props. Estos componentes
no implementan autorización ni deben recibir secretos o PII no autorizada.
Para cargar CSS y variables, envolver los componentes en NovaSurface.

## Coordinación

Se leyó AGENTS.md y docs/dev-bridge/OWNERSHIP.md. La copia original tiene un
cambio pendiente en office/manager-activity-panel.tsx; se conservó sin tocar.
Se creó un worktree independiente desde main local. Ningún archivo existente,
backend, API, SQL, configuración, puente, Radar u Oficina se modificó.
El estado del PR histórico #141 y los cambios actuales de Claude no están
verificados sin GitHub. Por ello la entrega es aditiva y no se conectó a rutas.
Antes de integrar, Claude debe comparar su copia actual y reutilizar componentes
si ya existe un equivalente. No aplicar cambios de forma ciega.

## Pruebas

- TypeScript: aprobado (incluye los componentes nuevos).
- Lint: aprobado, 0 errores; advertencia existente de next/no-img-element en
  src/components/suite/chrome.tsx.
- Suite existente: 240/240 aprobadas.
- `node --test tests/nova/components.test.cjs`: 4/4 aprobadas: enlaces inseguros,
  escape de texto, progreso desconocido y límites, estados y feedback semántico.
- Browser: intentado, bloqueado por ejecutable Chromium ausente. La instalación
  del navegador devolvió un ZIP vacío/inválido. No hay capturas, validación visual
  de responsive ni Safari físico. No declarar completa la fase móvil.
- Build: ver resultado en BUILD_RESULT.md.

Durante la prueba se creó y retiró una ruta local temporal. Se eliminaron los
archivos .next generados por esa ruta antes del typecheck definitivo.

## Reproducir navegador en entorno con Playwright + Chromium

Montar temporalmente NovaDemo en una ruta de desarrollo local, sin publicarla:
`import NovaDemo from '@/components/avalon-ui/nova-demo';`
`export default function Page(){ return <NovaDemo/>; }`

Ejecutar el servidor local y luego:
`NOVA_TEST_URL=http://127.0.0.1:3059/nova-test node tests/nova/browser.cjs`
Prueba 320/375/390/768/1440 px, overflow, foco/modal/Escape, filtros/búsqueda,
estado vacío, reintento DEMO, cambio EN y movimiento reducido.
Playwright ya existe en este runtime; no se agregó a package.json.
Opcionalmente NOVA_SCREENSHOT indica una ruta para una captura local.
Esta prueba NO sustituye auditoría automatizada completa de accesibilidad.

## Aplicar y revertir sin GitHub

El paquete incluye patch, bundle de la rama y manifiesto SHA-256.
En la copia del receptor, preservar primero cambios propios y comprobar la base.
`git apply --check avalon-nova-ui.patch` valida compatibilidad sin modificar.
Importar el bundle a una rama local de revisión o aplicar el patch una sola vez.
`git fetch /ruta/avalon-nova-ui.bundle codex/avalon-nova-ui:review/avalon-nova-ui`
`git log review/avalon-nova-ui` muestra commits antes de integrar.
Usar cherry-pick del commit documentado si corresponde a su base.
Revertir con `git revert <commit-importado>`; no reescribir ramas compartidas.
Si se aplicó como patch sin commit: `git apply -R --check` antes de revertir.

Validar checksums, tests y contraste móvil antes de conectar a rutas autorizadas.
No hacer merge, publicar producción ni importar automáticamente al Direct Bridge.

## Costos y siguiente incremento

Sin dependencias nuevas, servicios activados, generación de medios o gastos
contratados. Consumo Codex e infraestructura: no medido.
Siguiente: validar navegador; luego adaptar las bibliotecas existentes usando
estos componentes y contratos de Claude, sin reemplazar su persistencia.
