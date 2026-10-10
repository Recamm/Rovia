import { readFile } from "node:fs/promises";
import { normalize, stableId } from "./osm-normalize.mjs";
import { contains } from "./polygon.mjs";
const [snapshot, raw, coverage] = await Promise.all(
  ["public/catalog.json", "data/osm-source.json", "src/data/coverage.json"].map(
    async (p) => JSON.parse(await readFile(p, "utf8")),
  ),
);
const normalized = normalize(
  raw.elements,
  "CABA + Vicente López",
  snapshot.imported_at,
).filter((p) => contains(coverage, p.lng, p.lat));
const ids = new Set(snapshot.places.map((p) => p.id));
if (
  ids.size !== snapshot.places.length ||
  normalized.length !== snapshot.places.length
)
  throw new Error("Catálogo inconsistente o duplicado");
for (const p of snapshot.places) {
  if (
    !contains(coverage, p.lng, p.lat) ||
    p.id !== stableId(p.external_type, p.external_id) ||
    p.rating !== null ||
    p.review_count !== 0
  )
    throw new Error("Registro fuera de cobertura o valoración inventada");
}
console.log(
  JSON.stringify({
    ok: true,
    places: ids.size,
    source: snapshot.source,
    imported_at: snapshot.imported_at,
  }),
);
