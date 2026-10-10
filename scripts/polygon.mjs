export function selectPolygon(raw, name) {
  let shape = raw;
  if (raw.type === "FeatureCollection") {
    const features = name
      ? raw.features.filter((f) =>
          [f.properties?.name, f.properties?.nombre].includes(name),
        )
      : raw.features;
    if (features.length !== 1)
      throw new Error(
        "Elegí exactamente una zona mediante --feature-name (propiedad name o nombre).",
      );
    shape = features[0].geometry;
  } else if (raw.type === "Feature") shape = raw.geometry;
  if (!["Polygon", "MultiPolygon"].includes(shape?.type))
    throw new Error("Se requiere GeoJSON Polygon o MultiPolygon.");
  const coords = shape.coordinates.flat(shape.type === "Polygon" ? 1 : 2);
  if (
    coords.length > 100000 ||
    coords.length < 4 ||
    coords.some(
      (c) =>
        c.length < 2 ||
        !Number.isFinite(c[0]) ||
        !Number.isFinite(c[1]) ||
        Math.abs(c[0]) > 180 ||
        Math.abs(c[1]) > 90,
    )
  )
    throw new Error("Coordenadas del polígono inválidas.");
  return shape;
}
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    const cross = (lng - xi) * (yj - yi) - (lat - yi) * (xj - xi);
    if (
      Math.abs(cross) < 1e-12 &&
      lng >= Math.min(xi, xj) &&
      lng <= Math.max(xi, xj) &&
      lat >= Math.min(yi, yj) &&
      lat <= Math.max(yi, yj)
    )
      return true;
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
export function contains(shape, lng, lat) {
  const polygons =
    shape.type === "Polygon" ? [shape.coordinates] : shape.coordinates;
  return polygons.some(
    (rings) =>
      inRing(lng, lat, rings[0]) &&
      !rings.slice(1).some((h) => inRing(lng, lat, h)),
  );
}
export function geometryBounds(shape) {
  const coords = shape.coordinates.flat(shape.type === "Polygon" ? 1 : 2);
  const lng = coords.map((p) => p[0]),
    lat = coords.map((p) => p[1]);
  return [
    Math.min(...lat),
    Math.min(...lng),
    Math.max(...lat),
    Math.max(...lng),
  ];
}
