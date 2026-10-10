// @vitest-environment node
import { describe, it, expect } from "vitest";
import { inCoverage } from "../src/domain/coverage";
import { readFile } from "node:fs/promises";
import { contains } from "../scripts/polygon.mjs";
describe("Cobertura administrativa de Rovia", () => {
  it("incluye CABA, Olivos, Munro y otras localidades del partido", () => {
    for (const [lat, lng] of [
      [-34.588, -58.431],
      [-34.619, -58.441],
      [-34.513, -58.487],
      [-34.531, -58.522],
      [-34.538, -58.495],
      [-34.546, -58.513],
      [-34.519, -58.53],
    ])
      expect(inCoverage(lat, lng)).toBe(true);
    for (const [lat, lng] of [
      [-34.65, -58.62],
      [-34.72, -58.255],
      [-34.47, -58.52],
      [0, 0],
    ])
      expect(inCoverage(lat, lng)).toBe(false);
  });
  it("el catálogo entero queda dentro de los polígonos y solo contiene gastronomía", async () => {
    const catalog = JSON.parse(await readFile("public/catalog.json", "utf8"));
    const boundary = JSON.parse(
      await readFile("src/data/coverage.json", "utf8"),
    );
    expect(catalog.places.length).toBeGreaterThan(2000);
    const categories = new Set([
      "cafe",
      "bar",
      "restaurant",
      "ice_cream",
      "bakery",
      "pastry",
      "fast_food",
    ]);
    expect(
      catalog.places.every(
        (p: { lat: number; lng: number; category: string }) =>
          contains(boundary, p.lng, p.lat) && categories.has(p.category),
      ),
    ).toBe(true);
  });
});
