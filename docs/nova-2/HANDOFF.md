# Avalon Nova 2 — tres constructores frontend

9 noviembre 2026. Base: d948066e47f61036e6cb9e1345a36ea48f081a7d.
Rama local: codex/avalon-nova-2-builders. Sin operaciones Git remotas.

## Implementado

Componentes exportados en src/components/avalon-ui/builders/product-builders.tsx:
WebsiteDesignerUI, ChatbotsBuilderUI y CrmCreatorUI. Props: lang, initialProjects,
loading, error, onRetry, onHandoff opcional. Mantener el tipo de producto estable
por instancia o usar key por producto. initialProjects se copia al montar;
reconciliar actualizaciones externas en el adaptador, no sobrescribir borradores.

Cada producto tiene biblioteca con búsqueda/filtros, crear borrador, selector de
plantillas, detalles/editor, guardar snapshot local y restaurar versiones (máx.30).
Los snapshots son inmutables. Edición, guardado y restauración usan projectReducer.
Al recargar se pierde la sesión. No se implementó localStorage ni persistencia remota.
La biblioteca hereda filtros del kit Nova; completed significa snapshot local
completado en esta interfaz, no publicación ni finalización de una venta.

Website: páginas, bloques existentes hero/text/features/cta, propiedades, agregar,
quitar y reordenar bloques, navegación entre páginas y tamaños desktop/tablet/mobile.
Se inspeccionó el editor operativo existente, sus acciones y preview. Se reutilizan
Block, emptyBlock, moveItem y validateBlocks del dominio existente. El nuevo panel
es una presentación local del mismo esquema, no reemplaza el editor operativo ni
sus acciones. La vista previa muestra texto escapado; las CTA son representaciones
visuales sin navegación para evitar salir accidentalmente del borrador.

Chatbots: nombre común de proyecto, descripción, instrucciones, personalidad,
bienvenida, color y entradas de conocimiento editables. Preview inmediato de la
bienvenida y apariencia; entrada y envío desactivados. No hay inferencia ni llamadas.
Consumo no medido y despliegue no conectado. El estado de proyecto permanece local.

CRM: Blueprint existente, pipeline personalizado con etapas editables/reordenables,
campos personalizados, selector de tipos, borrar campos/etapas, tema, módulos,
Kanban vacío y tabla del esquema, permiso de rol de plantilla. Editor focalizado en
primera entidad/pipeline; conserva entidades/pipelines adicionales recibidos pero
no ofrece editarlos aún. Los tipos select importados requieren un editor de opciones
posterior; creación nueva ofrece los otros tipos soportados. Permisos son diseño,
no autorización real. Nunca cambia las 13 etapas del CRM principal.

## Contratos y conexión de Claude

contracts.ts define Project, ProjectVersion, BuilderTemplate, BuilderDraft,
ProjectAsset, BuilderStatus, ValidationResult y BuilderHandoff. Block y Blueprint
son tipos importados del dominio actual, no esquemas paralelos de BD.
Project es un envelope de UI, no sustituye ProjectRow del backend. Mapear IDs reales
y relaciones en el adaptador autorizado cuando exista contrato. Chatbot tiene kind
propio de UI, sin añadir un ModuleKey falso al backend existente.

onHandoff recibe una copia de un borrador validado. Su retorno no se interpreta como
guardado remoto; el componente indica únicamente que invocó el callback. Un error
síncrono muestra mensaje y conserva estado. No usar callback async para simular un
resultado remoto: añadir un adaptador controlado con resultado/estado explícitos
cuando Claude entregue el contrato. Publicar siempre está desactivado.

No hay endpoints, tablas, buckets, autenticación, secretos o dependencias nuevas.
Los componentes se montarán solo dentro de rutas ya autorizadas por el servidor.
Validación cliente es ayuda de UX, no reemplaza validar y autorizar en backend.
No enviar claves ni PII a props. No renderizar contenido importado como HTML.
Los assets son referencias tipadas y no se descargan ni muestran automáticamente.

