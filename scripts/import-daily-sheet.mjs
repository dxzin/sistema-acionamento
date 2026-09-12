import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const workbookPath = process.argv[2];
const worksheetName = process.argv[3];
const targetDate = process.argv[4];
const region = process.argv[5] || "SP";
const commit = process.argv.includes("--commit");
const replace = process.argv.includes("--replace");

if (!workbookPath || !worksheetName || !targetDate) {
  throw new Error("Uso: node scripts/import-daily-sheet.mjs <arquivo> <aba> <YYYY-MM-DD> [regiao] [--commit]");
}

for (const line of fs.readFileSync(path.resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['\"]|['\"]$/g, "");
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const workbook = XLSX.readFile(workbookPath, { cellDates: false });
const worksheet = workbook.Sheets[worksheetName];
if (!worksheet) throw new Error(`Aba não encontrada: ${worksheetName}`);
const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: true });

const normalize = (value) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const normalizeName = (value) => normalize(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const asText = (value) => {
  const text = String(value ?? "").trim();
  return text && !text.startsWith("#") ? text : null;
};
const asTime = (value) => {
  if (value == null || String(value).startsWith("#")) return null;
  if (value instanceof Date) return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}:${String(value.getUTCSeconds()).padStart(2, "0")}`;
  if (typeof value === "number") {
    const seconds = Math.round((value % 1) * 86400) % 86400;
    return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  const match = String(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}:${match[3] || "00"}` : null;
};
const statusMap = new Map([
  ["ACIONADO", "ACIONADO"], ["ABONADO", "ABONADO"], ["APOIO", "APOIO"],
  ["BALDEIO", "TROCA"], ["TROCA", "TROCA"], ["FALTA", "FALTA"],
  ["ATESTADO", "ATESTADO"], ["AFASTADO", "AFASTADO"], ["BATE E VOLTA", "BATE E VOLTA"],
  ["SUSPENSÃO", "SUSPENSÃO"], ["VIAGEM FECHADA", "VIAGEM FECHADA"],
]);

const { data: drivers, error: driversError } = await supabase.from("drivers").select("id,name,login_matricula");
if (driversError) throw driversError;
const driversByLogin = new Map(drivers.map((driver) => [normalize(driver.login_matricula), driver]));
const driversByName = new Map(drivers.map((driver) => [normalizeName(driver.name), driver]));
const { data: bases, error: basesError } = await supabase.from("bases").select("id,code");
if (basesError) throw basesError;
const basesByCode = new Map(bases.map((base) => [normalize(base.code), base.id]));

const { data: existingSheet, error: sheetLookupError } = await supabase.from("daily_sheets").select("id").eq("date", targetDate).eq("region", region).maybeSingle();
if (sheetLookupError) throw sheetLookupError;
let sheet = existingSheet;
if (!sheet && commit) {
  const result = await supabase.from("daily_sheets").insert({ date: targetDate, region, status: "OPEN" }).select("id").single();
  if (result.error) throw result.error;
  sheet = result.data;
}

let existingByDriver = new Map();
if (sheet) {
  const result = await supabase.from("dispatches").select("*").eq("daily_sheet_id", sheet.id);
  if (result.error) throw result.error;
  existingByDriver = new Map(result.data.map((item) => [item.driver_id, item]));
}

const locationCache = new Map();
const vehicleCache = new Map();
async function resolveLocation(value) {
  const name = normalize(value);
  if (!name) return null;
  if (locationCache.has(name)) return locationCache.get(name);
  let result = await supabase.from("locations").select("id").ilike("name", name).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data && commit) {
    result = await supabase.from("locations").insert({ name, is_active: true }).select("id").single();
    if (result.error) throw result.error;
  }
  const id = result.data?.id || null;
  locationCache.set(name, id);
  return id;
}
async function resolveVehicle(value) {
  const code = normalize(value).replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  if (!code) return null;
  if (vehicleCache.has(code)) return vehicleCache.get(code);
  let result = await supabase.from("vehicles").select("id").eq("plate_code", code).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data && commit) {
    result = await supabase.from("vehicles").insert({ plate_code: code, vehicle_type: "CAVALO_MECANICO", is_active: true }).select("id").single();
    if (result.error) throw result.error;
  }
  const id = result.data?.id || null;
  vehicleCache.set(code, id);
  return id;
}

