import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

const [{ data: drivers, error: driversError }, { data: sheets, error: sheetsError }, { data: locations, error: locationsError }] = await Promise.all([
  supabase.from("drivers").select("id,name,login_matricula"),
  supabase.from("daily_sheets").select("id,date,region").eq("region", "SP").in("date", ["2026-09-11", "2026-09-12", "2026-09-13"]),
  supabase.from("locations").select("id,name"),
]);
if (driversError) throw driversError;
if (sheetsError) throw sheetsError;
if (locationsError) throw locationsError;

const targets = (drivers || []).filter((driver) => {
  const name = normalize(driver.name);
  return name.includes("MARCOS ROBERTO DE OLIVEIRA") || name.includes("ADILSON MARTINS");
});
const sheetIds = (sheets || []).map((sheet) => sheet.id);
const { data: rows, error: rowsError } = await supabase.from("dispatches")
  .select("id,daily_sheet_id,driver_id,dispatch_status,origin_location_id,final_destination_location_id,created_at,updated_at")
  .in("daily_sheet_id", sheetIds).in("driver_id", targets.map((driver) => driver.id));
if (rowsError) throw rowsError;

const rowIds = (rows || []).map((row) => row.id);
const { data: audits, error: auditsError } = rowIds.length
  ? await supabase.from("audit_logs").select("entity_id,user_id,old_values,new_values,timestamp")
    .in("entity_id", rowIds).order("timestamp")
  : { data: [], error: null };
if (auditsError) throw auditsError;

const sheetById = new Map((sheets || []).map((sheet) => [sheet.id, sheet]));
const driverById = new Map(targets.map((driver) => [driver.id, driver]));
const locationById = new Map((locations || []).map((location) => [location.id, location.name]));
const auditByEntity = new Map();
for (const audit of audits || []) {
  auditByEntity.set(audit.entity_id, [...(auditByEntity.get(audit.entity_id) || []), audit]);
}

console.log(JSON.stringify((rows || []).map((row) => ({
  id: row.id,
  date: sheetById.get(row.daily_sheet_id)?.date,
  driver: driverById.get(row.driver_id)?.name,
  status: row.dispatch_status,
  origin: locationById.get(row.origin_location_id) || null,
  finalDestination: locationById.get(row.final_destination_location_id) || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  audits: auditByEntity.get(row.id) || [],
})).sort((a, b) => `${a.driver}:${a.date}`.localeCompare(`${b.driver}:${b.date}`)), null, 2));
