import { INITIAL_BASES } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import { Driver, MonthlyScheduleEntry } from "@/types/database";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { getDemoDrivers } from "./driver-service";

export const SCALE_CODES = ["1", "2", "3", "4", "5", "6", "VF", "F", "FE", "AT", "AF", "SATD", "DES", "DESL"] as const;

export interface ScheduleCellChange {
  driver_id: string;
  day_of_month: number;
  scale_code: string;
  shift_letter?: string | null;
  shift_time?: string | null;
}

export interface ScheduleTimeChange {
  driver_id: string;
  shift_time: string;
}

export interface ScheduleCatalog {
  drivers: Driver[];
  entries: MonthlyScheduleEntry[];
  source: "supabase" | "demo";
}

export interface ImportResult {
  changes: ScheduleCellChange[];
  scheduleTimes: ScheduleTimeChange[];
  shifts: Array<{ driver_id: string; shift_letter: string }>;
  matchedDriversCount: number;
  unmatchedNames: string[];
  totalEntries: number;
  worksheetName: string;
  detectedMonth: number | null;
}

const REGION_BASE_CODES: Record<string, string[]> = {
  SP: ["LP", "CASTILHO"],
  MG: ["UB", "LZ", "JP"],
  UBJP: ["UB", "LZ", "JP"],
};

export function normalizeScaleCode(value: string) {
  return value.toLocaleUpperCase("pt-BR").trim().replace(/\s+/g, " ").slice(0, 30);
}

export function normalizeScheduleTime(value: string): string | null {
  const normalizedValue = value.trim().toUpperCase();
  if (normalizedValue === "VF") return "VF";
  const match = normalizedValue.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || "00");
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseScheduleTimeClipboard(
  text: string,
  driverIds: string[],
  startRow: number,
  selectionEndRow = startRow
): ScheduleTimeChange[] {
  const rows = text.replace(/\r\n?/g, "\n").split("\n");
  while (rows.length && rows[rows.length - 1] === "") rows.pop();
  const rawTimes = rows.map((row) => row.split("\t")[0] || "");
  const values = rawTimes.length === 1 && selectionEndRow > startRow
    ? Array.from({ length: selectionEndRow - startRow + 1 }, () => rawTimes[0])
    : rawTimes;

  return values.flatMap((rawValue, offset) => {
    const driverId = driverIds[startRow + offset];
    if (!driverId) return [];
    const shiftTime = normalizeScheduleTime(rawValue);
    if (!shiftTime) throw new Error(`Horário inválido: “${rawValue.trim() || "vazio"}”. Use HH:MM ou VF.`);
    return [{ driver_id: driverId, shift_time: shiftTime }];
  });
}

export function parseScheduleClipboard(
  text: string,
  driverIds: string[],
  startRow: number,
  startDay: number,
  daysInMonth: number,
  selectionEndRow = startRow,
  selectionEndDay = startDay
): ScheduleCellChange[] {
  const rows = text.replace(/\r\n?/g, "\n").split("\n");
  while (rows.length && rows[rows.length - 1] === "") rows.pop();

  const clipboardRows = rows.map((line) => line.split("\t"));
  const isSingleValue = clipboardRows.length === 1 && clipboardRows[0]?.length === 1;

  if (isSingleValue && (selectionEndRow > startRow || selectionEndDay > startDay)) {
    const scaleCode = normalizeScaleCode(clipboardRows[0][0] || "");
    const changes: ScheduleCellChange[] = [];
    for (let row = startRow; row <= selectionEndRow; row++) {
      const driverId = driverIds[row];
      if (!driverId) continue;
      for (let day = startDay; day <= Math.min(selectionEndDay, daysInMonth); day++) {
        changes.push({ driver_id: driverId, day_of_month: day, scale_code: scaleCode });
      }
    }
    return changes;
  }

  const changes: ScheduleCellChange[] = [];
  clipboardRows.forEach((clipboardRow, rowOffset) => {
    const driverId = driverIds[startRow + rowOffset];
    if (!driverId) return;
    clipboardRow.forEach((rawValue, columnOffset) => {
      const day = startDay + columnOffset;
      if (day < 1 || day > daysInMonth) return;
      changes.push({
        driver_id: driverId,
        day_of_month: day,
        scale_code: normalizeScaleCode(rawValue),
      });
    });
  });
  return changes;
}

