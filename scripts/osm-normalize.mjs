import { createHash } from "node:crypto";
export function categoryOf(tags) {
  // Explicitly exclude retail groceries even if they carry secondary food tags.
  if (["kiosk", "supermarket", "convenience", "grocery"].includes(tags.shop))
    return null;
  if (tags.amenity === "ice_cream" || tags.shop === "ice_cream")
    return "ice_cream";
  if (tags.shop === "bakery") return "bakery";
  if (["pastry", "confectionery", "chocolate"].includes(tags.shop))
    return "pastry";
  if (tags.amenity === "cafe") return "cafe";
  if (["bar", "pub", "biergarten"].includes(tags.amenity)) return "bar";
  if (tags.amenity === "fast_food") return "fast_food";
  if (["restaurant", "food_court"].includes(tags.amenity)) return "restaurant";
  return null;
}
export function stableId(type, id) {
  const h = createHash("sha256").update(`osm:${type}:${id}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** @returns {import("../src/types/index").Place[]} */
export function normalize(
  elements,
  area,
  importedAt = new Date().toISOString(),
) {
  const seen = new Set();
  return elements.flatMap((e) => {
    const t = e.tags ?? {};
    const category = categoryOf(t);
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const key = `${e.type}:${e.id}`;
    if (
      !category ||
      !t.name ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      !["node", "way", "relation"].includes(e.type) ||
      seen.has(key)
    )
      return [];
    seen.add(key);
    return [
      {
        id: stableId(e.type, e.id),
        name: t.name.slice(0, 160),
        category,
        lat,
        lng,
        address: t["addr:street"]
          ? [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ")
          : null,
        area: t["addr:suburb"] ?? t["addr:city"] ?? area,
        phone: t["contact:phone"] ?? t.phone ?? null,
        website: t["contact:website"] ?? t.website ?? null,
        instagram: t["contact:instagram"] ?? null,
        opening_hours: t.opening_hours ?? null,
        timezone: "America/Argentina/Buenos_Aires",
        price_level: null,
        source: "OpenStreetMap",
        external_type: e.type,
        external_id: String(e.id),
        imported_at: importedAt,
        closed: false,
        rating: null,
        review_count: 0,
        tags: t,
      },
    ];
  });
}
