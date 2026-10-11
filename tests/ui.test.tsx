import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
vi.mock("../src/services/supabase", () => ({
  configured: false,
  supabase: null,
  db: () => {
    throw new Error("Backend desconectado solo en esta prueba");
  },
  fail: (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  },
}));
vi.mock("../src/components/MapView", () => ({
  MapView: () => <div aria-label="Mapa probado por separado">Mapa</div>,
}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TileLayer: () => null,
  CircleMarker: () => null,
}));
import App from "../src/App";
const snapshot = JSON.parse(
  readFileSync(process.cwd() + "/public/catalog.json", "utf8"),
);
snapshot.places = snapshot.places
  .filter(
    (p: { lat: number; lng: number }) =>
      p.lat >= -34.604 &&
      p.lat <= -34.576 &&
      p.lng >= -58.449 &&
      p.lng <= -58.413,
  )
  .slice(0, 12);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  localStorage.removeItem("rovia-theme");
});
describe("Interfaz conectada al catálogo real y estados pendientes", () => {
  it("cambia el archivo del logo al elegir oscuro y vuelve al claro", () => {
    window.history.replaceState(null, "", "/configuracion");
    localStorage.setItem("rovia-theme", "light");
    render(<App />);
    const logo = screen
      .getByRole("link", { name: "Rovia, ir a explorar" })
      .querySelector("img")!;
    expect(logo.getAttribute("src")).toBe("/logo-light.svg");
    fireEvent.change(screen.getByLabelText("Tema de Rovia"), {
      target: { value: "dark" },
    });
    expect(logo.getAttribute("src")).toBe("/logo-dark.svg");
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.change(screen.getByLabelText("Tema de Rovia"), {
      target: { value: "light" },
    });
    expect(logo.getAttribute("src")).toBe("/logo-light.svg");
  });
  it("carga locales, abre una ficha y conserva el destino de reseña al pedir acceso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(snapshot))),
    );
    render(<App />);
    await waitFor(
      () =>
        expect(document.querySelectorAll(".place-card").length).toBeGreaterThan(
          0,
        ),
      { timeout: 10000 },
    );
    const first = document.querySelector(".place-card") as HTMLElement;
    const name = first.querySelector("h3")!.textContent!;
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: "Conocer este lugar" }));
    await screen.findByRole("heading", { name });
    fireEvent.click(screen.getByRole("link", { name: "Escribir reseña" }));
    const enter = await screen.findByRole("link", { name: /Entrar a Rovia/ });
    expect(enter.getAttribute("href")).toContain("next=%2Flocal%2F");
    expect(enter.getAttribute("href")).toContain("%2Fresena");
  });
  it("muestra el backend pendiente y no registra cuentas falsas", async () => {
    window.history.replaceState(null, "", "/auth");
    render(<App />);
    expect(screen.getByText("Supabase pendiente de conexión")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Ingresar",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Registrate" }));
    expect(screen.getByLabelText("Nombre de usuario")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Crear mi cuenta",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("abre Explorar por defecto y protege Mi mapa y las sugerencias sin sesión", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(snapshot))),
    );
    render(<App />);
    expect(
      screen
        .getByRole("button", { name: "Explorar" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Mi mapa" }));
    expect(
      screen
        .getByRole("button", { name: "Mi mapa" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      await screen.findByRole("link", { name: /Entrar a Rovia/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: /Falta un local/ }));
    expect(
      await screen.findByRole("heading", { name: /Sugerí un local/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Enviar propuesta" }),
    ).toBeNull();
  });
});