function matchKey(value: string) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function hasSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes("your-project") && !url.includes("placeholder"));
}

function storageKey(month: number, year: number, region: string) {
  return `sistema_acionamento_schedule_${year}_${month}_${region}`;
}

function demoDriversForRegion(region: string) {
  const baseCodes = new Set(REGION_BASE_CODES[region] || []);
  const baseIds = new Set(INITIAL_BASES.filter((base) => baseCodes.has(base.code)).map((base) => base.id));
  return getDemoDrivers().filter((driver) => driver.is_active && baseIds.has(driver.base_id));
}

function createDemoEntries(month: number, year: number, region: string, drivers: Driver[]): MonthlyScheduleEntry[] {
  const days = new Date(year, month, 0).getDate();
  const now = new Date().toISOString();
  return drivers.flatMap((driver, driverIndex) =>
    Array.from({ length: days }, (_, index) => {
      const cycleDay = (index + driverIndex) % 8;
      return {
        id: `demo-${year}-${month}-${region}-${driver.id}-${index + 1}`,
        schedule_id: `demo-${year}-${month}-${region}`,
        driver_id: driver.id,
        day_of_month: index + 1,
        scale_code: cycleDay >= 6 ? "F" : String(cycleDay + 1),
        shift_letter: driver.default_shift,
        shift_time: driver.default_start_time,
        updated_at: now,
      };
    }),
  );
}

function loadDemoEntries(month: number, year: number, region: string, drivers: Driver[]) {
  const key = storageKey(month, year, region);
  const stored = window.localStorage.getItem(key);
  if (!stored) return createDemoEntries(month, year, region, drivers);
  try {
    return JSON.parse(stored) as MonthlyScheduleEntry[];
  } catch {
    window.localStorage.removeItem(key);
    return createDemoEntries(month, year, region, drivers);
  }
}

export async function loadMonthlySchedule(month: number, year: number, region: string): Promise<ScheduleCatalog> {
  if (!hasSupabaseConfig()) {
    const drivers = demoDriversForRegion(region);
    return { drivers, entries: loadDemoEntries(month, year, region, drivers), source: "demo" };
  }

  const supabase = createClient();
  const baseCodes = REGION_BASE_CODES[region] || [];
  const { data: bases, error: basesError } = await supabase.from("bases").select("id").in("code", baseCodes);
  if (basesError) throw new Error(basesError.message);

  const baseIds = (bases || []).map((base) => base.id);
  const driversResult = baseIds.length
    ? await supabase.from("drivers").select("id,name,login_matricula,base_id,default_shift,default_start_time,is_active,created_at,updated_at").in("base_id", baseIds).eq("is_active", true).order("name")
    : { data: [], error: null };
  const scheduleResult = await supabase.from("monthly_schedules").select("id").eq("month", month).eq("year", year).eq("region", region).maybeSingle();
  if (driversResult.error || scheduleResult.error) {
    throw new Error(driversResult.error?.message || scheduleResult.error?.message || "Falha ao carregar a escala.");
  }

  let entries: MonthlyScheduleEntry[] = [];
  if (scheduleResult.data?.id) {
    const pageSize = 1000;
    for (let start = 0; ; start += pageSize) {
      const result = await supabase
        .from("monthly_schedule_entries")
        .select("id,schedule_id,driver_id,day_of_month,scale_code,shift_letter,shift_time,updated_at")
        .eq("schedule_id", scheduleResult.data.id)
        .order("driver_id")
        .order("day_of_month")
        .range(start, start + pageSize - 1);
      if (result.error) throw new Error(result.error.message);
      const page = (result.data || []) as MonthlyScheduleEntry[];
      entries.push(...page);
      if (page.length < pageSize) break;
    }
  }
  return { drivers: (driversResult.data || []) as Driver[], entries, source: "supabase" };
}