const payload = [];
const unmatched = [];
const correctedLogins = [];
const createdDrivers = [];
for (const row of rows) {
  const login = normalize(row.LOGIN);
  if (!login) continue;
  const sourceName = asText(row.CONDUTORES);
  let driver = driversByLogin.get(login) || driversByName.get(normalizeName(sourceName));
  if (driver && normalize(driver.login_matricula) !== login) {
    correctedLogins.push({ name: driver.name, from: driver.login_matricula, to: login });
    if (commit) {
      const result = await supabase.from("drivers").update({ login_matricula: login, name: sourceName || driver.name }).eq("id", driver.id);
      if (result.error) throw result.error;
    }
    driver.login_matricula = login;
    driversByLogin.set(login, driver);
  }
  if (!driver) {
    if (!commit) {
      unmatched.push({ login, name: sourceName });
      continue;
    }
    const preferredBase = normalize(row.LOCAL) === "CASTILHO" ? "CASTILHO" : "LP";
    const result = await supabase.from("drivers").insert({
      name: sourceName || `CONDUTOR ${login}`,
      login_matricula: login,
      base_id: basesByCode.get(preferredBase),
      is_active: true,
    }).select("id,name,login_matricula").single();
    if (result.error) throw result.error;
    driver = result.data;
    createdDrivers.push({ login, name: driver.name });
  }
  const existing = existingByDriver.get(driver.id);
  const importedStatus = statusMap.get(normalize(row.ACIONADO));
  payload.push({
    daily_sheet_id: sheet?.id,
    driver_id: driver.id,
    forecast_start_time: asTime(row["PREVISÃO"] ?? row["PREVIS�O"]),
    dispatch_status: importedStatus || existing?.dispatch_status || "ACIONADO",
    abono_reason: asText(row["MOTIVO DO ABONO"]),
    abono_authorized_by: asText(row["AUTORIZAÇÃO DE ABONO"] ?? row["AUTORIZA��O DE ABONO"]),
    origin_location_id: await resolveLocation(row.LOCAL),
    entry_time: asTime(row["ENTRADA (h)"]),
    vehicle_id: await resolveVehicle(row.FROTA),
    cargo_status: ["C", "V"].includes(normalize(row["C/V"])) ? normalize(row["C/V"]) : null,
    destination_location_id: await resolveLocation(row.DESTINO),
    final_destination_location_id: await resolveLocation(row["DESTINO FINAL"]),
    exit_time: asTime(row["SAÍDA (h)"] ?? row["SA�DA (h)"]),
    observations: asText(row["OBSERVAÇÃO"] ?? row["OBSERVA��O"]),
    scale_day_status: asText(row["DIA DE ESC."]),
    next_day_forecast_time: asTime(row["PREV PRÓX. DIA"] ?? row["PREV PR�X. DIA"]),
  });
}

if (commit) {
  if (replace && sheet) {
    const deleted = await supabase.from("dispatches").delete().eq("daily_sheet_id", sheet.id);
    if (deleted.error) throw deleted.error;
  }
  const uniquePayload = [...new Map(payload.map((item) => [item.driver_id, item])).values()];
  const result = await supabase.from("dispatches").upsert(uniquePayload, { onConflict: "daily_sheet_id,driver_id" });
  if (result.error) throw result.error;
}

console.log(JSON.stringify({ mode: commit ? (replace ? "replace" : "commit") : "dry-run", sourceRows: rows.length, matched: payload.length, correctedLogins, createdDrivers, unmatched, existingSheet: Boolean(existingSheet), existingDispatches: existingByDriver.size }, null, 2));
