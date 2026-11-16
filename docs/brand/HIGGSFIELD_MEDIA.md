# Recursos audiovisuales del sitio público (Higgsfield)

Generados el 2026-11-16 con autorización explícita del owner («gasta lo que tengas que gastar… 4k y premium»).
**Consumo real:** 51,5 créditos (saldo 1.903,75 → 1.852,25, plan Team).

Los recursos se sirven como archivos estáticos optimizados desde `public/brand/`. Ninguna visita llama a Higgsfield ni consume créditos.
El manifiesto `src/components/public/landing/media.ts` es el único punto de cambio: para reemplazar una pieza, exporta el nuevo archivo con el mismo nombre (o cambia la ruta en el manifiesto) y despliega.

| Archivo(s) | Uso | Modelo | Job Higgsfield | Original | Web |
|---|---|---|---|---|---|
| `hero-desktop.webp`, `-1200` | Hero escritorio, póster | gpt_image_2_6 · 4k · high | `3e0dbd24-232c-4a2a-a8e1-2527bc47421d` | 3840×2160 PNG 7,3 MB | 2400 px 97 KB / 1200 px 37 KB |
| `hero-mobile.webp`, `-640` | Hero iPhone (composición vertical propia) | gpt_image_2_6 · 4k · high | `7026f73d-4499-4092-a1b5-2d7ed8ee6f7e` | 2160×3840 | 1080 px 67 KB / 640 px 32 KB |
| `hero-loop.mp4` | Loop ambiental escritorio (sin audio) | kling3_0 · pro · 5 s | `a9b6ab93-bdd8-49fb-8fe0-836c58db1b49` | 1920×1080 | 1600 px H.264 830 KB |
| `hero-loop-mobile.mp4` | Loop ambiental vertical (sin audio) | kling3_0 · pro · 5 s | `df3329de-0d74-4aff-bfc3-0cc407306798` | 1080×1920 | 720 px H.264 415 KB |
| `devices.webp`, `-960` | Dispositivos con paneles de ejemplo | gpt_image_2_6 · 4k | `b96cfebf-66d3-4a14-8745-07ec4c81c254` | 3840×2160 | 101 KB / 36 KB |
| `closing.webp` | Fondo del cierre / cotización | gpt_image_2_6 · 4k | `912e081b-8042-44b8-af38-a2ec99af0c1d` | 3840×2160 | 51 KB |
| `ecommerce.webp`, `-720` | E-commerce | gpt_image_2_6 · 4k | `5f22f5f6-762f-4a16-b62b-d2e132014fd6` | 3312×2480 | 80 KB / 29 KB |
| `receptionist.webp`, `-720` | AI Receptionist | gpt_image_2_6 · 4k | `8bb4fed8-9937-46fb-b159-11d22b350f2f` | 3312×2480 | 76 KB / 26 KB |
| `automation.webp`, `-720` | Automatizaciones | gpt_image_2_6 · 4k | `85070877-65a8-46c4-a8de-1228e2f0db25` | 3312×2480 | 50 KB / 20 KB |
| `marketing.webp`, `-720` | Marketing | gpt_image_2_6 · 4k | `adf2283c-7bdc-4265-a88d-fd387ae0c157` | 3312×2480 | 79 KB / 30 KB |

## Reglas que aplican estos recursos

- **Sin texto en las imágenes.** Los textos van en HTML, que es nítido, traducible y accesible.
- **Software ilustrativo.** Los paneles que se ven son mockups y la web los presenta así («Demo ilustrativa», «Ejemplo conceptual»).
- **Vídeo opcional y ligero.** Solo carga si no está activo *reduced motion* ni *data saver*. Se pausa fuera de pantalla. Usa `preload="none"`, y la imagen se muestra primero como LCP.

## Pendiente (siguiente lote recomendado)

1. Cinemáticas por producto (laptop → website, panel CRM, flujo de recepción): image-to-video sobre `devices` y los visuales de producto.
2. Intro «Avalon Reveal» del logo, cuando exista un logo vectorial definitivo para usar como referencia.