export async function saveMonthlySchedule(month: number, year: number, region: string, changes: ScheduleCellChange[], source: ScheduleCatalog["source"]): Promise<void> {
  if (source === "demo") {
    const drivers = demoDriversForRegion(region);
    const current = loadDemoEntries(month, year, region, drivers);
    const byCell = new Map(current.map((entry) => [`${entry.driver_id}:${entry.day_of_month}`, entry]));
    for (const change of changes) {
      const key = `${change.driver_id}:${change.day_of_month}`;
      if (!change.scale_code) byCell.delete(key);
      else byCell.set(key, { ...(byCell.get(key) || { id: crypto.randomUUID(), schedule_id: `demo-${year}-${month}-${region}` }), ...change, updated_at: new Date().toISOString() } as MonthlyScheduleEntry);
    }
    window.localStorage.setItem(storageKey(month, year, region), JSON.stringify([...byCell.values()]));
    return;
  }

  const supabase = createClient();
  const { data: schedule, error: scheduleError } = await supabase.from("monthly_schedules").upsert({ month, year, region, status: "ACTIVE" }, { onConflict: "month,year,region" }).select("id").single();
  if (scheduleError) throw new Error(scheduleError.message);

  const filled = changes.filter((change) => change.scale_code);
  const cleared = changes.filter((change) => !change.scale_code);
  if (filled.length) {
    const { error } = await supabase.from("monthly_schedule_entries").upsert(filled.map((change) => ({ ...change, schedule_id: schedule.id })), { onConflict: "schedule_id,driver_id,day_of_month" });
    if (error) throw new Error(error.message);
  }
  for (const change of cleared) {
    const { error } = await supabase.from("monthly_schedule_entries").delete().eq("schedule_id", schedule.id).eq("driver_id", change.driver_id).eq("day_of_month", change.day_of_month);
    if (error) throw new Error(error.message);
  }
}

function plainExcelValue(value: unknown): string | number | Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || value instanceof Date) return value;
  if (typeof value === "object") {
    const cell = value as { result?: unknown; text?: string; richText?: Array<{ text?: string }> };
    if (cell.result !== undefined) return plainExcelValue(cell.result);
    if (cell.text !== undefined) return cell.text;
    if (cell.richText) return cell.richText.map((part) => part.text || "").join("");
  }
  return String(value);
}

