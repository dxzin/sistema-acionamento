import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseScheduleFile } from "../src/lib/services/schedule-service";
import type { Driver } from "../src/types/database";

const driver: Driver = {
  id: "driver-1",
  name: "MARIA DA SILVA",
  login_matricula: "12345",
  base_id: "base-sp",
  default_shift: "A",
  default_start_time: "04:00:00",
  is_active: true,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

async function workbookBuffer(rows: unknown[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Escala").addRows(rows);
  const output = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(output);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

test("importa códigos da escala e encontra condutor por matrícula", async () => {
  const buffer = await workbookBuffer([
    ["Condutor", "Login", "1", "2", "3"],
    ["Nome diferente no arquivo", "12345", "1", "F", "FE"],
  ]);

  const result = await parseScheduleFile(buffer, [driver], 3);

  assert.equal(result.matchedDriversCount, 1);
  assert.equal(result.totalEntries, 3);
  assert.deepEqual(result.changes.map((change) => change.scale_code), ["1", "F", "FE"]);
});

test("recusa planilha acima do limite seguro de linhas", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Escala");
  worksheet.getCell("A2001").value = "fora do limite";
  const output = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(output);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  await assert.rejects(
    () => parseScheduleFile(buffer, [driver], 30),
    /limite seguro de 2\.000 linhas ou 100 colunas/,
  );
});

