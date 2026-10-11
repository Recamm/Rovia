import { useRef, useCallback, useEffect } from "react";
import type L from "leaflet";
import type { Category, Place } from "../types";
import { categories } from "../domain/rules";
import { inCoverage } from "../domain/coverage";
import { MapView } from "./MapView";
export type PlaceDraft = {
  name: string;
  category: Category;
  lat: string;
  lng: string;
  address: string;
  area: string;
  phone: string;
  website: string;
  instagram: string;
  opening_hours: string;
  price_level: string;
  closed: boolean;
};
export const emptyDraft: PlaceDraft = {
  name: "",
  category: "cafe",
  lat: "",
  lng: "",
  address: "",
  area: "",
  phone: "",
  website: "",
  instagram: "",
  opening_hours: "",
  price_level: "",
  closed: false,
};
export function draftFrom(p: Partial<Place>): PlaceDraft {
  return {
    ...emptyDraft,
    name: p.name ?? "",
    category: p.category ?? "cafe",
    lat: p.lat?.toString() ?? "",
    lng: p.lng?.toString() ?? "",
    address: p.address ?? "",
    area: p.area ?? "",
    phone: p.phone ?? "",
    website: p.website ?? "",
    instagram: p.instagram ?? "",
    opening_hours: p.opening_hours ?? "",
    price_level: p.price_level?.toString() ?? "",
    closed: p.closed ?? false,
  };
}
export function draftFields(d: PlaceDraft) {
  if (!d.lat || !d.lng || !inCoverage(Number(d.lat), Number(d.lng)))
    throw new Error(
      "Marcá una ubicación dentro de CABA o el partido de Vicente López.",
    );
  return {
    ...d,
    name: d.name.trim(),
    lat: Number(d.lat),
    lng: Number(d.lng),
    price_level: d.price_level ? Number(d.price_level) : null,
  };
}
export function draftMarker(
  d: PlaceDraft,
  id = "draft",
  source = "Propuesta",
): Place | null {
  if (
    !d.lat ||
    !d.lng ||
    !Number.isFinite(Number(d.lat)) ||
    !Number.isFinite(Number(d.lng)) ||
    Math.abs(Number(d.lat)) > 90 ||
    Math.abs(Number(d.lng)) > 180
  )
    return null;
  return {
    id,
    name: d.name || "Ubicación del local",
    category: d.category,
    lat: Number(d.lat),
    lng: Number(d.lng),
    address: d.address || null,
    area: d.area || null,
    phone: d.phone || null,
    website: d.website || null,
    instagram: d.instagram || null,
    opening_hours: d.opening_hours || null,
    timezone: "America/Argentina/Buenos_Aires",
    price_level: null,
    closed: d.closed,
    source,
    external_type: "manual",
    external_id: id,
    imported_at: "",
    rating: null,
    review_count: 0,
  };
}
export function PlaceFields({
  value,
  onChange,
  requireAddress = false,
  admin = false,
  simple = false,
  onAddressBlur,
}: {
  value: PlaceDraft;
  onChange: (d: PlaceDraft) => void;
  requireAddress?: boolean;
  admin?: boolean;
  simple?: boolean;
  onAddressBlur?: () => void;
}) {
  const field = (key: keyof PlaceDraft, text: string) =>
    onChange({ ...value, [key]: text });
  return (
    <div className="form-grid place-fields">
      <label>
        Nombre del local
        <input
          required
          minLength={2}
          maxLength={160}
          value={value.name}
          onChange={(e) => field("name", e.target.value)}
        />
      </label>
      <label>
        Categoría
        <select
          value={value.category}
          onChange={(e) => field("category", e.target.value)}
        >
          {Object.entries(categories).map(([id, c]) => (
            <option key={id} value={id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="full-width">
        Dirección
        <input
          required={requireAddress}
          minLength={requireAddress ? 2 : undefined}
          maxLength={300}
          placeholder="Calle y altura"
          onBlur={onAddressBlur}
          value={value.address}
          onChange={(e) => field("address", e.target.value)}
        />
      </label>
      {!simple && (
        <>
          {admin && (
            <label>
              Barrio o zona
              <input
                maxLength={300}
                value={value.area}
                onChange={(e) => field("area", e.target.value)}
              />
            </label>
          )}
          <label>
            Latitud
            <input
              required
              type="number"
              step="any"
              min={-90}
              max={90}
              value={value.lat}
              onChange={(e) => field("lat", e.target.value)}
            />
          </label>
          <label>
            Longitud
            <input
              required
              type="number"
              step="any"
              min={-180}
              max={180}
              value={value.lng}
              onChange={(e) => field("lng", e.target.value)}
            />
          </label>
          <p className="help full-width">
            Tocá el mapa para ubicar el pin o ingresá sus coordenadas. La
            ubicación debe estar en CABA o Vicente López.
          </p>
          <label>
            Teléfono · opcional
            <input
              type="tel"
              maxLength={120}
              value={value.phone}
              onChange={(e) => field("phone", e.target.value)}
            />
          </label>
          <label>
            Sitio web · opcional
            <input
              maxLength={300}
              placeholder="https://…"
              value={value.website}
              onChange={(e) => field("website", e.target.value)}
            />
          </label>
          <label>
            Instagram · opcional
            <input
              maxLength={300}
              value={value.instagram}
              onChange={(e) => field("instagram", e.target.value)}
            />
          </label>
          <label>
            Horarios · opcional
            <input
              maxLength={500}
              placeholder="Ej.: Mo-Sa 08:00-20:00"
              value={value.opening_hours}
              onChange={(e) => field("opening_hours", e.target.value)}
            />
          </label>
          {admin && (
            <>
              <label>
                Rango de precios
                <select
                  value={value.price_level}
                  onChange={(e) => field("price_level", e.target.value)}
                >
                  <option value="">Desconocido</option>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {"$".repeat(n)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={value.closed}
                  onChange={(e) =>
                    onChange({ ...value, closed: e.target.checked })
                  }
                />
                Cerrado permanentemente
              </label>
            </>
          )}
        </>
      )}
    </div>
  );
}
export function LocationPicker({
  value,
  onChange,
}: {
  value: PlaceDraft;
  onChange: (d: PlaceDraft) => void;
}) {
  const map = useRef<L.Map | null>(null);
  const onMap = useCallback((m: L.Map) => {
    map.current = m;
  }, []);
  const marker = draftMarker(value);
  const lat = marker?.lat,
    lng = marker?.lng;
  useEffect(() => {
    if (lat !== undefined && lng !== undefined)
      map.current?.flyTo([lat, lng], 16);
  }, [lat, lng]);
  return (
    <div className="location-picker">
      <MapView
        places={marker ? [marker] : []}
        onSelect={() => {}}
        onMap={onMap}
        onBounds={() => {}}
        onTileError={() => {}}
        center={marker ? [marker.lat, marker.lng] : [-34.59, -58.48]}
        zoom={12}
        onPick={(lat, lng) =>
          onChange({ ...value, lat: lat.toFixed(6), lng: lng.toFixed(6) })
        }
      />
      <div className="picker-tools">
        <button
          type="button"
          className="button secondary"
          onClick={() => map.current?.zoomIn()}
          aria-label="Acercar ubicación"
        >
          +
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => map.current?.zoomOut()}
          aria-label="Alejar ubicación"
        >
          −
        </button>
        {marker && (
          <button
            type="button"
            className="button secondary"
            onClick={() => map.current?.flyTo([marker.lat, marker.lng], 16)}
          >
            Ver mi pin
          </button>
        )}
      </div>
    </div>
  );
}
