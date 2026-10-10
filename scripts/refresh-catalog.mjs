import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import {
  boundaryFeatures,
  regions,
  foodSelector,
  overpass,
} from "./region.mjs";
import { normalize } from "./osm-normalize.mjs";
import { contains } from "./polygon.mjs";
const { values } = parseArgs({
  options: { "cached-boundaries": { type: "boolean", default: false } },
});
try {
  const boundaries = values["cached-boundaries"]
    ? JSON.parse(await readFile("data/coverage-osm.json", "utf8"))
    : await overpass(
        `[out:json][timeout:40];rel(id:${regions.map((r) => r.relation).join(",")});out geom;`,
      );
  const features = boundaryFeatures(boundaries);
  const coverage = { type: "FeatureCollection", features };
  const combined = {
    type: "MultiPolygon",
    coordinates: features.flatMap((f) => f.geometry.coordinates),
  };
  const imported_at = new Date().toISOString();
  const elements = [];
  const seen = new Set();
  const counts = {};
  for (const region of regions) {
    console.log(`Descargando gastronomía: ${region.name}`);
    const raw = await overpass(
      `[out:json][timeout:40];rel(${region.relation});map_to_area->.region;${foodSelector}`,
    );
    counts[region.id] = raw.elements.length;
    for (const e of raw.elements) {
      const key = `${e.type}:${e.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        elements.push(e);
      }
    }
  }
  const places = normalize(
    elements,
    "CABA + Vicente López",
    imported_at,
  ).flatMap((p) => {
    const zone = features.find((f) => contains(f.geometry, p.lng, p.lat));
    return zone
      ? [{ ...p, area: p.tags?.["addr:suburb"] ?? zone.properties.name }]
      : [];
  });
  if (!places.length)
    throw new Error("No se reemplaza el catálogo por una descarga vacía");
  const report = {
    source: "OpenStreetMap",
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    area: "CABA + todo el partido de Vicente López",
    imported_at,
    coverage:
      "Locales gastronómicos con nombre disponibles en OSM dentro de los límites administrativos. No garantiza todos los negocios existentes.",
    raw_count: elements.length,
    region_counts: counts,
    boundary_relations: regions,
    polygon_sha256: createHash("sha256")
      .update(JSON.stringify(combined))
      .digest("hex"),
    places,
  };
  await writeFile("data/coverage-osm.json", JSON.stringify(boundaries));
  await writeFile("data/coverage.geojson", JSON.stringify(coverage));
  await writeFile("src/data/coverage.json", JSON.stringify(combined));
  await writeFile("public/coverage.geojson", JSON.stringify(coverage));
  await writeFile(
    "data/osm-source.json",
    JSON.stringify({
      elements,
      osm3s: { timestamp_osm_base: imported_at },
      regions,
    }),
  );
  await writeFile("public/catalog.json", JSON.stringify(report));
  console.log(
    JSON.stringify({
      ok: true,
      places: places.length,
      objects: elements.length,
      categories: Object.fromEntries(
        [...new Set(places.map((p) => p.category))].map((c) => [
          c,
          places.filter((p) => p.category === c).length,
        ]),
      ),
      imported_at,
    }),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
