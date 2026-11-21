// Closeout V4: the lead record drawer follows the CRM language (EN/ES) instead of hard-coded Spanish.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync('src/components/crm/lead-timeline.tsx', 'utf8');
const crm = fs.readFileSync('src/components/crm/crm.tsx', 'utf8');

test('lead drawer receives the CRM language and translates its actions, tabs and states', () => {
  assert.match(crm, /<LeadTimeline\n\s*lang=\{lang\}/, 'CRM passes its language to the drawer');
  assert.match(src, /lang = "es"/, 'Spanish stays the default');
  for (const [es, en] of [['Editar lead', 'Edit lead'], ['Cerrar historial', 'Close history'], ['Guardar nota', 'Save note'],
    ['Subir archivo', 'Upload file'], ['Registrar venta', 'Record sale'], ['Archivos adjuntos', 'Attachments'], ['Sin historial todavía.', 'No history yet.']])
    assert.ok(src.includes(`t("${es}", "${en}")`), `${es} / ${en}`);
  assert.doesNotMatch(src, /Intl\.(NumberFormat|DateTimeFormat)\("es"/, 'dates and money follow the selected language');
  // No bare Spanish text left between JSX tags.
  assert.doesNotMatch(src, />\s*(Editar|Guardar|Subir|Cargando|Historial|Descargar|Ver|Reintentar)[^<{]*</);
});
