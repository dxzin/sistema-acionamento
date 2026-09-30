import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
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

const msDriver: Driver = {
  ...driver,
  id: "driver-ms",
  name: "JOAO DE MS",
  login_matricula: "67890",
  default_shift: "C",
  default_start_time: "20:00:00",
};

async function workbookBuffer(rows: unknown[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Escala").addRows(rows);
  const output = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(output);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function prefixedWorkbookBuffer(rows: unknown[][]): Promise<ArrayBuffer> {
  const buffer = await workbookBuffer(rows);
  const archive = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(archive.files).filter((entry) => entry.endsWith(".xml"))) {
    const entry = archive.file(name);
    if (!entry) continue;
    const xml = await entry.async("string");
    if (!xml.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) continue;
    const prefixed = xml
      .replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
      .replace(/<(\/?)((?!x:)[A-Za-z_][\w.-]*)(?=[\s/>])/g, "<$1x:$2");
    archive.file(name, prefixed);
  }
  const output = await archive.generateAsync({ type: "uint8array" });
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
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

test("importa arquivo Excel válido que usa prefixo XML x", async () => {
  const buffer = await prefixedWorkbookBuffer([
    ["Condutor", "Login", "1", "2", "3"],
    ["MARIA DA SILVA", "12345", "A", "F", "A"],
  ]);

  const result = await parseScheduleFile(buffer, [driver], 31);

  assert.equal(result.matchedDriversCount, 1);
  assert.deepEqual(result.changes.map((change) => change.scale_code), ["A", "F", "A"]);
});

test("importa o modelo 4x2 com dias, horário e turma e escolhe a aba compatível", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Capa").addRows([["ESCALA OPERACIONAL"], ["OUTUBRO"]]);
  workbook.addWorksheet("LP Outubro").addRows([
    [null, null, null, null, "OUTUBRO"],
    [null, null, "ESCALA", null, null, 1, 2, 3],
    ["CONDUTORES", "LIBERAÇÃO", 4, "x", 2, "QUI", "SEX", "SÁB", "HORÁRIO", "TURMA"],
    ["MARIA DA SILVA", "Liberado", 4, "x", 2, "A", "F", "FE", "20:00", "B"],
  ]);
  const output = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(output);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  const result = await parseScheduleFile(buffer, [driver], 31);

  assert.equal(result.worksheetName, "LP Outubro");
  assert.equal(result.detectedMonth, 10);
  assert.deepEqual(result.changes.map((change) => change.scale_code), ["A", "F", "FE"]);
  assert.deepEqual(result.scheduleTimes, [{ driver_id: "driver-1", shift_time: "20:00" }]);
  assert.deepEqual(result.shifts, [{ driver_id: "driver-1", shift_letter: "B" }]);
});

test("importa a escala 6x3 de MS dentro do mesmo grupo de LP", async () => {
  const buffer = await workbookBuffer([
    [null, null, null, null, "OUTUBRO"],
    [null, null, "ESCALA", null, null, 1, 2, 3, 4],
    ["CONDUTORES", "LIBERAÇÃO", 6, "x", 3, "QUI", "SEX", "SÁB", "DOM", "HORÁRIO", "TURMA"],
    ["JOAO DE MS", "Liberado", 6, "x", 3, "1", "2", "3", "F", "20:00", "C"],
  ]);

  const result = await parseScheduleFile(buffer, [driver, msDriver], 31);

  assert.equal(result.matchedDriversCount, 1);
  assert.deepEqual(result.changes.map((change) => change.driver_id), ["driver-ms", "driver-ms", "driver-ms", "driver-ms"]);
  assert.deepEqual(result.changes.map((change) => change.scale_code), ["1", "2", "3", "F"]);
  assert.deepEqual(result.scheduleTimes, [{ driver_id: "driver-ms", shift_time: "20:00" }]);
  assert.deepEqual(result.shifts, [{ driver_id: "driver-ms", shift_letter: "C" }]);
});

test("importa o arquivo LP quando os dias são datas e os campos são Hora e Letra", async () => {
  const buffer = await workbookBuffer([
    [null, null, null, null, null, null, new Date("2026-10-01T00:00:00.000Z")],
    [null, null, null, null, null],
    [null, null, "Escala", "Escala", "Escala", new Date("1900-01-31T00:00:00.000Z"), new Date("1900-02-01T00:00:00.000Z"), new Date("1900-02-02T00:00:00.000Z")],
    [null, null, 4, "x", 2, "QUI", "SEX", "SÁB"],
    ["Nome", "Login", "N", "x", "F", null, null, null, "Hora", "Letra"],
    ["MARIA DA SILVA", 12345, 4, "x", 2, "A", "F", "A", new Date("1899-12-30T04:00:00.000Z"), "A"],
  ]);

  const result = await parseScheduleFile(buffer, [driver], 31);

  assert.equal(result.detectedMonth, 10);
  assert.equal(result.matchedDriversCount, 1);
  assert.deepEqual(result.changes.map((change) => change.scale_code), ["A", "F", "A"]);
  assert.deepEqual(result.scheduleTimes, [{ driver_id: "driver-1", shift_time: "04:00" }]);
  assert.deepEqual(result.shifts, [{ driver_id: "driver-1", shift_letter: "A" }]);
});

test("informa os nomes da planilha que não existem na operação selecionada", async () => {
  const buffer = await workbookBuffer([
    ["Condutor", "1", "2", "3"],
    ["CONDUTOR NÃO CADASTRADO", "A", "F", "A"],
  ]);

  const result = await parseScheduleFile(buffer, [driver], 31);

  assert.equal(result.matchedDriversCount, 0);
  assert.deepEqual(result.unmatchedNames, ["CONDUTOR NÃO CADASTRADO"]);
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
