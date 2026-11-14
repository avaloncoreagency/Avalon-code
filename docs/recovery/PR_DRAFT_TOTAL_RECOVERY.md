# DRAFT: candidato de recuperación — CRM, Product Control y garantías de integridad

Refs #23. Reúne sin alterar sus ramas las puntas #175/#181–#184 y corrige defectos reproducidos en adjuntos, mantenimiento, identidad canónica y recibos de Bridge. No fusionar hasta pasar aceptación aislada y revisión de las PR fuente.

Pruebas locales: 565 unitarias, 28 Dev Bridge, 63 PostgreSQL existentes más dos nuevas; Auth/ventas HTTP y autorización CRM HTTP. TypeScript/lint/build pasan; cinco avisos de lint previos. ZIP/Storage usa dobles donde se indica. Navegador móvil/Safari y sesiones remotas pendientes. CI nuevo no ejecutado.

La migración de categorías se conserva de #175; no se aplicó en producción y la bandera sigue cerrada por defecto. La propuesta de revocación anon para restore es review-only. Managers y campañas permanecen apagados. Sin assets generados ni proveedores nuevos. Costes/rendimiento: no medidos.

Riesgos: integración de cinco PR, gate Preview, diferencias de catálogo/ACL, concurrencia de paquetes y aceptación remota. Rollback de aplicación conserva versiones/Storage. Ver docs/recovery/AVALON_FINAL_REPORT.md.
