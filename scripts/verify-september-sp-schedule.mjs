import fs from "node:fs";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}
const normalize = (value) => String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (value) => String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
const asTime = (value) => {
  if (typeof value === "number") {
    const minutes = Math.round((value % 1) * 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
  }
  return String(value ?? "").slice(0, 8);
};
const workbook = XLSX.readFile("C:/Users/Livia/Desktop/CONTROLE DE ALOCAÇÃO - ACIONAMENTO2.xlsx", { cellDates: false });
const source = XLSX.utils.sheet_to_json(workbook.Sheets["Escala Setembro 2026 - SP"], { header: 1, defval: null, raw: true }).slice(1).filter((row) => row[0] && row[1]);
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const schedule = await supabase.from("monthly_schedules").select("id").eq("month", 9).eq("year", 2026).eq("region", "SP").single();
if (schedule.error) throw schedule.error;
const driversResult = await supabase.from("drivers").select("id,name,login_matricula,default_shift,default_start_time");
if (driversResult.error) throw driversResult.error;
const entries = [];
for (let start = 0; ; start += 1000) {
  const page = await supabase.from("monthly_schedule_entries").select("driver_id,day_of_month,scale_code,shift_letter,shift_time").eq("schedule_id", schedule.data.id).order("driver_id").order("day_of_month").range(start, start + 999);
  if (page.error) throw page.error;
  entries.push(...page.data);
  if (page.data.length < 1000) break;
}
const byLogin = new Map(driversResult.data.map((driver) => [String(driver.login_matricula ?? "").trim(), driver]));
const byCell = new Map(entries.map((entry) => [`${entry.driver_id}:${entry.day_of_month}`, entry]));
const errors = [];
for (const row of source) {
  const driver = byLogin.get(String(row[1]).trim());
  if (!driver) { errors.push(`${row[0]}: cadastro ausente`); continue; }
  if (normalize(driver.name) !== normalize(row[0])) errors.push(`${row[0]}: nome divergente`);
  if (String(driver.default_shift ?? "") !== String(row[33] ?? "")) errors.push(`${row[0]}: turno divergente`);
  if (String(driver.default_start_time ?? "") !== asTime(row[32])) errors.push(`${row[0]}: horário divergente`);
  for (let day = 1; day <= 30; day++) {
    if (code(byCell.get(`${driver.id}:${day}`)?.scale_code) !== code(row[day + 1])) errors.push(`${row[0]}: dia ${day}`);
  }
}
console.log(JSON.stringify({ sourceDrivers: source.length, systemEntries: entries.length, errorsCount: errors.length, errors: errors.slice(0, 20) }, null, 2));
