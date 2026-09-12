import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const targetDate = String(process.argv[2] || "");
const region = String(process.argv[3] || "SP").toUpperCase();
const apply = process.argv.includes("--apply");
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error("Informe a data no formato AAAA-MM-DD.");

const previousDateValue = new Date(`${targetDate}T12:00:00Z`);
previousDateValue.setUTCDate(previousDateValue.getUTCDate() - 1);
const previousDate = previousDateValue.toISOString().slice(0, 10);
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: sheets, error: sheetsError } = await supabase
  .from("daily_sheets")
  .select("id,date")
  .eq("region", region)
  .in("date", [previousDate, targetDate]);
if (sheetsError) throw sheetsError;
const currentSheet = (sheets || []).find((sheet) => sheet.date === targetDate);
const previousSheet = (sheets || []).find((sheet) => sheet.date === previousDate);
if (!currentSheet || !previousSheet) throw new Error("Folha atual ou anterior não encontrada.");

const [{ data: currentRows, error: currentError }, { data: previousRows, error: previousError }] = await Promise.all([
  supabase.from("dispatches").select("id,driver_id,forecast_start_time,forecast_source").eq("daily_sheet_id", currentSheet.id),
  supabase.from("dispatches").select("driver_id,next_day_forecast_time").eq("daily_sheet_id", previousSheet.id),
]);
if (currentError) throw currentError;
if (previousError) throw previousError;

const previousByDriver = new Map((previousRows || []).map((row) => [row.driver_id, row]));
const fixes = (currentRows || []).flatMap((row) => {
  const expected = previousByDriver.get(row.driver_id)?.next_day_forecast_time;
  if (!expected || row.forecast_source === "MANUAL" || row.forecast_start_time === expected) return [];
  return [{
    id: row.id,
    driverId: row.driver_id,
    previousForecast: row.forecast_start_time,
    expectedForecast: expected,
  }];
});

if (apply) {
  for (const fix of fixes) {
    const { error } = await supabase
      .from("dispatches")
      .update({ forecast_start_time: fix.expectedForecast, forecast_source: "CONTINUITY" })
      .eq("id", fix.id);
    if (error) throw error;
  }
}

console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  targetDate,
  previousDate,
  region,
  count: fixes.length,
  fixes,
}, null, 2));
