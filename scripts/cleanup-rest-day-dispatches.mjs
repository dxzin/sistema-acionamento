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
  supabase.from("daily_sheets").select("id,date").eq("region", region).gte("date", startDate).lte("date", endDate),
  allPages((from, to) => supabase.from("drivers").select("id,name").order("id").range(from, to)),
]);
if (scheduleError) throw scheduleError;
if (sheetsError) throw sheetsError;
if (!schedule) throw new Error("Escala mensal não encontrada.");

const entries = await allPages((from, to) => supabase.from("monthly_schedule_entries")
  .select("driver_id,day_of_month,scale_code").eq("schedule_id", schedule.id)
  .order("driver_id").order("day_of_month").range(from, to));
const sheetIds = (sheets || []).map((sheet) => sheet.id);
const dispatches = sheetIds.length ? await allPages((from, to) => supabase.from("dispatches")
  .select("id,daily_sheet_id,driver_id,dispatch_status,abono_reason,abono_authorized_by,entry_time,vehicle_id,cargo_status,destination_location_id,final_destination_location_id,exit_time,observations")
  .in("daily_sheet_id", sheetIds).order("daily_sheet_id").order("driver_id").range(from, to)) : [];

const normalize = (value) => String(value || "").trim().toUpperCase();
const scaleByCell = new Map(entries.map((entry) => [`${entry.driver_id}:${entry.day_of_month}`, normalize(entry.scale_code)]));
const sheetById = new Map((sheets || []).map((sheet) => [sheet.id, sheet]));
const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
const protectedFields = [
  "dispatch_status", "abono_reason", "abono_authorized_by", "entry_time", "vehicle_id", "cargo_status",
  "destination_location_id", "final_destination_location_id", "exit_time", "observations",
];
const candidates = [];
const protectedRows = [];

for (const row of dispatches) {
  const date = sheetById.get(row.daily_sheet_id)?.date;
  const day = date ? Number(date.slice(8, 10)) : 0;
  const scaleCode = scaleByCell.get(`${row.driver_id}:${day}`);
  if (!["F", "FE"].includes(scaleCode)) continue;
  const filledFields = protectedFields.filter((field) => String(row[field] || "").trim());
  const summary = { id: row.id, date, driver: driverById.get(row.driver_id)?.name, scaleCode, filledFields };
  if (filledFields.length) protectedRows.push(summary);
  else candidates.push(summary);
}

if (apply && candidates.length) {
  const { error } = await supabase.from("dispatches").delete().in("id", candidates.map((row) => row.id));
  if (error) throw error;
}

console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  period: { year, month, region },
  removable: { count: candidates.length, rows: candidates },
  protected: { count: protectedRows.length, rows: protectedRows },
}, null, 2));
