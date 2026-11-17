"use client";
import { useMemo, useState } from "react";
import type { Lang } from "../../landing/copy";
import { money } from "../industries";
import { useDemo } from "../store";
import d from "../demos.module.css";
import { Panel, pickName, useT } from "./shared";

type Product = { id: number; name: string; cat: number; price: number; colors: [string, string, string][] };
const PRODUCTS: Product[] = [
  { id: 1, name: "Aero Run", cat: 0, price: 129, colors: [["#1d4ed8", "#e8ecf5", "#ff8736"], ["#111827", "#e5e7eb", "#22d3ee"], ["#e5e7eb", "#111827", "#7847ff"]] },
  { id: 2, name: "Pulse Daily", cat: 0, price: 109, colors: [["#7847ff", "#f3f4f6", "#30daf4"], ["#0f172a", "#cbd5e1", "#ff8736"], ["#be123c", "#f5f5f5", "#111827"]] },
  { id: 3, name: "Metro Low", cat: 1, price: 95, colors: [["#f5f5f4", "#1c1917", "#a16207"], ["#1c1917", "#f5f5f4", "#a16207"], ["#57534e", "#e7e5e4", "#f97316"]] },
  { id: 4, name: "Loft Suede", cat: 1, price: 119, colors: [["#92400e", "#fef3c7", "#1f2937"], ["#334155", "#e2e8f0", "#0ea5e9"], ["#365314", "#ecfccb", "#1f2937"]] },
  { id: 5, name: "Ridge Trail", cat: 2, price: 149, colors: [["#3f6212", "#1f2937", "#f97316"], ["#1e3a8a", "#111827", "#facc15"], ["#44403c", "#0c0a09", "#ef4444"]] },
  { id: 6, name: "Summit GTX", cat: 2, price: 169, colors: [["#0f766e", "#111827", "#fde047"], ["#7c2d12", "#1c1917", "#fb923c"], ["#18181b", "#27272a", "#22d3ee"]] },
];
const SIZES = ["38", "39", "40", "41", "42", "43", "44"];
type Line = { key: string; product: number; color: number; size: string; qty: number };

