import { inCoverage } from "../domain/coverage";

export type AddressLocation = { label: string; lat: number; lng: number };
type GeorefAddress = {
  nomenclatura?: string;
  altura?: { valor?: number | null };
  ubicacion?: { lat?: number | null; lon?: number | null };
};

export function hasStreetNumber(address: string) {
  return /\p{L}/u.test(address) && /\d/.test(address);
}

export async function locateAddress(address: string, signal?: AbortSignal) {
  if (!hasStreetNumber(address))
    throw new Error("Ingresá la calle y el número del local.");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 15000);
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const responses = await Promise.allSettled(
    [
      { provincia: "02" },
      { provincia: "06", departamento: "Vicente López" },
    ].map(async (region) => {
      const params = new URLSearchParams({
        direccion: address.trim(),
        max: "3",
        provincia: region.provincia,
      });
      if (region.departamento) params.set("departamento", region.departamento);
      const response = await fetch(
        `https://apis.datos.gob.ar/georef/api/direcciones?${params}`,
        { signal: controller.signal },
      );
      if (!response.ok)
        throw new Error("Servicio de direcciones no disponible.");
      const data = (await response.json()) as { direcciones?: GeorefAddress[] };
      return Array.isArray(data.direcciones) ? data.direcciones : [];
    }),
  );
  clearTimeout(timer);
  signal?.removeEventListener("abort", cancel);
  const found = new Map<string, AddressLocation>();
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const address of response.value) {
      if (!address || typeof address !== "object") continue;
      const lat = address.ubicacion?.lat,
        lng = address.ubicacion?.lon;
      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        address.altura?.valor == null ||
        typeof address.nomenclatura !== "string" ||
        !address.nomenclatura ||
        !inCoverage(lat, lng)
      )
        continue;
      if (!found.has(address.nomenclatura))
        found.set(address.nomenclatura, {
          label: address.nomenclatura,
          lat,
          lng,
        });
    }
  }
  if (!found.size)
    throw new Error(
      "No pudimos ubicar esa dirección. Revisá la calle y el número o tocá el mapa para marcar el local.",
    );
  return [...found.values()];
}
