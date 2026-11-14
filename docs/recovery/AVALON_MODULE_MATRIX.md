# Matriz de módulos y aceptación

14-nov-2026. Pruebas de PostgreSQL usan PGlite y usuarios sintéticos. HTTP ejecuta Next real con Auth/REST simulados. Ninguna fila certifica sesiones remotas reales.

| Módulo | Implementado / recuperado | Prueba ejecutada | Pendiente / bloqueo |
|---|---|---|---|
| Auth | UUID+membresías, cookies, MFA, rate limit, logout | Unitarias + HTTP SSR | Cuentas reales y Safari |
| CRM / Radar | 13 etapas, run_id por búsqueda, aprobación y procedencia #184 | SQL CRM/Radar y 33311→33009 sintético | Geoapify desplegado, sin consumir API en esta ronda |
| Diagnóstico | 13 industrias y merge de respuestas del #174 | Unitarias + SQL + autorización HTTP | Recorrido visual de formulario largo |
| Ventas / Cliente 360° | Totales por moneda del #174, mensajes #182 y enlaces #184 | SQL financiero y ventas HTTP | Aceptación humana y backend remoto por SHA |
| Adjuntos | Panel #180, formato y hash reforzados | Unitarias de formatos y descarga + SQL existente | Upload/preview Safari, Storage/cuentas remotas |
| Calendario / tareas | Calendario existente, edición/completar/reabrir #183 con CAS | Unitarias, SQL y rutas HTTP | Calendario táctil y dos sesiones remotas |
| Product Control | Portafolios #175, referencias, inbox, mantenimiento, filtros | Unitarias, Bridge SQL/service | Preview aislado, entrega externa y conflicto de paquetes |
| Website / Store / CRM Creator | Portafolios y archivos/versiones existentes reutilizados | Bridge/service/restore aislados | UI móvil y publicación autorizada separada |
| Communication Hub | Único Hub, voz/chat separados, cartera canónica | Unitarias y módulos SQL | Motores externos no activados; nunca llamadas ficticias |
| Marketing / Funnels | Contratos de consentimiento y captación actuales | SQL de funnels y B2C; HTTP público parcial | Navegador no completa envío; Ads apagado |
| Lead Router | Regla de receptor único, ledger B2C existente | `commercial-b2c.database` | Flujo público y revisión legal antes de captación real |
| Dev Bridge / HQ | #181 limita enlaces y datos de proveedores, preserva HQ único | 28 pruebas Bridge + unitarias | Preview/UI; managers y automatizaciones apagados |
| Code Exchange / Direct Bridge | Código y contratos existentes, versionado y recibos | SQL Code Exchange/Bridge; recibo corregido | No reactivar permisos anon ni publicar mainline |

Los seis avisos anon SECURITY DEFINER y 38 authenticated fueron consultados en Advisors. Son superficie a revisar por función; su cantidad no demuestra vulnerabilidad. RLS sin policy en finance_access y worker_config conserva denegación directa intencional. pg_net en public queda pendiente de mantenimiento; no se movió.
