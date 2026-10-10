// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function worker() {
  const handlers: Record<string, (e: unknown) => void> = {};
  const cache = {
    match: vi.fn(async () => "public-shell"),
    open: vi.fn(),
    keys: vi.fn(),
  };
  const fetch = vi.fn(async () => {
    throw new Error("Offline");
  });
  const template = readFileSync("scripts/service-worker.js", "utf8")
    .replace("__BUILD_ID__", "test")
    .replace(
      "__ASSETS__",
      JSON.stringify(["/index.html", "/assets/public.js"]),
    );
  runInNewContext(template, {
    URL,
    caches: cache,
    fetch,
    self: {
      location: { origin: "https://userovia.vercel.app" },
      addEventListener: (name: string, handler: (e: unknown) => void) => {
        handlers[name] = handler;
      },
    },
  });
  return { onFetch: handlers.fetch, cache, fetch };
}
describe("Caché PWA y privacidad", () => {
  it("no intercepta Supabase, teselas, catálogo ni solicitudes autenticadas", () => {
    const w = worker();
    for (const url of [
      "https://scektvkakqnrjndjaupe.supabase.co/rest/v1/lists",
      "https://tile.openstreetmap.org/1/1/1.png",
      "https://userovia.vercel.app/catalog.json",
    ]) {
      const respondWith = vi.fn();
      w.onFetch({
        request: { url, method: "GET", mode: "cors", headers: new Headers() },
        respondWith,
      });
      expect(respondWith).not.toHaveBeenCalled();
    }
    const respondWith = vi.fn();
    w.onFetch({
      request: {
        url: "https://userovia.vercel.app/assets/public.js",
        method: "GET",
        mode: "cors",
        headers: new Headers({ Authorization: "Bearer test" }),
      },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
  });
  it("en una navegación sin red usa el shell limpio y no guarda URLs de autenticación", async () => {
    const w = worker();
    const respondWith = vi.fn();
    w.onFetch({
      request: {
        url: "https://userovia.vercel.app/auth/callback?code=private-test",
        method: "GET",
        mode: "navigate",
        headers: new Headers(),
      },
      respondWith,
    });
    expect(await respondWith.mock.calls[0][0]).toBe("public-shell");
    expect(w.cache.match).toHaveBeenCalledWith("/index.html");
    expect(w.cache.open).not.toHaveBeenCalled();
  });
});
