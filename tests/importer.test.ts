import { describe, it, expect } from "vitest";
import { normalize, stableId, categoryOf } from "../scripts/osm-normalize.mjs";
describe("Normalización OSM", () => {
  it("admite nodos, vías y relaciones; conserva identificadores estables", () => {
    const objects = [
      {
        type: "node",
        id: 1,
        lat: -34,
        lon: -58,
        tags: { name: "Café de prueba", amenity: "cafe" },
      },
      {
        type: "way",
        id: 2,
        center: { lat: -34.1, lon: -58.1 },
        tags: { name: "Bar de prueba", amenity: "pub" },
      },
      {
        type: "relation",
        id: 3,
        center: { lat: -34.2, lon: -58.2 },
        tags: { name: "Panadería de prueba", shop: "bakery" },
      },
    ];
    const a = normalize(objects, "Zona de prueba", "2026-10-10");
    const b = normalize(objects, "Zona de prueba", "2026-10-11");
    expect(a).toHaveLength(3);
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
    expect(a.map((p) => p.category)).toEqual(["cafe", "bar", "bakery"]);
    expect(a[0].opening_hours).toBeNull();
    expect(a[0].price_level).toBeNull();
  });
  it("incluye gastronomía y bares, excluye kioscos, supermercados y comercios ajenos", () => {
    expect(categoryOf({ amenity: "ice_cream" })).toBe("ice_cream");
    expect(categoryOf({ shop: "pastry" })).toBe("pastry");
    expect(categoryOf({ amenity: "fast_food" })).toBe("fast_food");
    expect(categoryOf({ amenity: "biergarten" })).toBe("bar");
    for (const shop of [
      "kiosk",
      "supermarket",
      "convenience",
      "grocery",
      "books",
      "clothes",
    ])
      expect(categoryOf({ shop })).toBeNull();
    expect(categoryOf({ shop: "supermarket", amenity: "cafe" })).toBeNull();
    expect(categoryOf({ amenity: "theatre" })).toBeNull();
  });
  it("descarta duplicados, nombres y coordenadas inválidas", () => {
    const good = {
      type: "node",
      id: 1,
      lat: -34,
      lon: -58,
      tags: { name: "Café de prueba", amenity: "cafe" },
    };
    expect(
      normalize(
        [
          good,
          good,
          { ...good, id: 2, lat: NaN },
          { ...good, id: 3, tags: { amenity: "cafe" } },
        ],
        "Prueba",
      ),
    ).toHaveLength(1);
    expect(stableId("node", 1)).not.toBe(stableId("way", 1));
  });
});
