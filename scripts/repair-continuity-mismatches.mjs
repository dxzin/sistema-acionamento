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
const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: sheets, error: sheetsError } = await supabase
  .from("daily_sheets").select("id,date").eq("region", region).gte("date", startDate).lte("date", endDate).order("date");
if (sheetsError) throw sheetsError;
const sheetIds = (sheets || []).map((sheet) => sheet.id);
const { data: rows, error: rowsError } = sheetIds.length
  ? await supabase.from("dispatches").select("id,daily_sheet_id,driver_id,origin_location_id,origin_source,final_destination_location_id").in("daily_sheet_id", sheetIds)
  : { data: [], error: null };
if (rowsError) throw rowsError;

const sheetByDate = new Map((sheets || []).map((sheet) => [sheet.date, sheet]));
const rowsBySheetDriver = new Map((rows || []).map((row) => [`${row.daily_sheet_id}:${row.driver_id}`, row]));
const fixes = [];

for (const sheet of sheets || []) {
  const previousDate = new Date(`${sheet.date}T12:00:00Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const previousSheet = sheetByDate.get(previousDate.toISOString().slice(0, 10));
  if (!previousSheet) continue;
  for (const current of (rows || []).filter((row) => row.daily_sheet_id === sheet.id)) {
    const previous = rowsBySheetDriver.get(`${previousSheet.id}:${current.driver_id}`);
    if (!previous) continue;
    if (current.origin_source === "MANUAL") continue;
    const expectedOrigin = previous.final_destination_location_id || null;
    if ((current.origin_location_id || null) !== expectedOrigin) {
      fixes.push({
        id: current.id,
        date: sheet.date,
        driverId: current.driver_id,
        previousOrigin: current.origin_location_id,
        expectedOrigin,
      });
    }
  }
}

if (apply) {
  for (const fix of fixes) {
    const { error } = await supabase.from("dispatches").update({ origin_location_id: fix.expectedOrigin, origin_source: "CONTINUITY" }).eq("id", fix.id);
    if (error) throw error;
  }
}

console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", count: fixes.length, fixes }, null, 2));
