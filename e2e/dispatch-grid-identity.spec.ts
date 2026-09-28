import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue() : route.abort());
  await page.goto("/");
});

test("consulta em lote envia de uma vez os condutores elegíveis visíveis", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { makeJourneyEligible(): void }).makeJourneyEligible());
  const button = page.getByRole("button", { name: "Buscar jornadas (3)" });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator("#batch-requests")).toHaveText('[["ana","gabriel","joao"]]');
});

test("consulta em lote respeita uma única linha selecionada", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { makeJourneyEligible(): void }).makeJourneyEligible());
  const joao = page.locator("tbody tr").filter({ hasText: "JOÃO" });
  await joao.locator("td").first().click();
  const button = page.getByRole("button", { name: "Buscar jornadas (1)" });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator("#batch-requests")).toHaveText('[["joao"]]');
});

test("consulta em lote usa linhas visíveis quando a seleção antiga desaparece", async ({ page }) => {
  await page.locator("tbody tr").filter({ hasText: "JOÃO" }).locator("td").first().click();
  await page.evaluate(() => (window as unknown as { replaceGrid(): void }).replaceGrid());
  const button = page.getByRole("button", { name: "Buscar jornadas (2)" });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator("#batch-requests")).toHaveText('[["novo1","novo2"]]');
});

test("exibe a cidade/base UB e LZ entre condutor e login", async ({ page }) => {
  const joaoCells = page.locator("tbody tr").filter({ hasText: "JOÃO" }).locator("td");
  const gabrielCells = page.locator("tbody tr").filter({ hasText: "GABRIEL" }).locator("td");
  await expect(joaoCells.nth(2)).toHaveText("UB");
  await expect(gabrielCells.nth(2)).toHaveText("LZ");
  await expect(page.locator("thead tr").nth(1).locator("th").nth(2)).toContainText("CIDADE");
});

test("não exibe a coluna Cidade na operação de SP", async ({ page }) => {
  await page.goto("/page");
  await expect(page.locator("thead tr").nth(1)).not.toContainText("CIDADE");
  const joaoCells = page.locator("tbody tr").filter({ hasText: "JOÃO" }).locator("td");
  await expect(joaoCells.nth(2)).toHaveText("1");
});

test("Tab continua no mesmo condutor depois de reordenar durante a edição", async ({ page }) => {
  const joao = page.locator("tbody tr").filter({ hasText: "JOÃO" });
  const forecast = joao.locator("td").nth(5).locator("input");
  await forecast.click();
  await forecast.fill("08:00");
  await page.evaluate(() => (window as unknown as { refreshGrid(): void }).refreshGrid());
  await expect(forecast).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(joao.getByLabel("Status do acionamento")).toBeFocused();
  await page.keyboard.type("APOIO");
  await page.keyboard.press("Tab");
  await expect(page.locator("#writes")).toContainText('"id":"joao","changes":{"dispatch_status":"APOIO"}');
  await expect(page.locator("#writes")).not.toContainText('"id":"gabriel"');
  await expect(page.locator("#writes")).not.toContainText('"id":"ana"');
});

