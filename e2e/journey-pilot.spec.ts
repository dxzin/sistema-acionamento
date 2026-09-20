import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue() : route.abort());
});

test("busca atrasada continua no João após reordenação e aplica pelo recordId", async ({ page }) => {
  await page.goto("/journey");
  await expect(page.getByRole("button", { name: "Buscar jornada SIGhRa de JOÃO" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buscar jornada SIGhRa de GABRIEL" })).toHaveCount(0);

  await page.getByRole("button", { name: "Buscar jornada SIGhRa de JOÃO" }).click();
  await page.evaluate(() => (window as unknown as { pageFixture: { reorder(): void } }).pageFixture.reorder());
  await page.getByRole("button", { name: "Atualizar" }).click();

  const dialog = page.getByRole("dialog", { name: "Prévia da jornada" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("JOÃO");
  await expect(dialog).toContainText("Jornada identificada com segurança");
  await dialog.getByRole("button", { name: "Aplicar à planilha" }).click();

  await expect.poll(() => page.evaluate(() => (window as unknown as { pageFixture: { writes(): { id: string }[] } }).pageFixture.writes())).toEqual([
    { id: "joao", changes: { entry_time: "04:30:00", exit_time: "00:20:00" }, expectedUpdatedAt: "2026-09-19T10:00:00Z" },
  ]);
});

test("valor manual divergente aparece na prévia e bloqueia aplicação", async ({ page }) => {
  await page.goto("/journey?conflict=1");
  await page.getByRole("button", { name: "Buscar jornada SIGhRa de JOÃO" }).click();
  const dialog = page.getByRole("dialog", { name: "Prévia da jornada" });
  await expect(dialog).toContainText("Já existe um valor manual divergente");
  await expect(dialog).toContainText("atual 09:20 · SIGhRa 00:20");
  await expect(dialog.getByRole("button", { name: "Aplicar à planilha" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.locator("#writes")).toHaveCount(0);
});
