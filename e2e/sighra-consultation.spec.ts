import { expect, test } from "@playwright/test";

test.skip(!process.env.SIGHRA_UI_TEST, "Executar com SIGHRA_UI_TEST=1 em servidor local com Supabase placeholder; APIs simuladas.");
const jobId = "00000000-0000-0000-0000-000000000001";
const end = { login: "30049", name: "FIM DE JORNADA GA", gps_at: "2026-09-16 12:20:33", inserted_at: "2026-09-16 12:20:46", vehicle: "220842", plate: "ABC1D23", point: "Garagem", city: "São Paulo", state: "SP", street: null, latitude: -23.55, longitude: -46.63 };
const job = { id: jobId, login: "30049", status: "queued", created_at: new Date().toISOString(), since_date: "2026-08-18", result: null, error: null };

test("consulta exibe macros sem oferecer o preenchimento legado pelo último fim", async ({ page }) => {
  await page.route("**/api/integracoes/sighra/consultas**", route => route.fulfill({ json: route.request().method() === "POST" ? job : {
    ...job, status: "completed", result: { macros: [{ ...end, name: "REINICIO DE VIAGEM", gps_at: "2026-09-17 14:30:19" }], last_end: end },
  } }));
  await page.goto("/sighra");
  await page.getByLabel("Login do condutor").fill("30049");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByText("Aguardando a ponte receber o pedido…", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Últimas 10 macros · login 30049" })).toBeVisible();
  await expect(page.getByText("17/09/2026 14:30:19", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "ABC1D23", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Garagem · São Paulo / SP Ver no mapa", exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver no mapa" }).last()).toHaveAttribute("href", "https://www.google.com/maps?q=-23.55,-46.63");
  await expect(page.getByRole("button", { name: "Preencher saída", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Conferir preenchimento" })).toHaveCount(0);
  await expect(page.getByText("Esta tela é somente para consulta", { exact: false })).toBeVisible();
});

test("ausencia de fim de jornada nao oferece preenchimento nem afirma jornada aberta", async ({ page }) => {
  await page.route("**/api/integracoes/sighra/consultas**", route => route.fulfill({ json: route.request().method() === "POST" ? job : { ...job, status: "completed", result: { macros: [], last_end: null } } }));
  await page.goto("/sighra");
  await page.getByLabel("Login do condutor").fill("30049");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByText("Nenhum fim de jornada encontrado desde", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preencher saída", exact: true })).toHaveCount(0);
});
