# Avalon Ultimate 2.0 · The Business Growth Experience

Público: `avaloncoreagency.com` (homepage). Solo frontend público: no toca `/admin`, Auth, RLS, migraciones, tablas ni finanzas internas.
Todas las demostraciones usan datos sintéticos en memoria del navegador; no se envía nada a Supabase ni a ningún proveedor.

## 1. Arquitectura de la experiencia

| Orden | Sección (`id`) | Componente | Qué hace |
|---|---|---|---|
| 1–2 | Intro «El Despegue» (`#avalon-intro`) | `growth/intro.tsx` | Túnel Higgsfield (luces que se encienden → aceleración ×2.2 → luz dorada) → nace el logotipo auténtico en metal → iris que abre la homepage. ≈4.5 s, una vez por sesión, botón «Omitir intro», Esc/scroll/toque la cierran. Sin intro con *reduced motion*; póster estático con *data saver*/2G; *failsafe* CSS si no hay JavaScript. |
| 3 | Hero | `app/page.tsx` + `universe/copy.ts` | «Más clientes. Más trabajo. Más crecimiento.» CTAs → `#arbol` y `#demos`. El núcleo WebGL de la Ignición sigue como fondo vivo y se vela bajo el contenido. |
| 4 | Árbol del crecimiento (`#arbol`) | `growth/tree.tsx` | Minijuego: semilla → riego (agua real en canvas) → tronco que crece → 6 multiplicadores → frutos (brote → joven → maduro) → cosecha con gravedad y rebotes → partículas doradas → moneda `$` → ingresos simulados → reinicio. |
| 5 | Selector de industria (`#industria`) | `growth/demos/shared.tsx` | Barbería, Roofing, HVAC, Dental, Restaurante, E-commerce, Otro. Re-siembra todas las demos con clientes, servicios y necesidades del sector. Fondo: Ignición (Higgsfield). |
| 6 | Showroom (`#demos`) | `growth/demos/*.tsx` | 6 demos funcionales en pestañas (teclado ←/→). Cada una termina en «Quiero esto para mi negocio» → cotización con servicios preseleccionados. |
| 7 | Recorrido integrado (`#recorrido`) | `growth/demos/journey.tsx` | Anuncio → prospecto → atención → cita → CRM → cotización → venta → ingreso → fruto en el árbol, con actividad en vivo. Fondo: Motor (Higgsfield). |
| 8–11 | Soluciones, Cómo trabajamos, Proyectos (ejemplos etiquetados), FAQ, Cotización | existentes | Sin cambios funcionales; el formulario de cotización y su integración se mantienen. |

**Modelo compartido** (`growth/store.tsx`): `leads`, `bookings`, `sales`, `inquiries`, `fruitQueue`, `feed`. Las mismas acciones (`lead`, `book`, `move`, `sale`…) las usan todas las demos; una venta «Cerrado» en cualquier demo encola un fruto en la rama que la produjo (atención → rama 1, agenda → 2, CRM → 3, búsqueda → 4, tienda → 5, publicidad → 6). Reiniciable, determinista, aislado.

### Las seis demostraciones
1. **Más clientes atendidos** — chat con mensajes de un toque, respuestas guionizadas, servicios y huecos libres reales de la agenda; la reserva crea cita + oportunidad. KPIs: recibidas, atendidas, reservas, pendientes.
2. **Agenda con trabajo** — semana completa (escritorio) o un día (móvil); reservar, seleccionar, mover y cancelar; ocupación, huecos y valor agendado.
3. **CRM de oportunidades** — Nuevo → Contactado → Cita → Cotización → Negociación → Cerrado; arrastrar con ratón o botones ◀ ▶ (táctil/teclado); origen de cada oportunidad; cerrar = venta + fruto.
4. **Visibilidad local** — búsqueda y ficha ilustrativas (no Google), mejoras de presencia que cambian la ficha, «Llamar» y «Reservar» crean oportunidades. Sin promesas de posición.
5. **Tienda online** — catálogo de zapatillas (ilustraciones vectoriales recoloreables, 2 vistas), color, talla, carrito, cantidades, cupón `AVALON10`, envío, total, checkout de demostración (tarjeta de prueba no editable; Apple Pay/Klarna/PayPal solo como ejemplo visual), confirmación y venta en el CRM.
6. **Publicidad → dinero** — 6 palancas; fórmulas visibles (Clics = Presupuesto ÷ CPC; Impresiones = Clics ÷ 2.5 %; Prospectos, Reservas, Ventas, Ingresos, ROAS, neto); flujo animado; enviar prospectos al CRM; lluvia de monedas cuando hay ventas. Puede dar resultado negativo: es honesto.

## 2. Inventario Higgsfield reutilizado (sin créditos nuevos)

