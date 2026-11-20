# React #418 — causa raíz y corrección (2026-11-20)

## Síntoma

`Minified React error #418 (args[]=HTML)` intermitente en el build de producción, más o menos en 1 de cada 4 corridas del E2E de ventas. Apareció en páginas distintas:

- `/admin/workspace/products/[id]` (CI de #252, run `44625705794`);
- `/crm/clients/[id]`;
- `/crm/leads`;
- `/crm/sales`;
- `/crm/hunter`.

Cuando ocurre, React descarta todo el HTML del servidor y vuelve a renderizar la raíz en el cliente.

## Cómo se aisló (con evidencia, sin suposiciones)

1. **Reproducción rápida.** Una variante local del E2E (no se commitea) recarga en bucle cliente, dashboard, ventas, leads y producto sobre el build de producción. El error salió en `/crm/leads` (vuelta 23) y en `/crm/sales` (vuelta 4).
2. **HTML del servidor frente al DOM final.** La estructura coincide. Las únicas diferencias son los `<input type="hidden">` de las *server actions*, que React omite a propósito. Con eso se descarta un componente que renderice distinto en servidor y en cliente: fechas, `window`, `localStorage`, anidamiento inválido o extensiones.
3. **Instrumentación del React de producción**, solo en el build local de diagnóstico. En el punto exacto del fallo se registró:
   ```
   HYD418 {"ready":"complete","path":["nav.suite_nav","aside.suite_sidebar","div.suite_shell",...],
           "next":"<a class=\"suite_navItem\" title=\"Dashboard\" href=\"/admin/dashboard\">..."}
   ```
   - React intentaba reclamar el `<nav>` mientras su cursor de hidratación ya apuntaba al **primer hijo** de ese `<nav>`.
   - El documento ya estaba completo (`readyState=complete`), así que tampoco es un problema de streaming parcial.
4. **Payload RSC.** Los hijos del `<nav>` son elementos `Link` (`$L12`, módulo cliente del chunk `7077`). Si el módulo aún no está resuelto, el cliente Flight entrega esos hijos como *lazy*. Entonces la reconciliación de los hijos se suspende **en la fibra host del `<nav>`**.

## Causa raíz

El fallo está en React, en `replaySuspendedUnitOfWork` del build que vendoriza Next.js 15.5.28 y 15.5.29 (`19.2.0-canary-0bdb9206-20250818`):

1. Al reintentar una fibra host suspendida, React deshace el contexto pero **no restaura el cursor de hidratación**.
2. `beginWork` vuelve a intentar reclamar el `<nav>` desde dentro de él y lanza #418.

Que el módulo esté listo o no depende del orden en que terminan de descargarse los scripts `async`. Por eso el error es aleatorio y aparece en cualquier página que tenga este patrón (la navegación lateral está en todas).

React ya lo corrigió upstream. El build que vendoriza Next 16.4 (`19.3.0-canary-278794d7-20261002`) reinicia el cursor en ese mismo punto:

```js
case 5:
  resetHooksOnUnwind(next);
  var fiber = next;
  fiber === hydrationParentFiber &&
    (isHydrating
      ? (popToNextHostParent(fiber), 5 === fiber.tag && null != fiber.stateNode && (nextHydratableInstance = fiber.stateNode))
      : (popToNextHostParent(fiber), (isHydrating = !0)));
```

## Corrección

`scripts/patch-react-hydration-replay.cjs` aplica **exactamente** esa corrección upstream a los builds cliente de `next/dist/compiled/react-dom{,-experimental}`: producción, desarrollo y profiling.

- Se ejecuta en `postinstall` (con `npm ci` en CI y Vercel) y en `prebuild`.
- Es idempotente. Si detecta que la versión instalada ya trae la corrección upstream, no hace nada.
- **Falla el build** si el código vendorizado cambió de forma, así nunca diverge en silencio.
- Se comprobó que el chunk cliente generado contiene `n===rP&&(rL?(rM(n),5===n.tag&&null!=n.stateNode&&(rN=n.stateNode)):…)`.

No se usó `suppressHydrationWarning`, ni CSR forzado, ni se desactivaron pruebas.

**Salida definitiva:** al migrar a Next 16 (que trae React con la corrección), el script informa `fixed-upstream` y se puede borrar junto con su prueba.

## Pruebas

- `tests/react-hydration-backport.test.cjs` comprueba:
  - que el parche se inserta una sola vez y antes de volver a reclamar el nodo;
  - que no toca un build ya corregido upstream;
  - que falla ante una forma desconocida;
  - que el React instalado lleva la corrección;
  - que los scripts `prebuild` y `postinstall` existen.
- `tests/support/hydration-stability.cjs`, dentro del E2E de ventas, hace navegación directa y recargas repetidas de:
  - un producto **con** URL y uno **sin** URL;
  - Clients 360, Leads y Ventas;
  - en ES a 390 px y en EN a 1440 px;
  - con una sesión **no autorizada**, que se redirige sin errores.

  Cualquier `pageerror` hace fallar la suite.
- Evidencia de la prueba de estrés, antes y después: ver el informe del PR.
