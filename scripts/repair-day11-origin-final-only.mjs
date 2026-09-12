import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['\"]|['\"]$/g, "");
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function getSheet(date) {
  const { data, error } = await supabase.from("daily_sheets").select("id").eq("date", date).eq("region", "SP").single();
  if (error) throw error;
  return data.id;
}

const [day10, day11] = await Promise.all([getSheet("2026-09-10"), getSheet("2026-09-11")]);
const [{ data: previous, error: previousError }, { data: current, error: currentError }] = await Promise.all([
  supabase.from("dispatches").select("driver_id,destination_location_id,final_destination_location_id").eq("daily_sheet_id", day10),
  supabase.from("dispatches").select("id,driver_id,origin_location_id").eq("daily_sheet_id", day11),
]);
if (previousError) throw previousError;
if (currentError) throw currentError;

const previousByDriver = new Map(previous.map((row) => [row.driver_id, row]));
const incorrect = current.filter((row) => {
  const prior = previousByDriver.get(row.driver_id);
  return Boolean(
    row.origin_location_id &&
    prior?.destination_location_id &&
    !prior.final_destination_location_id &&
    row.origin_location_id === prior.destination_location_id
  );
});

for (const row of incorrect) {
  const { error } = await supabase.from("dispatches").update({ origin_location_id: null }).eq("id", row.id);
  if (error) throw error;
}

console.log(JSON.stringify({ clearedIncorrectOrigins: incorrect.length }, null, 2));
