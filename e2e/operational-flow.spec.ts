import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /e-mail ou matrícula/i }).fill(email || "");
  await page.getByLabel(/senha de acesso/i).fill(password || "");
  await page.getByRole("button", { name: /entrar no sistema/i }).click();
  await expect(page).toHaveURL(/\/acionamento/);
}

test("uma rota protegida exige sessão", async ({ page }) => {
  await page.goto("/acionamento");
  await expect(page).toHaveURL(/\/login/);
});

test.describe("operação autenticada", () => {
  test.skip(!email || !password, "Defina E2E_EMAIL e E2E_PASSWORD para executar os testes autenticados.");

  test("carrega a grade, a presença e o estado da sincronização", async ({ page }) => {
    await login(page);
    await expect(page.getByText("Online", { exact: true })).toBeVisible();
    await expect(page.getByText(/Ao vivo|Sincronização de segurança|Offline/)).toBeVisible();
    await expect(page.locator(".excel-grid tbody tr").first()).toBeVisible();
  });

  test("operador comum não acessa a administração", async ({ page }) => {
    await login(page);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/acionamento/);
  });
});
