import fs from "node:fs";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const sourcePath = "C:/Users/Livia/Desktop/CONTROLE DE ALOCAÇÃO - ACIONAMENTO2.xlsx";
const sheetName = "Escala Setembro 2026 - SP";
const normalizeName = (value) => String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const normalizeCode = (value) => String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
const asTime = (value) => {
  if (typeof value === "number") {
    const minutes = Math.round((value % 1) * 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
  }
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}:${match[3] || "00"}` : null;
};

const workbook = XLSX.readFile(sourcePath, { cellDates: false });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
const sourceRows = rows.slice(1).filter((row) => row[0] && row[1]);
if (sourceRows.length !== 100) throw new Error(`Esperados 100 condutores, encontrados ${sourceRows.length}.`);

const allowedCodes = new Set(["1", "2", "3", "4", "5", "6", "F", "FE", "AT", "AF", "DESL"]);
for (const row of sourceRows) {
  for (let day = 1; day <= 30; day++) {
    const code = normalizeCode(row[day + 1]);
    if (!allowedCodes.has(code)) throw new Error(`Código inválido ${code || "(vazio)"}: ${row[0]}, dia ${day}.`);
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [driversResult, basesResult] = await Promise.all([
  supabase.from("drivers").select("id,name,login_matricula"),
  supabase.from("bases").select("id,code").in("code", ["LP", "CASTILHO"]),
]);
if (driversResult.error) throw driversResult.error;
if (basesResult.error) throw basesResult.error;
const lpBase = basesResult.data.find((base) => base.code === "LP");
if (!lpBase) throw new Error("Base LP não encontrada.");

const byLogin = new Map(driversResult.data.map((driver) => [String(driver.login_matricula ?? "").trim(), driver]));
const byName = new Map(driversResult.data.map((driver) => [normalizeName(driver.name), driver]));
const resolvedDrivers = [];
const created = [];
const updated = [];

for (const row of sourceRows) {
  const name = String(row[0]).trim();
  const login = String(row[1]).trim();
  const defaultStartTime = asTime(row[32]);
  const defaultShift = String(row[33] ?? "").trim().toUpperCase() || null;
  let driver = byLogin.get(login) || byName.get(normalizeName(name));
  if (!driver) {
    const result = await supabase.from("drivers").insert({ name, login_matricula: login, default_start_time: defaultStartTime, default_shift: defaultShift, base_id: lpBase.id, is_active: true }).select("id,name,login_matricula").single();
    if (result.error) throw result.error;
    driver = result.data;
    created.push({ name, login });
  } else {
    const result = await supabase.from("drivers").update({ name, login_matricula: login, default_start_time: defaultStartTime, default_shift: defaultShift, is_active: true }).eq("id", driver.id);
    if (result.error) throw result.error;
    updated.push({ name, login });
  }
  resolvedDrivers.push({ driver, row, defaultStartTime, defaultShift });
}

const scheduleResult = await supabase.from("monthly_schedules").upsert({ month: 9, year: 2026, region: "SP", status: "ACTIVE" }, { onConflict: "month,year,region" }).select("id").single();
if (scheduleResult.error) throw scheduleResult.error;
const scheduleId = scheduleResult.data.id;
const deleteResult = await supabase.from("monthly_schedule_entries").delete().eq("schedule_id", scheduleId);
if (deleteResult.error) throw deleteResult.error;

const entries = resolvedDrivers.flatMap(({ driver, row, defaultStartTime, defaultShift }) =>
  Array.from({ length: 30 }, (_, index) => ({
    schedule_id: scheduleId,
    driver_id: driver.id,
    day_of_month: index + 1,
    scale_code: normalizeCode(row[index + 2]),
    shift_letter: defaultShift,
    shift_time: defaultStartTime,
  })),
);
for (let start = 0; start < entries.length; start += 500) {
  const result = await supabase.from("monthly_schedule_entries").insert(entries.slice(start, start + 500));
  if (result.error) throw result.error;
}

console.log(JSON.stringify({ sourceRows: sourceRows.length, created, updated: updated.length, insertedEntries: entries.length, scheduleId }, null, 2));
