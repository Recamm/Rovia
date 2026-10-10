import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type L from "leaflet";
import {
  Search,
  SlidersHorizontal,
  X,
  MapPin,
  Navigation,
  Plus,
  Minus,
  List,
  Map,
  ArrowRight,
  RotateCcw,
  Info,
  ArrowUpRight,
} from "lucide-react";
import type {
  Bounds,
  Filters,
  Place,
  Category,
  PersonalFilter,
  MapScope,
} from "../types";
import { categories } from "../domain/rules";
import { searchPlaces, ownLists } from "../services/api";
import { configured } from "../services/supabase";
import { useApp, useDebounce } from "../hooks/useApp";
import { MapView } from "../components/MapView";
import {
  PlaceCard,
  Loading,
  ErrorState,
  CategoryIcon,
  Modal,
  AuthGate,
} from "../components/UI";
const defaults: Filters = {
  categories: [],
  rating: 0,
  price: "",
  radius: 0,
  open: false,
};
export default function Explore() {
  const [params, setParams] = useSearchParams();
  const mode: MapScope = params.get("map") === "mine" ? "mine" : "all";
  const [personalFilter, setPersonalFilter] = useState<PersonalFilter>("all");
  const listId = mode === "mine" ? params.get("list") : null;
  const [text, setText] = useState("");
  const search = useDebounce(text);
  const [filters, setFilters] = useState(defaults);
  const [showFilters, setShowFilters] = useState(false);
  const [showList, setShowList] = useState(false);
  const [bounds, setBounds] = useState<Bounds>(
    mode === "mine"
      ? {
          south: -34.77,
          west: -58.57,
          north: -34.45,
          east: -58.32,
          lat: -34.6,
          lng: -58.46,
        }
      : {
          south: -34.604,
          west: -58.449,
          north: -34.576,
          east: -58.413,
          lat: -34.588,
          lng: -58.431,
        },
  );
  const [pending, setPending] = useState<Bounds | null>(null);
  const [moved, setMoved] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
  const [tileError, setTileError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [origin, setOrigin] = useState("el centro del mapa");
  const map = useRef<L.Map | null>(null);
  const navigate = useNavigate();
  const { notice, session } = useApp();
  const lists = useQuery({
    queryKey: ["lists", session?.user.id],
    queryFn: ownLists,
    enabled: !!session && mode === "mine",
  });
  const places = useQuery({
    queryKey: [
      "places",
      bounds,
      filters,
      search,
      mode,
      personalFilter,
      listId,
      session?.user.id,
    ],
    enabled: mode === "all" || !!session,
    queryFn: ({ signal }) =>
      searchPlaces(
        bounds,
        filters,
        search,
        signal,
        mode,
        personalFilter,
        listId,
      ),
  });
  function switchMode(next: MapScope) {
    setParams(next === "mine" ? { map: "mine" } : {});
    setSelected(null);
    if (next === "mine") {
      setBounds({
        south: -34.77,
        west: -58.57,
        north: -34.45,
        east: -58.32,
        lat: -34.6,
        lng: -58.46,
      });
      map.current?.flyTo([-34.6, -58.46], 11);
    } else if (pending) setBounds(pending);
    if (next === "mine" && !session) setShowList(true);
  }
  useEffect(
    () => setSelected(null),
    [mode, filters, search, bounds, personalFilter, listId],
  );
  const onBounds = useCallback((b: Bounds) => {
    setPending(b);
    setMoved(true);
  }, []);
  const onMap = useCallback((m: L.Map) => {
    map.current = m;
  }, []);
  const onSelect = useCallback((p: Place) => {
    setSelected(p);
    setShowList(false);
  }, []);
  const current = places.data ?? [];
  function locate() {
    if (!navigator.geolocation) {
      notice(
        "Tu navegador no ofrece ubicación. Podés explorar moviendo el mapa.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        map.current?.flyTo([p.coords.latitude, p.coords.longitude], 15);
        setOrigin("tu ubicación autorizada");
        setBounds({
          ...bounds,
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          south: p.coords.latitude - 0.014,
          north: p.coords.latitude + 0.014,
          west: p.coords.longitude - 0.017,
          east: p.coords.longitude + 0.017,
        });
      },
      () => {
        setLocating(false);
        notice(
          "Podés buscar en el catálogo o moverte por el mapa aunque no compartas tu ubicación.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }
  const activeFilters =
    filters.rating > 0 || !!filters.price || filters.radius > 0 || filters.open;
  return (
    <div className={`explore ${showList ? "list-view" : ""}`}>
      <aside className={`explore-panel ${showList ? "mobile-visible" : ""}`}>
        {showList && (
          <button
            className="panel-back button secondary"
            onClick={() => setShowList(false)}
          >
            <Map size={16} />
            Volver al mapa
          </button>
        )}
        <div className="explore-intro">
          <span className="eyebrow">
            <span className="tiny-dot" /> TU PRÓXIMO PLAN
          </span>
          <h1>
            Un lugar nuevo.
            <br />
            <span className="serif">Una buena historia.</span>
          </h1>
          <p>
            {mode === "mine"
              ? "Tus guardados, visitas, reseñas y listas en un mismo mapa."
              : "Descubrí dónde comer y tomar algo en CABA y Vicente López."}
          </p>
        </div>
        <label className="search-input">
          <Search size={20} />
          <input
            aria-label="Buscar lugares"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Un café, un bar, un lugar…"
          />
          {text && (
            <button onClick={() => setText("")} aria-label="Limpiar búsqueda">
              <X size={16} />
            </button>
          )}
        </label>
        <div className="area-row">
          <MapPin size={15} />
          <select
            aria-label="Mover mapa a una zona"
            onChange={(e) => {
              const [lat, lng] = e.target.value.split(",").map(Number);
              map.current?.flyTo([lat, lng], 15);
            }}
          >
            <option value="-34.588,-58.431">Palermo, Buenos Aires</option>
            <option value="-34.513,-58.487">Olivos, Buenos Aires</option>
            <option value="-34.531,-58.522">Munro, Buenos Aires</option>
            <option value="-34.530,-58.476">Vicente López</option>
            <option value="-34.538,-58.495">Florida, Vicente López</option>
            <option value="-34.546,-58.513">
              Villa Martelli, Vicente López
            </option>
            <option value="-34.519,-58.530">Carapachay, Vicente López</option>
            <option value="-34.565,-58.457">Belgrano, CABA</option>
            <option value="-34.619,-58.441">Caballito, CABA</option>
            <option value="-34.609,-58.373">Centro, CABA</option>
          </select>
          <button
            className={`filter-trigger ${activeFilters ? "on" : ""}`}
            onClick={() => setShowFilters(true)}
            aria-label="Abrir filtros"
          >
            <SlidersHorizontal size={17} />
            Filtros{activeFilters && <i />}
          </button>
        </div>
        {mode === "mine" && session && (
          <div className="personal-filters">
            <label>
              Mostrar
              <select
                aria-label="Filtrar Mi mapa"
                value={personalFilter}
                onChange={(e) =>
                  setPersonalFilter(e.target.value as PersonalFilter)
                }
              >
                <option value="all">Todos mis lugares</option>
                <option value="saved">Guardados</option>
                <option value="want">Quiero ir</option>
                <option value="visited">Ya fui</option>
                <option value="reviewed">Reseñados</option>
                <option value="lists">En mis listas</option>
              </select>
            </label>
            <label>
              Lista
              <select
                aria-label="Filtrar mapa por lista"
                value={listId ?? ""}
                onChange={(e) =>
                  setParams(
                    e.target.value
                      ? { map: "mine", list: e.target.value }
                      : { map: "mine" },
                  )
                }
              >
                <option value="">Todas mis listas</option>
                {lists.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <Link className="text-link" to="/guardados?tab=lists">
              Crear y organizar listas <ArrowUpRight size={14} />
            </Link>
            {lists.isError && <ErrorState error={lists.error} />}
          </div>
        )}
        <div className="category-grid">
          {(Object.keys(categories) as Category[]).map((cat) => (
            <button
              key={cat}
              className={`category-chip ${filters.categories.includes(cat) ? "active" : ""}`}
              aria-pressed={filters.categories.includes(cat)}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  categories: f.categories.includes(cat)
                    ? f.categories.filter((c) => c !== cat)
                    : [...f.categories, cat],
                }))
              }
            >
              <CategoryIcon category={cat} size={16} />
              {categories[cat].label}
            </button>
          ))}
        </div>
        <div className="results-heading">
          <h2>
            {mode === "mine"
              ? "Mis lugares en esta zona"
              : "Lugares para descubrir"}
          </h2>
          <span>
            {current.length}
            {current.length === 200 ? "+" : ""}
          </span>
        </div>
        <div className="result-origin">Distancias desde {origin}</div>
        <div className="result-list">
          {mode === "mine" && !session ? (
            <AuthGate />
          ) : places.isPending ? (
            <Loading />
          ) : places.isError ? (
            <ErrorState error={places.error} retry={() => places.refetch()} />
          ) : current.length === 0 ? (
            <div className="empty-results">
              <Search size={28} />
              <h3>
                {mode === "mine"
                  ? "Todavía no hay lugares tuyos en esta zona"
                  : "No encontramos lugares en esta zona"}
              </h3>
              <p>
                {mode === "mine"
                  ? "Guardá un local, marcá una visita, escribí una reseña o agregalo a una lista. También podés ampliar la zona o cambiar los filtros."
                  : "Probá ampliar la zona o cambiar los filtros. Si falta un local gastronómico, podés sugerirlo."}
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  setText("");
                  setFilters(defaults);
                  map.current?.flyTo([-34.588, -58.431], 15);
                  setBounds({
                    south: -34.604,
                    west: -58.449,
                    north: -34.576,
                    east: -58.413,
                    lat: -34.588,
                    lng: -58.431,
                  });
                }}
              >
                Volver a Palermo
              </button>
            </div>
          ) : (
            current.map((p) => (
              <PlaceCard
                key={p.id}
                place={p}
                active={selected?.id === p.id}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
        <div className="catalog-foot">
          <Info size={16} />
          <span>
            Gastronomía · CABA + Vicente López.
            <br />
            {configured
              ? "Reseñas de la comunidad Rovia."
              : "Cuentas y guardados: conexión pendiente."}
          </span>
        </div>
        <Link className="suggest-link" to="/sugerir-local">
          <Plus size={17} /> ¿Falta un local? Sugerilo
        </Link>
      </aside>
      <section className="map-section" aria-label="Mapa interactivo de lugares">
        <MapView
          center={mode === "mine" ? [-34.6, -58.46] : undefined}
          zoom={mode === "mine" ? 11 : undefined}
          places={current}
          selected={selected?.id}
          onSelect={onSelect}
          onBounds={onBounds}
          onMap={onMap}
          onTileError={() => setTileError(true)}
        />
        <div className="map-top">
          <div
            className="map-mode-switch"
            role="group"
            aria-label="Vistas del mapa"
          >
            <button
              className={mode === "all" ? "active" : ""}
              aria-pressed={mode === "all"}
              onClick={() => switchMode("all")}
            >
              <Map size={16} />
              Explorar
            </button>
            <button
              className={mode === "mine" ? "active" : ""}
              aria-pressed={mode === "mine"}
              onClick={() => switchMode("mine")}
            >
              <MapPin size={16} />
              Mi mapa
            </button>
          </div>
          <button
            className="map-pill mobile-search"
            onClick={() => setShowList((s) => !s)}
          >
            <Search size={18} />
            Buscar lugares
          </button>
          <button
            className="map-pill list-toggle"
            onClick={() => setShowList((s) => !s)}
          >
            <List size={16} />
            {showList ? "Ver mapa" : "Ver resultados"}
          </button>
        </div>
        {moved && (
          <button
            className="search-area"
            onClick={() => {
              if (pending) setBounds(pending);
              setMoved(false);
              setOrigin("el centro del mapa");
            }}
          >
            <RotateCcw size={16} />
            Buscar en esta zona
          </button>
        )}
        <div className="map-controls">
          <button
            className="map-control location-control"
            onClick={locate}
            aria-label="Mi ubicación"
            disabled={locating}
          >
            <Navigation size={20} />
          </button>
          <div>
            <button
              className="map-control"
              onClick={() => map.current?.zoomIn()}
              aria-label="Acercar mapa"
            >
              <Plus size={20} />
            </button>
            <button
              className="map-control"
              onClick={() => map.current?.zoomOut()}
              aria-label="Alejar mapa"
            >
              <Minus size={20} />
            </button>
          </div>
        </div>
        {tileError && (
          <div className="tile-error" role="status">
            No se pudo cargar parte del mapa. El listado sigue disponible.
            <button onClick={() => setShowList(true)}>Ver resultados</button>
          </div>
        )}
        {selected ? (
          <div className="map-detail-preview">
            <div className={`place-art ${selected.category}`}>
              <CategoryIcon category={selected.category} size={28} />
            </div>
            <div>
              <span className="eyebrow">
                {categories[selected.category].singular}
              </span>
              <h2>{selected.name}</h2>
              <p>{selected.address || "Dirección no disponible"}</p>
              <button
                className="button primary"
                onClick={() => navigate(`/local/${selected.id}`)}
              >
                Conocer este lugar <ArrowUpRight size={17} />
              </button>
            </div>
            <button
              className="icon-button close-preview"
              aria-label="Cerrar selección"
              onClick={() => setSelected(null)}
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="map-bottom-note">
            <span className="mini-compass">
              <Map size={21} />
            </span>
            <div>
              <strong>Los mejores planes empiezan con un pin.</strong>
              <span>Tocá un lugar para conocerlo.</span>
            </div>
            <ArrowRight size={19} />
          </div>
        )}
        <span className="map-coverage">
          CABA + Vicente López · datos OSM
          {!configured ? " · actualizado 10 oct. 2026" : ""}
        </span>
      </section>
      {showFilters && (
        <Modal
          title="Encontrá tu próximo lugar"
          onClose={() => setShowFilters(false)}
        >
          <p className="muted">Combiná filtros para afinar la búsqueda.</p>
          <div className="form-grid">
            <label>
              Valoración mínima
              <select
                value={filters.rating}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, rating: Number(e.target.value) }))
                }
              >
                <option value="0">Cualquier valoración</option>
                <option value="3">3 estrellas o más</option>
                <option value="4">4 estrellas o más</option>
                <option value="5">5 estrellas</option>
              </select>
            </label>
            <label>
              Rango de precios
              <select
                value={filters.price}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, price: e.target.value }))
                }
              >
                <option value="">Todos, incluidos desconocidos</option>
                {[1, 2, 3, 4].map((x) => (
                  <option key={x} value={x}>
                    {"$".repeat(x)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Distancia
              <select
                value={filters.radius}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, radius: Number(e.target.value) }))
                }
              >
                <option value="0">Toda la zona visible</option>
                <option value="500">Hasta 500 metros</option>
                <option value="1000">Hasta 1 km</option>
                <option value="3000">Hasta 3 km</option>
                <option value="5000">Hasta 5 km</option>
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={filters.open}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, open: e.target.checked }))
                }
              />
              Abierto ahora
            </label>
            <p className="help">
              “Abierto ahora” incluye solo horarios interpretables. Horarios y
              precios faltantes se mantienen desconocidos.
            </p>
          </div>
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() => setFilters(defaults)}
            >
              Limpiar filtros
            </button>
            <button
              className="button primary"
              onClick={() => setShowFilters(false)}
            >
              Ver resultados
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
