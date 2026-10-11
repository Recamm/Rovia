import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import type { MapView } from "../src/components/MapView";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), flyTo: vi.fn() }));
vi.mock("../src/hooks/useApp", () => ({
  useApp: () => ({
    session: { user: { id: "test-user" } },
    notice: vi.fn(),
    invalidate: vi.fn(),
  }),
}));
vi.mock("../src/services/api", () => ({ rpc: mocks.rpc }));
vi.mock("../src/services/supabase", () => ({
  fail: (error: unknown) => {
    if (error) throw error;
  },
  db: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
        }),
      }),
    }),
  }),
}));
vi.mock("../src/components/MapView", () => ({
  MapView: ({ places, onPick, onMap }: ComponentProps<typeof MapView>) => {
    useEffect(() => {
      onMap({ flyTo: mocks.flyTo } as unknown as Parameters<typeof onMap>[0]);
    }, [onMap]);
    return (
      <div>
        {places[0] && (
          <output aria-label="Pin del local">
            {places[0].lat},{places[0].lng}
          </output>
        )}
        <button type="button" onClick={() => onPick?.(-34.589, -58.432)}>
          Corregir pin en el mapa
        </button>
      </div>
    );
  },
}));
import SuggestPlace from "../src/pages/SuggestPlace";
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <MemoryRouter>
        <SuggestPlace />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Nombre del local"), {
    target: { value: "Local de prueba" },
  });
  fireEvent.change(screen.getByLabelText("Dirección"), {
    target: { value: "Cabildo 2000" },
  });
}
beforeEach(() => {
  mocks.rpc.mockResolvedValue("proposal-id");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify({
            direcciones:
              new URL(url).searchParams.get("provincia") === "02"
                ? [
                    {
                      nomenclatura: "CABILDO 2000, CABA",
                      altura: { valor: 2000 },
                      ubicacion: { lat: -34.588, lon: -58.431 },
                    },
                    {
                      nomenclatura: "Fuera de cobertura",
                      altura: { valor: 2000 },
                      ubicacion: { lat: 0, lon: 0 },
                    },
                  ]
                : [],
          }),
        ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.rpc.mockReset();
  mocks.flyTo.mockClear();
});

it("pide solo los cuatro datos, ubica automáticamente y exige confirmar antes de enviar", async () => {
  show();
  expect(screen.queryByLabelText("Latitud")).toBeNull();
  expect(screen.queryByLabelText("Longitud")).toBeNull();
  expect(screen.queryByLabelText(/Teléfono/)).toBeNull();
  expect(screen.getAllByRole("textbox")).toHaveLength(3);
  expect(fetch).not.toHaveBeenCalled();
  const send = screen.getByRole("button", {
    name: "Enviar propuesta",
  }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.blur(screen.getByLabelText("Dirección"));
  await waitFor(() =>
    expect(screen.getByLabelText("Pin del local").textContent).toBe(
      "-34.588,-58.431",
    ),
  );
  expect(mocks.flyTo).toHaveBeenCalledWith([-34.588, -58.431], 16);
  expect(send.disabled).toBe(true);
  fireEvent.click(
    screen.getByLabelText("Sí, el local está en la ubicación marcada"),
  );
  fireEvent.click(send);
  await waitFor(() =>
    expect(mocks.rpc).toHaveBeenCalledWith(
      "submit_place_suggestion",
      expect.objectContaining({
        fields: expect.objectContaining({
          name: "Local de prueba",
          category: "cafe",
          address: "Cabildo 2000",
          lat: -34.588,
          lng: -58.431,
        }),
        explanation: "",
      }),
    ),
  );
  expect(
    await screen.findByText(/Tu propuesta ya está en revisión/),
  ).toBeTruthy();
});

it("corregir el pin o editar la dirección obliga a confirmar de nuevo", async () => {
  show();
  fireEvent.blur(screen.getByLabelText("Dirección"));
  await screen.findByLabelText("Pin del local");
  const confirm = screen.getByLabelText(
    "Sí, el local está en la ubicación marcada",
  ) as HTMLInputElement;
  fireEvent.click(confirm);
  fireEvent.click(
    screen.getByRole("button", { name: "Corregir pin en el mapa" }),
  );
  expect(confirm.checked).toBe(false);
  expect(screen.getByLabelText("Pin del local").textContent).toBe(
    "-34.589,-58.432",
  );
  fireEvent.click(confirm);
  fireEvent.change(screen.getByLabelText("Dirección"), {
    target: { value: "Cabildo 3000" },
  });
  expect(confirm.checked).toBe(false);
  expect(confirm.disabled).toBe(true);
  expect(screen.queryByLabelText("Pin del local")).toBeNull();
});

it("si falla la búsqueda permite marcar manualmente y conserva los datos ante un envío fallido", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Offline");
    }),
  );
  mocks.rpc.mockRejectedValue(new Error("No se pudo enviar la propuesta"));
  show();
  fireEvent.blur(screen.getByLabelText("Dirección"));
  expect(
    await screen.findByText(/No pudimos ubicar esa dirección/),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Corregir pin en el mapa" }),
  );
  fireEvent.click(
    screen.getByLabelText("Sí, el local está en la ubicación marcada"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Enviar propuesta" }));
  expect(
    await screen.findByText("No se pudo enviar la propuesta"),
  ).toBeTruthy();
  expect(
    (screen.getByLabelText("Nombre del local") as HTMLInputElement).value,
  ).toBe("Local de prueba");
  expect(screen.getByLabelText("Pin del local").textContent).toBe(
    "-34.589,-58.432",
  );
});
