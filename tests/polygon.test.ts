import { it, expect } from "vitest";
import {
  selectPolygon,
  contains,
  geometryBounds,
} from "../scripts/polygon.mjs";
it("recorta por límite administrativo y respeta huecos", () => {
  const p = selectPolygon(
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [3, 0],
          [3, 3],
          [0, 3],
          [0, 0],
        ],
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 2],
          [1, 1],
        ],
      ],
    },
    undefined,
  );
  expect(contains(p, 0.5, 0.5)).toBe(true);
  expect(contains(p, 1.5, 1.5)).toBe(false);
  expect(contains(p, 4, 4)).toBe(false);
  expect(geometryBounds(p)).toEqual([0, 0, 3, 3]);
});
it("exige elegir una zona si el GeoJSON contiene varios municipios", () => {
  expect(() =>
    selectPolygon(
      {
        type: "FeatureCollection",
        features: [
          { properties: { name: "A" } },
          { properties: { name: "B" } },
        ],
      },
      undefined,
    ),
  ).toThrow();
});