test("colagem usa os IDs selecionados antes do refresh", async ({ page }) => {
  const joao = page.locator("tbody tr").filter({ hasText: "JOÃO" });
  const forecast = joao.locator("td").nth(5).locator("input");
  await forecast.click();
  await page.evaluate(() => (window as unknown as { refreshGrid(): void }).refreshGrid());
  await forecast.evaluate(element => {
    const data = new DataTransfer(); data.setData("text/plain", "08:00\tAPOIO");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(page.locator("#writes")).toContainText('"id":"joao"');
  await expect(page.locator("#writes")).not.toContainText('"id":"ana"');
});

test("mudança de horário mantém a célula estacionária e Tab acompanha o ID ao salvar", async ({ page }) => {
  const joao = page.locator("tbody tr").filter({ hasText: "JOÃO" });
  const forecast = joao.locator("td").nth(5).locator("input");
  await forecast.click();
  const before = await joao.evaluate(element => (element as HTMLTableRowElement).sectionRowIndex);
  await forecast.fill("08:00");
  await page.evaluate(() => (window as unknown as { changeJoaoShift(): void }).changeJoaoShift());
  await expect(forecast).toBeFocused();
  expect(await joao.evaluate(element => (element as HTMLTableRowElement).sectionRowIndex)).toBe(before);
  await page.keyboard.press("Tab");
  await expect(joao.getByLabel("Status do acionamento")).toBeFocused();
});

test("colagem de várias linhas preserva os destinatários após mudar a ordenação", async ({ page }) => {
  const originalOrder = await page.locator("tbody tr").evaluateAll(elements => elements.map(element => element.getAttribute("data-dispatch-id")));
  await page.getByTitle("Selecionar coluna F", { exact: true }).click();
  await page.evaluate(() => (window as unknown as { changeJoaoShift(): void }).changeJoaoShift());
  await expect(page.locator("tbody tr").first()).toContainText("JOÃO");
  await page.locator(".excel-grid").evaluate(element => {
    const data = new DataTransfer(); data.setData("text/plain", "APOIO\nTROCA\nACIONADO");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  const expected = originalOrder.map((id, index) => ({ id, changes: { dispatch_status: ["APOIO", "TROCA", "ACIONADO"][index] } }));
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toEqual(expected);
});

test("seleção removida não transfere limpeza para o condutor que ocupou a posição", async ({ page }) => {
  await page.locator("tbody tr").filter({ hasText: "JOÃO" }).locator("td").nth(5).click();
  await page.evaluate(() => (window as unknown as { removeJoao(): void }).removeJoao());
  await page.locator(".excel-grid").focus();
  await page.keyboard.press("Delete");
  await expect(page.locator("#writes")).toHaveText("[]");
});

test("Ctrl+A após selecionar a coluna Entrada não apaga outras colunas", async ({ page }) => {
  await page.getByTitle("Selecionar coluna I", { exact: true }).click();
  await page.locator(".excel-grid").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toEqual([
    { id: "ana", changes: { entry_time: null } },
    { id: "gabriel", changes: { entry_time: null } },
    { id: "joao", changes: { entry_time: null } },
  ]);
});

test("Ctrl+A após selecionar uma linha mantém a limpeza nessa linha", async ({ page }) => {
  await page.getByTitle("Selecionar linha 1", { exact: true }).click();
  await page.locator(".excel-grid").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toMatchObject([
    { id: "ana", changes: { entry_time: null, dispatch_status: "" } },
  ]);
});

test("copia várias linhas da própria grade e cola em outros condutores", async ({ page }) => {
  await page.goto("/copy-rows");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => (window as unknown as { prepareMultiRowCopy(): void }).prepareMultiRowCopy());
  await page.getByTitle("Selecionar linha 1", { exact: true }).click();
  await page.getByTitle("Selecionar linha 2", { exact: true }).click({ modifiers: ["Shift"] });
  await page.keyboard.press("ControlOrMeta+C");
  await page.getByTitle("Selecionar linha 4", { exact: true }).click();
  await page.getByTitle("Selecionar linha 5", { exact: true }).click({ modifiers: ["Shift"] });
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toEqual([
    { id: "maria", changes: { dispatch_status: "ACIONADO", destination_name: "UBERABA", final_destination_name: "BAURU" } },
    { id: "pedro", changes: { dispatch_status: "APOIO", destination_name: "CASTILHO", final_destination_name: "LENÇÓIS" } },
  ]);
});

test("cola uma cidade nas células de destino de vários condutores", async ({ page }) => {
  await page.setViewportSize({ width: 2100, height: 900 });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("UBERABA"));
  const cells = page.locator("tbody tr td:nth-child(13)");
  const first = await cells.nth(0).boundingBox();
  const last = await cells.nth(2).boundingBox();
  if (!first || !last) throw new Error("Células de destino não encontradas");
  await page.mouse.move(first.x + 10, first.y + 10);
  await page.mouse.down();
  await page.mouse.move(last.x + 10, last.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("tbody td.excel-range-selected")).toHaveCount(3);
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toEqual([
    { id: "ana", changes: { destination_name: "UBERABA" } },
    { id: "gabriel", changes: { destination_name: "UBERABA" } },
    { id: "joao", changes: { destination_name: "UBERABA" } },
  ]);
});

test("repete Destino e Destino final copiados juntos em várias linhas", async ({ page }) => {
  await page.setViewportSize({ width: 2100, height: 900 });
  const first = await page.locator("tbody tr td:nth-child(13)").first().boundingBox();
  const last = await page.locator("tbody tr td:nth-child(14)").nth(2).boundingBox();
  if (!first || !last) throw new Error("Células de destino não encontradas");
  await page.mouse.move(first.x + 10, first.y + 10);
  await page.mouse.down();
  await page.mouse.move(last.x + 10, last.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("tbody td.excel-range-selected")).toHaveCount(6);
  await page.locator(".excel-grid").evaluate(element => {
    const data = new DataTransfer(); data.setData("text/plain", "UBERABA\tCASTILHO");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toEqual([
    { id: "ana", changes: { destination_name: "UBERABA", final_destination_name: "CASTILHO" } },
    { id: "gabriel", changes: { destination_name: "UBERABA", final_destination_name: "CASTILHO" } },
    { id: "joao", changes: { destination_name: "UBERABA", final_destination_name: "CASTILHO" } },
  ]);
});

test("valor copiado de Destino pode ser colado em várias linhas selecionadas pelo número", async ({ page }) => {
  await page.setViewportSize({ width: 2100, height: 900 });
  await page.evaluate(() => (window as unknown as { setAnaDestination(): void }).setAnaDestination());
  const source = page.getByRole("textbox", { name: "Destino de ANA" });
  await source.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  await page.getByTitle("Selecionar linha 2", { exact: true }).click();
  await page.getByTitle("Selecionar linha 3", { exact: true }).click({ modifiers: ["Shift"] });
  await expect(page.locator("tbody td.excel-range-selected")).toHaveCount(36);
  await page.keyboard.press("ControlOrMeta+A");
  await expect(page.locator("tbody td.excel-range-selected")).toHaveCount(36);
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toEqual([
    { id: "gabriel", changes: { destination_name: "UBERABA" } },
    { id: "joao", changes: { destination_name: "UBERABA" } },
  ]);
});

test("arrastar pelos números seleciona várias linhas", async ({ page }) => {
  const first = await page.getByTitle("Selecionar linha 1", { exact: true }).boundingBox();
  const last = await page.getByTitle("Selecionar linha 3", { exact: true }).boundingBox();
  if (!first || !last) throw new Error("Números das linhas não encontrados");
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await expect(page.locator("tbody td.excel-range-selected")).toHaveCount(18);
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("tbody td.excel-range-selected")).toHaveCount(54);
});

test("Shift nas letras seleciona várias colunas para repetir um valor", async ({ page }) => {
  await page.setViewportSize({ width: 2100, height: 900 });
  await page.getByTitle("Selecionar coluna L", { exact: true }).click();
  await page.getByTitle("Selecionar coluna M", { exact: true }).click({ modifiers: ["Shift"] });
  await expect(page.locator("tbody td.excel-range-selected")).toHaveCount(6);
  await page.locator(".excel-grid").evaluate(element => {
    const data = new DataTransfer(); data.setData("text/plain", "UBERABA");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toEqual([
    { id: "ana", changes: { destination_name: "UBERABA", final_destination_name: "UBERABA" } },
    { id: "gabriel", changes: { destination_name: "UBERABA", final_destination_name: "UBERABA" } },
    { id: "joao", changes: { destination_name: "UBERABA", final_destination_name: "UBERABA" } },
  ]);
});

test("bloco menor não repete a primeira linha nas linhas restantes", async ({ page }) => {
  await page.setViewportSize({ width: 2100, height: 900 });
  const cells = page.locator("tbody tr td:nth-child(13)");
  const first = await cells.nth(0).boundingBox();
  const last = await cells.nth(2).boundingBox();
  if (!first || !last) throw new Error("Células de destino não encontradas");
  await page.mouse.move(first.x + 10, first.y + 10);
  await page.mouse.down();
  await page.mouse.move(last.x + 10, last.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("tbody td.excel-range-selected")).toHaveCount(3);
  await page.locator(".excel-grid").evaluate(element => {
    const data = new DataTransfer(); data.setData("text/plain", "UBERABA\nCASTILHO");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toEqual([
    { id: "ana", changes: { destination_name: "UBERABA" } },
    { id: "gabriel", changes: { destination_name: "CASTILHO" } },
  ]);
});

test("planilha completa do Excel usa a ordem das linhas e pede confirmação", async ({ page }) => {
  await page.locator("tbody tr").first().locator("td").nth(1).click();
  await page.locator(".excel-grid").evaluate(element => {
    const data = new DataTransfer();
    data.setData("text/plain", "CONDUTOR\tLOGIN\tDESTINO\tDESTINO FINAL\nANA\tana\tUBERABA\tCASTILHO\nGABRIEL\tgabriel\tLENÇÓIS\tBAURU\n");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(page.getByRole("dialog", { name: "Conferir colagem do Excel" })).toContainText("2 linha(s), 4 célula(s)");
  await expect(page.locator("#writes")).toHaveText("[]");
  await page.getByRole("button", { name: "Aplicar colagem" }).click();
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toEqual([
    { id: "ana", changes: { destination_name: "UBERABA", final_destination_name: "CASTILHO" } },
    { id: "gabriel", changes: { destination_name: "LENÇÓIS", final_destination_name: "BAURU" } },
  ]);
});

test("cabeçalhos do Excel alinham colunas mesmo com Cidade visível na grade", async ({ page }) => {
  await page.locator("tbody tr").first().locator("td").nth(1).click();
  await page.locator(".excel-grid").evaluate(element => {
    const data = new DataTransfer();
    data.setData("text/plain", "CONDUTOR\tLOGIN\tHORÁRIO\tPREVISÃO\tSTATUS\tMOTIVO DO ABONO / APROVAÇÃO\tLOCAL\tENTRADA\tFROTA\tC/V\tDESTINO\tDESTINO FINAL\tSAÍDA\tOBSERVAÇÃO\tDIA DE ESCALA\tPREV. PRÓX. DIA\tTEMPO DE JORNADA\nANA\tana\t04:00\t03:30\tACIONADO\t\tUBERABA\t07:00\tABC1234\tC\tBAURU\tCASTILHO\t\tNota\t1\t\t\n");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await page.getByRole("button", { name: "Aplicar colagem" }).click();
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toEqual([
    { id: "ana", changes: {
      forecast_start_time: "03:30", dispatch_status: "ACIONADO", origin_name: "UBERABA",
      entry_time: "07:00:00", fleet_code: "ABC1234", cargo_status: "C",
      destination_name: "BAURU", final_destination_name: "CASTILHO", observations: "Nota",
    } },
  ]);
});

test("linhas completas do Excel sem cabeçalho também seguem a ordem", async ({ page }) => {
  await page.locator("tbody tr").first().locator("td").nth(1).click();
  await page.locator(".excel-grid").evaluate(element => {
    const data = new DataTransfer();
    const line = ["ANA", "ana", "04:00", "", "ACIONADO", "", "", "", "", "", "UBERABA", "CASTILHO", "", "", "", "", ""];
    data.setData("text/plain", line.join("\t"));
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(page.getByRole("dialog", { name: "Conferir colagem do Excel" })).toBeVisible();
  await page.getByRole("button", { name: "Aplicar colagem" }).click();
  await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText())).toEqual([
    { id: "ana", changes: { dispatch_status: "ACIONADO", destination_name: "UBERABA", final_destination_name: "CASTILHO" } },
  ]);
});

test("planilha inteira com login desalinhado não altera condutores", async ({ page }) => {
  await page.locator("tbody tr").first().locator("td").nth(1).click();
  await page.locator(".excel-grid").evaluate(element => {
    const data = new DataTransfer();
    data.setData("text/plain", "CONDUTOR\tLOGIN\tDESTINO\tDESTINO FINAL\nJOÃO\tjoao\tUBERABA\tCASTILHO\n");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(page.getByRole("status").filter({ hasText: "Alinhe as linhas" })).toContainText("Alinhe as linhas antes de colar");
  await expect(page.locator("#writes")).toHaveText("[]");
});

test("valor único em linha inteira não preenche colunas indevidas", async ({ page }) => {
  await page.getByTitle("Selecionar linha 1", { exact: true }).click();
  await page.locator(".excel-grid").evaluate(element => {
    const data = new DataTransfer(); data.setData("text/plain", "UBERABA");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(page.getByRole("status").filter({ hasText: "Selecione somente as colunas" })).toContainText("Selecione somente as colunas");
  await expect(page.locator("#writes")).toHaveText("[]");
});

test("Ctrl+C copia o conteúdo da linha e coluna selecionadas pelo cabeçalho", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("anterior"));
  await page.getByTitle("Selecionar linha 1", { exact: true }).click();
  await page.keyboard.press("ControlOrMeta+C");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("ANA");

  await page.evaluate(() => navigator.clipboard.writeText("anterior"));
  await page.getByTitle("Selecionar coluna A", { exact: true }).click();
  await page.keyboard.press("ControlOrMeta+C");
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n")))
    .toBe("ANA\nGABRIEL\nJOÃO");
});

test("Ctrl+A em uma caixa de Entrada seleciona só o texto da caixa", async ({ page }) => {
  const input = page.locator("tbody tr").filter({ hasText: "JOÃO" }).locator("td").nth(9).locator("input");
  await input.fill("08:15");
  await page.keyboard.press("ControlOrMeta+A");
  await expect.poll(() => input.evaluate(element => ({
    start: (element as HTMLInputElement).selectionStart,
    end: (element as HTMLInputElement).selectionEnd,
  }))).toEqual({ start: 0, end: 5 });
  await page.keyboard.press("Delete");
  await expect(input).toHaveValue("");
  await expect(page.locator("#writes")).toHaveText("[]");
  await input.blur();
  await expect(page.locator("#writes")).toHaveText('[{"id":"joao","changes":{"entry_time":null}}]');
});

test("Ctrl+C em uma caixa copia somente o texto selecionado", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const input = page.locator("tbody tr").filter({ hasText: "JOÃO" }).locator("td").nth(9).locator("input");
  await input.fill("08:15");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("08:15");
});

test("prévia do alarme usa o arquivo de áudio e o volume configurado", async ({ page }) => {
  await page.addInitScript(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { alarmAudio: HTMLMediaElement }).alarmAudio = this;
      return originalPlay.call(this);
    };
  });
  await page.goto("/page");
  await page.locator(".dispatch-reminder-button").first().click();
  await page.getByRole("button", { name: "Testar" }).click();
  await expect.poll(() => page.evaluate(() => {
    const audio = (window as unknown as { alarmAudio?: HTMLMediaElement }).alarmAudio;
    return audio && {
      path: new URL(audio.currentSrc || audio.src).pathname,
      volume: audio.volume,
      duration: Math.round(audio.duration),
      playing: !audio.paused && audio.currentTime > 0,
    };
  })).toEqual({ path: "/audio/alarme.mp3", volume: 0.65, duration: 26, playing: true });
});

test("alarme programado toca o MP3 e para ao confirmar", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-28T10:00:00") });
  await page.addInitScript(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { alarmAudio: HTMLMediaElement }).alarmAudio = this;
      return originalPlay.call(this);
    };
  });
  await page.goto("/page");
  await page.locator(".dispatch-reminder-button").first().click();
  await page.getByLabel("Horário do alerta").fill("10:01");
  await page.getByRole("button", { name: "Salvar alerta" }).click();
  await page.clock.fastForward(61_000);
  await expect(page.getByRole("alert", { name: "" }).filter({ hasText: "Hora de acionar" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const audio = (window as unknown as { alarmAudio?: HTMLMediaElement }).alarmAudio;
    return Boolean(audio && !audio.paused && audio.currentTime > 0);
  })).toBe(true);
  await page.getByRole("button", { name: "Entendido" }).click();
  await expect.poll(() => page.evaluate(() => {
    const audio = (window as unknown as { alarmAudio?: HTMLMediaElement }).alarmAudio;
    return Boolean(audio?.paused && audio.currentTime === 0);
  })).toBe(true);
});

test("resposta de refresh anterior ao save não sobrescreve o texto confirmado", async ({ page }) => {
  await page.clock.install();
  await page.goto("/page");
  const input = page.locator("tbody tr").filter({ hasText: "JOÃO" }).locator("td").nth(14).locator("input");
  await expect(input).toHaveValue("original");
  await page.evaluate(() => (window as unknown as { pageFixture: { deferRead(): void } }).pageFixture.deferRead());
  await page.clock.fastForward(5000);
  await expect.poll(() => page.evaluate(() => (window as unknown as { pageFixture: { readIsWaiting(): boolean } }).pageFixture.readIsWaiting())).toBe(true);
  await input.click();
  await input.fill("texto novo de JOÃO");
  await input.blur();
  await expect.poll(() => page.evaluate(() => (window as unknown as { pageFixture: { writes(): unknown[] } }).pageFixture.writes().length)).toBe(1);
  await page.evaluate(() => (window as unknown as { pageFixture: { releaseRead(): void } }).pageFixture.releaseRead());
  await page.clock.fastForward(50);
  await expect(input).toHaveValue("texto novo de JOÃO");
});

test("filtro da página mantém o condutor focado até concluir a edição", async ({ page }) => {
  await page.goto("/page");
  const joao = page.locator("tbody tr").filter({ hasText: "JOÃO" });
  const input = joao.locator("td").nth(14).locator("input");
  await input.click();
  await input.fill("rascunho de JOÃO");
  await page.evaluate(() => (window as unknown as { filterPageToGabriel(): void }).filterPageToGabriel());
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("rascunho de JOÃO");
  await input.blur();
  await expect(joao).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { pageFixture: { writes(): { id: string }[] } }).pageFixture.writes().map(item => item.id))).toEqual(["joao"]);
});

for (const [field, column, value] of [
  ["previsão", 5, "08:00"], ["status", 6, "APOIO"], ["motivo", 7, "teste"],
  ["local", 8, "BASE MANUAL"], ["entrada", 9, "08:00"], ["frota", 10, "ABC1234"], ["carga", 11, "C"],
  ["destino", 12, "LOCAL A"], ["destino final", 13, "LOCAL B"],
  ["saída", 14, "18:00"], ["observação", 15, "texto de JOÃO"],
] as const) {
  test(`${field}: digitação permanece em JOÃO com novos dados e alteração de horário`, async ({ page }) => {
    const input = page.locator("tbody tr").filter({ hasText: "JOÃO" }).locator("td").nth(column).locator("input");
    await input.click();
    await input.fill(value);
    await page.evaluate(() => {
      const fixture = window as unknown as { changeJoaoShift(): void; insertDriver(): void };
      fixture.changeJoaoShift(); fixture.insertDriver();
    });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(value);
    await input.blur();
    await expect.poll(async () => JSON.parse(await page.locator("#writes").innerText()).map((write: { id: string }) => write.id)).toEqual(["joao"]);
  });
}

test("Escape cancela a edição do condutor original mesmo após reordenar", async ({ page }) => {
  const input = page.locator("tbody tr").filter({ hasText: "JOÃO" }).locator("td").nth(15).locator("input");
  await input.click();
  await input.fill("não salvar este rascunho");
  await page.evaluate(() => (window as unknown as { changeJoaoShift(): void }).changeJoaoShift());
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("");
  await expect(page.locator("#writes")).toHaveText('[{"id":"joao","changes":{"observations":null}}]');
});

test("status sai do filtro Vazio somente depois de terminar a edição", async ({ page }) => {
  await page.getByRole("button", { name: "Filtrar coluna Status", exact: true }).click();
  await page.getByLabel("Vazio", { exact: true }).click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  const joao = page.locator("tbody tr").filter({ hasText: "JOÃO" });
  const input = joao.getByLabel("Status do acionamento");
  await input.click();
  await input.fill("APOIO");
  await expect(input).toBeFocused();
  await input.blur();
  await expect(joao).toHaveCount(0);
  await expect(page.locator("#writes")).toHaveText('[{"id":"joao","changes":{"dispatch_status":"APOIO"}}]');
});

test("oferece filtro Vazio nas colunas operacionais que podem ficar sem preenchimento", async ({ page }) => {
  const columns = ["Local", "Entrada", "Frota", "C/V", "Destino", "Destino final", "Saída"];

  for (const column of columns) {
    await page.getByRole("button", { name: `Filtrar coluna ${column}`, exact: true }).click();
    await expect(page.getByLabel("Vazio", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "OK", exact: true }).click();
  }
});

test("Enter salva o condutor original e encontra o próximo por ID após o blur reordenar", async ({ page }) => {
  const input = page.locator("tbody tr").filter({ hasText: "GABRIEL" }).getByLabel("Status do acionamento");
  await input.click();
  await input.fill("APOIO");
  await page.evaluate(() => (window as unknown as { changeJoaoShift(): void }).changeJoaoShift());
  await expect(input).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("tbody tr").filter({ hasText: "ANA" }).getByLabel("Status do acionamento")).toBeFocused();
  await expect(page.locator("#writes")).toHaveText('[{"id":"gabriel","changes":{"dispatch_status":"APOIO"}}]');
});