DEMO: builders-demo.tsx permite cambiar entre los tres productos y editar proyectos
vacíos; etiqueta visible DEMO. No inventa clientes, facturación ni conversaciones.
Al cambiar producto en esa demo se reinicia la instancia; no es workspace persistente.
No se añadió ruta al admin ni al sitio público.

## Pruebas realmente ejecutadas

- npm run typecheck: aprobado.
- npm run lint: aprobado; 0 errores, advertencia preexistente img en suite/chrome.tsx.
- npm test: 240/240 aprobadas.
- node --test tests/nova/*.test.cjs: 18/18 aprobadas (4 Nova1 + 14 Nova2).
- Modelo: crear/editar/guardar/restaurar por cada producto, snapshots independientes,
  plantillas, validación de bloques/enlaces y Blueprint, configuración chatbot,
  claves duplicadas y guardados inválidos.
- Render React SSR: tres bibliotecas, loading/error, escape de texto, controles de
  preview Website, chatbot sin envío real y permisos CRM solo de diseño.
- npm run build: ver VALIDATION.md. Al no montar estos componentes en rutas, el build
  general verifica el árbol existente; TypeScript y SSR cubren el código nuevo.
- Browser: intentado con tests/nova/builders-browser.cjs; launch falla por falta de
  Chromium. No se repitió descarga que ya había devuelto ZIP inválido en Nova1.
  Sin E2E aprobado ni capturas. Las interacciones se verificaron en modelo, no por
  eventos DOM en un navegador. No hay Safari físico ni medidas de rendimiento.

## Móvil y accesibilidad

CSS con columnas adaptables, controles de 44px, paneles que se ajustan al ancho y
scroll interno en tabla, labels asociados por nesting, focus visible y estados
semánticos heredados. Preview tablet/mobile se limita al ancho disponible, no emula
el motor de Safari. No se añadieron animaciones; Nova1 respeta reduced-motion.
Contraste y disposición renderizada están pendientes; no se declara fase móvil
completa. Probar 320/375/390/768/1440px, teclado, modal, controles y tabla real.

Para navegador: montar BuildersDemo temporalmente solo en desarrollo autorizado,
arrancar servidor local y ejecutar NOVA_TEST_URL=<url> node tests/nova/builders-browser.cjs.
La suite tiene casos de editar, guardar/restaurar, preview y overflow en cinco anchos.
Playwright existe en el runtime, no se agregó a dependencias de la aplicación.

## Integración y conflictos

Solo archivos nuevos en builders/, tests/nova/ y docs/nova-2/. No se tocó el backend,
Direct Bridge, SQL, Auth, Oficina, Radar ni producción. La copia original con cambios
pendientes de Oficina sigue intacta. Los archivos vigentes de Claude/#141 no están
verificados; comparar antes de integrar para evitar duplicar paneles más recientes.

El paquete contiene fuente completa Nova1+Nova2, patch incremental desde d948066,
patch acumulativo desde 8a0104d y bundle acumulativo de las dos ramas/commits de Nova.
El bundle incremental requiere 8a0104d09a160558998416f13f642003aa13d6f2 en el receptor.
SHA256SUMS cubre todos los archivos del paquete.

Aplicar una sola variante: git apply --check nova2.patch sobre Nova1, o revisar el
acumulativo si no tiene Nova1. git bundle verify avalon-nova.bundle antes de fetch
local. Importar a rama de revisión, comparar y ejecutar tests. Revertir el commit
importado con git revert. No hacer push, merge o publicación automática.

Siguiente: navegador y contraste, luego revisión de adaptadores/persistencia de
Claude. Falta conectar datos reales, versiones remotas, publicación e inferencia.
Sin servicios nuevos ni cargos contratados; consumo de Codex/infra: no medido.
