import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  normalizeScaleCode,
  normalizeScheduleTime,
  parseScheduleClipboard,
  parseScheduleFile,
  parseScheduleTimeClipboard,
} from "../src/lib/services/schedule-service";
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
    ["Condutor", "Login", "1", "2", "3", "4"],
    ["Nome diferente no arquivo", "12345", "1", "F", "FE", "SATD"],
  ]);

  const result = await parseScheduleFile(buffer, [driver], 4);

  assert.equal(result.matchedDriversCount, 1);
  assert.equal(result.totalEntries, 4);
  assert.deepEqual(result.changes.map((change) => change.scale_code), ["1", "F", "FE", "SATD"]);
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

test("preserva informações novas da escala com até 30 caracteres", () => {
  assert.equal(normalizeScaleCode("  s/atd especial  "), "S/ATD ESPECIAL");
  assert.equal(normalizeScaleCode("a".repeat(35)), "A".repeat(30));
});

test("cola um bloco de escala a partir da célula selecionada", () => {
  assert.deepEqual(
    parseScheduleClipboard("1\tSATD\r\nF\ttexto novo\r\n", ["d1", "d2", "d3"], 1, 3, 4),
    [
      { driver_id: "d2", day_of_month: 3, scale_code: "1" },
      { driver_id: "d2", day_of_month: 4, scale_code: "SATD" },
      { driver_id: "d3", day_of_month: 3, scale_code: "F" },
      { driver_id: "d3", day_of_month: 4, scale_code: "TEXTO NOVO" },
    ]
  );
});

test("repete um único valor em todas as células selecionadas", () => {
  assert.deepEqual(
    parseScheduleClipboard("SATD", ["d1", "d2", "d3"], 0, 1, 4, 1, 2),
    [
      { driver_id: "d1", day_of_month: 1, scale_code: "SATD" },
      { driver_id: "d1", day_of_month: 2, scale_code: "SATD" },
      { driver_id: "d2", day_of_month: 1, scale_code: "SATD" },
      { driver_id: "d2", day_of_month: 2, scale_code: "SATD" },
    ]
  );
});

test("normaliza e cola horários em várias linhas da escala", () => {
  assert.equal(normalizeScheduleTime("4:00"), "04:00");
  assert.equal(normalizeScheduleTime("12:30:00"), "12:30");
  assert.equal(normalizeScheduleTime(" vf "), "VF");
  assert.equal(normalizeScheduleTime("25:00"), null);
  assert.deepEqual(
    parseScheduleTimeClipboard("20:00", ["d1", "d2", "d3"], 0, 2),
    [
      { driver_id: "d1", shift_time: "20:00" },
      { driver_id: "d2", shift_time: "20:00" },
      { driver_id: "d3", shift_time: "20:00" },
    ]
  );
  assert.deepEqual(
    parseScheduleTimeClipboard("04:00\n12:00", ["d1", "d2"], 0),
    [
      { driver_id: "d1", shift_time: "04:00" },
      { driver_id: "d2", shift_time: "12:00" },
    ]
  );
  assert.deepEqual(
    parseScheduleTimeClipboard("VF", ["d1", "d2"], 0, 1),
    [
      { driver_id: "d1", shift_time: "VF" },
      { driver_id: "d2", shift_time: "VF" },
    ]
  );
});
