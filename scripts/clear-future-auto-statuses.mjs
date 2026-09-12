import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['\"]|['\"]$/g, "");
}

const apply = process.argv.includes("--apply");
const startDate = "2026-09-11";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: sheets, error: sheetsError } = await supabase
  .from("daily_sheets")
  .select("id,date,region")
  .gte("date", startDate)
  .order("date");
if (sheetsError) throw sheetsError;

const report = [];
for (const sheet of sheets) {
  const { data: rows, error } = await supabase
    .from("dispatches")
    .select("id,dispatch_status,abono_reason")
    .eq("daily_sheet_id", sheet.id);
  if (error) throw error;

  // BALDEIO/TROCA é o lançamento manual conhecido e deve ser preservado.
  const toClear = rows.filter((row) => row.dispatch_status !== "" && row.dispatch_status !== "TROCA");
  if (apply) {
    for (const row of toClear) {
      const changes = { dispatch_status: "" };
      if (row.abono_reason?.startsWith("ESCALA:")) changes.abono_reason = null;
      const { error: updateError } = await supabase.from("dispatches").update(changes).eq("id", row.id);
      if (updateError) throw updateError;
    }
  }
  report.push({ date: sheet.date, region: sheet.region, rows: rows.length, cleared: toClear.length,
    preservedBaldeio: rows.filter((row) => row.dispatch_status === "TROCA").length });
}

console.log(JSON.stringify({ apply, startDate, sheets: report }, null, 2));
