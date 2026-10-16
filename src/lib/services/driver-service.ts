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
  is_closed_trip?: boolean;
  is_active: boolean;
}

export interface DriverCatalog {
  drivers: Driver[];
  bases: Base[];
  source: "supabase" | "demo";
}

const STORAGE_KEY = "sistema_acionamento_drivers";
let atomicDriverMutationAvailable: boolean | null = null;

type DriverChanges = Partial<DriverFormData>;

type ScheduleEntrySnapshot = {
  id: string;
  shift_letter: string | null;
  shift_time: string | null;
};

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

async function updateDriverAndFutureSchedule(
  id: string,
  changes: DriverChanges,
  syncShift: boolean,
  syncTime: boolean,
): Promise<Driver> {
  const supabase = createClient();

  if (atomicDriverMutationAvailable !== false) {
    const { data, error } = await supabase.rpc("update_driver_and_future_schedule", {
      p_driver_id: id,
      p_changes: changes,
      p_sync_shift: syncShift,
      p_sync_time: syncTime,
    }).single();

    if (!error && data) {
      atomicDriverMutationAvailable = true;
      return data as Driver;
    }
    if (error?.code !== "PGRST202") throw driverMutationError(error || { message: "O banco não confirmou a alteração do condutor." });
    atomicDriverMutationAvailable = false;
  }

  // Compatibilidade enquanto a migration da função atômica ainda não foi aplicada.
  // Mantém uma cópia dos valores para desfazer a primeira escrita caso a segunda falhe.
  const { data: previous, error: previousError } = await supabase.from("drivers").select("*").eq("id", id).maybeSingle();
  if (previousError) throw driverMutationError(previousError);
  if (!previous) throw new Error("Condutor não encontrado ou sem permissão para alteração.");

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const { data: schedules, error: schedulesError } = await supabase
    .from("monthly_schedules")
    .select("id")
    .or(`year.gt.${year},and(year.eq.${year},month.gte.${month})`);
  if (schedulesError) throw new Error(`Não foi possível preparar a sincronização da escala: ${schedulesError.message}`);

  const scheduleIds = (schedules || []).map((schedule) => schedule.id);
  let entrySnapshots: ScheduleEntrySnapshot[] = [];
  if (scheduleIds.length && (syncShift || syncTime)) {
    const { data: entries, error: entriesError } = await supabase
      .from("monthly_schedule_entries")
      .select("id,shift_letter,shift_time")
      .eq("driver_id", id)
      .in("schedule_id", scheduleIds)
      .or("shift_letter.is.null,shift_letter.neq.VF");
    if (entriesError) throw new Error(`Não foi possível preparar a sincronização da escala: ${entriesError.message}`);
    entrySnapshots = (entries || []) as ScheduleEntrySnapshot[];
  }

  const { data: updated, error: driverError } = await supabase.from("drivers").update(changes).eq("id", id).select().maybeSingle();
  if (driverError) throw driverMutationError(driverError);
  if (!updated) throw new Error("Somente supervisores e administradores podem alterar cadastros de condutores.");

  if (!entrySnapshots.length) return updated as Driver;

  const scheduleChanges = {
    ...(syncShift ? { shift_letter: updated.default_shift } : {}),
    ...(syncTime ? { shift_time: updated.default_start_time } : {}),
  };
  const { error: syncError } = await supabase
    .from("monthly_schedule_entries")
    .update(scheduleChanges)
    .in("id", entrySnapshots.map((entry) => entry.id));
  if (!syncError) return updated as Driver;

  const previousDriver = previous as Driver;
  const { error: rollbackDriverError } = await supabase.from("drivers").update({
    name: previousDriver.name,
    login_matricula: previousDriver.login_matricula,
    base_id: previousDriver.base_id,
    default_shift: previousDriver.default_shift,
    default_start_time: previousDriver.default_start_time,
    is_closed_trip: previousDriver.is_closed_trip ?? false,
    is_active: previousDriver.is_active,
  }).eq("id", id);
  const rollbackEntries = await Promise.all(entrySnapshots.map((entry) => supabase
    .from("monthly_schedule_entries")
    .update({ shift_letter: entry.shift_letter, shift_time: entry.shift_time })
    .eq("id", entry.id)));
  const rollbackFailed = Boolean(rollbackDriverError || rollbackEntries.some((result) => result.error));
  throw new Error(rollbackFailed
    ? `A sincronização da escala falhou e o banco não confirmou a reversão. Recarregue os dados antes de continuar: ${syncError.message}`
    : `A alteração não foi concluída e foi desfeita: ${syncError.message}`);
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

  return updateDriverAndFutureSchedule(id, input, true, true);
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
  return updateDriverAndFutureSchedule(id, { default_start_time: `${time}:00` }, false, true);
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
  return updateDriverAndFutureSchedule(id, { default_shift: normalized }, true, false);
}
