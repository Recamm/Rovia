import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ThemeProvider, useTheme } from "../src/hooks/useTheme";

function ThemeProbe() {
  const { preference, theme, setPreference } = useTheme();
  return (
    <>
      <output>
        {preference}/{theme}
      </output>
      <button onClick={() => setPreference("dark")}>Oscuro</button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
});

describe("Tema claro predeterminado", () => {
  it("inicia claro aunque el dispositivo prefiera oscuro", () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText("light/light")).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("rovia-theme")).toBe("light");
  });

  it.each(["dark", "system"])(
    "conserva la preferencia explícita %s",
    (value) => {
      localStorage.setItem("rovia-theme", value);
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      );
      expect(screen.getByText(`${value}/dark`)).toBeTruthy();
      expect(document.documentElement.dataset.theme).toBe("dark");
    },
  );

  it("usa claro ante una preferencia inválida", () => {
    localStorage.setItem("rovia-theme", "invalid");
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText("light/light")).toBeTruthy();
  });

  it("usa claro si no hay acceso al almacenamiento", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText("light/light")).toBeTruthy();
  });

  it("permite elegir y guardar oscuro después", () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Oscuro" }));
    expect(screen.getByText("dark/dark")).toBeTruthy();
    expect(localStorage.getItem("rovia-theme")).toBe("dark");
  });

  it("también usa claro antes de que React cargue, sin destello oscuro", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain('data-theme="light"');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    for (const [saved, expected] of [
      [null, "light"],
      ["invalid", "light"],
      ["dark", "dark"],
      ["system", "dark"],
    ]) {
      const document = { documentElement: { dataset: { theme: "light" } } };
      runInNewContext(script, {
        document,
        localStorage: { getItem: () => saved },
        window: { matchMedia: () => ({ matches: true }) },
      });
      expect(document.documentElement.dataset.theme).toBe(expected);
    }
  });
});
