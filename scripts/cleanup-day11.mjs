import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['\"]|['\"]$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: sheet, error: sheetError } = await supabase
  .from("daily_sheets")
  .select("id")
  .eq("date", "2026-09-11")
  .eq("region", "SP")
  .single();
if (sheetError) throw sheetError;

const { data: dispatches, error: dispatchError } = await supabase
  .from("dispatches")
  .select("id,driver_id,dispatch_status,scale_day_status")
  .eq("daily_sheet_id", sheet.id);
if (dispatchError) throw dispatchError;

const preserved = dispatches.filter((row) => row.dispatch_status === "TROCA");
const toReset = dispatches.filter((row) => row.dispatch_status !== "TROCA");
const restCodes = new Set(["F", "FE", "AT", "AF", "DESL"]);

for (const row of toReset) {
  const scaleCode = row.scale_day_status || "";
  const isRest = restCodes.has(scaleCode);
  const { error } = await supabase
    .from("dispatches")
    .update({
      forecast_start_time: null,
      dispatch_status: isRest ? "ABONADO" : "ACIONADO",
      abono_reason: isRest ? `ESCALA: ${scaleCode}` : null,
      abono_authorized_by: null,
      origin_location_id: null,
      entry_time: null,
      vehicle_id: null,
      cargo_status: null,
      destination_location_id: null,
      final_destination_location_id: null,
      exit_time: null,
      observations: null,
      next_day_forecast_time: null,
      total_worked_minutes: null,
    })
    .eq("id", row.id);
  if (error) throw error;
}

console.log(JSON.stringify({ reset: toReset.length, preservedBaldeio: preserved.length }, null, 2));
