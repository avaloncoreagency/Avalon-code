# Bandeja entrante — 19 noviembre 2026

Refs #23 y #47. Rama independiente desde main 53e5436. No modifica portal #233 ni archivos reclamados por Quoting Studio #248 (incluida navegación compartida). Acceso desde Mesa comercial; enlace adicional en navegación queda para coordinación con Claude.

Ruta `/admin/workspace/crm/inbound`, owner-only, ES/EN. Usa CRM API y RPC de conversión existentes. Lista empresas que tienen recibos reales en `crm_public_inquiries` mediante inner FK; no solo `source_kind=web_form`, pues una solicitud puede reutilizar un prospecto de Radar. Excluye descubrimientos sin solicitud. Búsqueda/estado/páginas de 50 y recuento exacto aplicados en servidor. Las solicitudes se agrupan por empresa y comparten su revisión; no se inventa estado de lectura por mensaje.

Aprobar/descartar usa actualización con versión existente; conflicto 409 conserva la fila y exige refrescar. Convertir mantiene autorización/RLS, aprobación previa, detección de duplicados y conversión idempotente. Vincular duplicado requiere acción explícita y el servidor calcula el destino. No hay venta, cliente ni consulta externa automática. Errores de red no adelantan estado; advertencia de confirmación ambigua evita reintentos ciegos.

Baseline main: npm ci, 675 unitarias, typecheck, lint (0 errores/2 avisos existentes), build aprobados. 22 pruebas SQL focales (inquiry, Project Bridge, service/receipt, AI gates, CRM flow, ventas) pasaron. 41 regresiones locales de adjuntos/finanzas/Bridge/filtros pasaron. Nuevo filtro API tiene cuatro pruebas ejecutables. HTTP Sales/owner routes pasó en app real contra PGlite/RLS, sin navegador.

Browser E2E preparado dentro de Sales existente: dos sesiones sintéticas, consulta que reutiliza prospecto licensed, exclusión Radar sin recibo, revisión concurrente, conversión/replay, pérdida de red, ES320/EN1440 y capturas. El bridge de pruebas emula !inner mediante FK real y RLS; no se sustituye por datos fijos. Estado browser depende de CI; no afirmar Safari/iPhone físico.

No SQL remoto, permisos, datos reales, publicación o cambios de precio. Estado: IMPLEMENTED — NOT FULLY VERIFIED hasta CI/Preview. La bandeja no certifica aceptación hosted por Miguel/Samuel ni notificaciones de cada reconsulta después de conversión.

Next action: Codex verifica CI y captura sintética; Claude incorpora enlace a su navegación sin sobrescribir sus cambios. Propietarios revisan antes de integrar/publicar.

Primer E2E nuevo: el seed sintético falló con 42501 `CRM forbidden` porque el formulario público anterior había restaurado correctamente el JWT anónimo; `reset role` no proporciona identidad para los triggers. Se corrige exclusivamente el seed: transacción con subject del owner sintético aprobado. No se relajan permisos, RLS o aserciones de la aplicación. Las acciones de navegador continúan usando las dos sesiones separadas.
