import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const region = String(process.argv[2] || "SP").toUpperCase();
const apply = process.argv.includes("--apply");
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const tomorrowDate = new Date(`${today}T12:00:00Z`);
tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
const tomorrow = tomorrowDate.toISOString().slice(0, 10);

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Variáveis do Supabase não encontradas.");
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: sheets, error: sheetsError } = await supabase
  .from("daily_sheets")
  .select("id,date,region")
  .eq("region", region)
  .gt("date", tomorrow)
  .order("date");
if (sheetsError) throw sheetsError;

const candidates = [];
const blocked = [];
for (const sheet of sheets || []) {
  const { data: rows, error: rowsError } = await supabase
    .from("dispatches")
    .select("id,dispatch_status,abono_reason,abono_authorized_by,entry_time,vehicle_id,cargo_status,destination_location_id,final_destination_location_id,exit_time,observations")
    .eq("daily_sheet_id", sheet.id);
  if (rowsError) throw rowsError;

  const manualRows = (rows || []).filter((row) =>
    String(row.dispatch_status || "").trim() || row.abono_reason || row.abono_authorized_by ||
    row.entry_time || row.vehicle_id || row.cargo_status || row.destination_location_id ||
    row.final_destination_location_id || row.exit_time || row.observations
  );
  const summary = { id: sheet.id, date: sheet.date, rows: rows?.length || 0, manualRows: manualRows.length };
  if (manualRows.length) blocked.push(summary);
  else candidates.push(summary);
}

if (apply && candidates.length) {
  const ids = candidates.map((sheet) => sheet.id);
  const { error: deleteError } = await supabase.from("daily_sheets").delete().in("id", ids);
  if (deleteError) throw deleteError;
}

console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  today,
  latestAllowedDate: tomorrow,
  deleted: apply ? candidates : [],
  candidates: apply ? [] : candidates,
  blocked,
}, null, 2));

if (blocked.length) process.exitCode = 2;
