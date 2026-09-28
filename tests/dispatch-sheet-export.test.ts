import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { dispatchExportDates, exportDispatchSheets } from "../src/lib/exports/dispatch-sheet";

test("monta todas as datas do período sem atravessar o limite mensal", () => {
  assert.deepEqual(dispatchExportDates("2026-09-27", "2026-09-30"), [
    "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30",
  ]);
  assert.throws(() => dispatchExportDates("2026-09-30", "2026-09-27"), /data final/);
  assert.throws(() => dispatchExportDates("2026-01-01", "2026-02-01"), /no máximo 31 dias/);
});

test("gera um arquivo com uma aba para cada dia selecionado", async () => {
  const originalDocument = globalThis.document;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let generatedBlob: Blob | null = null;
  let downloadedName = "";
  const link = {
    href: "",
    download: "",
    click() { downloadedName = this.download; },
    remove() {},
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => link, body: { appendChild() {} } },
  });
  URL.createObjectURL = (blob) => {
    if (!(blob instanceof Blob)) throw new Error("A exportação não gerou um arquivo Blob.");
    generatedBlob = blob;
    return "blob:dispatch-export";
  };
  URL.revokeObjectURL = () => undefined;

  try {
    await exportDispatchSheets([
      { date: "2026-09-27", rows: [] },
      { date: "2026-09-28", rows: [] },
    ], "SP");
    assert.equal(downloadedName, "acionamento_SP_2026-09-27_a_2026-09-28.xlsx");
    assert.ok(generatedBlob);
    const exportedBlob = generatedBlob as Blob;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await exportedBlob.arrayBuffer() as never);
    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
      "Acionamento 2026-09-27", "Acionamento 2026-09-28",
    ]);
    assert.equal(workbook.worksheets[0].getCell("A1").value, "CONDUTOR");
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});
