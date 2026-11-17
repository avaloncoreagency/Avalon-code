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

## 2026-11-17 · Cinematic realism masters (owner-approved budget)

Art direction: luxury technology × cinematic realism × premium architecture. Real materials only (brushed titanium,
optical glass, basalt, board-formed concrete, bronze, walnut, leather); midnight palette with electric blue/violet
light and amber for opportunity. No text, logos, people or brands in any frame.

Stills: `gpt_image_2_6`, 4K, quality high (4.25 credits each). Films: `kling3_0` pro, image-to-video from the still,
sound off (10 s = 17.5 credits, 5 s = 8.75). Web derivatives: WebP q76–80 (Pillow, Lanczos); H.264 CRF 25–26,
30 fps, no audio track, `+faststart`.

| Asset (public/brand) | Still job | Film job |
|---|---|---|
| `u/ignition-{1280,2400}.webp`, `u/ignition.mp4` | cd8f72c5-79e4-4e2a-9735-1c845dd775eb | 6bc89f81-434d-4249-b32d-5800d540394e |
| `u/ignition-m-{720,1080}.webp`, `u/ignition-m.mp4` | b8b028a5-0517-4f79-8ec7-95c02cdcfa12 | 1016f3b8-4af3-478e-89ee-9ee4dcc2c2e7 |
| `u/launch-*.webp`, `u/launch.mp4` | 33485337-96fc-4c6b-8bf2-ac3a1e31ce9d | 1f2e95f4-816c-47ee-af2a-d5792055f332 |
| `u/launch-m-*.webp`, `u/launch-m.mp4` | e13d9d2b-cdb3-4b11-a493-ebfc13ce9c2e | 0f69d72c-8650-4f4b-aee3-6f9989a8d766 |
| `u/engine-*.webp`, `u/engine.mp4` | 624ec0c5-b7ea-4b60-96c0-1214542d9799 | ed4a67a8-b5e3-44c5-80af-92fb12613d41 |
| `u/engine-m-*.webp`, `u/engine-m.mp4` | 4b904673-ddb1-49d2-9c76-dddeb191a604 | 22af4fbc-9a82-4e4a-adbf-1d033d18b9b2 |
| `u/tree-*.webp`, `u/tree.mp4` | 5b84efe5-eebf-41b9-bb85-4cc534b36404 | 8d7a7b1c-76fd-47a0-b84c-8084355c6f81 |
| `u/tree-m-*.webp`, `u/tree-m.mp4` | ca93c214-b16a-47a8-97c0-c6f97b0a86f2 | 22a003a7-dffd-4899-afbe-89abd514649a |
| `closing.webp` / `closing-m.webp` | c7440750-1085-4d7a-9e18-0daccdf2624e / 39d3b8a0-5af6-48cb-8dba-3eb191431a53 | 4cefa2e9-0f88-41e8-bb1f-496e2c646475 (not served) |
| `devices{,-960}.webp`, `devices-loop.mp4` | 6840efa3-4d12-42f6-9ce6-8ecfb2af9638 | 2c048a75-7c7a-47c2-9525-64fa1481fe2f |
| `ecommerce{,-720}.webp`, `ecommerce-loop.mp4` | 79bf7303-48db-4719-8c03-c2dfffb4603d | b2210bef-60a2-47b0-aba1-c977728c1291 |
| `receptionist{,-720}.webp`, `receptionist-loop.mp4` | aee4b8cf-d851-402e-a893-c6c980e8352d | 87e4539f-ed04-43ef-807d-844e7dd47a82 |
| `automation{,-720}.webp`, `automation-loop.mp4` | e39f4880-783a-4b59-a9ac-29c0bb34fc96 | df381245-d57f-484c-8faf-9ed07d901238 |
| `marketing{,-720}.webp`, `marketing-loop.mp4` | c1e14819-a520-4c42-a1ad-8e4adc06ca19 | c5e2b0ba-ccab-4f17-ae33-b16c52c52bc1 |
| `network.webp`, `network-loop.mp4` | 606f9396-69cb-49d9-8c57-709b6f0c3e77 | 53091e03-9a79-4114-aa77-d40feba005f0 |

Spend for this round (account balance, measured): 1735.75 → 1457.75 = **278 credits** for 16 stills, 9 ten-second
films and 6 five-second loops. The universe CSS no longer hot-links CloudFront URLs; every frame is served from this repo.
