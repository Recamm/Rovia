// @vitest-environment node
import { describe, it, expect } from "vitest";
import { resolveSupabaseConfig } from "../src/config/supabase";

describe("Configuración pública de Supabase en builds limpios", () => {
  it("conecta al proyecto Rovia sin depender de archivos locales ignorados", () => {
    const config = resolveSupabaseConfig({});
    expect(config?.url).toBe("https://scektvkakqnrjndjaupe.supabase.co");
    expect(config?.key).toMatch(/^sb_publishable_/);
  });
  it("permite cambiar de entorno con un par completo y no mezcla proyectos", () => {
    expect(
      resolveSupabaseConfig({
        VITE_SUPABASE_URL: "https://development.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "development-public-key",
      }),
    ).toEqual({
      url: "https://development.supabase.co",
      key: "development-public-key",
    });
    expect(
      resolveSupabaseConfig({
        VITE_SUPABASE_URL: "https://development.supabase.co",
      }),
    ).toBeNull();
    expect(
      resolveSupabaseConfig({
        VITE_SUPABASE_PUBLISHABLE_KEY: "development-public-key",
      }),
    ).toBeNull();
  });
});
