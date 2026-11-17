# Avalon Ultimate — The Living Universe

Estado: **prototipo funcional en rama `claude/avalon-ultimate`, sin fusionar.** Solo frontend público; no toca `/admin`, auth, RLS ni datos.

## 1. Auditoría del frontend anterior (Fase 1)

| Hallazgo | Evidencia | Acción |
|---|---|---|
| Identidad clara y pastel, similar a muchas agencias | `landing.module.css` (tokens perla) | Sustituida por la paleta Ultimate oscura |
| Recursos Higgsfield producidos para fondo claro (hero, dispositivos, productos, cierre, escultura del logo, secuencia de 80 fotogramas) | `public/brand/*` | Hero, secuencia y escultura retirados de la portada. Productos y miniaturas se conservan con una gradación hacia la paleta nueva hasta aprobar los masters oscuros (§5) |
| El hero dependía de una imagen como LCP | Lighthouse previo: LCP 2.2–2.6 s móvil | El LCP es ahora texto renderizado en servidor: 1.9–2.3 s móvil, 0.5 s escritorio |
| Campos del formulario se desbordaban de su columna | captura `form.png` | Corregido (`width:100%`, `min-width:0`) |
| Sin PR abiertos sobre el sitio público | GitHub, 2026-11-17 | Sin solapamiento con otros agentes |

## 2. Dirección artística (Fase 2)

- **Paleta:** Midnight `#050610`, Obsidian `#0A1024`, Electric `#2979FF`, Violet `#7847FF`, Magenta `#D946EF`, Orange `#FF8736`, Cyan `#30DAF4`, Silver `#E8ECF5`. Azul y violeta llevan la marca; naranja y magenta se reservan para energía y oportunidad (despegue, manzanas); cian para señales y etiquetas.
- **Materiales:** cromo y metal líquido iridiscente con reflejos de un estudio oscuro con paredes de luz de marca; vidrio esmerilado para paneles; energía aditiva para partículas, enlaces y halos.
- **Tres metáforas, sin ilustración infantil:** el cohete es un túnel de luz que la cámara atraviesa; el motor es un núcleo que alimenta seis módulos; el árbol es metal que crece con el scroll y da manzanas de cristal.
- **Tipografía:** pila del sistema (sin fuentes externas), titulares en mayúsculas muy apretadas solo en el hero.

## 3. Arquitectura

Un único lienzo WebGL fijo detrás de la página (`universe/scene.ts`, three.js, cargado en diferido) y una línea de tiempo `T` publicada por el scroll nativo:

| T | Universo | Qué ocurre | Interacción |
|---|---|---|---|
| 0→1 | I · The Ignition | Partículas convergen, se forma el núcleo, emerge el símbolo de Avalon, onda de choque | Ratón: el símbolo y la cámara responden. Clic/toque: onda expansiva. Scroll: la cámara se acerca |
| 1→2 | II · The Launch | La cámara atraviesa el núcleo y un túnel de estelas y compuertas | Clic/toque: aceleración breve. Scroll: avance de cámara y tres mensajes |
| 2→3 | III · The Growth Engine | Núcleo con seis módulos en órbita y enlaces de energía | Hover: ilumina. Clic/toque: enfoca el módulo y abre su panel (problema, solución, beneficios, enlaces reales). Scroll: recorrido por los seis |
| 3→4 | IV · The Growth Tree | La energía baja por un conducto y el árbol crece: raíces, tronco, hojas, diez manzanas | Hover: la manzana revela su nombre. Clic/toque: abre la oportunidad con su enlace |
| >4 | Ambiente | La cámara desciende bajo las raíces; quedan las partículas atenuadas | — |

Las etiquetas del motor y las manzanas son botones HTML reales que siguen la proyección 3D (accesibles por teclado y lector de pantalla). El scroll nunca se bloquea ni se secuestra.

**Protecciones:**
- Con *reduced motion* o *data saver* no se descarga la escena: las mismas secciones se muestran como contenido normal.
- Sin GPU (renderizado por software) no se inicia la escena.
- Vigilante de fotogramas: baja la resolución una vez y, si sigue lento, pasa a la versión estática.
- Pausa con la pestaña oculta; liberación de recursos al salir.

## 4. Verificación (commit de esta rama)

| Prueba | Resultado |
|---|---|
| `npm test` | 630/630 |
| typecheck, lint (0 errores), build | ✓ |
| Matriz de anchos 320, 375, 390, 430, 768, 1024, 1440, 1920 (Chromium, escena forzada) | Sin desbordamiento horizontal, h1 sin recortar, clic en módulo cambia el panel, 10/10 manzanas visibles y abribles, 0 errores de consola |
| *Reduced motion* 390 px | Sin escena; 6 módulos y 10 oportunidades accesibles; sin desbordamiento |
| Lighthouse móvil (portada) | 92–98 / 100 / 96 / 92 · LCP 2.3 s · CLS 0 · TBT 70–290 ms |
| Lighthouse escritorio (portada) | 100 / 100 / 96 / 92 · LCP 0.5 s · CLS 0 |
| Lighthouse móvil `/soluciones/crm` | 97 / 100 / 96 / 92 |

**Límite de estas cifras:** el laboratorio no tiene GPU, así que Lighthouse mide la ruta sin escena. El coste real de la escena en el hilo principal (INP, fluidez) **no está medido en dispositivos reales**; hay que comprobarlo en un iPhone y un Android de gama media desde la Preview. El trozo de JavaScript de la escena pesa 170 KB comprimido y solo se descarga después del primer pintado.

No probado: Safari real en iPhone (solo emulación de Chromium).

## 5. Producción Higgsfield propuesta — **requiere autorización; no se ha gastado nada**

Precios observados en esta cuenta: imagen 4K 4.25 créditos; vídeo kling3_0 pro 5 s 8.75; 10 s 17.5. Saldo: 1751.75.

| Paquete | Contenido | Créditos |
|---|---|---|
| A · Reemplazo de recursos claros | 5 stills 4K oscuros de producto + 5 loops de 5 s + fondo de cierre | ≈ 69 |
| B · Universos cinematográficos | Por universo: stills 4K escritorio y móvil (póster y versión sin WebGL) y película de 10 s en 16:9 y 9:16 (nacimiento del núcleo, túnel, motor, crecimiento del árbol) | ≈ 152 |
| C · Servicios y materiales | 6 stills de módulo + 6 loops de 5 s + 4 texturas (metal líquido, vidrio, corteza metálica, cristal de manzana) | ≈ 95 |
| Margen de iteración (30 %) | Repeticiones para aprobar dirección | ≈ 95 |
| **Total estimado** | | **≈ 410** |

Masters 8K: solo tendrían sentido para las cuatro stills de universo; el precio del *upscale* no está verificado en esta cuenta y se cotizaría antes de usarlo. En móvil nunca se serviría más de 1080 px de ancho.

## 6. Pendiente

1. Autorización de gasto Higgsfield (§5) y aprobación de la dirección visual.
2. Prueba en dispositivos reales (fluidez e INP) y Safari iOS.
3. Sustituir las miniaturas graduadas por los masters oscuros.
4. Página propia de Industrias y de Proyectos (hoy son secciones de la portada).
5. Fusión: solo con autorización expresa.
