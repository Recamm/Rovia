import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Phone,
  Globe,
  Bookmark,
  Check,
  Navigation,
  Flag,
  Plus,
  Star,
  Share2,
  Heart,
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import type { Visibility } from "../types";
import { categories, openState, safeWebsite } from "../domain/rules";
import { placeById, reviewsFor, toggle, ownLists, rpc } from "../services/api";
import { db, configured, fail } from "../services/supabase";
import { useApp } from "../hooks/useApp";
import {
  Loading,
  ErrorState,
  CategoryIcon,
  Modal,
  Empty,
  ConnectionNote,
} from "../components/UI";
import ReviewCard from "../components/ReviewCard";
export default function PlaceDetail() {
  const { id = "" } = useParams();
  const { session, notice, requireAuth, invalidate } = useApp();
  const [modal, setModal] = useState<"list" | "correction" | "visit" | null>(
    null,
  );
  const [field, setField] = useState("address");
  const [value, setValue] = useState("");
  const [explanation, setExplanation] = useState("");
  const [day, setDay] = useState("");
  const [vis, setVis] = useState<Visibility>("friends");
  const [share, setShare] = useState(false);
  const [clear, setClear] = useState(true);
  const place = useQuery({
    queryKey: ["place", id],
    queryFn: () => placeById(id),
  });
  const reviews = useQuery({
    queryKey: ["reviews", id, session?.user.id],
    queryFn: () => reviewsFor(id),
    refetchInterval: 30000,
  });
  const state = useQuery({
    queryKey: ["place-state", id, session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const results = await Promise.all(
        ["saved_places", "want_places", "visits"].map((t) =>
          db()
            .from(t)
            .select("place_id")
            .eq("user_id", session!.user.id)
            .eq("place_id", id),
        ),
      );
      results.forEach((r) => fail(r.error));
      return {
        saved: !!results[0].data?.length,
        want: !!results[1].data?.length,
        visited: !!results[2].data?.length,
      };
    },
  });
  const lists = useQuery({
    queryKey: ["lists", session?.user.id],
    enabled: !!session && modal === "list",
    queryFn: ownLists,
  });
  const mutation = useMutation<void, Error, () => Promise<unknown>>({
    mutationFn: async (fn) => {
      await fn();
    },
    onSuccess: () => {
      void invalidate();
      notice("Cambios guardados.");
      setModal(null);
    },
    onError: (e) => notice(e.message),
  });
  if (place.isPending) return <Loading />;
  if (place.isError) return <ErrorState error={place.error} />;
  const p = place.data;
  if (!p)
    return (
      <Empty title="No encontramos este lugar">
        <Link to="/">Volver al mapa</Link>
      </Empty>
    );
  const opening = openState(p),
    web = safeWebsite(p.website);
  const run = (fn: () => Promise<unknown>) => {
    if (requireAuth()) mutation.mutate(fn);
  };
  return (
    <div className="content-page place-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={17} />
        Volver a explorar
      </Link>
      <div className={`place-hero ${p.category}`}>
        <div className="hero-contours" />
        <CategoryIcon category={p.category} size={58} />
        <span>Un lugar por descubrir</span>
        <small>Este local todavía no tiene una foto de portada.</small>
      </div>
      <div className="place-main">
        <div>
          <span className="eyebrow">
            {categories[p.category].singular} · {p.area || "AMBA"}
          </span>
          <h1>{p.name}</h1>
          <p className="place-address">
            <MapPin size={18} />
            {p.address || "Dirección no disponible"}
          </p>
          <div className="rating-line">
            <Star size={18} />
            {p.rating
              ? `${p.rating} · ${p.review_count} reseñas públicas`
              : "Sin reseñas públicas"}
            {p.closed && <span className="badge">Cerrado permanentemente</span>}
            {p.archived_at && (
              <span className="badge">Local dado de baja del catálogo</span>
            )}
          </div>
        </div>
        <button
          className="icon-button"
          aria-label="Compartir enlace"
          onClick={async () => {
            const url = location.href;
            if (navigator.share) {
              try {
                await navigator.share({ title: p.name, url });
              } catch {}
            } else {
              try {
                await navigator.clipboard.writeText(url);
                notice("Enlace copiado.");
              } catch {
                notice("Copiá el enlace desde la barra de direcciones.");
              }
            }
          }}
        >
          <Share2 size={21} />
        </button>
      </div>
      <div className="place-action-row">
        <Link className="button primary" to={`/local/${id}/resena`}>
          <Star size={17} />
          Compartir experiencia
        </Link>
        <button
          className={`button ${state.data?.saved ? "selected-button" : "secondary"}`}
          disabled={mutation.isPending}
          onClick={() =>
            run(() =>
              toggle(
                "saved_places",
                "place_id",
                id,
                !!state.data?.saved,
                session!.user.id,
              ),
            )
          }
        >
          <Bookmark size={18} />
          {state.data?.saved ? "Guardado" : "Guardar"}
        </button>
        <button
          className="button secondary"
          disabled={mutation.isPending}
          onClick={() =>
            run(() =>
              toggle(
                "want_places",
                "place_id",
                id,
                !!state.data?.want,
                session!.user.id,
              ),
            )
          }
        >
          <Heart size={17} />
          {state.data?.want ? "Quiero ir ✓" : "Quiero ir"}
        </button>
        <button
          className="button secondary"
          onClick={() => {
            if (requireAuth()) setModal("visit");
          }}
        >
          <Check size={18} />
          {state.data?.visited ? "Ya fui ✓" : "Ya fui"}
        </button>
        <button
          className="button secondary"
          onClick={() => {
            if (requireAuth()) setModal("list");
          }}
        >
          <Plus size={18} />A una lista
        </button>
      </div>
      <div className="detail-columns">
        <section>
          <h2>Lo que sabemos del lugar</h2>
          <div className="place-facts">
            <div>
              <Clock size={20} />
              <div>
                <strong>
                  {opening === "open"
                    ? "Abierto ahora"
                    : opening === "closed"
                      ? "Cerrado ahora"
                      : "Horario no disponible"}
                </strong>
                <p>
                  {p.opening_hours ||
                    "Podés proponer el horario si lo conocés."}
                </p>
              </div>
            </div>
            <div>
              <span className="price-symbol">$</span>
              <div>
                <strong>
                  {p.price_level
                    ? "$".repeat(p.price_level)
                    : "Precio desconocido"}
                </strong>
                <p>No estimamos precios sin información.</p>
              </div>
            </div>
            {p.phone && (
              <div>
                <Phone size={20} />
                <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>{p.phone}</a>
              </div>
            )}
            {web && (
              <div>
                <Globe size={20} />
                <a
                  className="text-link"
                  href={web}
                  target="_blank"
                  rel="noreferrer"
                >
                  Sitio web del lugar ↗
                </a>
              </div>
            )}
          </div>
          <div className="source-note">
            Fuente: {p.source} · {p.external_type}/{p.external_id}
            <br />
            Importado el {new Date(p.imported_at).toLocaleDateString("es-AR")}.
            Datos comunitarios, sujetos a cambios.
            <br />
            <a
              href={`https://www.openstreetmap.org/${p.external_type}/${p.external_id}`}
              target="_blank"
              rel="noreferrer"
            >
              Ver objeto en OpenStreetMap ↗
            </a>
          </div>
          <button
            className="text-button"
            onClick={() => {
              if (requireAuth()) setModal("correction");
            }}
          >
            <Flag size={16} />
            Proponer una corrección
          </button>
        </section>
        <section className="mini-map-section">
          <div className="mini-map">
            <MapContainer
              center={[p.lat, p.lng]}
              zoom={16}
              scrollWheelZoom={false}
              zoomControl={false}
              key={p.id}
            >
              <TileLayer
                url={
                  import.meta.env.VITE_TILE_URL ||
                  "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                }
                attribution={
                  import.meta.env.VITE_TILE_ATTRIBUTION || "© OpenStreetMap"
                }
              />
              <CircleMarker
                center={[p.lat, p.lng]}
                radius={10}
                pathOptions={{
                  color: "#fff",
                  fillColor: "#C64E3B",
                  fillOpacity: 1,
                  weight: 3,
                }}
              />
            </MapContainer>
          </div>
          <a
            className="button secondary wide"
            href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation size={18} />
            Cómo llegar ↗
          </a>
        </section>
      </div>
      <section className="place-reviews">
        <h2>
          Experiencias de la comunidad{" "}
          <span className="count">{p.review_count}</span>
        </h2>
        <p className="muted">
          La valoración general usa solo reseñas públicas de perfiles públicos.
        </p>
        {reviews.isPending ? (
          <Loading />
        ) : reviews.isError ? (
          <ErrorState error={reviews.error} />
        ) : reviews.data?.length ? (
          reviews.data.map((r) => <ReviewCard key={r.id} review={r} />)
        ) : (
          <Empty title="La primera historia puede ser la tuya">
            <p>Todavía no hay reseñas que puedas ver de este lugar.</p>
            <Link className="button primary" to={`/local/${id}/resena`}>
              Contá tu experiencia
            </Link>
          </Empty>
        )}
      </section>
      <ConnectionNote />
      {modal === "list" && (
        <Modal title="Agregar a una lista" onClose={() => setModal(null)}>
          {lists.isPending ? (
            <Loading />
          ) : lists.isError ? (
            <ErrorState error={lists.error} />
          ) : lists.data?.length ? (
            lists.data.map((l) => {
              const included = l.list_places?.some((i) => i.place_id === id);
              return (
                <button
                  className="list-select"
                  key={l.id}
                  disabled={included || mutation.isPending}
                  onClick={() =>
                    run(async () => {
                      const { error } = await db()
                        .from("list_places")
                        .insert({ list_id: l.id, place_id: id });
                      fail(error);
                    })
                  }
                >
                  {l.name}
                  {included ? <Check size={17} /> : <Plus size={17} />}
                </button>
              );
            })
          ) : (
            <p>Creá tu primera lista desde Guardados.</p>
          )}
          <Link className="text-link" to="/guardados?tab=lists">
            Gestionar listas →
          </Link>
        </Modal>
      )}
      {modal === "correction" && (
        <Modal title="Proponer una corrección" onClose={() => setModal(null)}>
          <p className="muted">Tu propuesta quedará pendiente de revisión.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const { error } = await db()
                  .from("corrections")
                  .insert({
                    place_id: id,
                    fields: {
                      [field]: field === "closed" ? value === "true" : value,
                    },
                    explanation,
                  });
                fail(error);
              });
            }}
          >
            <label>
              Dato a corregir
              <select
                value={field}
                onChange={(e) => {
                  setField(e.target.value);
                  setValue("");
                }}
              >
                <option value="address">Dirección</option>
                <option value="opening_hours">Horario (formato OSM)</option>
                <option value="phone">Teléfono</option>
                <option value="website">Sitio web</option>
                <option value="instagram">Instagram</option>
                <option value="category">Categoría</option>
                <option value="closed">Cierre permanente</option>
                <option value="duplicate_of">
                  Duplicado: ID del local original
                </option>
              </select>
            </label>
            <label>
              Propuesta
              {field === "category" ? (
                <select
                  value={value}
                  required
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="">Elegí categoría</option>
                  {Object.entries(categories).map(([key, c]) => (
                    <option key={key} value={key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : field === "closed" ? (
                <select
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="">Elegí estado</option>
                  <option value="true">Cerrado permanentemente</option>
                  <option value="false">Funciona</option>
                </select>
              ) : (
                <input
                  required
                  maxLength={500}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              )}
            </label>
            <label>
              Explicación opcional
              <textarea
                maxLength={1000}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={mutation.isPending}>
              Enviar propuesta
            </button>
          </form>
        </Modal>
      )}
      {modal === "visit" && (
        <Modal title="Marcar una visita" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() =>
                rpc("mark_visit", {
                  pid: id,
                  day: day || null,
                  audience: vis,
                  share,
                  clear_pending: clear,
                }),
              );
            }}
          >
            <p>
              “Ya fui” es independiente de guardar y de escribir una reseña.
            </p>
            <label>
              Fecha opcional
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <label>
              Quién puede verla
              <select
                value={vis}
                onChange={(e) => setVis(e.target.value as Visibility)}
              >
                <option value="friends">Amigos</option>
                <option value="public">Pública</option>
                <option value="private">Privada</option>
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={share}
                onChange={(e) => setShare(e.target.checked)}
              />
              Compartir voluntariamente en la actividad
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={clear}
                onChange={(e) => setClear(e.target.checked)}
              />
              Quitar de “Quiero ir” al marcar la visita
            </label>
            <button className="button primary" disabled={mutation.isPending}>
              Guardar visita
            </button>
            {state.data?.visited && (
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  run(async () => {
                    const { error } = await db()
                      .from("visits")
                      .delete()
                      .eq("place_id", id)
                      .eq("user_id", session!.user.id);
                    fail(error);
                  })
                }
              >
                Quitar “Ya fui”
              </button>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
