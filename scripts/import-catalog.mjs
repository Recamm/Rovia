import { readFile } from "node:fs/promises";
import { contains } from "./polygon.mjs";
try {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno local confiable.",
    );
  const raw = await readFile("public/catalog.json", "utf8");
  if (Buffer.byteLength(raw) > 20 * 1024 * 1024)
    throw new Error("Catálogo demasiado grande");
  const { places } = JSON.parse(raw);
  const geometry = JSON.parse(await readFile("src/data/coverage.json", "utf8"));
  if (!Array.isArray(places) || places.length > 20000)
    throw new Error("Catálogo inválido");
  const categories = new Set([
    "cafe",
    "bar",
    "restaurant",
    "ice_cream",
    "bakery",
    "pastry",
    "fast_food",
  ]);
  if (
    places.some(
      (p) => !categories.has(p.category) || !contains(geometry, p.lng, p.lat),
    )
  )
    throw new Error("Catálogo fuera del alcance autorizado");
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
        `Lote ${Math.floor(i / 100) + 1} rechazado (${response.status}). Corregí la configuración y volvé a ejecutar: la importación es idempotente.`,
      );
    console.log(
      `Importados ${Math.min(i + 100, places.length)}/${places.length}`,
    );
  }
  console.log("Catálogo importado sin borrar historiales.");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
