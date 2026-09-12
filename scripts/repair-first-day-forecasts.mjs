import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const year = Number(process.argv[2] || 2026);
const month = Number(process.argv[3] || 9);
const region = String(process.argv[4] || "SP").toUpperCase();
const apply = process.argv.includes("--apply");
const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
const endDate = `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function allPages(makeQuery) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const result = await makeQuery(from, from + 999);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < 1000) return rows;
  }
}

const [{ data: schedule, error: scheduleError }, { data: sheets, error: sheetsError }, drivers] = await Promise.all([
  supabase.from("monthly_schedules").select("id").eq("year", year).eq("month", month).eq("region", region).maybeSingle(),
  supabase.from("daily_sheets").select("id,date").eq("region", region).gte("date", startDate).lte("date", endDate).order("date"),
  allPages((from, to) => supabase.from("drivers").select("id,name,default_start_time").order("id").range(from, to)),
]);
if (scheduleError) throw scheduleError;
if (sheetsError) throw sheetsError;
if (!schedule) throw new Error("Escala mensal não encontrada.");

const entries = await allPages((from, to) => supabase.from("monthly_schedule_entries")
  .select("driver_id,day_of_month,scale_code,shift_time")
  .eq("schedule_id", schedule.id).order("driver_id").order("day_of_month").range(from, to));
const sheetIds = (sheets || []).map((sheet) => sheet.id);
const dispatches = sheetIds.length ? await allPages((from, to) => supabase.from("dispatches")
  .select("id,daily_sheet_id,driver_id,forecast_start_time,forecast_source")
  .in("daily_sheet_id", sheetIds).order("daily_sheet_id").order("driver_id").range(from, to)) : [];

const sheetById = new Map((sheets || []).map((sheet) => [sheet.id, sheet]));
const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
const entryByCell = new Map(entries.map((entry) => [`${entry.driver_id}:${entry.day_of_month}`, entry]));
const subtractFourHours = (time) => {
  const [hours, minutes = "0"] = String(time || "").split(":");
  if (!hours) return null;
  const total = ((Number(hours) * 60 + Number(minutes) - 240) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
};
const fixes = dispatches.flatMap((row) => {
  const date = sheetById.get(row.daily_sheet_id)?.date;
  const day = date ? Number(date.slice(8, 10)) : 0;
  const entry = entryByCell.get(`${row.driver_id}:${day}`);
  if (String(entry?.scale_code || "").trim() !== "1" || row.forecast_source === "MANUAL") return [];
  const driver = driverById.get(row.driver_id);
  const expected = subtractFourHours(entry.shift_time || driver?.default_start_time);
  if (!expected || row.forecast_start_time === expected) return [];
  return [{ id: row.id, date, driver: driver?.name, previousForecast: row.forecast_start_time, expectedForecast: expected }];
});

if (apply) {
  for (const fix of fixes) {
    const { error } = await supabase.from("dispatches")
      .update({ forecast_start_time: fix.expectedForecast, forecast_source: "SCHEDULE" }).eq("id", fix.id);
    if (error) throw error;
  }
}

console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", period: { year, month, region }, count: fixes.length, fixes }, null, 2));
