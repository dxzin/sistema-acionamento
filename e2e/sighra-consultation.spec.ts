import { expect, test } from "@playwright/test";

test.skip(!process.env.SIGHRA_UI_TEST, "Executar com SIGHRA_UI_TEST=1 em servidor local com Supabase placeholder; APIs simuladas.");
const jobId = "00000000-0000-0000-0000-000000000001";
const end = { login: "30049", name: "FIM DE JORNADA GA", gps_at: "2026-09-16 12:20:33", inserted_at: "2026-09-16 12:20:46", vehicle: "220842" };
const job = { id: jobId, login: "30049", status: "queued", created_at: new Date().toISOString(), since_date: "2026-08-18", result: null, error: null };

test("consulta exibe macros e confere a folha antes de preencher a saida", async ({ page }) => {
  let applied: unknown;
  await page.route("**/api/integracoes/sighra/consultas**", route => route.fulfill({ json: route.request().method() === "POST" ? job : {
    ...job, status: "completed", result: { macros: [{ ...end, name: "REINICIO DE VIAGEM", gps_at: "2026-09-17 14:30:19" }], last_end: end },
  } }));
  await page.route("**/api/integracoes/sighra/preenchimento**", async route => {
    if (route.request().method() === "POST") {
      applied = route.request().postDataJSON();
      await route.fulfill({ json: { salvo: true, saida: "12:20:00" } });
    } else await route.fulfill({ json: { condutor: "Jose Douglas Garcia Filho", data: "2026-09-16", regiao: "SP", entrada: "00:51:00", saida_atual: "12:18:00", saida_sighra: "12:20:00", updated_at: "2026-09-17T08:50:22Z" } });
  });
  await page.goto("/sighra");
  await page.getByLabel("Login do condutor").fill("30049");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByText("Aguardando a ponte receber o pedido…", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Últimas 10 macros · login 30049" })).toBeVisible();
  await expect(page.getByText("17/09/2026 14:30:19", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preencher saída", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Conferir preenchimento" }).click();
  await expect(page.getByText("Entrada: 00:51. Saída atual: 12:18 →", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Preencher saída", exact: true }).click();
  await expect(page.getByText("Saída 12:20 salva para Jose Douglas Garcia Filho", { exact: false })).toBeVisible();
  expect(applied).toEqual({ consulta: jobId, data: "2026-09-16", regiao: "SP", updated_at: "2026-09-17T08:50:22Z" });
});

test("ausencia de fim de jornada nao oferece preenchimento nem afirma jornada aberta", async ({ page }) => {
  await page.route("**/api/integracoes/sighra/consultas**", route => route.fulfill({ json: route.request().method() === "POST" ? job : { ...job, status: "completed", result: { macros: [], last_end: null } } }));
  await page.goto("/sighra");
  await page.getByLabel("Login do condutor").fill("30049");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByText("Nenhum fim de jornada encontrado desde", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preencher saída", exact: true })).toHaveCount(0);
});
