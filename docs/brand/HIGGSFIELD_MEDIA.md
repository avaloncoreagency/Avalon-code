# Recursos audiovisuales del sitio público (Higgsfield)

Generados el 2026-11-16 con autorización explícita del owner («gasta lo que tengas que gastar… 4k y premium»).
**Consumo real total:** 95,25 créditos (saldo 1.903,75 → 1.808,5, plan Team). Lote 1: 51,5 créditos (8 imágenes 4K y 2 loops del hero). Lote 2: 43,75 créditos (5 cinemáticas de producto).

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

### Lote 2 · Cinemáticas de producto (kling3_0 · pro · 5 s · sin audio · image-to-video sobre el still 4K)

| Archivo | Uso | Job |
|---|---|---|
| `devices-loop.mp4` (573 KB) | Website Design y Custom CRM | `72f5ddf5-d04c-4239-9291-1fc82e36c523` |
| `ecommerce-loop.mp4` (812 KB) | E-commerce | `e431f7b1-6b6f-4037-8212-937b39dd8da4` |
| `receptionist-loop.mp4` (664 KB) | Communication Hub: AI Receptionist y AI Chatbots | `a7e95e62-29a5-42cb-a725-6fdaf8f6b398` |
| `automation-loop.mp4` (613 KB) | Business Automations | `b89a3897-0e2c-46ad-a9db-d8bc438f3e35` |
| `marketing-loop.mp4` (743 KB) | Marketing y Funnel Builder | `f1b4d1df-5794-477b-98ae-de89f717b896` |

Las cinemáticas se cargan solo cuando su bloque se acerca a la pantalla (`ProductVideo`), se pausan fuera de ella y nunca se descargan con *reduced motion* o *data saver*.

### Lote 3 · Experiencia inmersiva (ronda 3)

| Archivo | Uso | Modelo | Job |
|---|---|---|---|
| `seq/fly-000…079.webp` (1.9 MB) y `seq/fly-s-*.webp` (0.9 MB, *data saver*) | Secuencia controlada por el scroll (`#experiencia`): 80 fotogramas a 8 fps del vuelo de cámara | kling3_0 · pro · 10 s · fotogramas inicial/final = hero + dispositivos | `b5890bf3-4a7d-4871-beb7-044d7c2f0f3c` |
| `network-loop.mp4` (628 KB) y `network.webp` | Fondo vivo del recorrido «Cómo funciona», en bucle ida y vuelta de 5 s | kling3_0 · pro · 10 s · image-to-video sobre `automation` | `11186590-28e4-4f83-9f6c-cf4f3053214a` |
| `logo-sculpture.webp`, `-960` | Escultura de vidrio del símbolo Avalon (bloque «Avalon Core») | gpt_image_2_6 · 4k · referencia `public/brand/src/avalon-mark-ref.png` | `e6f9db6a-35f9-43e6-b049-e588a9d47c57` |
| `logo-sculpture-loop.mp4` (1.45 MB) | Revelado 3D del logo, en bucle ida y vuelta | kling3_0 · pro · 10 s · image-to-video sobre la escultura | `6d78ee9b-4b66-43b5-9fc0-b3cef8a3175c` |

Los fotogramas solo se descargan cuando la sección se acerca a la pantalla. Con *reduced motion* se muestran tres imágenes fijas con sus textos.

Gasto acumulado: 1903.75 → 1751.75 créditos (152 en total; 56.75 en esta ronda).

## Reglas que aplican estos recursos

- **Sin texto en las imágenes.** Los textos van en HTML, que es nítido, traducible y accesible.
- **Software ilustrativo.** Los paneles que se ven son mockups y la web los presenta así («Demo ilustrativa», «Ejemplo conceptual»).
- **Vídeo opcional y ligero.** Solo carga si no está activo *reduced motion* ni *data saver*. Se pausa fuera de pantalla. Usa `preload="none"`, y la imagen se muestra primero como LCP.

## Pendiente

- El revelado en vídeo del logo ya existe (lote 3). El símbolo SVG del encabezado sigue animándose con CSS.
