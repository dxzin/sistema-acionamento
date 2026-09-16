import { INITIAL_BASES, INITIAL_DRIVERS } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import { Driver, MonthlyScheduleEntry } from "@/types/database";
import ExcelJS from "exceljs";

export const SCALE_CODES = ["1", "2", "3", "4", "5", "6", "F", "FE", "AT", "AF", "SATD", "DES", "DESL"] as const;

export interface ScheduleCellChange {
  driver_id: string;
  day_of_month: number;
  scale_code: string;
}

export interface ScheduleCatalog {
  drivers: Driver[];
  entries: MonthlyScheduleEntry[];
  source: "supabase" | "demo";
}

export interface ImportResult {
  changes: ScheduleCellChange[];
  matchedDriversCount: number;
  unmatchedNames: string[];
  totalEntries: number;
}

const REGION_BASE_CODES: Record<string, string[]> = {
  SP: ["LP", "CASTILHO"],
  MG: ["UB", "LZ", "JP"],
  UBJP: ["UB", "LZ", "JP"],
  MS: ["MS"],
};

export function normalizeScaleCode(value: string) {
  return value.toLocaleUpperCase("pt-BR").trim().replace(/\s+/g, " ").slice(0, 30);
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
  return INITIAL_DRIVERS.filter((driver) => driver.is_active && baseIds.has(driver.base_id));
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
    ? await supabase.from("drivers").select("*").in("base_id", baseIds).eq("is_active", true).order("name")
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
        .select("*")
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

export async function parseScheduleFile(
  buffer: ArrayBuffer,
  drivers: Driver[],
  daysInMonth: number
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("O arquivo não possui uma planilha legível.");
  if (worksheet.rowCount > 2000 || worksheet.columnCount > 100) {
    throw new Error("A planilha excede o limite seguro de 2.000 linhas ou 100 colunas.");
  }

  const rows: Array<Array<string | number | Date | null>> = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber > 2000) return;
    const values = Array.isArray(row.values) ? row.values.slice(1, 101) : [];
    rows[rowNumber - 1] = values.map(plainExcelValue);
  });

  const driverByKey = new Map<string, Driver>();
  const driverByLogin = new Map<string, Driver>();
  for (const d of drivers) {
    driverByKey.set(matchKey(d.name), d);
    if (d.login_matricula) driverByLogin.set(d.login_matricula.trim(), d);
  }

  let headerRowIndex = 0;
  let nameCol = 0;
  let loginCol = -1;
  let firstDayCol = 2;

  for (let r = 0; r < Math.min(6, rows.length); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    let foundDays = 0;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || "").trim().toLowerCase();
      if (val === "1" || val === "01") {
        foundDays++;
        firstDayCol = c;
      }
      if (val.includes("nome") || val.includes("condutor") || val.includes("colaborador")) {
        nameCol = c;
      }
      if (val.includes("login") || val.includes("matr")) {
        loginCol = c;
      }
    }
    if (foundDays > 0) {
      headerRowIndex = r;
      break;
    }
  }

  const changes: ScheduleCellChange[] = [];
  const matchedDrivers = new Set<string>();
  const unmatchedNames: string[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || !row[nameCol]) continue;
    const rawName = String(row[nameCol]).trim();
    const cleanName = rawName.replace(/\s+-\s+VOLTA\s+\d{1,2}\/\d{1,2}\s*$/i, "").trim();
    const rawLogin = loginCol >= 0 && row[loginCol] ? String(row[loginCol]).trim() : "";

    const driver = driverByKey.get(matchKey(cleanName)) || (rawLogin ? driverByLogin.get(rawLogin) : undefined);
    if (!driver) {
      unmatchedNames.push(cleanName);
      continue;
    }

    matchedDrivers.add(driver.id);

    for (let day = 1; day <= daysInMonth; day++) {
      const colIdx = firstDayCol + (day - 1);
      if (colIdx < row.length) {
        const rawCode = row[colIdx];
        if (rawCode !== undefined && rawCode !== null && String(rawCode).trim() !== "") {
          let codeStr = String(rawCode).trim().toUpperCase();
          if (codeStr.endsWith(".0")) codeStr = codeStr.slice(0, -2);
          codeStr = normalizeScaleCode(codeStr);
          changes.push({
            driver_id: driver.id,
            day_of_month: day,
            scale_code: codeStr,
          });
        }
      }
    }
  }

  return {
    changes,
    matchedDriversCount: matchedDrivers.size,
    unmatchedNames,
    totalEntries: changes.length,
  };
}

export async function exportScheduleToExcel(
  month: number,
  year: number,
  region: string,
  drivers: Driver[],
  values: Record<string, string>
) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const headers = ["#", "Condutor", "Login", "Turno", ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1))];
  const dataRows = drivers.map((d, idx) => {
    const row: (string | number)[] = [
      idx + 1,
      d.name,
      d.login_matricula,
      d.default_shift || "",
    ];
    for (let day = 1; day <= daysInMonth; day++) {
      row.push(values[`${d.id}:${day}`] || "");
    }
    return row;
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`Escala ${month}-${year}`, {
    views: [{ state: "frozen", xSplit: 4, ySplit: 1 }],
  });
  worksheet.addRows([headers, ...dataRows]);
  worksheet.autoFilter = { from: "A1", to: worksheet.getRow(1).getCell(headers.length).address };
  worksheet.columns = headers.map((header, index) => ({
    width: index === 1 ? 34 : index === 2 ? 14 : index < 4 ? 10 : Math.max(5, String(header).length + 2),
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
