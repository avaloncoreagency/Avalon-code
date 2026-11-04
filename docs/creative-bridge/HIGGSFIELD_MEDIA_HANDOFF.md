# Higgsfield → Avalon: entrega verificable de medios, sin generar créditos

**Estado:** mejora en PR apilado sobre #112 → #87. No está publicada en el dominio de Avalon.

## Objetivo
Tomar un recurso **ya completado** en el workspace autorizado de Higgsfield, descargarlo por un medio legítimo y registrarlo en Avalon de forma duradera. No se llama a la API Higgsfield desde Next.js ni se presupone que la conexión de ChatGPT exista dentro de Vercel.

### Pasos del propietario, Codex o Claude

1. En Higgsfield, comprobar que el trabajo está **completado**; copiar el ID real del trabajo y conservar la prueba de licencia/uso para el cliente. No copiar aquí una URL temporal firmada, tokens ni secretos. Descargar el PNG/JPEG/WebP o MP4 a un archivo local privado. No gastar créditos nuevos.
2. Preparar un checkpoint privado **fuera del Git público** según `docs/creative-bridge/CONTINUITY.md`, con una entrada `assets[]`:
   `{ "id": "hero", "kind": "image", "alt": "Descripción accesible", "state": "pending", "job_ref": null, "storage_ref": null, "sha256": null, "reduced_motion_ref": null }`
   La entrega debe vincularse a la biblioteca adecuada: Website Designer, E-commerce o CRM Creator. No inventar clientes o ventas.
3. Una vez que el propietario **apruebe explícitamente el uso público** de los bytes, importar desde una copia local:

```bash
node scripts/creative-bridge/import-asset.cjs /private/checkpoint.json hero /private/hero.png --approve-public-use --higgsfield-job=IDENTIFICADOR_REAL_DEL_TRABAJO
```

El último argumento es opcional para archivos **locales que no provienen de Higgsfield**. El ID indicado lo proporciona el operador; el importador **no verifica a distancia que ese ID exista o esté completado**. No afirmar que la generación se verificó remotamente hasta cotejar el ID en el workspace propietario.

4. El importador compara tamaño/tipo/estructura mínima, evita symlinks de entrada, calcula SHA-256 de los bytes y copia a `public/creative-bridge/<sha256>.<ext>` sin sobrescribir archivos existentes. Si el checkpoint ya dice `ready`, **volverá a leer el archivo publicado** y rechazará una copia ausente, alterada o con otra referencia de trabajo.
5. Revisar `git status`, el manifiesto privado y los **bytes reales** del nuevo archivo; luego crear PR independiente con solo el medio aprobado y su integración en la ruta Next.js correspondiente. La página protegida `/admin/creative-bridge` y el enlace desde Marketing Hub facilitan localizar productos y medios; por sí solos **no publican el recurso**.
6. Aceptación final: CI del SHA exacto, Preview aislada con login owner, captura de escritorio y 390px, licencia/alt/reduced-motion y aprobación del propietario. Un hash coincidente **solo prueba integridad local**, no derechos comerciales, origen Higgsfield remoto ni aprobación de producción.

### Restricciones

- Archivos permitidos: PNG/JPEG/WebP/MP4 con estructura básica reconocible, tamaño máximo 12 MiB. Los MP4 necesitan una **imagen de respaldo ya aprobada** y visible en el checkpoint; para videos mayores se necesita una estrategia de almacenamiento aprobada aparte.
- No se permite SVG/HTML, fuentes, archivos enlazados simbólicamente, archivos mutilados ni copias con hash distinto.
- El importador no elimina ni cambia contenido existente cuando falla; cada intento deja un código de error no cero.
- Los paths privados, ID de generación y datos del cliente se conservan fuera del repositorio público salvo que haya aprobación explícita para compartir metadatos.
- Sin tokens Higgsfield en Vercel, sin costos nuevos, sin automatización de generación ni descargas directas de URL temporales.
