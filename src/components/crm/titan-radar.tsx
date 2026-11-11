"use client";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Map as LeafletMap, LayerGroup, Circle } from "leaflet";
import { INDUSTRIES, PUBLIC_MAX_RADIUS_M, RADIUS_PRESETS_MI, tierStyle, type IndustryId } from "@/lib/crm/radar";
import s from "./titan.module.css";
import { RadarResearchPanel } from "./radar-research-panel";
import { RadarAutoResearch } from "./radar-auto-research";
import { resolveRadarMapTiles, geoapifyFreeTileUrl, GEOAPIFY_FREE_TILE_ATTRIBUTION } from "@/lib/crm/radar-map-tiles";

type Need = { service: string; state: string; evidence_url: string; method: string; note: string; confidence: string; verified_at: string | null };
export type RadarBusiness = {
  id: string; company: string; contact: string; email: string | null; phone: string; industry: string; category: string; location: string;
  status: string; source_ref: string; lat: number | null; lon: number | null; website: string; license: string; first_seen_at: string | null;
  last_seen_at: string | null; do_not_contact: boolean; research_status: string; stars: number | null; stars_reasons: string[]; confidence: string;
  stars_override: number | null; override_reason: string; lead_id: string | null; crm_prospect_needs: Need[];
};
const SERVICES: [string, string][] = [["website", "Sitio web"], ["ecommerce", "E-commerce"], ["crm", "CRM / seguimiento"], ["receptionist", "Recepcionista IA"], ["marketing", "Marketing"], ["automation", "Automatización"]];
const STATES: [string, string][] = [["unverified", "Sin verificar"], ["verified_missing", "Necesidad verificada"], ["opportunity_to_improve", "Oportunidad de mejora"], ["verified_present", "Ya lo tiene (verificado)"], ["not_applicable", "No aplica"]];
const METHODS: [string, string][] = [["call", "Llamada"], ["website_review", "Revisión de su web"], ["public_listing", "Ficha pública"], ["owner_statement", "Lo dijo el negocio"], ["visit", "Visita"], ["other", "Otro"]];
const VIEWS: [string, string][] = [["all", "Encontrados"], ["new", "Nuevos"], ["unrated", "Sin calificar"], ["preliminary", "Precalificados"], ["qualified", "Calificados"], ["approved", "Aprobados"], ["pipeline", "En pipeline"], ["discarded", "Descartados"], ["dnc", "No contactar"]];
const CONFIDENCE: Record<string, string> = { none: "Sin evidencia", low: "Baja", medium: "Media", high: "Alta" };
/** Guidance only; actual automatic scores come from the verified evidence RPC. */
const RATING_GUIDE: { stars: number | null; rule: string }[] = [
  { stars: 5, rule: "Necesidades verificadas en prácticamente todos los servicios aplicables; propuesta integral clara." },
  { stars: 4, rule: "Varias carencias importantes verificadas; oportunidad real de vender múltiples servicios." },
  { stars: 3, rule: "Una o dos necesidades de alto impacto confirmadas; oferta concreta." },
  { stars: 2, rule: "Precalificación de ficha con web y teléfono, O mejora técnica verificada. No implica intención de compra." },
  { stars: 1, rule: "Ficha pública encontrada con categoría y ubicación; prioridad de investigación, no necesidad confirmada." },
  { stars: null, rule: "No hay siquiera una ficha pública suficiente ni necesidad verificada. Sigue sin calificar." },
];
const CUSTOM_MAP_TILE_URL = resolveRadarMapTiles(process.env.NEXT_PUBLIC_AVALON_MAP_TILES);
const GEOAPIFY_MAP_TILE_URL = geoapifyFreeTileUrl(process.env.NEXT_PUBLIC_AVALON_GEOAPIFY_MAP_KEY);
const MAP_TILE_URL = CUSTOM_MAP_TILE_URL ?? GEOAPIFY_MAP_TILE_URL;
const USE_GEOAPIFY_MAP = !CUSTOM_MAP_TILE_URL && !!GEOAPIFY_MAP_TILE_URL;
const effective = (b: RadarBusiness) => b.stars_override ?? b.stars;
const isPreliminary = (b: RadarBusiness) => b.stars_override == null &&
  b.stars_reasons.some(reason => reason.startsWith("Precalificación automática:"));