/** Illustrative sneaker (vector, recolourable); two views for the gallery. */
function Shoe({ c, view = 0, label }: { c: [string, string, string]; view?: number; label: string }) {
  const id = `${c[0].slice(1)}${c[2].slice(1)}${view}`;
  return <svg viewBox="0 0 240 130" role="img" aria-label={label} className={d.shoe}>
    <defs>
      <linearGradient id={`u${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".38" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".28" /></linearGradient>
      <radialGradient id={`s${id}`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#000" stopOpacity=".45" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="122" cy="116" rx="104" ry="9" fill={`url(#s${id})`} />
    {view === 0 ? <>
      <path d="M16 96c0-8 8-12 20-12h164c16 0 27 6 29 14 1 6-4 10-12 10H32c-10 0-16-5-16-12Z" fill={c[1]} />
      <path d="M18 98h210" stroke="#000" strokeOpacity=".18" strokeWidth="3" />
      <path d="M30 86c4-20 14-36 32-42l30-11c8-3 16 0 20 7l11 16c6 8 18 12 34 14l40 4c16 2 26 8 28 16l1 6H30Z" fill={c[0]} />
      <path d="M30 86c4-20 14-36 32-42l30-11c8-3 16 0 20 7l11 16c6 8 18 12 34 14l40 4c16 2 26 8 28 16l1 6H30Z" fill={`url(#u${id})`} />
      <path d="M66 76c34-10 74-8 120 2" stroke={c[2]} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M96 40l10 18M88 45l10 17M80 50l9 16" stroke={c[1]} strokeWidth="3" strokeLinecap="round" />
      <path d="M62 44c-6 2-11 8-13 14 8 2 16-2 22-8Z" fill="#0b0f1d" opacity=".55" />
      <circle cx="206" cy="86" r="3" fill={c[2]} />
    </> : <>
      <path d="M40 70c0-24 30-44 82-44s82 20 82 44-30 44-82 44S40 94 40 70Z" fill={c[1]} />
      <path d="M58 70c0-18 26-32 64-32s64 14 64 32-26 32-64 32-64-14-64-32Z" fill={c[0]} />
      <path d="M58 70c0-18 26-32 64-32s64 14 64 32-26 32-64 32-64-14-64-32Z" fill={`url(#u${id})`} />
      {[0, 1, 2, 3, 4, 5].map(k => <path key={k} d={`M${76 + k * 15} 52v36`} stroke={c[2]} strokeWidth="4" strokeLinecap="round" opacity=".8" />)}
    </>}
  </svg>;
}

/** DEMO 5 · Interactive e-commerce: catalogue → product → cart → coupon → demo checkout → sale in the demo CRM. */
export function ShopDemo({ lang }: { lang: Lang }) {
  const t = useT(lang); const { dispatch } = useDemo();
  const cats = [t("Running", "Running"), t("Urbano", "Lifestyle"), t("Montaña", "Trail")];
  const [cat, setCat] = useState(-1), [pid, setPid] = useState(1), [color, setColor] = useState(0), [size, setSize] = useState("41"), [view, setView] = useState(0);
  const [cart, setCart] = useState<Line[]>([]), [coupon, setCoupon] = useState(""), [applied, setApplied] = useState(false), [couponMsg, setCouponMsg] = useState("");
  const [step, setStep] = useState<"shop" | "checkout" | "done">("shop"), [pay, setPay] = useState("card"), [order, setOrder] = useState(""), [n, setN] = useState(0);
  const p = PRODUCTS.find(x => x.id === pid)!;
  const list = PRODUCTS.filter(x => cat < 0 || x.cat === cat);
  const sums = useMemo(() => {
    const sub = cart.reduce((a, l) => a + PRODUCTS.find(x => x.id === l.product)!.price * l.qty, 0);
    const disc = applied ? Math.round(sub * 0.1 * 100) / 100 : 0;
    const ship = sub - disc >= 150 || sub === 0 ? 0 : 9;
    return { sub, disc, ship, total: Math.round((sub - disc + ship) * 100) / 100, items: cart.reduce((a, l) => a + l.qty, 0) };
  }, [cart, applied]);
  const add = () => setCart(c => {
    const key = `${pid}-${color}-${size}`, ex = c.find(l => l.key === key);
    return ex ? c.map(l => (l.key === key ? { ...l, qty: l.qty + 1 } : l)) : [...c, { key, product: pid, color, size, qty: 1 }];
  });
  const qty = (key: string, dq: number) => setCart(c => c.map(l => (l.key === key ? { ...l, qty: l.qty + dq } : l)).filter(l => l.qty > 0));
  const apply = () => { const ok = coupon.trim().toUpperCase() === "AVALON10"; setApplied(ok); setCouponMsg(ok ? t("Cupón aplicado: 10 % de descuento (demo).", "Coupon applied: 10% off (demo).") : t("Cupón no válido. Prueba AVALON10.", "Invalid coupon. Try AVALON10.")); };
  const place = () => {
    const name = pickName(n + 2); setN(v => v + 1);
    const num = `DEMO-${String(1040 + n).padStart(5, "0")}`; setOrder(num);
    dispatch({ type: "sale", amount: Math.round(sums.total), label: t("Pedido online (demo)", "Online order (demo)"), source: "shop", name, need: `${sums.items} × ${t("zapatillas", "sneakers")} · ${num}` });
    setStep("done");
  };
  const payLabel: Record<string, string> = { card: t("Tarjeta de débito/crédito", "Debit/credit card"), apple: "Apple Pay", klarna: "Klarna", paypal: "PayPal" };

  return <Panel lang={lang} services="ecommerce" kicker={t("E-commerce interactivo", "Interactive e-commerce")} title={t("Una tienda que vende mientras atiendes tu negocio", "A store that sells while you run your business")}
    note={t("Tienda y checkout de demostración: no se procesa ningún pago, no se piden datos reales y Apple Pay, Klarna o PayPal se muestran solo como ejemplo, sin integración.", "Demo store and checkout: no payment is processed, no real data is requested, and Apple Pay, Klarna or PayPal are shown only as examples, not integrated.")}>
    {step === "shop" && <div className={d.shop}>
      <div className={d.catalog}>
        <div className={d.seg} role="radiogroup" aria-label={t("Categorías", "Categories")}>
          <button type="button" role="radio" aria-checked={cat < 0} onClick={() => setCat(-1)}>{t("Todo", "All")}</button>
          {cats.map((x, i) => <button key={x} type="button" role="radio" aria-checked={cat === i} onClick={() => setCat(i)}>{x}</button>)}
        </div>
        <div className={d.products}>{list.map(x => <button key={x.id} type="button" className={d.product} aria-pressed={pid === x.id} onClick={() => { setPid(x.id); setColor(0); setView(0); }}>
          <Shoe c={x.colors[0]} label="" /><b>{x.name}</b><span>{money(x.price)}</span></button>)}</div>
      </div>
      <div className={d.detail}>
        <div className={d.gallery}><Shoe c={p.colors[color]} view={view} label={`${p.name} · ${t("ilustración", "illustration")}`} />
          <div className={d.views}>{[t("Lateral", "Side"), t("Superior", "Top")].map((v, i) => <button key={v} type="button" aria-pressed={view === i} onClick={() => setView(i)}>{v}</button>)}</div></div>
        <h4>{p.name}<span>{money(p.price)}</span></h4>
        <p className={d.small}>{t("Color", "Color")}</p>
        <div className={d.swatches}>{p.colors.map((c, i) => <button key={i} type="button" aria-label={`${t("Color", "Color")} ${i + 1}`} aria-pressed={color === i} onClick={() => setColor(i)} style={{ background: `linear-gradient(135deg, ${c[0]} 55%, ${c[2]} 55%)` }} />)}</div>
        <p className={d.small}>{t("Talla (EU)", "Size (EU)")}</p>
        <div className={d.sizes}>{SIZES.map(s => <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)}>{s}</button>)}</div>
        <button type="button" className={d.primary} onClick={add}>{t("Agregar al carrito", "Add to cart")}</button>
      </div>
      <aside className={d.cart} aria-label={t("Carrito", "Cart")}>
        <h4>{t("Carrito", "Cart")} <span>{sums.items}</span></h4>
        {!cart.length && <p className={d.empty}>{t("Tu carrito está vacío.", "Your cart is empty.")}</p>}
        {cart.map(l => { const x = PRODUCTS.find(q => q.id === l.product)!; return <div key={l.key} className={d.line}>
          <Shoe c={x.colors[l.color]} label="" /><div><b>{x.name}</b><small>{t("Talla", "Size")} {l.size}</small></div>
          <div className={d.qty}><button type="button" aria-label={t("Quitar uno", "Remove one")} onClick={() => qty(l.key, -1)}>−</button><span>{l.qty}</span><button type="button" aria-label={t("Agregar uno", "Add one")} onClick={() => qty(l.key, 1)}>+</button></div>
          <b>{money(x.price * l.qty)}</b></div>; })}
        {!!cart.length && <>
          <form className={d.coupon} onSubmit={e => { e.preventDefault(); apply(); }}><input aria-label={t("Cupón", "Coupon")} placeholder="AVALON10" value={coupon} onChange={e => setCoupon(e.target.value)} /><button type="submit">{t("Aplicar", "Apply")}</button></form>
          {couponMsg && <p className={d.small} role="status">{couponMsg}</p>}
          <dl className={d.totals}><div><dt>Subtotal</dt><dd>{money(sums.sub)}</dd></div>{sums.disc > 0 && <div><dt>{t("Descuento", "Discount")}</dt><dd>−${sums.disc.toFixed(2)}</dd></div>}
            <div><dt>{t("Envío", "Shipping")}</dt><dd>{sums.ship ? money(sums.ship) : t("Gratis", "Free")}</dd></div><div className={d.total}><dt>Total</dt><dd>${sums.total.toFixed(2)}</dd></div></dl>
          <button type="button" className={d.primary} onClick={() => setStep("checkout")}>{t("Ir al checkout", "Go to checkout")}</button>
        </>}
      </aside>
    </div>}
    {step === "checkout" && <div className={d.checkout}>
      <p className={d.demoBanner}>{t("Checkout de demostración · no se procesa ningún pago", "Demo checkout · no payment is processed")}</p>
      <div className={d.coGrid}>
        <div>
          <h4>{t("Método de pago (ilustrativo)", "Payment method (illustrative)")}</h4>
          <div className={d.payList} role="radiogroup" aria-label={t("Método de pago", "Payment method")}>{Object.entries(payLabel).map(([k, v]) =>
            <button key={k} type="button" role="radio" aria-checked={pay === k} onClick={() => setPay(k)}>{v}</button>)}</div>
          {pay === "card" && <div className={d.cardMock}><p>{t("Tarjeta de prueba (no editable)", "Test card (not editable)")}</p><b>4242 4242 4242 4242</b><span>12/30 · CVC •••</span></div>}
          {pay === "apple" && <div className={d.walletMock}><b>Apple Pay</b><p>{t("Ejemplo visual: Apple Pay no está integrado en esta demostración.", "Visual example: Apple Pay is not integrated in this demo.")}</p></div>}
          {pay === "klarna" && <div className={d.walletMock}><b>Klarna</b><p>{t(`Ejemplo: 4 pagos de $${(sums.total / 4).toFixed(2)} sin intereses (ilustrativo, sin integración).`, `Example: 4 interest-free payments of $${(sums.total / 4).toFixed(2)} (illustrative, not integrated).`)}</p></div>}
          {pay === "paypal" && <div className={d.walletMock}><b>PayPal</b><p>{t("Ejemplo visual, sin integración.", "Visual example, not integrated.")}</p></div>}
        </div>
        <div className={d.summary}>
          <h4>{t("Resumen", "Summary")}</h4>
          <dl className={d.totals}><div><dt>{sums.items} {t("artículos", "items")}</dt><dd>{money(sums.sub)}</dd></div>{sums.disc > 0 && <div><dt>{t("Descuento", "Discount")}</dt><dd>−${sums.disc.toFixed(2)}</dd></div>}
            <div><dt>{t("Envío", "Shipping")}</dt><dd>{sums.ship ? money(sums.ship) : t("Gratis", "Free")}</dd></div><div className={d.total}><dt>Total</dt><dd>${sums.total.toFixed(2)}</dd></div></dl>
          <button type="button" className={d.primary} onClick={place}>{t("Confirmar pedido de demostración", "Place demo order")}</button>
          <button type="button" className={d.ghostBtn} onClick={() => setStep("shop")}>{t("Volver al carrito", "Back to cart")}</button>
        </div>
      </div>
    </div>}
    {step === "done" && <div className={d.done} role="status">
      <p className={d.check} aria-hidden="true">✓</p>
      <h4>{t("Pedido de demostración confirmado", "Demo order confirmed")}</h4>
      <p>{t(`Pedido ${order} · $${sums.total.toFixed(2)} con ${payLabel[pay]} (simulado). La venta ya aparece como «Cerrado» en el CRM y maduró un fruto en el árbol.`, `Order ${order} · $${sums.total.toFixed(2)} with ${payLabel[pay]} (simulated). The sale now shows as “Won” in the CRM and ripened a fruit on the tree.`)}</p>
      <button type="button" className={d.primary} onClick={() => { setCart([]); setApplied(false); setCoupon(""); setCouponMsg(""); setStep("shop"); }}>{t("Seguir comprando", "Keep shopping")}</button>
    </div>}
  </Panel>;
}