const IMPORT_MONTH_NAMES = [
  "JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

function normalizedLabel(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function importedScheduleTime(value: string | number | Date | null | undefined): string | null {
  if (value instanceof Date) {
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60) % (24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }
  return normalizeScheduleTime(String(value ?? ""));
}

function findDayHeader(rows: Array<Array<string | number | Date | null>>, daysInMonth: number) {
  let best: { row: number; column: number; sequence: number } | null = null;
  for (let rowIndex = 0; rowIndex < Math.min(20, rows.length); rowIndex++) {
    const row = rows[rowIndex] || [];
    for (let column = 0; column < row.length; column++) {
      const value = row[column];
      let sequence = 0;
      if (/^(?:1|01)$/.test(String(value ?? "").trim())) {
        sequence = 1;
        while (
          sequence < daysInMonth &&
          String(row[column + sequence] ?? "").trim().replace(/^0/, "") === String(sequence + 1)
        ) {
          sequence++;
        }
      } else if (value instanceof Date) {
        while (sequence < daysInMonth && row[column + sequence] instanceof Date) sequence++;
      }
      if (!best || sequence > best.sequence) best = { row: rowIndex, column, sequence };
    }
  }
  return best && best.sequence >= Math.min(3, daysInMonth) ? best : null;
}

function parseScheduleWorksheet(
  worksheet: ExcelJS.Worksheet,
  drivers: Driver[],
  daysInMonth: number
): ImportResult {
  if (worksheet.rowCount > 2000 || worksheet.columnCount > 100) {
    throw new Error(`A aba “${worksheet.name}” excede o limite seguro de 2.000 linhas ou 100 colunas.`);
  }

  const rows: Array<Array<string | number | Date | null>> = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = Array.isArray(row.values) ? row.values.slice(1, 101) : [];
    rows[rowNumber - 1] = values.map(plainExcelValue);
  });

  const header = findDayHeader(rows, daysInMonth);
  if (!header) {
    return {
      changes: [], scheduleTimes: [], shifts: [], matchedDriversCount: 0,
      unmatchedNames: [], totalEntries: 0, worksheetName: worksheet.name, detectedMonth: null,
    };
  }

  let detectedMonth: number | null = null;
  for (const row of rows.slice(0, 12)) {
    for (const value of row || []) {
      if (value instanceof Date && value.getUTCFullYear() >= 2000) {
        detectedMonth = value.getUTCMonth() + 1;
      }
      const label = normalizedLabel(value);
      const monthIndex = IMPORT_MONTH_NAMES.findIndex((monthName) => label === monthName || label.includes(monthName));
      if (monthIndex >= 0) detectedMonth = monthIndex + 1;
    }
  }

  let nameCol = 0;
  let loginCol = -1;
  let timeCol = -1;
  let shiftCol = -1;
  let lastHeaderRow = header.row;
  for (let rowIndex = Math.max(0, header.row - 2); rowIndex <= Math.min(rows.length - 1, header.row + 2); rowIndex++) {
    const row = rows[rowIndex] || [];
    row.forEach((value, column) => {
      const label = normalizedLabel(value);
      if (["NOME", "NOME DO CONDUTOR", "CONDUTOR", "CONDUTORES", "COLABORADOR", "COLABORADORES"].includes(label)) {
        nameCol = column;
        lastHeaderRow = Math.max(lastHeaderRow, rowIndex);
      }
      if (["LOGIN", "MATRICULA", "MATRÍCULA"].includes(label)) {
        loginCol = column;
        lastHeaderRow = Math.max(lastHeaderRow, rowIndex);
      }
      if (label === "HORA" || label.includes("HORARIO")) {
        timeCol = column;
        lastHeaderRow = Math.max(lastHeaderRow, rowIndex);
      }
      if (label === "TURMA" || label === "TURNO" || label === "LETRA") {
        shiftCol = column;
        lastHeaderRow = Math.max(lastHeaderRow, rowIndex);
      }
    });
  }

  const driverByKey = new Map<string, Driver>();
  const driverByLogin = new Map<string, Driver>();
  for (const driver of drivers) {
    driverByKey.set(matchKey(driver.name), driver);
    if (driver.login_matricula) driverByLogin.set(driver.login_matricula.trim(), driver);
  }

  const changes: ScheduleCellChange[] = [];
  const matchedDrivers = new Set<string>();
  const unmatchedNames: string[] = [];
  const scheduleTimes = new Map<string, ScheduleTimeChange>();
  const shifts = new Map<string, { driver_id: string; shift_letter: string }>();

  for (let rowIndex = lastHeaderRow + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!Array.isArray(row) || !row[nameCol]) continue;
    const rawName = String(row[nameCol]).trim();
    const cleanName = rawName.replace(/\s+-\s+VOLTA\s+\d{1,2}\/\d{1,2}\s*$/i, "").trim();
    const rawLogin = loginCol >= 0 && row[loginCol] ? String(row[loginCol]).trim() : "";
    const driver = driverByKey.get(matchKey(cleanName)) || (rawLogin ? driverByLogin.get(rawLogin) : undefined);
    if (!driver) {
      if (cleanName && !unmatchedNames.includes(cleanName)) unmatchedNames.push(cleanName);
      continue;
    }

    matchedDrivers.add(driver.id);
    const importedTime = timeCol >= 0 ? importedScheduleTime(row[timeCol]) : null;
    if (importedTime) scheduleTimes.set(driver.id, { driver_id: driver.id, shift_time: importedTime });
    const importedShift = shiftCol >= 0 ? normalizedLabel(row[shiftCol]) : "";
    if (/^[A-G]$/.test(importedShift)) shifts.set(driver.id, { driver_id: driver.id, shift_letter: importedShift });

    for (let day = 1; day <= Math.min(daysInMonth, header.sequence); day++) {
      const rawCode = row[header.column + day - 1];
      if (rawCode === undefined || rawCode === null || String(rawCode).trim() === "") continue;
      let code = String(rawCode).trim().toUpperCase();
      if (code.endsWith(".0")) code = code.slice(0, -2);
      changes.push({
        driver_id: driver.id,
        day_of_month: day,
        scale_code: normalizeScaleCode(code),
        shift_letter: /^[A-G]$/.test(importedShift) ? importedShift : undefined,
        shift_time: importedTime && importedTime !== "VF" ? `${importedTime}:00` : importedTime === "VF" ? null : undefined,
      });
    }
  }

  return {
    changes,
    scheduleTimes: [...scheduleTimes.values()],
    shifts: [...shifts.values()],
    matchedDriversCount: matchedDrivers.size,
    unmatchedNames,
    totalEntries: changes.length,
    worksheetName: worksheet.name,
    detectedMonth,
  };
}

