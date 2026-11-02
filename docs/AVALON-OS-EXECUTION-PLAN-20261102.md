# Avalon OS — plan de ejecución

## Objetivo
Integrar el trabajo existente de Avalon Core Agency sin duplicar módulos ni consumir créditos de Codex. Rama de trabajo: `integration/avalon-os-reconciliation-20261102`. No desplegar a producción antes de pasar pruebas.

## Orden y criterios de aceptación

1. **Login y seguridad**: dos propietarios autorizados; acceso email/contraseña y recuperación; invitaciones privadas; Google opcional; protección SSR y API, RLS, cierre de registro público. Verificar con cuentas reales en Preview.
2. **HUD principal**: menú lateral, acceso directo por sesión a perfil propio, seis módulos (CRM, Website Designer, E-commerce Designer, CRM Creator, AI Receptionist, Marketing Hub). Estados vacíos veraces donde falte backend.
3. **CRM único**: Leads y pipeline Kanban por etapas, actividades e historial, KPIs, calendario, Lead Hunter y medidores de IA. No crear otro CRM.
4. **Lead Hunter**: adquisición solo desde fuentes autorizadas, deduplicación, puntuación explicable, revisión humana, aprobación y conversión idempotente a lead; respetar límites, privacidad y términos de fuentes. No declarar radar automático activo hasta conectar proveedor.
5. **Tareas internas**: asignación a Miguel/Samuel, prioridad, fecha límite, estado, notas y vínculo a lead/proyecto. Separadas de las actualizaciones técnicas del sitio y del sistema de alertas de infraestructura.
6. **Módulos restantes**: catálogo de webs y tiendas de clientes, herramientas de edición con permisos, CRM Creator, recepción IA y Marketing Hub. Conectar entidades al CRM por ID y permisos, sin fabricar integraciones.
7. **Consumo y notificaciones**: consumo real solo con APIs autorizadas; etiquetar manual vs automático; avisos urgentes y normales con fuente, marca temporal y estado de lectura.
8. **Verificación**: lint, typecheck, build, tests, migraciones Supabase y RLS en staging, pruebas de acceso, flujos de conversión, respaldo y rollback. Publicar Preview y revisar antes de producción.

## Restricciones
No introducir secretos en GitHub; no suponer que un proveedor está conectado; no prometer gasto de tokens en tiempo real sin fuente; mantener costos bajos; conservar el sitio público y datos de clientes. Cualquier migración de producción requiere respaldo, revisión y verificación.

## Estado
Plan documentado. La existencia de código no demuestra que esté desplegado ni probado. Registrar en cada PR cambios, resultados de CI, bloqueos y enlaces de Preview.
