import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['\"]|['\"]$/g, "");
}

const [, , currentDate = "2026-09-11", previousDate = "2026-09-10", region = "SP"] = process.argv;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function sheetId(date) {
  const { data, error } = await supabase.from("daily_sheets").select("id").eq("date", date).eq("region", region).single();
  if (error) throw error;
  return data.id;
}

const [currentSheetId, previousSheetId] = await Promise.all([sheetId(currentDate), sheetId(previousDate)]);
const [{ data: current, error: currentError }, { data: previous, error: previousError }] = await Promise.all([
  supabase.from("dispatches").select("id,driver_id,origin_location_id").eq("daily_sheet_id", currentSheetId),
  supabase.from("dispatches").select("driver_id,destination_location_id,final_destination_location_id").eq("daily_sheet_id", previousSheetId),
]);
if (currentError) throw currentError;
if (previousError) throw previousError;

const previousByDriver = new Map(previous.map((row) => [row.driver_id, row]));
const updates = current.flatMap((row) => {
  if (row.origin_location_id) return [];
  const previousRow = previousByDriver.get(row.driver_id);
  const originId = previousRow?.final_destination_location_id;
  return originId ? [{ id: row.id, originId }] : [];
});

for (const { id, originId } of updates) {
  const { error } = await supabase.from("dispatches").update({ origin_location_id: originId }).eq("id", id);
  if (error) throw error;
}

console.log(JSON.stringify({ currentDate, previousDate, region, updated: updates.length }, null, 2));
