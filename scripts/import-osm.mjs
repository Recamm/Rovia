import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { normalize } from "./osm-normalize.mjs";
import { selectPolygon, contains, geometryBounds } from "./polygon.mjs";
import { createHash } from "node:crypto";
const { values } = parseArgs({
  options: {
    bbox: { type: "string" },
    file: { type: "string" },
    area: { type: "string", default: "Palermo, CABA" },
    snapshot: { type: "string" },
    "download-only": { type: "boolean", default: false },
    "polygon-file": { type: "string" },
    "feature-name": { type: "string" },
  },
});
try {
  let raw,
    polygon = null,
    polygonSha = null;
  if (values["polygon-file"]) {
    const data = await readFile(values["polygon-file"]);
    if (data.length > 5 * 1024 * 1024) throw new Error("Polígono mayor a 5 MB");
    polygon = selectPolygon(
      JSON.parse(data.toString()),
      values["feature-name"],
    );
    polygonSha = createHash("sha256").update(data).digest("hex");
  }
  const maxBytes = 20 * 1024 * 1024;
  if (values.file) {
    const data = await readFile(values.file);
    if (data.length > maxBytes) throw new Error("Archivo mayor a 20 MB");
    raw = JSON.parse(data.toString());
  } else {
    const bbox = (
      values.bbox ??
      (polygon
        ? geometryBounds(polygon).join(",")
        : "-34.602,-58.447,-34.578,-58.419")
    )
      .split(",")
      .map(Number);
    if (
      bbox.length !== 4 ||
      bbox.some((x) => !Number.isFinite(x)) ||
      bbox[0] >= bbox[2] ||
      bbox[1] >= bbox[3] ||
      bbox[2] - bbox[0] > 0.08 ||
      bbox[3] - bbox[1] > 0.08
    )
      throw new Error(
        "bbox inválido: sur,oeste,norte,este, hasta 0.08° por lado",
      );
    const query = `[out:json][timeout:30];(nwr["amenity"~"^(cafe|bar|pub|biergarten|restaurant|fast_food|food_court|ice_cream)$"](${bbox.join(",")});nwr["shop"~"^(bakery|pastry|confectionery|chocolate|ice_cream)$"](${bbox.join(",")}););out center tags;`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(
          process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
          {
            method: "POST",
            body: new URLSearchParams({ data: query }),
            signal: AbortSignal.timeout(45000),
            headers: { "User-Agent": "Rovia-catalog-import/0.1" },
          },
        );
        if (!res.ok) throw new Error(`Overpass: ${res.status}`);
        const reader = res.body.getReader();
        let size = 0;
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maxBytes) {
            await reader.cancel();
            throw new Error("Respuesta mayor a 20 MB");
          }
          chunks.push(value);
        }
        raw = JSON.parse(Buffer.concat(chunks).toString());
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  if (!Array.isArray(raw.elements) || raw.elements.length > 20000)
    throw new Error("Formato o cantidad de objetos inválidos");
  const imported_at = new Date().toISOString();
  const places = normalize(raw.elements, values.area, imported_at).filter(
    (p) => !polygon || contains(polygon, p.lng, p.lat),
  );
  const result = {
    source: "OpenStreetMap",
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    area: values.area,
    imported_at,
    coverage:
      "Lote acotado. No representa todos los locales de la zona ni la cobertura completa del AMBA.",
    raw_count: raw.elements.length,
    polygon_sha256: polygonSha,
    bbox:
      values.bbox ??
      (polygon
        ? geometryBounds(polygon).join(",")
        : "-34.602,-58.447,-34.578,-58.419"),
    places,
  };
  if (values.snapshot) {
    await writeFile(values.snapshot, JSON.stringify(result));
    await mkdir("data", { recursive: true });
    await writeFile("data/osm-source.json", JSON.stringify(raw));
  }
  if (!values["download-only"]) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error(
        "Configurá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY o usá --download-only",
      );
    for (let i = 0; i < places.length; i += 100) {
      const response = await fetch(`${url}/rest/v1/rpc/import_places`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ batch: places.slice(i, i + 100) }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(
          `Importación rechazada (${response.status}). Verificá migraciones y credenciales.`,
        );
    }
  }
  console.log(
    JSON.stringify({
      ok: true,
      area: values.area,
      objects: raw.elements.length,
      places: places.length,
      imported_at,
      database: !values["download-only"],
    }),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
