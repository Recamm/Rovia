import { contains } from "./polygon.mjs";
export const regions = [
  { id: "caba", relation: 3082668, name: "CABA" },
  { id: "vicente_lopez", relation: 2752665, name: "Partido de Vicente López" },
];
function key(p) {
  return p.join(",");
}
export function joinRings(segments) {
  const remaining = segments.map((s) => s.map((p) => [p.lon, p.lat]));
  const rings = [];
  while (remaining.length) {
    const ring = remaining.shift();
    while (key(ring[0]) !== key(ring.at(-1))) {
      const end = key(ring.at(-1));
      const i = remaining.findIndex(
        (s) => key(s[0]) === end || key(s.at(-1)) === end,
      );
      if (i < 0)
        throw new Error(
          "Límite administrativo incompleto; no se amplía la cobertura.",
        );
      const next = remaining.splice(i, 1)[0];
      if (key(next[0]) !== end) next.reverse();
      ring.push(...next.slice(1));
    }
    if (ring.length < 4) throw new Error("Anillo administrativo inválido");
    rings.push(ring);
  }
  return rings;
}
export function boundaryFeatures(raw) {
  return regions.map((region) => {
    const r = raw.elements.find(
      (e) => e.type === "relation" && e.id === region.relation,
    );
    if (!r) throw new Error(`Falta el límite de ${region.name}`);
    const ways = r.members.filter(
      (m) => m.type === "way" && ["outer", "inner", ""].includes(m.role),
    );
    if (ways.some((m) => !m.geometry?.length))
      throw new Error("Geometría de límite incompleta");
    const outer = joinRings(
      ways.filter((m) => m.role !== "inner").map((m) => m.geometry),
    );
    const inner = joinRings(
      ways.filter((m) => m.role === "inner").map((m) => m.geometry),
    );
    const polygons = outer.map((ring) => [
      ring,
      ...inner.filter((hole) =>
        contains({ type: "Polygon", coordinates: [ring] }, ...hole[0]),
      ),
    ]);
    return {
      type: "Feature",
      properties: { ...region, source: "OpenStreetMap", license: "ODbL-1.0" },
      geometry: { type: "MultiPolygon", coordinates: polygons },
    };
  });
}
export const foodSelector =
  '(nwr["amenity"~"^(cafe|bar|pub|biergarten|restaurant|fast_food|food_court|ice_cream)$"](area.region);nwr["shop"~"^(bakery|pastry|confectionery|chocolate|ice_cream)$"](area.region););out center tags;';
export async function overpass(query) {
  const base =
    process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(
        `${base}?data=${encodeURIComponent(query)}`,
        {
          headers: {
            "User-Agent":
              "Rovia/0.2 (+https://github.com/Recamm/Rovia; bounded gastronomic catalog import)",
          },
          signal: AbortSignal.timeout(55000),
        },
      );
      if (!response.ok)
        throw new Error(`Overpass respondió ${response.status}`);
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 20 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Respuesta mayor a 20 MB");
        }
        chunks.push(value);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString());
      if (
        data.remark ||
        !Array.isArray(data.elements) ||
        data.elements.length > 20000
      )
        throw new Error(
          data.remark ?? "Respuesta incompleta o demasiado grande",
        );
      return data;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}
