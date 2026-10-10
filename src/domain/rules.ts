import OpeningHours from "opening_hours";
import type { Place, Visibility } from "../types";
export const categories = {
  cafe: { label: "Cafeterías", singular: "Cafetería", color: "#C64E3B" },
  restaurant: {
    label: "Restaurantes",
    singular: "Restaurante",
    color: "#203F3B",
  },
  bar: { label: "Bares", singular: "Bar", color: "#806A9C" },
  ice_cream: { label: "Heladerías", singular: "Heladería", color: "#A3687B" },
  bakery: { label: "Panaderías", singular: "Panadería", color: "#AA712C" },
  pastry: { label: "Pastelerías", singular: "Pastelería", color: "#8D657D" },
  fast_food: {
    label: "Comida rápida",
    singular: "Comida rápida",
    color: "#277F79",
  },
} as const;
export const visibilityLabels: Record<Visibility, string> = {
  public: "Pública",
  friends: "Para amigos",
  private: "Privada",
};
export function validateReview(rating: number, comment: string) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return "Elegí un puntaje entre 1 y 5.";
  if (comment.trim().length < 10 || comment.trim().length > 2000)
    return "El comentario debe tener entre 10 y 2.000 caracteres.";
  return null;
}
export function validateUsername(value: string) {
  return /^[a-z0-9_]{3,24}$/.test(value.toLowerCase());
}
export function canRead(
  owner: string,
  viewer: string | null,
  profile: Visibility,
  item: Visibility,
  friends: boolean,
) {
  if (owner === viewer) return true;
  const audience = (v: Visibility) =>
    v === "public" || (v === "friends" && friends);
  return audience(profile) && audience(item);
}
export function distance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function openState(
  p: Pick<Place, "opening_hours" | "timezone">,
  date = new Date(),
): "open" | "closed" | "unknown" {
  if (!p.opening_hours) return "unknown";
  try {
    const local = new Date(
      date.toLocaleString("en-US", { timeZone: p.timezone }),
    );
    const schedule = new OpeningHours(p.opening_hours);
    return schedule.getUnknown(local)
      ? "unknown"
      : schedule.getState(local)
        ? "open"
        : "closed";
  } catch {
    return "unknown";
  }
}
export function validatePhotos(files: File[]) {
  if (files.length > 5) return "Podés agregar hasta 5 fotos.";
  if (files.some((f) => f.size > 5 * 1024 * 1024))
    return "Cada foto debe pesar como máximo 5 MB.";
  if (
    files.some(
      (f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type),
    )
  )
    return "Usá fotos JPEG, PNG o WebP.";
  return null;
}
export function safeWebsite(value: string | null) {
  if (!value) return null;
  try {
    const u = new URL(value.startsWith("http") ? value : `https://${value}`);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
