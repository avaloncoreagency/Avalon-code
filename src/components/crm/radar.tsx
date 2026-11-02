"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  RADAR_SERVICES, RADAR_ZONES, type RadarPlace, type RadarService, type RadarZoneId,
} from "@/lib/crm/radar";
import s from "./crm.module.css";

type SearchResponse = { places?: RadarPlace[]; zone?: string; cached?: boolean; error?: string };
const serviceNames: Record<RadarService, string> = {
  website: "Diseño web", receptionist: "Recepcionista IA", crm: "CRM", ecommerce: "E-commerce",
};

/** Manual discovery. Prospect approval and CRM conversion use the existing audited CRM flow. */
export function LeadRadar({ ownerId, onSaved }: { ownerId: string; onSaved: () => void }) {
  const [zone, setZone] = useState<RadarZoneId>("miami");
  const [service, setService] = useState<RadarService>("website");
  const [radius, setRadius] = useState("1500");
  const [places, setPlaces] = useState<RadarPlace[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sourceZone, setSourceZone] = useState("");
  const [cached, setCached] = useState(false);

  async function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (searching) return;
    setSearching(true); setError(""); setNotice(""); setSearched(false); setPlaces([]);
    try {
      const params = new URLSearchParams({ zone, service, radius });
      const res = await fetch("/admin/workspace/crm/radar?" + params.toString(), { cache: "no-store" });
      const body = await res.json() as SearchResponse;
      if (!res.ok) throw new Error(body.error ?? "No se pudo completar la búsqueda");
      setPlaces(body.places ?? []); setSearched(true);
      setSourceZone(body.zone ?? ""); setCached(Boolean(body.cached));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Radar no disponible");
    } finally { setSearching(false); }
  }

  async function save(place: RadarPlace) {
    if (!ownerId || busyKey) return;
    setBusyKey(place.key); setError(""); setNotice("");
    try {
      const res = await fetch("/admin/workspace/crm/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "prospects",
          values: {
            company: place.name, contact: "", email: place.email || null, phone: place.phone,
            source: "OpenStreetMap " + place.key,
            owner_id: ownerId, industry: place.industry, location: place.location,
            opportunity: place.opportunity, acquired_at: new Date().toISOString(), status: "pending",
          },
        }),
      });
      const body = await res.json() as { error?: string };
      if (!res.ok) throw new Error(res.status === 409
        ? "Este negocio ya figura en Lead Hunter. Búscalo en los prospectos guardados."
        : body.error ?? "No se pudo guardar");
      setSaved(current => [...current, place.key]);
      setNotice(place.name + " guardado para revisión. Apruébalo en la lista y conviértelo en lead cuando lo califiques.");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar"); }
    finally { setBusyKey(""); }
  }

  return (
    <section className={s.radar} aria-labelledby="radar-title">
      <div className={s.radarHead}>
        <div>
          <p className={s.eyebrow}>Avalon · Lead Hunter</p>
          <h2 id="radar-title">Radar de negocios</h2>
          <p className={s.muted}>Busca negocios reales en un mapa abierto. Evalúa su presencia digital, guarda los candidatos y llévalos al pipeline después de aprobarlos.</p>
        </div>
        <span className={s.radarLive}>● Búsqueda manual</span>
      </div>
      <form onSubmit={search} className={s.radarForm}>
        <label>Zona
          <select value={zone} onChange={e => setZone(e.target.value as RadarZoneId)}>
            {RADAR_ZONES.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </label>
        <label>Servicio que podríamos ofrecer
          <select value={service} onChange={e => setService(e.target.value as RadarService)}>
            {RADAR_SERVICES.map(x => <option value={x.id} key={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label>Radio de búsqueda
          <select value={radius} onChange={e => setRadius(e.target.value)}>
            <option value="800">800 metros</option>
            <option value="1500">1,5 km</option>
            <option value="2500">2,5 km</option>
          </select>
        </label>
        <button disabled={searching} type="submit" className={s.radarSearch}>
          {searching ? "Buscando negocios…" : "Buscar oportunidades"}
        </button>
      </form>
      <p className={s.radarDisclosure}>Datos empresariales publicados en OpenStreetMap (ODbL). Que no aparezca una web, correo o teléfono <strong>no demuestra que el negocio carezca de ellos</strong>. El mapa no revela si usa CRM, e-commerce o agentes IA: hay que verificarlo antes de vender. No incluye nombres privados de propietarios.</p>
      {error && <div className={s.notice} role="alert">{error}</div>}
      {notice && <p className={s.radarNotice} role="status">{notice}</p>}
      {searched && (
        <div aria-live="polite">
          <div className={s.radarSummary}>
            <strong>{places.length} negocios para revisar</strong>
            <span>{sourceZone} · {cached ? "Resultados recientes en caché" : "Consulta de mapa"}</span>
          </div>
          {!places.length && <p className={s.empty}>No hay negocios con datos suficientes para estos filtros. Prueba otra zona, radio o servicio. La cobertura del mapa varía.</p>}
          <div className={s.radarGrid}>
            {places.map(place => <article key={place.key} className={s.radarCard}>
              <div className={s.radarCardTop}>
                <div><h3>{place.name}</h3><small>{place.industry} · {place.location}</small></div>
                <span className={s.radarScore} title="Prioridad calculada a partir de datos de contacto y web registrada, no calidad del negocio">{place.score}/100</span>
              </div>
              <div className={s.radarSignals}>
                <span data-tone={place.websiteUnlisted ? "warn" : "ok"}>{place.websiteUnlisted ? "Web no registrada en mapa" : "Web registrada"}</span>
                <span>{place.phone ? "Teléfono disponible" : "Teléfono no registrado"}</span>
                <span>{place.email ? "Correo disponible" : "Correo no registrado"}</span>
              </div>
              <p className={s.radarOpportunity}><strong>{serviceNames[place.service]} · oportunidad por verificar</strong><br />{place.opportunity}</p>
              <div className={s.radarContacts}>
                {place.phone ? <a href={"tel:" + place.phone}>{place.phone}</a> : <span>Teléfono no disponible</span>}
                {place.email ? <a href={"mailto:" + place.email}>{place.email}</a> : <span>Correo no disponible</span>}
                {place.website && <a href={place.website} target="_blank" rel="noopener noreferrer">Visitar web</a>}
                <a href={place.mapUrl} target="_blank" rel="noopener noreferrer">Ver ficha en mapa</a>
              </div>
              <p className={s.muted}>Dueño o contacto decisor: <strong>sin verificar</strong>. Confirma responsable y necesidades antes de llamar.</p>
              <button className={s.radarSave} disabled={!ownerId || Boolean(busyKey) || saved.includes(place.key)}
                onClick={() => void save(place)}>
                {saved.includes(place.key) ? "Guardado para revisión ✓" : busyKey === place.key ? "Guardando…" : "Guardar prospecto"}
              </button>
            </article>)}
          </div>
        </div>
      )}
      <div className={s.radarBottom}>
        <span>Flujo: mapa → prospecto pendiente → aprobación → pipeline → venta.</span>
        <Link href="/admin/workspace/crm/leads">Ir al pipeline de ventas</Link>
      </div>
      <p className={s.radarAttribution}>Fuente: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a>. Servicio sujeto a cobertura, límites y disponibilidad; no se ejecutan rastreos automáticos.</p>
    </section>
  );
}