const shape = (b: RadarBusiness) => b.do_not_contact ? "dnc" : b.status === "converted" ? "pipeline" : b.status === "approved" ? "approved" : "found";
const SHAPE_LABEL: Record<string, string> = { found: "Encontrado", approved: "Aprobado", pipeline: "En pipeline", dnc: "No contactar" };
const distanceKm = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/** Avalon Titan Radar: real map, honest search state, evidence-based tiers, human approval. */
export function TitanRadar({ onChanged }: { onChanged?: () => void }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const ring = useRef<Circle | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const placesLoadRevision = useRef(0);
  const [center, setCenter] = useState<[number, number]>([25.7743, -80.1937]);
  const [label, setLabel] = useState("Miami, Florida");
  const [radius, setRadius] = useState("3");
  const [unit, setUnit] = useState<"mi" | "km">("mi");
  const [industries, setIndustries] = useState<IndustryId[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [geoResults, setGeoResults] = useState<{ label: string; lat: number; lon: number }[]>([]);
  const [view, setView] = useState("all");
  const [minStars, setMinStars] = useState(0);
  const [onlyZone, setOnlyZone] = useState(false);
  const [places, setPlaces] = useState<RadarBusiness[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [lastSearch, setLastSearch] = useState<{ at: string; found: number; inserted: number; updated: number; runId: string | null } | null>(null);
  // Results of ONE search (run_id) instead of the whole accumulated inbox; null = everything.
  const [runFilter, setRunFilter] = useState<string | null>(null);
  // How the current center was chosen: map click, coordinates, postcode, address or place name (stored in the run history).
  const [searchKind, setSearchKind] = useState<"map" | "coordinates" | "postcode" | "address" | "place">("map");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdLeadId, setCreatedLeadId] = useState<string | null>(null);
  const [sweep, setSweep] = useState(true);
  const [tileStatus, setTileStatus] = useState<"loading" | "ready" | "unconfigured" | "failed">(MAP_TILE_URL ? "loading" : "unconfigured");
  const [mapRevision, setMapRevision] = useState(0);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const radiusM = Math.round(Number(radius) * (unit === "km" ? 1000 : 1609.344)) || 0;
  type Campaign = { id: string; name: string; radius_m: number; place_label: string; categories: string[]; frequency: string; status: string; last_run_at: string | null; crm_radar_runs: { status: string; found: number; inserted: number; started_at: string }[] };
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [placesProvider, setPlacesProvider] = useState<"geoapify" | "overpass" | "missing" | "unknown">("unknown");
  // Searches recorded today vs the daily cap; credits are an upper bound computed from our own records.
  // Set when "Pasar al pipeline" finds the business already exists as a lead (same e-mail / company + contact).
  const [existingLead, setExistingLead] = useState<{ prospectId: string; id: string; company: string } | null>(null);
  const [quota, setQuota] = useState<{ searchesToday: number; limit: number; remaining: number; blocked: boolean; maxCreditsUsed: number; sharedDailyCredits: number } | null>(null);
  const [scheduler, setScheduler] = useState("");
  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/admin/workspace/crm/radar/campaigns", { cache: "no-store" });
      if (!res.ok) throw new Error("campaigns unavailable");
      const body = await res.json() as {
        campaigns?: Campaign[]; scheduler?: { reason: string }; quota?: typeof quota;
        provider?: { kind: "geoapify" | "overpass" | "missing"; ready: boolean };
      };
      setCampaigns(body.campaigns ?? []);
      setPlacesProvider(body.provider?.kind ?? "unknown");
      setQuota(body.quota ?? null);
      setScheduler(body.scheduler?.reason ?? "");
    } catch {
      setScheduler("No se pudieron cargar las campañas. Revisa tu conexión e inténtalo nuevamente.");
    }
  }, []);
  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);
  async function campaign(payload: Record<string, unknown>, ok: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/admin/workspace/crm/radar/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json() as { error?: string; run?: { found: number; inserted: number; replayed: boolean } };
      if (!res.ok) throw new Error(body.error ?? "No se pudo completar");
      setNotice(body.run ? `${ok} ${body.run.found} encontrados · ${body.run.inserted} nuevos${body.run.replayed ? " (ya ejecutada esta hora)" : ""}.` : ok);
      await Promise.all([loadCampaigns(), load()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setSweep(false);
  }, []);

  const load = useCallback(async () => {
    // A response for a previous view/filter must never replace a newer inbox.
    const revision = ++placesLoadRevision.current;
    const params = new URLSearchParams({ view });
    if (minStars) params.set("stars", String(minStars));
    if (runFilter) params.set("run", runFilter);
    try {
      const res = await fetch("/admin/workspace/crm/radar/places?" + params, { cache: "no-store" });
      const body = await res.json() as { places?: RadarBusiness[]; error?: string };
      if (revision !== placesLoadRevision.current) return;
      if (!res.ok) { setError(body.error ?? "No se pudo cargar el radar."); return; }
      setPlaces(body.places ?? []);
    } catch {
      if (revision === placesLoadRevision.current) setError("No se pudo conectar al servidor del radar. Revisa tu conexión e inténtalo nuevamente.");
    }
  }, [view, minStars, runFilter]);
  useEffect(() => { void load(); }, [load]);

  // Only request tiles when an HTTPS basemap provider was explicitly approved.
  // Volunteer OSM servers previously returned policy-blocked images, sometimes with HTTP 200.
  useEffect(() => {
    let cancelled = false;
    let sizeTimer = 0;
    let tileTimer = 0;
    void import("leaflet").then(mod => {
      if (cancelled || !mapEl.current || map.current) return;
      L.current = mod;
      const m = mod.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView(center, 13);
      if (MAP_TILE_URL) {
        const tiles = mod.tileLayer(MAP_TILE_URL, {
          maxZoom: 19,
          // Narrow per-image override of the application's no-referrer security header.
          // Only the site origin, not the private CRM path, goes to the approved provider.
          referrerPolicy: "strict-origin-when-cross-origin",
          attribution: USE_GEOAPIFY_MAP
            ? GEOAPIFY_FREE_TILE_ATTRIBUTION
            : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        });
        let loaded = false;
        tiles.on("load", () => {
          if (cancelled || !m.hasLayer(tiles)) return;
          loaded = true;
          window.clearTimeout(tileTimer);
          setTileStatus("ready");
        });
        tiles.on("tileerror", () => {
          if (cancelled || !m.hasLayer(tiles)) return;
          m.removeLayer(tiles);
          window.clearTimeout(tileTimer);
          setTileStatus("failed");
        });
        tiles.addTo(m);
        tileTimer = window.setTimeout(() => {
          if (cancelled || loaded || !m.hasLayer(tiles)) return;
          m.removeLayer(tiles);
          setTileStatus("failed");
        }, 8000);
      }
      layer.current = mod.layerGroup().addTo(m);
      m.on("click", e => { setCenter([e.latlng.lat, e.latlng.lng]); setSearchKind("map"); setLabel("Punto " + e.latlng.lat.toFixed(4) + ", " + e.latlng.lng.toFixed(4)); });
      map.current = m;
      // Initial markers and range circle must render even if data loads before Leaflet.
      setMapRevision(n => n + 1);
      sizeTimer = window.setTimeout(() => { if (map.current === m) m.invalidateSize(); }, 100);
    }).catch(() => { if (!cancelled) setTileStatus("failed"); });
    return () => {
      cancelled = true;
      window.clearTimeout(sizeTimer);
      window.clearTimeout(tileTimer);
      const m = map.current;
      map.current = null; layer.current = null; ring.current = null;
      m?.stop(); m?.off(); m?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search radius ring.
  useEffect(() => {
    const mod = L.current, m = map.current;
    if (!mod || !m) return;
    ring.current?.remove();
    ring.current = mod.circle(center, { radius: Math.max(radiusM, 100), color: "#22d3ee", weight: 1.5, fillOpacity: 0.04, dashArray: "6 6" }).addTo(m);
  }, [center, radiusM, places, mapRevision]);

  const visible = useMemo(() => places.filter(p => !onlyZone || (p.lat !== null && p.lon !== null && distanceKm(center, [p.lat, p.lon]) * 1000 <= radiusM)), [places, onlyZone, center, radiusM]);

  // Markers synced with the list.
  useEffect(() => {
    const mod = L.current, group = layer.current;
    if (!mod || !group) return;
    group.clearLayers();
    let animatedMarkers = 0;
    for (const p of visible) {
      if (p.lat === null || p.lon === null) continue;
      const tier = tierStyle(effective(p));
      const kind = shape(p);
      // Limit continuous marker animations to protect low-end mobile devices.
      const live = sweep && animatedMarkers < 14;
      const delay = ((animatedMarkers % 7) * 0.45).toFixed(2);
      animatedMarkers++;
      const icon = mod.divIcon({
        className: "", iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<span class="${s.marker} ${s[kind]} ${live ? s.markerLive : ""} ${p.id === selected ? s.markerSelected : ""}" style="--tier:${tier.color};--blip-delay:${delay}s" aria-hidden="true">${effective(p) ?? "?"}</span>`,
      });
      const marker = mod.marker([p.lat, p.lon], { icon, title: `${p.company} · ${tier.label} · ${SHAPE_LABEL[kind]}`, keyboard: true, alt: p.company });
      marker.on("click", () => setSelected(p.id));
      group.addLayer(marker);
    }
  }, [visible, selected, mapRevision, sweep]);

  useEffect(() => {
    const p = places.find(x => x.id === selected);
    if (p && p.lat !== null && p.lon !== null) map.current?.panTo([p.lat, p.lon], { animate: false });
  }, [selected, places, mapRevision]);
  useEffect(() => { map.current?.panTo(center, { animate: false }); }, [center, mapRevision]);

  async function geocode(e: FormEvent) {
    e.preventDefault();
    setError(""); setGeoResults([]);
    try {
      const res = await fetch("/admin/workspace/crm/radar/geocode?q=" + encodeURIComponent(query), { cache: "no-store" });
      const body = await res.json() as { results?: { label: string; lat: number; lon: number }[]; error?: string; kind?: typeof searchKind };
      if (!res.ok) { setError(body.error ?? "No se encontró el lugar."); return; }
      if (!body.results?.length) { setError("Sin coincidencias. Prueba con otra ciudad, un código postal, una dirección o coordenadas (lat, lon)."); return; }
      setSearchKind(body.kind && body.kind !== "map" ? body.kind : "place");
      if (body.results.length === 1) pick(body.results[0], body.kind); else setGeoResults(body.results);
    } catch {
      setError("No se pudo buscar la ciudad. Revisa tu conexión e inténtalo nuevamente.");
    }
  }
  function pick(r: { label: string; lat: number; lon: number }, kind?: typeof searchKind) { if (kind) setSearchKind(kind); setCenter([r.lat, r.lon]); setLabel(r.label); setGeoResults([]); map.current?.setView([r.lat, r.lon], 12); }
  function locate() {
    if (locating) return;
    // On the current Avalon security baseline geolocation=() is disabled.
    // Detect that policy first; never ask for the user's location without a click.
    const doc = document as Document & {
      permissionsPolicy?: { allowsFeature(name: string): boolean };
      featurePolicy?: { allowsFeature(name: string): boolean };
    };
    if (doc.permissionsPolicy?.allowsFeature("geolocation") === false ||
        doc.featurePolicy?.allowsFeature("geolocation") === false) {
      setError("La ubicación está deshabilitada por la política de seguridad de Avalon. Busca una ciudad o toca el radar.");
      return;
    }
    if (!navigator.geolocation) { setError("Este navegador no permite ubicación. Busca una ciudad o toca el radar."); return; }
    setError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        pick({ label: "Mi ubicación", lat: pos.coords.latitude, lon: pos.coords.longitude }, "coordinates");
      },
      err => {
        setLocating(false);
        setError(err.code === 1
          ? "No se autorizó el acceso a tu ubicación. Busca una ciudad o toca el radar."
          : "No se pudo obtener tu ubicación. Busca una ciudad o toca el radar.");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }

  async function search() {
    if (searching) return;
    setSearching(true); setError(""); setNotice("");
    try {
      const params = new URLSearchParams({ lat: String(center[0]), lon: String(center[1]), radius, unit, label, industries: industries.join(","), kind: searchKind });
      const res = await fetch("/admin/workspace/crm/radar/area?" + params, { cache: "no-store" });
      const body = await res.json() as { error?: string; run?: { run_id?: string; found: number; inserted: number; updated: number }; searchedAt?: string };
      if (!res.ok) throw new Error(body.error ?? "Búsqueda no disponible");
      const runId = body.run?.run_id ?? null;
      setLastSearch({ at: body.searchedAt ?? new Date().toISOString(), found: body.run?.found ?? 0, inserted: body.run?.inserted ?? 0, updated: body.run?.updated ?? 0, runId });
      // Show exactly what THIS search found. Changing view/run re-runs load() through its effect, with the new values
      // (calling load() here would use the previous closure and could show the old inbox).
      setView("all"); setOnlyZone(!runId); setRunFilter(runId);
      void loadCampaigns();
      onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Búsqueda no disponible"); void loadCampaigns(); }
    finally { setSearching(false); }
  }

  async function act(id: string, payload: Record<string, unknown>, ok: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setCreatedLeadId(null); setExistingLead(null);
    try {
      const res = await fetch("/admin/workspace/crm/radar/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...payload }) });
      const body = await res.json() as { error?: string; lead_id?: string; stars?: number | null; qualified?: boolean; created?: boolean; link_warning?: boolean; code?: string; lead?: { id: string; company: string } };
      if (!res.ok) {
        // The business is already a lead (same e-mail / company + contact): say which one and offer the human link.
        if (body.code === "lead_exists" && body.lead) setExistingLead({ prospectId: id, id: body.lead.id, company: body.lead.company });
        throw new Error(body.error ?? "No se pudo guardar");
      }
      if (body.lead_id) setCreatedLeadId(body.lead_id);
      if (body.lead_id)
        setNotice(`${ok} ${body.created === false ? "La tarjeta ya existía" : "Tarjeta creada automáticamente"} en Nuevo lead.${body.link_warning ? " Revisa la vinculación con el prospecto." : ""}`);
      else if (payload.op === "need" && body.qualified)
        setNotice(`${ok} El radar calculó ${body.stars} estrella(s). Termina la investigación y pulsa «Calificar y crear tarjeta».`);
      else setNotice(ok);
      await load();
      onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar"); }
    finally { setBusy(false); }
  }

  const current = places.find(p => p.id === selected) ?? null;
  const currentPreliminary = current ? isPreliminary(current) : false;
  const best = visible.filter(p => (effective(p) ?? 0) >= 3 && !p.do_not_contact && p.status !== "rejected").sort((a, b) => (effective(b) ?? 0) - (effective(a) ?? 0)).slice(0, 5);

  return (
    <section className={s.titan} aria-labelledby="titan-title">
      <header className={s.head}>
        <div><p className={s.eyebrow}>Avalon · Lead Hunter</p><h2 id="titan-title">Titan Radar</h2>
          <p className={s.muted}>Explorar → Descubrir → Investigar el sitio oficial con fuentes → Revisar evidencias → Calificar → Pipeline. El radar verifica lo observable, pero nunca inventa necesidades invisibles.</p></div>
        <ol className={s.steps} aria-label="Recorrido">{["Explorar", "Investigar", "Calificar", "Pipeline"].map((step, i) => <li key={step} data-done={i < (current ? (current.status === "converted" ? 4 : effective(current) !== null && !currentPreliminary ? 3 : 1) : lastSearch ? 1 : 0)}>{step}</li>)}</ol>
      </header>

      <form className={s.searchBar} onSubmit={geocode} role="search">
        <label className={s.srOnly} htmlFor="radar-place">Ciudad, dirección o código postal</label>
        <input id="radar-place" value={query} onChange={e => setQuery(e.target.value)} placeholder="Ciudad, dirección o código postal" maxLength={120} />
        <button type="submit" className={s.ghost}>Ir</button>
        <button type="button" className={s.ghost} onClick={locate} aria-label="Usar mi ubicación" disabled={locating} aria-busy={locating}>{locating ? "…" : "◎"}</button>
      </form>
      {geoResults.length > 0 && <ul className={s.geoList}>{geoResults.map(r => <li key={r.label}><button type="button" onClick={() => pick(r)}>{r.label}</button></li>)}</ul>}

      <div className={s.controls}>
        <span className={s.centerLabel} title={label}>📍 {label}</span>
        <div className={s.radius} role="group" aria-label="Radio">
          {RADIUS_PRESETS_MI.map(v => <button type="button" key={v} aria-pressed={unit === "mi" && Number(radius) === v} onClick={() => { setUnit("mi"); setRadius(String(v)); }}>{v} mi</button>)}
          <label className={s.srOnly} htmlFor="radar-radius">Radio personalizado</label>
          <input id="radar-radius" inputMode="decimal" value={radius} onChange={e => setRadius(e.target.value.replace(/[^0-9.]/g, ""))} />
          <select aria-label="Unidad" value={unit} onChange={e => setUnit(e.target.value as "mi" | "km")}><option value="mi">mi</option><option value="km">km</option></select>
        </div>
        <button type="button" className={s.ghost} aria-expanded={showFilters} onClick={() => setShowFilters(v => !v)}>Filtros{industries.length ? ` (${industries.length})` : ""}</button>
        <button type="button" className={s.search} onClick={search} disabled={searching || radiusM < 100} aria-busy={searching}>{searching ? "Buscando…" : "Buscar negocios"}</button>
      </div>
      {radiusM > PUBLIC_MAX_RADIUS_M && <p className={s.hint}>Geoapify Free permite búsquedas de hasta 5 km en Avalon para controlar créditos. Para radios mayores se necesita otro proveedor autorizado. Selecciona 1 o 3 millas, o indica hasta 5 km.</p>}
      {showFilters && <fieldset className={s.filters}><legend>Industrias (opcional · sin filtros busca todas)</legend>
        {(Object.keys(INDUSTRIES) as IndustryId[]).map(id => <label key={id} className={s.chip}><input type="checkbox" checked={industries.includes(id)} onChange={e => setIndustries(cur => e.target.checked ? [...cur, id] : cur.filter(x => x !== id))} />{INDUSTRIES[id].name}</label>)}
      </fieldset>}

      <div className={s.status} aria-live="polite">
        <span>Exploración visual: {sweep ? "activa" : "pausada"} <button type="button" className={s.link} onClick={() => setSweep(v => !v)}>{sweep ? "Pausar animación" : "Animar"}</button></span>
        <span>Búsqueda: {searching ? "en ejecución…" : lastSearch ? `completada ${new Date(lastSearch.at).toLocaleTimeString()} · ${lastSearch.found} encontrados · ${lastSearch.inserted} nuevos · ${lastSearch.updated} ya conocidos` : "sin ejecutar en esta sesión"}</span>
        <span>Fuente de negocios: {placesProvider === "geoapify"
          ? "Geoapify Free · OpenStreetMap (ODbL)"
          : placesProvider === "overpass"
            ? "OpenStreetMap (Overpass autorizado)"
            : placesProvider === "missing" ? "NO CONFIGURADA" : "verificando…"}</span>
        {quota && <span data-testid="radar-quota" data-blocked={quota.blocked || undefined}>Cuota de hoy: {quota.searchesToday} de {quota.limit} búsquedas · hasta {quota.maxCreditsUsed} de {quota.sharedDailyCredits.toLocaleString("es")} créditos Geoapify (estimación máxima, compartida con mapa y ciudades)</span>}
        <span>Mapa base: {tileStatus === "ready" ? "conectado" : tileStatus === "loading" ? "cargando" : "modo radar sin cartografía"}</span>
      </div>
      {placesProvider === "missing" && <p className={s.hint} role="status">
        Para descubrir nuevos negocios hace falta conectar Geoapify Free en Vercel (AVALON_GEOAPIFY_PLACES_KEY). La bandeja y los leads existentes siguen disponibles.
      </p>}
      {error && <p className={s.error} role="alert">{error}</p>}
      {existingLead && <p className={s.hint} role="status" data-testid="radar-existing-lead">
        Lead existente: <a href={`/admin/workspace/crm/leads?lead=${existingLead.id}`}>{existingLead.company}</a>{" "}
        <button type="button" disabled={busy} onClick={() => void act(existingLead.prospectId, { op: "link" }, `Vinculado a «${existingLead.company}». No se creó un lead duplicado.`)}>Vincular al lead existente</button>
      </p>}
      {notice && <div className={s.ok} role="status">{notice}{createdLeadId && <>{" "}<Link href={`/admin/workspace/crm/leads?lead=${createdLeadId}`}>Abrir tarjeta en pipeline</Link></>}</div>}

      <RadarAutoResearch revision={lastSearch?.at ?? ""} onChanged={() => { void load(); onChanged?.(); }} />

      <details className={s.ratingGuide} id="radar-calificacion">
        <summary>
          <span className={s.ratingGuideIcon} aria-hidden="true">✦</span>
          <span className={s.ratingGuideHeading}><strong>Cómo calificar leads con estrellas</strong><small>Investiga primero · Guarda evidencia · Califica después</small></span>
          <span className={s.ratingGuideAction}>Ver criterios</span>
        </summary>
        <div className={s.ratingGuideBody}>
          <ol className={s.ratingSteps}>
            <li>Abre un negocio y revisa su web, atención, CRM, marketing y e-commerce solo cuando aplique.</li>
            <li>En «Necesidades por servicio» registra lo que comprobaste, el método, una nota o URL y el nivel de confianza.</li>
            <li>La calificación calculada depende de la evidencia registrada. Puedes ajustarla manualmente solo con un motivo verificable.</li>
            <li>La ficha pública recibe 1–2 estrellas preliminares automáticamente y después la investigación puede aumentar su calificación según pruebas.</li>
             <li>Solo una oportunidad realmente verificada puede convertirse en tarjeta del pipeline. Una calificación manual fundamentada también permite incorporarla.</li>
          </ol>
          <ul className={s.ratingRules}>
            {RATING_GUIDE.map(item => <li key={String(item.stars)}>
              <strong style={{ color: tierStyle(item.stars).color }}>{tierStyle(item.stars).label}</strong>
              <span>{item.rule}</span>
            </li>)}
          </ul>
          <p className={s.ratingWarning}><strong>Regla de evidencia:</strong> las estrellas preliminares indican prioridad para investigar, no carencias de servicios. Que una ficha no muestre página web, correo o teléfono NO prueba que el negocio carezca de ellos. Las estrellas miden oportunidad; «Confianza» mide por separado la solidez de las pruebas.</p>
        </div>
      </details>

      <div className={s.stage}>
        <div className={s.mapWrap}>
          <div ref={mapEl} className={s.map} data-basemap={USE_GEOAPIFY_MAP ? "geoapify" : undefined} role="application" aria-label="Radar de negocios. Toca para elegir el centro de búsqueda." />
          {(tileStatus === "unconfigured" || tileStatus === "failed") && <div className={s.mapNotice} role="status">
            <strong>{tileStatus === "failed" ? "Cartografía temporalmente no disponible" : "Radar en modo de respaldo"}</strong>
            <p>{tileStatus === "failed" ? "El proveedor de mapas no respondió. " : "No hay proveedor de mapas autorizado configurado. "}Los marcadores, el radio y la búsqueda siguen disponibles.</p>
            <a href={"https://www.openstreetmap.org/#map=13/" + center[0].toFixed(4) + "/" + center[1].toFixed(4)} target="_blank" rel="noopener noreferrer">Ver la zona en OpenStreetMap</a>
          </div>}
          {sweep && <div className={s.radarFx} data-searching={searching || undefined} aria-hidden="true">
            <div className={s.radarDial}>
              <div className={s.radarBeam} />
              <div className={s.radarEcho} />
              <div className={s.radarEchoDelayed} />
              <div className={s.radarCrosshair} />
            </div>
            <span className={s.radarTelemetry}><span className={s.radarLed} />{searching ? "CONSULTANDO FUENTE" : "BARRIDO VISUAL"} · {visible.length} EN VISTA</span>
          </div>}
          <ul className={s.legend} aria-label="Leyenda">{[5, 4, 3, 2, 1, null].map(t => <li key={String(t)}><span style={{ background: tierStyle(t).color }} />{tierStyle(t).label}</li>)}</ul>
        </div>

        <div className={s.side}>
          <nav className={s.views} aria-label="Bandejas del radar">{VIEWS.map(([k, v]) => <button type="button" key={k} aria-pressed={view === k} onClick={() => setView(k)}>{v}</button>)}</nav>
          <div className={s.quick}>
            <label>Mínimo <select value={minStars} onChange={e => setMinStars(Number(e.target.value))}><option value={0}>todas</option>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select></label>
            <label><input type="checkbox" checked={onlyZone} onChange={e => setOnlyZone(e.target.checked)} /> Solo esta zona</label>
            {lastSearch?.runId && <label><input type="checkbox" checked={runFilter === lastSearch.runId} onChange={e => setRunFilter(e.target.checked ? lastSearch.runId : null)} /> Solo la última búsqueda</label>}
            <span className={s.count}>{visible.length} negocios</span>
          </div>
          {best.length > 0 && <section className={s.best} aria-labelledby="best-title"><h3 id="best-title">✦ Mejores oportunidades de esta zona</h3>
            <ol>{best.map(b => <li key={b.id}><button type="button" onClick={() => setSelected(b.id)}><strong>{b.company}</strong> <span style={{ color: tierStyle(effective(b)).color }}>{tierStyle(effective(b)).label}</span></button></li>)}</ol></section>}
          <ul className={s.cards}>{visible.map(p => {
            const tier = tierStyle(effective(p));
            return <li key={p.id}><button type="button" className={s.card} data-selected={p.id === selected} onClick={() => setSelected(p.id)} aria-label={`Abrir ${p.company}`}>
              <span className={s.tier} style={{ borderColor: tier.color, color: tier.color }}>{tier.label}</span>
              <strong>{p.company}</strong>
              <small>{[p.industry, p.location].filter(Boolean).join(" · ")}</small>
              <small>{SHAPE_LABEL[shape(p)]} · Evidencia: {CONFIDENCE[p.confidence] ?? p.confidence}{isPreliminary(p) ? " · Calificación preliminar" : ""}{p.phone ? " · ☎ disponible" : ""}</small>
            </button></li>;
          })}</ul>
          {visible.length === 0 && <p className={s.muted}>Sin negocios en esta bandeja. Elige una zona y pulsa <strong>Buscar negocios</strong>. Si la fuente no devuelve datos, lo verás indicado; nunca se muestran negocios inventados.</p>}
        </div>
      </div>

      <section className={s.campaigns} aria-labelledby="campaigns-title">
        <header><h3 id="campaigns-title">Campañas de radar</h3>
          <form className={s.inline} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget);
            void campaign({ op: "create", name: f.get("name"), lat: center[0], lon: center[1], radius_m: radiusM, place_label: label, categories: industries, frequency: f.get("frequency") }, "Campaña creada (pausada).");
            e.currentTarget.reset(); }}>
            <input name="name" aria-label="Nombre de la campaña" placeholder="Ej.: Dentistas en Orlando" required maxLength={120} />
            <select name="frequency" aria-label="Frecuencia"><option value="weekly">Semanal</option><option value="daily">Diaria</option><option value="monthly">Mensual</option></select>
            <button type="submit" disabled={busy || radiusM < 100}>Guardar búsqueda actual como campaña</button>
          </form></header>
        {scheduler && <p className={s.hint}>{scheduler}</p>}
        {campaigns.length === 0 ? <p className={s.muted}>Sin campañas todavía.</p> : <ul className={s.cards}>{campaigns.map(c => {
          const last = [...(c.crm_radar_runs ?? [])].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
          return <li key={c.id} className={s.campaign}>
            <strong>{c.name}</strong>
            <small>{c.place_label || "Zona guardada"} · {(c.radius_m / 1609.344).toFixed(1)} mi · {c.categories.length ? c.categories.map(x => INDUSTRIES[x as IndustryId]?.name ?? x).join(", ") : "todas las industrias"} · {c.frequency}</small>
            <small>Estado: {c.status === "active" ? "Activa" : "Pausada"} · Última ejecución: {last ? `${new Date(last.started_at).toLocaleString()} · ${last.found} encontrados / ${last.inserted} nuevos` : "nunca"}</small>
            <div className={s.actions}>
              <button type="button" className={s.search} disabled={busy} onClick={() => campaign({ op: "run", id: c.id }, "Campaña ejecutada:")}>Ejecutar ahora</button>
              <button type="button" disabled={busy} onClick={() => campaign({ op: "status", id: c.id, status: c.status === "active" ? "paused" : "active" }, c.status === "active" ? "Campaña pausada." : "Campaña activada.")}>{c.status === "active" ? "Pausar" : "Activar"}</button>
            </div>
          </li>;
        })}</ul>}
      </section>

      {current && <aside className={s.sheet} role="dialog" aria-modal="false" aria-labelledby="sheet-title">
        <header><div><h3 id="sheet-title">{current.company}</h3><p className={s.muted}>{[current.industry, current.location].filter(Boolean).join(" · ")}</p></div>
          <button type="button" className={s.close} onClick={() => setSelected(null)} aria-label="Cerrar ficha">✕</button></header>
        <p className={s.tierBig} style={{ color: tierStyle(effective(current)).color }}>{tierStyle(effective(current)).label}{current.stars_override ? " (ajuste manual)" : currentPreliminary ? " (preliminar)" : ""} · Evidencia {CONFIDENCE[current.confidence]}</p>
        <details open><summary>¿Por qué tiene esta calificación?</summary><ul>{current.stars_reasons.map(r => <li key={r}>{r}</li>)}{current.stars_override && <li>Ajuste manual: {current.override_reason}</li>}</ul></details>
        <dl className={s.facts}>
          <dt>Teléfono</dt><dd>{current.phone ? <a href={`tel:${current.phone.replace(/[^\d+]/g, "")}`}>{current.phone}</a> : "No disponible"}</dd>
          <dt>Correo</dt><dd>{current.email ? <a href={`mailto:${current.email}`}>{current.email}</a> : "No disponible"}</dd>
          <dt>Web</dt><dd>{current.website ? <a href={current.website} target="_blank" rel="noopener noreferrer nofollow">{current.website}</a> : "No registrada en la fuente (no significa que no tenga)"}</dd>
          <dt>Decisor</dt><dd>{current.contact || "Pendiente de verificar"}</dd>
          <dt>Fuente</dt><dd>{current.source_ref} · {current.license || "—"}</dd>
          <dt>Vista por última vez</dt><dd>{current.last_seen_at ? new Date(current.last_seen_at).toLocaleString() : "—"}</dd>
        </dl>
        {!current.do_not_contact && current.status !== "rejected" && <RadarResearchPanel
          key={current.id}
          prospectId={current.id}
          businessName={current.company}
          initialWebsite={current.website}
          profile={{
            company: current.company,
            category: current.category,
            phone: current.phone,
            website: current.website,
            contact: current.contact,
            stars: current.stars,
            stars_override: current.stars_override,
            stars_reasons: current.stars_reasons,
            confidence: current.confidence,
            status: current.status,
            do_not_contact: current.do_not_contact,
            needs: current.crm_prospect_needs,
          }}
          promoting={busy}
          onPromote={() => void act(current.id, { op: "qualify" }, `${current.company}: lead incorporado al pipeline.`)}
          onChanged={() => { void load(); onChanged?.(); }}
        />}
        <div className={s.actions}>
          {current.phone && !current.do_not_contact && <a className={s.call} href={`tel:${current.phone.replace(/[^\d+]/g, "")}`}>☎ Llamar</a>}
          {current.website && <a className={s.research} href={current.website} target="_blank" rel="noopener noreferrer nofollow">Investigar web</a>}
          {current.status === "converted" && <Link className={s.pipeline} href={current.lead_id ? `/admin/workspace/crm/leads?lead=${current.lead_id}` : "/admin/workspace/crm/leads"}>Abrir tarjeta en pipeline</Link>}
          {current.status !== "converted" && current.status !== "rejected" && <button type="button" className={s.discard} disabled={busy} onClick={() => act(current.id, { op: "status", action: "discard" }, "Descartado.")}>Descartar</button>}
          {current.status === "rejected" && !current.do_not_contact && <button type="button" className={s.ghost} disabled={busy} onClick={() => act(current.id, { op: "status", action: "reopen" }, "Reabierto.")}>Reabrir</button>}
          {current.status !== "converted" && !current.do_not_contact && <button type="button" className={s.discard} disabled={busy} onClick={() => act(current.id, { op: "status", action: "dnc" }, "Marcado como No contactar.")}>No contactar</button>}
        </div>

        {current.status !== "converted" && <>
          <div className={s.qualifyPanel} data-ready={effective(current) !== null && !currentPreliminary ? "true" : "false"}>
             <strong>Calificación actual: <span style={{ color: tierStyle(effective(current)).color }}>{tierStyle(effective(current)).label}</span></strong>
             {effective(current) !== null && !currentPreliminary && !current.do_not_contact && current.status !== "rejected"
               ? <button type="button" className={s.pipeline} disabled={busy} onClick={() => void act(current.id, { op: "qualify" }, `${current.company}: calificación confirmada.`)}>★ Calificar y crear tarjeta en pipeline</button>
               : <p className={s.ratingTip}>{current.do_not_contact || current.status === "rejected"
                 ? "Negocio bloqueado o descartado: no se enviará al pipeline."
                 : currentPreliminary
                  ? "Estas estrellas son una prioridad inicial basada en el directorio. La investigación automática debe encontrar una oportunidad comprobada antes de enviar al pipeline."
                  : "Sin evidencia suficiente. Guarda necesidades verificadas o asigna estrellas manualmente con motivo."}</p>}
             <small>Una tarjeta por negocio en «Nuevo lead». La oportunidad y la confianza de evidencia se muestran por separado.</small>
             <div className={s.quickManual}><p className={s.ratingTip}>¿Verificaste otra oportunidad? Puedes asignar estrellas manualmente y crear el lead en un solo paso.</p>
          <form key={`override:${current.id}`} className={s.inline} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const v = String(f.get("stars"));
            void act(current.id, { op: "override", stars: v ? Number(v) : null, reason: f.get("reason") }, v ? "Calificación manual confirmada." : "Volviste al cálculo automático."); }}>
            <h4>Ajuste manual de estrellas</h4>
            <select name="stars" aria-label="Estrellas manuales" required defaultValue={current.stars_override ?? ""}><option value="" disabled>Selecciona 1–5 estrellas</option>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select>
            <input name="reason" aria-label="Motivo del ajuste" placeholder="Motivo (mínimo 10 caracteres)" defaultValue={current.override_reason} maxLength={1000} />
            <button type="submit" className={s.pipeline} disabled={busy}>Calificar manualmente y crear lead</button>
          </form>
             </div>
           </div>
           <h4>Necesidades por servicio (evidencia)</h4>
           <p className={s.ratingTip}>Registra lo comprobado antes de decidir las estrellas. «Sin verificar» no cuenta como una carencia.</p>
           <details className={s.sheetGuide}><summary>Ver escala de estrellas para este lead</summary>
             <ul>{RATING_GUIDE.map(item => <li key={String(item.stars)}><strong style={{ color: tierStyle(item.stars).color }}>{tierStyle(item.stars).label}:</strong> {item.rule}</li>)}</ul>
             <p>La confianza de cada prueba se evalúa aparte. Para un ajuste manual necesitas justificar el motivo.</p>
           </details>
          <div className={s.needs}>{SERVICES.map(([key, name]) => {
            const n = current.crm_prospect_needs.find(x => x.service === key);
            return <form key={`${current.id}:${key}`} className={s.need} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget);
              void act(current.id, { op: "need", service: key, state: f.get("state"), method: f.get("method"), evidence_url: f.get("evidence_url"), note: f.get("note"), confidence: f.get("confidence") }, `${name}: guardado.`); }}>
              <strong>{name}</strong>
              <select name="state" aria-label={`Estado de ${name}`} defaultValue={n?.state ?? "unverified"}>{STATES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
              <select name="method" aria-label={`Método de ${name}`} defaultValue={n?.method ?? ""}><option value="">Método…</option>{METHODS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
              <select name="confidence" aria-label={`Confianza de ${name}`} defaultValue={n?.confidence ?? "medium"}><option value="low">Confianza baja</option><option value="medium">Media</option><option value="high">Alta</option></select>
              <input name="evidence_url" aria-label={`Evidencia de ${name}`} placeholder="URL de evidencia (opcional)" defaultValue={n?.evidence_url ?? ""} />
              <input name="note" aria-label={`Nota de ${name}`} placeholder="Nota" defaultValue={n?.note ?? ""} maxLength={2000} />
              <button type="submit" disabled={busy}>Guardar</button>
            </form>;
          })}</div>
          <form className={s.inline} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget);
            void act(current.id, { op: "contact", contact: f.get("contact"), phone: f.get("phone"), email: f.get("email") }, "Contacto actualizado."); }}>
            <h4>Contacto verificado</h4>
            <input name="contact" aria-label="Decisor verificado" placeholder="Nombre y cargo del decisor (solo si lo verificaste)" defaultValue={current.contact} maxLength={160} />
            <input name="phone" aria-label="Teléfono comercial" placeholder="Teléfono comercial" defaultValue={current.phone} maxLength={40} />
            <input name="email" aria-label="Correo comercial" placeholder="Correo comercial" defaultValue={current.email ?? ""} maxLength={254} />
            <button type="submit" disabled={busy}>Guardar contacto</button>
          </form>

        </>}
      </aside>}
    </section>
  );
}
