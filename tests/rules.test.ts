import { describe, it, expect } from "vitest";
import {
  canRead,
  distance,
  openState,
  validateReview,
  validateUsername,
  validatePhotos,
  safeWebsite,
} from "../src/domain/rules";
describe("Visibilidad efectiva", () => {
  it("seguir o solicitar amistad no concede permiso de amigo", () => {
    expect(canRead("ana", "camilo", "friends", "public", false)).toBe(false);
    expect(canRead("ana", "camilo", "public", "friends", false)).toBe(false);
  });
  it("el perfil restringe y no amplía la audiencia", () => {
    expect(canRead("ana", null, "private", "public", false)).toBe(false);
    expect(canRead("ana", "amigo", "public", "private", true)).toBe(false);
    expect(canRead("ana", "ana", "private", "private", false)).toBe(true);
    expect(canRead("ana", "amigo", "friends", "friends", true)).toBe(true);
  });
});
describe("Reglas de reseñas e identidad", () => {
  it("rechaza puntajes fraccionarios y texto inválido", () => {
    expect(validateReview(3.5, "Una buena experiencia")).toBeTruthy();
    expect(validateReview(5, "Corto")).toBeTruthy();
    expect(validateReview(0, "Texto suficientemente largo")).toBeTruthy();
    expect(validateReview(4, "Un café muy agradable.")).toBeNull();
  });
  it("valida usuario y archivos", () => {
    expect(validateUsername("Camilo_1")).toBe(true);
    expect(validateUsername("ca")).toBe(false);
    expect(validateUsername("mi usuario")).toBe(false);
    expect(
      validatePhotos([new File(["x"], "x.svg", { type: "image/svg+xml" })]),
    ).toBeTruthy();
    expect(
      validatePhotos(
        Array.from(
          { length: 6 },
          () => new File(["x"], "x.jpg", { type: "image/jpeg" }),
        ),
      ),
    ).toBeTruthy();
  });
  it("bloquea esquemas web ejecutables", () => {
    expect(safeWebsite("javascript:alert(1)")).toBeNull();
    expect(safeWebsite("https://example.com")).toBe("https://example.com/");
  });
});
describe("Mapa y horarios", () => {
  it("mantiene horarios faltantes o inválidos desconocidos", () => {
    expect(
      openState({
        opening_hours: null,
        timezone: "America/Argentina/Buenos_Aires",
      }),
    ).toBe("unknown");
    expect(
      openState({ opening_hours: "cualquier cosa", timezone: "UTC" }),
    ).toBe("unknown");
  });
  it("evalúa horarios en el huso del local", () => {
    const p = {
      opening_hours: "Mo-Fr 09:00-17:00",
      timezone: "America/Argentina/Buenos_Aires",
    };
    expect(openState(p, new Date("2026-10-09T12:30:00Z"))).toBe("open");
    expect(openState(p, new Date("2026-10-09T21:00:00Z"))).toBe("closed");
  });
  it("calcula distancias geográficas", () => {
    expect(distance(-34.588, -58.431, -34.588, -58.431)).toBe(0);
    expect(distance(0, 0, 0, 1)).toBeCloseTo(111194.9, 0);
  });
});
