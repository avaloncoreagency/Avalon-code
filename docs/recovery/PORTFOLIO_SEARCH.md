# Portfolio search — 19 noviembre 2026

Refs #23. Main 5f99d05; rama independiente. No portal #233, contratos/Quoting Studio ni cambios de proveedores.

Problema reproducible: búsqueda de CompanyPortfolio solo filtra los 50 proyectos cargados; un proyecto en otra página no puede encontrarse desde ese control. Las tarjetas de estadísticas también deben indicar que sus cifras corresponden a una página.

Cambio: búsqueda global por **nombre de producto** y estado aplicados al query owner/RLS existente, antes de paginar. Websites, E-commerce, CRM Creator y Marketing conservan módulo y client_id canónico; 50 por página, count exacto, orden estable, q/status preservados en navegación. El filtro local por empresa/producto se mantiene y se etiqueta expresamente como filtro de esta página; no se finge una búsqueda global de nombres de empresa. No hay consultas por pulsación, endpoint nuevo ni carga de miles de registros en navegador. Las tarjetas locales indican su alcance y el recuento servidor indica productos coincidentes.

Compatibilidad: callers históricos de listProjects siguen limitados a 100 cuando no optan por página; estatus inválido no amplía acceso; archivados requieren estado explícito o selector histórico. No cambia registro de borradores, asociaciones o URLs, ni dispara publicación. ILIKE no altera autorización; caracteres %/_/backslash se escapan; sin índice nuevo ni claim de latencia mejorada. Rendimiento hosted/costes: no medido.

Verificación local: TypeScript, 689 unitarias, 22 pruebas focales de búsqueda/scoping/Product Control, lint sin errores y build. Browser preparado ES390/EN1440: 101 proyectos delante de Needle, búsqueda lo encuentra y excluye otro módulo, filtro archivado, recuento y no overflow. CI exacto por SHA debe aprobar antes de aceptación; no Safari físico.

Next action: Codex confirma E2E/CI y propietarios revisan. No fusionar ni desplegar producción desde esta misión.