| Recurso | Uso en 2.0 |
|---|---|
| Túnel (still `33485337…`/`e13d9d2b…`, film `1f2e95f4…`/`0f69d72c…`) | Intro: `u/launch-intro{,-m}.mp4` (primeros 6 s recodificados, 1.2 MB) y pósteres `u/launch-*.webp` |
| Árbol 9:16 (`ca93c214…`) | Árbol único: `tree/plate-{720,1080}.webp` (manzanas retiradas por *inpainting* local multiescala) + 9 sprites reales `tree/apple-0..8.webp` recortados del mismo máster |
| Ignición 16:9/9:16 | Fondo del hero (CSS) y banda del selector de industria |
| Motor 16:9 | Banda del recorrido integrado |
| Cierre, dispositivos, red | Fondo de contacto; fotos ilustrativas de la ficha local |

Retirado de la página: galería «La película» y las películas completas de los universos (`u/{ignition,launch,engine,tree}{,-m}.mp4`; sus job ids siguen en `HIGGSFIELD_MEDIA.md`), el árbol WebGL proyectado y las etapas fijadas Despegue/Motor/Árbol (`universe/stages.tsx`), el showroom antiguo de la portada (se mantiene para las páginas de servicio) y la sección de industrias duplicada.

## 3. Recursos adicionales que requieren aprobación (no ejecutados)

| Recurso | Para qué | Estimado |
|---|---|---|
| 6 fotos de producto 4K de zapatillas (gpt_image_2_6) | Sustituir las ilustraciones vectoriales de la tienda por fotos realistas | ≈ 26 créditos |
| Secuencia de crecimiento del árbol (Kling 3.0, 10 s, desde el máster) | Capa de vídeo opcional para la fase final del árbol | ≈ 17.5 créditos |
| Logotipo 3D metálico (escultura) | Sustituir el SVG metalizado de la intro por un render del logo real, si el propietario aporta el archivo vectorial maestro | ≈ 9–18 créditos |

## 4. Pruebas

- `tests/public-landing.http.cjs` (Chromium real, sin `force:true`): intro visible → «Skip intro» → no reaparece en la sesión; árbol en 320/375/390/430/768/1024/1440/1920 (regar ×4, activar 6 ramas, cosechar un fruto maduro, ingresos > 0, sin desbordamiento); a 390 y 1440 el recorrido completo: selector Roofing, chat que reserva, agenda (reservar/cancelar), CRM hasta «Won», tienda (carrito, cupón, checkout Klarna demo, confirmación), anuncios (recalcula, envía prospectos), recorrido integrado y fruto en el árbol.
- `tests/public-universe.test.cjs`: aislamiento (sin Supabase/fetch/server actions/SDK de pago), un solo árbol, fórmulas exactas del simulador, industrias completas sin «agencias de IA», checkout sin campos de tarjeta, intro con sesión/reduced motion/skip/failsafe y path auténtico del logo.
- `npm test` 657/657 · `tsc` · eslint (sin errores nuevos) · `next build`.
- Lighthouse móvil (simulado, local): rendimiento 90, accesibilidad 100, buenas prácticas 96, SEO 92, CLS 0.

## 5. Limitaciones honestas

- Pruebas en Chromium con WebGL por software; **no** se probó en iPhone/Safari físico ni se midió fluidez real (no afirmamos 4K ni 120 fps).
- El árbol es una composición fotorrealista por capas (máscaras animadas, sprites reales, partículas): no hay geometría 3D de ramas que se deformen. La «aparición de hojas» se expresa con la iluminación de cada zona de la copa.
- Las zapatillas son ilustraciones vectoriales (ver §3).
- El chat es guionizado: no es un asistente de IA real ni hace llamadas.
- Los números del árbol y del simulador son ilustrativos y están etiquetados como tales.

## 6. Checklist de aceptación

| Criterio | Estado |
|---|---|
| El Despegue es la intro cinematográfica (no una tarjeta de vídeo) | ✓ |
| Transición real hacia el logotipo auténtico | ✓ (path del logo oficial, metal + destello, iris) |
| Un único árbol | ✓ (árbol WebGL y etapas proyectadas eliminados) |
| El árbol crece por interacción | ✓ |
| Los frutos se cosechan y caen con gravedad | ✓ |
| La caída produce una representación del resultado económico | ✓ (partículas doradas, moneda, contador) |
| Demos funcionales, no imágenes | ✓ (6) |
| Calendario responde | ✓ (reservar, mover, cancelar) |
| CRM mueve oportunidades | ✓ (arrastrar + botones) |
| Carrito modifica totales | ✓ (cantidad, cupón, envío) |
| Publicidad recalcula | ✓ (fórmulas visibles) |
| Números ficticios etiquetados | ✓ |
| Sin vídeos decorativos sin propósito | ✓ |
| La homepage vende resultados, no terminología de IA | ✓ (hero sin IA; verificado por prueba) |
| Móvil sin recortes ni desbordamientos | ✓ en Chromium 320–1920; pendiente Safari físico |
| Sin romper funcionalidad previa | ✓ (cotización, páginas de servicio, 657 pruebas) |
| No invade backend de Codex | ✓ (solo `src/components/public`, `src/app/page.tsx`, `public/brand`, pruebas y docs públicas) |

Capturas: `docs/brand/ultimate-2/*.jpg` (escritorio 1440 e iPhone 13).
