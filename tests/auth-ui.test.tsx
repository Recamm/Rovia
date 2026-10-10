import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  signup: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mocks.login,
      signUp: mocks.signup,
      resetPasswordForEmail: mocks.reset,
    },
  }),
}));
vi.mock("../src/hooks/useApp", () => ({
  useApp: () => ({ session: null, ready: true }),
}));
import Auth from "../src/pages/Auth";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show() {
  return render(
    <MemoryRouter initialEntries={["/auth"]}>
      <Auth />
    </MemoryRouter>,
  );
}
function credentials() {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "test@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "only-for-test-123" },
  });
}
describe("Autenticación con configuración pública incluida", () => {
  it("habilita el formulario sin variables de Vercel y envía el inicio real al cliente", async () => {
    mocks.login.mockResolvedValue({ error: null });
    show();
    expect(screen.queryByText("Supabase pendiente de conexión")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Ingresar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    credentials();
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "only-for-test-123",
      }),
    );
  });
  it("explica cuándo el correo necesita confirmación", async () => {
    mocks.login.mockResolvedValue({
      error: { message: "Email not confirmed" },
    });
    show();
    credentials();
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(
      await screen.findByText(/Confirmá tu correo antes de ingresar/),
    ).toBeTruthy();
  });
});