export async function parseScheduleFile(
  buffer: ArrayBuffer,
  drivers: Driver[],
  daysInMonth: number
): Promise<ImportResult> {
  let workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch (reason) {
    let archive: JSZip;
    try {
      archive = await JSZip.loadAsync(buffer);
    } catch {
      throw reason;
    }
    const xmlFiles = Object.keys(archive.files).filter((name) => name.endsWith(".xml"));
    let normalizedFiles = 0;
    for (const name of xmlFiles) {
      const entry = archive.file(name);
      if (!entry) continue;
      const xml = await entry.async("string");
      if (!xml.includes("xmlns:x=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"")) continue;
      const normalized = xml.replace(/<(\/?)x:/g, "<$1");
      if (normalized !== xml) {
        archive.file(name, normalized);
        normalizedFiles++;
      }
    }
    if (!normalizedFiles) throw reason;
    try {
      const compatibleBuffer = await archive.generateAsync({ type: "uint8array" });
      workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(compatibleBuffer as never);
    } catch {
      throw new Error("O arquivo Excel não pôde ser interpretado. Abra-o no Excel, use Salvar como .xlsx e tente novamente.");
    }
  }
  if (!workbook.worksheets.length) throw new Error("O arquivo não possui uma planilha legível.");
  if (workbook.worksheets.length > 20) throw new Error("O arquivo excede o limite seguro de 20 abas.");

  const results = workbook.worksheets.map((worksheet) => parseScheduleWorksheet(worksheet, drivers, daysInMonth));
  return results.sort((left, right) =>
    right.matchedDriversCount - left.matchedDriversCount || right.totalEntries - left.totalEntries
  )[0];
}

export async function exportScheduleToExcel(
  month: number,
  year: number,
  region: string,
  drivers: Driver[],
  values: Record<string, string>,
  scheduleTimes: Record<string, string> = {}
) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const headers = ["#", "Condutor", "Login", "Turno", "Horário", ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1))];
  const dataRows = drivers.map((d, idx) => {
    const row: (string | number)[] = [
      idx + 1,
      d.name,
      d.login_matricula,
      d.default_shift || "",
      scheduleTimes[d.id] || d.default_start_time?.slice(0, 5) || "",
    ];
    for (let day = 1; day <= daysInMonth; day++) {
      row.push(values[`${d.id}:${day}`] || "");
    }
    return row;
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`Escala ${month}-${year}`, {
    views: [{ state: "frozen", xSplit: 5, ySplit: 1 }],
  });
  worksheet.addRows([headers, ...dataRows]);
  worksheet.autoFilter = { from: "A1", to: worksheet.getRow(1).getCell(headers.length).address };
  worksheet.columns = headers.map((header, index) => ({
    width: index === 1 ? 34 : index === 2 ? 14 : index < 5 ? 10 : Math.max(5, String(header).length + 2),
  }));
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF107C41" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.height = 18;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD0D0D0" } },
        left: { style: "thin", color: { argb: "FFD0D0D0" } },
        bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
        right: { style: "thin", color: { argb: "FFD0D0D0" } },
      };
    });
  });

  const output = await workbook.xlsx.writeBuffer();
  const blob = new Blob([output as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `escala_${region}_${year}_${String(month).padStart(2, "0")}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
