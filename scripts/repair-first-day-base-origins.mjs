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

const scheduleRegion = region === "UBJP" ? "MG" : region;
const [{ data: schedule, error: scheduleError }, { data: sheets, error: sheetsError }, drivers, { data: bases, error: basesError }, { data: locations, error: locationsError }] = await Promise.all([
  supabase.from("monthly_schedules").select("id").eq("year", year).eq("month", month).eq("region", scheduleRegion).maybeSingle(),
  supabase.from("daily_sheets").select("id,date").eq("region", region).gte("date", startDate).lte("date", endDate),
  allPages((from, to) => supabase.from("drivers").select("id,name,base_id").order("id").range(from, to)),
  supabase.from("bases").select("id,code,name"),
  supabase.from("locations").select("id,name"),
]);
if (scheduleError) throw scheduleError;
if (sheetsError) throw sheetsError;
if (basesError) throw basesError;
if (locationsError) throw locationsError;
if (!schedule) throw new Error("Escala mensal não encontrada.");

const entries = await allPages((from, to) => supabase
  .from("monthly_schedule_entries")
  .select("driver_id,day_of_month,scale_code")
  .eq("schedule_id", schedule.id)
  .order("driver_id")
  .order("day_of_month")
  .range(from, to));
const sheetIds = (sheets || []).map((sheet) => sheet.id);
const dispatches = sheetIds.length ? await allPages((from, to) => supabase
  .from("dispatches")
  .select("id,daily_sheet_id,driver_id,origin_location_id")
  .in("daily_sheet_id", sheetIds)
  .order("daily_sheet_id")
  .order("driver_id")
  .range(from, to)) : [];

const normalize = (value) => String(value || "").trim().toLocaleUpperCase("pt-BR");
const sheetById = new Map((sheets || []).map((sheet) => [sheet.id, sheet]));
const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
const baseById = new Map((bases || []).map((base) => [base.id, base]));
const locationByName = new Map((locations || []).map((location) => [normalize(location.name), location]));
const scaleByCell = new Map(entries.map((entry) => [`${entry.driver_id}:${entry.day_of_month}`, normalize(entry.scale_code)]));
const fixes = [];
const blocked = [];

for (const row of dispatches) {
  if (row.origin_location_id) continue;
  const sheet = sheetById.get(row.daily_sheet_id);
  const day = Number(sheet?.date.slice(8, 10));
  if (scaleByCell.get(`${row.driver_id}:${day}`) !== "1") continue;
  const driver = driverById.get(row.driver_id);
  const base = baseById.get(driver?.base_id);
  const location = locationByName.get(normalize(base?.code)) || locationByName.get(normalize(base?.name));
  const summary = { id: row.id, date: sheet?.date, driver: driver?.name, base: base?.code || base?.name || null };
  if (!location) blocked.push(summary);
  else fixes.push({ ...summary, originLocationId: location.id });
}

if (apply) {
  for (const fix of fixes) {
    const { error } = await supabase.from("dispatches").update({ origin_location_id: fix.originLocationId }).eq("id", fix.id);
    if (error) throw error;
  }
}

console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", count: fixes.length, fixes, blocked }, null, 2));
if (blocked.length) process.exitCode = 2;
