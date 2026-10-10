import { useEffect } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { renderToStaticMarkup } from "react-dom/server";
import type { Place, Bounds } from "../types";
import { CategoryIcon } from "./UI";
import { categories } from "../domain/rules";
const initial: [number, number] = [
  Number(import.meta.env.VITE_INITIAL_LAT) || -34.588,
  Number(import.meta.env.VITE_INITIAL_LNG) || -58.431,
];
function Markers({
  places,
  onSelect,
  selected,
}: {
  places: Place[];
  onSelect: (p: Place) => void;
  selected?: string;
}) {
  const map = useMap();
  useEffect(() => {
    const group = L.markerClusterGroup({
      maxClusterRadius: 45,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 17,
      iconCreateFunction: (cluster) =>
        L.divIcon({
          html: `<span class="cluster-count">${cluster.getChildCount()}</span>`,
          className: "rovia-cluster",
          iconSize: [42, 42],
        }),
    });
    for (const p of places) {
      const icon = L.divIcon({
        html: `<span style="background:${categories[p.category]?.color ?? "#203F3B"}" class="pin ${p.source === "Propuesta" ? "pending-pin" : ""} ${p.id === selected ? "active" : ""}">${renderToStaticMarkup(<CategoryIcon category={p.category} size={18} />)}</span>`,
        className: "rovia-marker",
        iconSize: [40, 46],
        iconAnchor: [20, 44],
      });
      const marker = L.marker([p.lat, p.lng], {
        icon,
        title: p.name,
        alt: p.name,
        keyboard: true,
      }).on("click", () => onSelect(p));
      marker.bindTooltip(
        () => {
          const el = document.createElement("span");
          el.textContent = p.name;
          return el;
        },
        { direction: "top", offset: [0, -35] },
      );
      group.addLayer(marker);
    }
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [map, places, onSelect, selected]);
  return null;
}
function Events({
  onBounds,
  onMap,
  onPick,
}: {
  onBounds: (b: Bounds) => void;
  onMap: (m: L.Map) => void;
  onPick?: (lat: number, lng: number) => void;
}) {
  const map = useMapEvents({
    click(e) {
      onPick?.(e.latlng.lat, e.latlng.lng);
    },
    moveend() {
      update();
    },
  });
  function update() {
    const b = map.getBounds(),
      c = map.getCenter();
    onBounds({
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
      lat: c.lat,
      lng: c.lng,
    });
  }
  useEffect(() => {
    onMap(map);
    update();
    const t = setTimeout(() => map.invalidateSize(), 100);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [map]);
  return null;
}
export function MapView({
  places,
  onSelect,
  onBounds,
  onMap,
  selected,
  onTileError,
  onPick,
  center = initial,
  zoom = Number(import.meta.env.VITE_INITIAL_ZOOM) || 15,
}: {
  places: Place[];
  onSelect: (p: Place) => void;
  onBounds: (b: Bounds) => void;
  onMap: (m: L.Map) => void;
  selected?: string;
  onTileError: () => void;
  onPick?: (lat: number, lng: number) => void;
  center?: [number, number];
  zoom?: number;
}) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      zoomControl={false}
      className="map-canvas"
      minZoom={10}
      maxZoom={19}
    >
      <TileLayer
        url={
          import.meta.env.VITE_TILE_URL ||
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        }
        attribution={
          import.meta.env.VITE_TILE_ATTRIBUTION ||
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
        eventHandlers={{ tileerror: onTileError }}
      />
      <Markers places={places} onSelect={onSelect} selected={selected} />
      <Events onBounds={onBounds} onMap={onMap} onPick={onPick} />
    </MapContainer>
  );
}
