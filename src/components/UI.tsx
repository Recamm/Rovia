import { useEffect, useRef, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  MapPin,
  Coffee,
  Utensils,
  Wine,
  Croissant,
  CakeSlice,
  IceCreamBowl,
  Sandwich,
  ArrowRight,
  LoaderCircle,
  Database,
  Bookmark,
  Compass,
  X,
} from "lucide-react";
import type { Category, Place } from "../types";
import { categories } from "../domain/rules";
import { configured } from "../services/supabase";
export const categoryIcons = {
  cafe: Coffee,
  restaurant: Utensils,
  bar: Wine,
  bakery: Croissant,
  pastry: CakeSlice,
  ice_cream: IceCreamBowl,
  fast_food: Sandwich,
};
export function CategoryIcon({
  category,
  size = 20,
}: {
  category: Category;
  size?: number;
}) {
  const I = categoryIcons[category] ?? Utensils;
  return <I size={size} />;
}
export function Empty({
  title,
  children,
  icon = "compass",
}: {
  title: string;
  children?: ReactNode;
  icon?: "compass" | "bookmark";
}) {
  const I = icon === "compass" ? Compass : Bookmark;
  return (
    <div className="empty">
      <span className="empty-icon">
        <I size={30} />
      </span>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} /> Cargando…
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error" role="alert">
      {error instanceof Error ? error.message : "Ocurrió un error."}
      {retry && <button onClick={retry}>Volver a intentar</button>}
    </div>
  );
}
export function ConnectionNote({ compact = false }: { compact?: boolean }) {
  if (configured) return null;
  return (
    <div className={`connection-note ${compact ? "compact" : ""}`}>
      <Database size={18} />
      <div>
        <strong>Supabase pendiente de conexión</strong>
        {!compact && (
          <p>
            Podés explorar el catálogo real de OSM. Para crear tu cuenta y
            guardar tus planes, conectá el proyecto siguiendo el README.
          </p>
        )}
      </div>
      <Link to="/configuracion" aria-label="Ver estado de conexión">
        <ArrowUpRight size={18} />
      </Link>
    </div>
  );
}
export function PlaceCard({
  place,
  active,
  onSelect,
}: {
  place: Place;
  active?: boolean;
  onSelect?: (p: Place) => void;
}) {
  return (
    <button
      className={`place-card ${active ? "selected" : ""}`}
      onClick={() => onSelect?.(place)}
    >
      <div className={`place-art ${place.category}`}>
        <CategoryIcon category={place.category} size={24} />
        <span className="art-line" />
      </div>
      <div className="place-card-content">
        <div className="place-card-meta">
          <span>{categories[place.category].singular}</span>
          {place.distance_m !== undefined && (
            <span>
              {place.distance_m < 1000
                ? `${Math.round(place.distance_m)} m`
                : `${(place.distance_m / 1000).toFixed(1)} km`}
            </span>
          )}
        </div>
        <h3>{place.name}</h3>
        <p>{place.address || place.area || "Dirección no disponible"}</p>
        <div className="place-rating">
          {place.rating ? (
            <>
              ★ {place.rating} <span>({place.review_count})</span>
            </>
          ) : (
            <span>Sin reseñas públicas</span>
          )}
        </div>
      </div>
      <ArrowUpRight className="card-arrow" size={18} />
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    element
      ?.querySelector<HTMLElement>("button,input,select,textarea")
      ?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = element?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,textarea,a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>
          {title}
          <span className="coral">.</span>
        </h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function AuthGate() {
  const location = useLocation();
  return (
    <Empty title="Tus planes empiezan acá" icon="bookmark">
      <p>
        Iniciá sesión para guardar lugares, compartir experiencias y conectar
        con tu gente.
      </p>
      <Link
        className="button primary"
        to={`/auth?next=${encodeURIComponent(location.pathname + location.search)}`}
      >
        Entrar a Rovia <ArrowRight size={18} />
      </Link>
      <ConnectionNote />
    </Empty>
  );
}
export function PlaceLink({ id, name }: { id: string; name: string }) {
  return (
    <Link className="text-link" to={`/local/${id}`}>
      <MapPin size={16} />
      {name}
    </Link>
  );
}
