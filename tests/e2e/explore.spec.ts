import { test, expect } from "@playwright/test";
test("explorar catálogo real, ficha y ruta directa", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Un lugar nuevo/ }),
  ).toBeVisible();
  if (test.info().project.name === "mobile")
    await page
      .getByRole("button", { name: "Buscar lugares", exact: true })
      .click();
  await expect(page.locator(".place-card").first()).toBeVisible();
  const name = await page
    .locator(".place-card")
    .first()
    .locator("h3")
    .innerText();
  await page.locator(".place-card").first().click();
  await page.getByRole("button", { name: "Conocer este lugar" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Cómo llegar/ })).toHaveAttribute(
    "href",
    /destination=/,
  );
});
test("rechazar ubicación permite seguir explorando", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) =>
      error?.({
        code: 1,
        message: "Denegada",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mi ubicación", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /Podés buscar/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Acercar mapa" }),
  ).toBeEnabled();
});
test("cuentas pendientes se identifican y no simulan publicación", async ({
  page,
}) => {
  test.skip(!!process.env.VITE_SUPABASE_URL, "Solo modo sin conexión");
  await page.goto("/auth");
  await expect(page.getByText("Supabase pendiente de conexión")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ingresar", exact: true }),
  ).toBeDisabled();
});
