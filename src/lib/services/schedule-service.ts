import { INITIAL_BASES, INITIAL_DRIVERS } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import { Driver, MonthlyScheduleEntry } from "@/types/database";

export const SCALE_CODES = ["1", "2", "3", "4", "5", "6", "F", "FE", "AT", "AF", "DESL"] as const;

export interface ScheduleCellChange {
  driver_id: string;
  day_of_month: number;
  scale_code: string;
}

export interface ScheduleCatalog {
  drivers: Driver[];
  entries: MonthlyScheduleEntry[];
  source: "supabase" | "demo";
}

const REGION_BASE_CODES: Record<string, string[]> = {
  SP: ["LP", "CASTILHO"],
  MG: ["UB", "LZ", "JP"],
  MS: ["MS"],
};

function hasSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes("your-project") && !url.includes("placeholder"));
}

function storageKey(month: number, year: number, region: string) {
  return `sistema_acionamento_schedule_${year}_${month}_${region}`;
}

function demoDriversForRegion(region: string) {
  const baseCodes = new Set(REGION_BASE_CODES[region] || []);
  const baseIds = new Set(INITIAL_BASES.filter((base) => baseCodes.has(base.code)).map((base) => base.id));
  return INITIAL_DRIVERS.filter((driver) => driver.is_active && baseIds.has(driver.base_id));
}

function createDemoEntries(month: number, year: number, region: string, drivers: Driver[]): MonthlyScheduleEntry[] {
  const days = new Date(year, month, 0).getDate();
  const now = new Date().toISOString();
  return drivers.flatMap((driver, driverIndex) =>
    Array.from({ length: days }, (_, index) => {
      const cycleDay = (index + driverIndex) % 8;
      return {
        id: `demo-${year}-${month}-${region}-${driver.id}-${index + 1}`,
        schedule_id: `demo-${year}-${month}-${region}`,
        driver_id: driver.id,
        day_of_month: index + 1,
        scale_code: cycleDay >= 6 ? "F" : String(cycleDay + 1),
        shift_letter: driver.default_shift,
        shift_time: driver.default_start_time,
        updated_at: now,
      };
    }),
  );
}

function loadDemoEntries(month: number, year: number, region: string, drivers: Driver[]) {
  const key = storageKey(month, year, region);
  const stored = window.localStorage.getItem(key);
  if (!stored) return createDemoEntries(month, year, region, drivers);
  try {
    return JSON.parse(stored) as MonthlyScheduleEntry[];
  } catch {
    window.localStorage.removeItem(key);
    return createDemoEntries(month, year, region, drivers);
  }
}

export async function loadMonthlySchedule(month: number, year: number, region: string): Promise<ScheduleCatalog> {
  if (!hasSupabaseConfig()) {
    const drivers = demoDriversForRegion(region);
    return { drivers, entries: loadDemoEntries(month, year, region, drivers), source: "demo" };
  }

  const supabase = createClient();
  const baseCodes = REGION_BASE_CODES[region] || [];
  const { data: bases, error: basesError } = await supabase.from("bases").select("id").in("code", baseCodes);
  if (basesError) throw new Error(basesError.message);

  const baseIds = (bases || []).map((base) => base.id);
  const driversResult = baseIds.length
    ? await supabase.from("drivers").select("*").in("base_id", baseIds).eq("is_active", true).order("name")
    : { data: [], error: null };
  const scheduleResult = await supabase.from("monthly_schedules").select("id").eq("month", month).eq("year", year).eq("region", region).maybeSingle();
  if (driversResult.error || scheduleResult.error) {
    throw new Error(driversResult.error?.message || scheduleResult.error?.message || "Falha ao carregar a escala.");
  }

  let entries: MonthlyScheduleEntry[] = [];
  if (scheduleResult.data?.id) {
    const result = await supabase.from("monthly_schedule_entries").select("*").eq("schedule_id", scheduleResult.data.id);
    if (result.error) throw new Error(result.error.message);
    entries = (result.data || []) as MonthlyScheduleEntry[];
  }
  return { drivers: (driversResult.data || []) as Driver[], entries, source: "supabase" };
}

export async function saveMonthlySchedule(month: number, year: number, region: string, changes: ScheduleCellChange[], source: ScheduleCatalog["source"]): Promise<void> {
  if (source === "demo") {
    const drivers = demoDriversForRegion(region);
    const current = loadDemoEntries(month, year, region, drivers);
    const byCell = new Map(current.map((entry) => [`${entry.driver_id}:${entry.day_of_month}`, entry]));
    for (const change of changes) {
      const key = `${change.driver_id}:${change.day_of_month}`;
      if (!change.scale_code) byCell.delete(key);
      else byCell.set(key, { ...(byCell.get(key) || { id: crypto.randomUUID(), schedule_id: `demo-${year}-${month}-${region}` }), ...change, updated_at: new Date().toISOString() } as MonthlyScheduleEntry);
    }
    window.localStorage.setItem(storageKey(month, year, region), JSON.stringify([...byCell.values()]));
    return;
  }

  const supabase = createClient();
  const { data: schedule, error: scheduleError } = await supabase.from("monthly_schedules").upsert({ month, year, region, status: "ACTIVE" }, { onConflict: "month,year,region" }).select("id").single();
  if (scheduleError) throw new Error(scheduleError.message);

  const filled = changes.filter((change) => change.scale_code);
  const cleared = changes.filter((change) => !change.scale_code);
  if (filled.length) {
    const { error } = await supabase.from("monthly_schedule_entries").upsert(filled.map((change) => ({ ...change, schedule_id: schedule.id })), { onConflict: "schedule_id,driver_id,day_of_month" });
    if (error) throw new Error(error.message);
  }
  for (const change of cleared) {
    const { error } = await supabase.from("monthly_schedule_entries").delete().eq("schedule_id", schedule.id).eq("driver_id", change.driver_id).eq("day_of_month", change.day_of_month);
    if (error) throw new Error(error.message);
  }
}
