import { createClient } from "@/lib/supabase/client";
import { INITIAL_BASES, INITIAL_DRIVERS } from "@/lib/mock-data";
import { Base, Driver } from "@/types/database";

export const SCALE_LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;

export interface DriverFormData {
  name: string;
  login_matricula: string;
  base_id: string;
  default_shift: string;
  default_start_time: string;
  is_active: boolean;
}

export interface DriverCatalog {
  drivers: Driver[];
  bases: Base[];
  source: "supabase" | "demo";
}

const STORAGE_KEY = "sistema_acionamento_drivers";

function hasSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes("your-project") && !url.includes("placeholder"));
}

export function getDemoDrivers(): Driver[] {
  if (typeof window === "undefined") return INITIAL_DRIVERS;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return INITIAL_DRIVERS;

  try {
    return JSON.parse(stored) as Driver[];
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return INITIAL_DRIVERS;
  }
}

function saveDemoDrivers(drivers: Driver[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drivers));
}

function driverMutationError(error: { code?: string; message: string }) {
  if (error.code === "23505") return new Error("Esta matrícula já está cadastrada.");
  if (error.code === "42501" || error.code === "PGRST116") {
    return new Error("Somente supervisores e administradores podem alterar cadastros de condutores.");
  }
  return new Error(error.message);
}

export async function loadDriverCatalog(): Promise<DriverCatalog> {
  if (!hasSupabaseConfig()) {
    return { drivers: getDemoDrivers(), bases: INITIAL_BASES, source: "demo" };
  }

  const supabase = createClient();
  const [driversResult, basesResult] = await Promise.all([
    supabase.from("drivers").select("*").order("name"),
    supabase.from("bases").select("*").order("code"),
  ]);

  if (driversResult.error || basesResult.error) {
    throw new Error(driversResult.error?.message || basesResult.error?.message || "Falha ao carregar cadastros.");
  }

  return {
    drivers: (driversResult.data || []) as Driver[],
    bases: (basesResult.data || []) as Base[],
    source: "supabase",
  };
}

export async function createDriver(input: DriverFormData, source: DriverCatalog["source"]): Promise<Driver> {
  if (source === "demo") {
    const now = new Date().toISOString();
    const driver: Driver = { id: crypto.randomUUID(), ...input, created_at: now, updated_at: now };
    saveDemoDrivers([...getDemoDrivers(), driver]);
    return driver;
  }

  const { data, error } = await createClient().from("drivers").insert(input).select().single();
  if (error) throw driverMutationError(error);
  return data as Driver;
}

export async function updateDriver(id: string, input: DriverFormData, source: DriverCatalog["source"]): Promise<Driver> {
  if (source === "demo") {
    const updated = { ...getDemoDrivers().find((driver) => driver.id === id), ...input, id, updated_at: new Date().toISOString() } as Driver;
    saveDemoDrivers(getDemoDrivers().map((driver) => (driver.id === id ? updated : driver)));
    return updated;
  }

  const { data, error } = await createClient().from("drivers").update(input).eq("id", id).select().maybeSingle();
  if (error) throw driverMutationError(error);
  if (!data) throw new Error("Somente supervisores e administradores podem alterar cadastros de condutores.");
  await syncDriverSchedule(id, input.default_shift, input.default_start_time);
  return data as Driver;
}

async function syncDriverSchedule(id: string, shift: string, time?: string) {
  const supabase = createClient();
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const { data: schedules, error: schedulesError } = await supabase.from("monthly_schedules").select("id").or(`year.gt.${year},and(year.eq.${year},month.gte.${month})`);
  if (schedulesError) throw new Error(`Cadastro salvo, mas não foi possível sincronizar a escala: ${schedulesError.message}`);
  if (!schedules?.length) return;
  const { error } = await supabase.from("monthly_schedule_entries")
    .update({ shift_letter: shift, ...(time ? { shift_time: time } : {}) })
    .eq("driver_id", id).in("schedule_id", schedules.map((schedule) => schedule.id))
    .or("shift_letter.is.null,shift_letter.neq.VF");
  if (error) throw new Error(`Cadastro salvo, mas não foi possível sincronizar a escala: ${error.message}`);
}

export async function updateDriverScheduleTime(id: string, time: string, source: DriverCatalog["source"]): Promise<Driver> {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Horário inválido. Use HH:MM.");
  if (source === "demo") {
    const driver = getDemoDrivers().find((item) => item.id === id);
    if (!driver) throw new Error("Condutor não encontrado.");
    const updated = { ...driver, default_start_time: `${time}:00`, updated_at: new Date().toISOString() };
    saveDemoDrivers(getDemoDrivers().map((item) => item.id === id ? updated : item));
    return updated;
  }
  const { data, error } = await createClient().from("drivers").update({ default_start_time: `${time}:00` }).eq("id", id).select().maybeSingle();
  if (error) throw driverMutationError(error);
  if (!data) throw new Error("Somente supervisores e administradores podem alterar o horário do cadastro.");
  await syncDriverSchedule(id, data.default_shift, `${time}:00`);
  return data as Driver;
}

export async function updateDriverShift(id: string, shift: string, source: DriverCatalog["source"]): Promise<Driver> {
  const normalized = shift.trim().toUpperCase();
  if (!SCALE_LETTERS.some((letter) => letter === normalized)) throw new Error("Selecione uma letra de escala de A a G.");
  if (source === "demo") {
    const driver = getDemoDrivers().find((item) => item.id === id);
    if (!driver) throw new Error("Condutor não encontrado.");
    const updated = { ...driver, default_shift: normalized, updated_at: new Date().toISOString() };
    saveDemoDrivers(getDemoDrivers().map((item) => item.id === id ? updated : item));
    return updated;
  }
  const { data, error } = await createClient().from("drivers").update({ default_shift: normalized }).eq("id", id).select().maybeSingle();
  if (error) throw driverMutationError(error);
  if (!data) throw new Error("Somente supervisores e administradores podem alterar o turno.");
  await syncDriverSchedule(id, normalized);
  return data as Driver;
}
