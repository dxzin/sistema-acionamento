import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const year = Number(process.argv[2] || 2026);
const month = Number(process.argv[3] || 9);
const region = String(process.argv[4] || "SP").toUpperCase();
const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Variáveis do Supabase não encontradas.");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function allPages(makeQuery) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const result = await makeQuery(start, start + 999);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < 1000) return rows;
  }
}

const [{ data: schedule, error: scheduleError }, { data: sheets, error: sheetsError }, drivers] = await Promise.all([
  supabase.from("monthly_schedules").select("id").eq("month", month).eq("year", year).eq("region", region).maybeSingle(),
  supabase.from("daily_sheets").select("id,date").eq("region", region).gte("date", startDate).lte("date", endDate).order("date"),
  allPages((from, to) => supabase.from("drivers").select("id,name,login_matricula").order("id").range(from, to)),
]);
if (scheduleError) throw scheduleError;
if (sheetsError) throw sheetsError;

const scheduleEntries = schedule?.id
  ? await allPages((from, to) => supabase
    .from("monthly_schedule_entries")
    .select("driver_id,day_of_month,scale_code")
    .eq("schedule_id", schedule.id)
    .order("driver_id")
    .order("day_of_month")
    .range(from, to))
  : [];

const sheetIds = (sheets || []).map((sheet) => sheet.id);
const dispatches = sheetIds.length
  ? await allPages((from, to) => supabase
    .from("dispatches")
    .select("id,daily_sheet_id,driver_id,dispatch_status,origin_location_id,destination_location_id,final_destination_location_id")
    .in("daily_sheet_id", sheetIds)
    .order("daily_sheet_id")
    .order("driver_id")
    .range(from, to))
  : [];

const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
const sheetById = new Map((sheets || []).map((sheet) => [sheet.id, sheet]));
const sheetByDate = new Map((sheets || []).map((sheet) => [sheet.date, sheet]));
const scheduleByCell = new Map(scheduleEntries.map((entry) => [
  `${entry.driver_id}:${entry.day_of_month}`,
  String(entry.scale_code || "").trim().toUpperCase(),
]));
const dispatchBySheetDriver = new Map(dispatches.map((dispatch) => [
  `${dispatch.daily_sheet_id}:${dispatch.driver_id}`,
  dispatch,
]));

const restDayDispatches = dispatches.filter((dispatch) => {
  const date = sheetById.get(dispatch.daily_sheet_id)?.date;
  const day = date ? Number(date.slice(8, 10)) : 0;
  return ["F", "FE"].includes(scheduleByCell.get(`${dispatch.driver_id}:${day}`));
}).map((dispatch) => ({
  date: sheetById.get(dispatch.daily_sheet_id)?.date,
  driver: driverById.get(dispatch.driver_id)?.name,
  code: scheduleByCell.get(`${dispatch.driver_id}:${Number(sheetById.get(dispatch.daily_sheet_id)?.date.slice(8, 10))}`),
}));

const futureStatuses = dispatches.filter((dispatch) => {
  const date = sheetById.get(dispatch.daily_sheet_id)?.date || "";
  return date > today && String(dispatch.dispatch_status || "").trim();
}).map((dispatch) => ({
  date: sheetById.get(dispatch.daily_sheet_id)?.date,
  driver: driverById.get(dispatch.driver_id)?.name,
  status: dispatch.dispatch_status,
}));

const continuityIssues = [];
for (const sheet of sheets || []) {
  const date = new Date(`${sheet.date}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  const previousSheet = sheetByDate.get(date.toISOString().slice(0, 10));
  if (!previousSheet) continue;
  for (const driver of drivers) {
    const previous = dispatchBySheetDriver.get(`${previousSheet.id}:${driver.id}`);
    const current = dispatchBySheetDriver.get(`${sheet.id}:${driver.id}`);
    if (!previous?.final_destination_location_id || !current) continue;
    if (current.origin_location_id !== previous.final_destination_location_id) {
      continuityIssues.push({
        date: sheet.date,
        driver: driver.name,
        type: current.origin_location_id ? "origem divergente" : "origem ausente",
      });
    }
  }
}

const anizio = drivers.find((driver) => /ANIZIO|ANIZIO/i.test(driver.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
const day10Sheet = sheetByDate.get(`${year}-${String(month).padStart(2, "0")}-10`);
const anizioDay10 = anizio ? {
  driver: anizio.name,
  scaleCode: scheduleByCell.get(`${anizio.id}:10`) || null,
  appearsInDailySheet: Boolean(day10Sheet && dispatchBySheetDriver.get(`${day10Sheet.id}:${anizio.id}`)),
} : null;

console.log(JSON.stringify({
  auditedAt: new Date().toISOString(),
  period: { startDate, endDate, region },
  totals: {
    drivers: drivers.length,
    scheduleEntries: scheduleEntries.length,
    dailySheets: (sheets || []).length,
    dispatches: dispatches.length,
  },
  restDayDispatches: { count: restDayDispatches.length, samples: restDayDispatches.slice(0, 20) },
  futureStatuses: { count: futureStatuses.length, samples: futureStatuses.slice(0, 20) },
  continuityIssues: { count: continuityIssues.length, samples: continuityIssues.slice(0, 20) },
  anizioDay10,
}, null, 2));

