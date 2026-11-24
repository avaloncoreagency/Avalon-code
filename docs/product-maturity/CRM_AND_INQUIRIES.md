# CRM y solicitudes — guía de operación y validación

## Acceso

Con sesión de propietario autorizada, abrir CRM → Solicitudes (`/admin/workspace/crm/inbound`) o CRM → Clientes 360 (`/admin/workspace/crm/clients`). Las correcciones de este PR requieren integración y despliegue aprobados antes de estar disponibles en producción.

## Solicitudes

1. Buscar negocio, contacto o correo y pulsar Buscar. El estado de empresa limita las fichas a pendientes, aprobadas, descartadas o convertidas.
2. Los filtros de mensajes (Por revisar, Posible spam, Repetidos, Revisados) afectan **solo a la página actual**, según indica la interfaz. Un filtro sin coincidencias muestra un mensaje vacío explícito.
3. Expandir Revisión y detalles del mensaje para leer el original y registrar una revisión. La clasificación orientativa no convierte automáticamente nada.
4. Aprobar la revisión de empresa antes de convertir a lead. La conversión conserva los controles existentes de duplicados; no crea una venta ni un cliente.
5. Abrir oportunidad y usar Atrás del navegador para volver a la bandeja. La búsqueda, estado, filtro de mensajes y página quedan en la URL privada y sobreviven a recarga. No se guarda el texto aún sin enviar del buscador.
6. Si falla la red, la bandeja muestra el error y oculta las fichas antiguas. Pulsar Actualizar conserva el contexto. Si se interrumpió una escritura, actualizar antes de repetirla: el servidor podría haberla guardado.

No compartir URLs de la bandeja con personas no autorizadas: pueden contener el término de búsqueda. La URL no concede acceso; las comprobaciones de propietario del servidor permanecen obligatorias. No se escriben credenciales ni datos del mensaje en esos parámetros.

## Clientes y pipeline

En Clientes 360, búsqueda y archivados se conservan al paginar. El directorio mantiene orden estable y distingue los estados vacíos. Volver a la lista desde una ficha requiere el recorrido existente; no se han cambiado acciones de ventas.

En el pipeline, abrir un lead debe anclar su panel arriba, bloquear el scroll del fondo y conservar el punto del Kanban al cerrar. Escape devuelve el foco. Cambiar filtros internos del historial no debe reiniciar su scroll. Se reutiliza el runtime existente; este cambio amplía su prueba, sin editar el componente del lead.

## Evidencia y límites

- La regresión de navegación falló sobre el código previo: `q=Navigation QA` no restauraba el campo de búsqueda. Los errores iniciales de fixture/selectores no cuentan como defectos del producto.
- Nuevas pruebas: `inbound-navigation.browser.cjs` (ES/EN, seis anchos, volver/recargar, filtro vacío, fallo y recuperación GET); `inbound-location.test.cjs` (normalización y límites).
- Directorio y drawer amplían sus escenarios existentes a 320/375/390/430/768/1440. Chromium y touch emulado no certifican Safari físico.
- El workflow CRM ejecuta las regresiones con `CRM_BROWSER=1`; un resultado anterior no certifica el HEAD nuevo. Consultar CI del SHA del PR.
- No se han cambiado API, SQL, RLS, conversión, Sales Center, Quotes, finanzas, Auth ni Staff. No se han enviado mensajes ni activado proveedores.
- Preview alojado y Safari físico: NOT_RUN hasta que exista evidencia separada. Un build local no certifica producción.

## Reproducción y reversión

Tras instalar las dependencias fijadas y ejecutar `npm run build`:

```sh
NODE_PATH=./tests/qa/node_modules CRM_BROWSER=1 \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node --test --test-concurrency=1 tests/client-directory.browser.cjs tests/inbound-navigation.browser.cjs tests/lead-drawer-scroll.browser.cjs
```

En CI se utiliza Chromium instalado por el workflow, sin `CHROME_PATH`. Todos los registros de prueba son sintéticos y la base es PGlite desechable. Revertir el commit de navegación de solicitudes deshace estos cambios sin migraciones ni modificación de registros.
