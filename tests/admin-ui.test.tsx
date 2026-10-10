import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invalidate: vi.fn(async () => {}),
  notice: vi.fn(),
  admin: true,
  mode: true,
}));
vi.mock("../src/hooks/useApp", () => ({
  useApp: () => ({
    session: { user: { id: "test-only-admin" } },
    isAdmin: mocks.admin,
    adminMode: mocks.mode,
    setAdminMode: vi.fn(),
    invalidate: mocks.invalidate,
    notice: mocks.notice,
  }),
  useDebounce: (value: string) => value,
}));
vi.mock("../src/services/api", () => ({ rpc: mocks.rpc }));
vi.mock("../src/components/MapView", () => ({
  MapView: () => <div aria-label="Mapa de prueba">Mapa</div>,
}));
import Admin from "../src/pages/Admin";
const proposal = {
  id: "test-only-proposal",
  user_id: "test-only-user",
  name: "Local sugerido de prueba",
  category: "cafe",
  lat: -34.588,
  lng: -58.431,
  address: "Dirección de prueba 123",
  area: "CABA",
  explanation: "Propuesta sintética solo para pruebas",
  status: "pending",
  place_id: null,
  decision_reason: null,
  created_at: "2026-10-10T12:00:00Z",
};
function show() {
  return render(
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
        <Admin />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  mocks.rpc.mockReset();
  mocks.invalidate.mockClear();
  mocks.notice.mockClear();
  mocks.admin = true;
  mocks.mode = true;
});
describe("Administración de catálogo", () => {
  it("una cuenta normal no carga propuestas ni acciones administrativas", () => {
    mocks.admin = false;
    show();
    expect(screen.getByText("Acceso de administrador requerido")).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("aprobar envía los datos revisados y exige un motivo", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "admin_suggestions"
        ? [proposal]
        : name === "admin_catalog"
          ? []
          : null,
    );
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: /Local sugerido de prueba/ }),
    );
    fireEvent.change(screen.getByLabelText("Nombre del local"), {
      target: { value: "Nombre revisado de prueba" },
    });
    fireEvent.change(screen.getByLabelText("Motivo de la acción"), {
      target: { value: "Dirección verificada para la prueba" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar y publicar" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "admin_decide_suggestion",
        expect.objectContaining({
          sid: proposal.id,
          decision: "approve",
          fields: expect.objectContaining({
            name: "Nombre revisado de prueba",
            lat: -34.588,
          }),
          reason: "Dirección verificada para la prueba",
        }),
      ),
    );
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled());
  });
  it("rechazar pasa por una confirmación que se puede cancelar", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "admin_suggestions" ? [proposal] : [],
    );
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: /Local sugerido de prueba/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(
      screen
        .getByRole("button", { name: "Confirmar" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      mocks.rpc.mock.calls.some((c) => c[0] === "admin_decide_suggestion"),
    ).toBe(false);
  });
});
