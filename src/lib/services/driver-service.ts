import { createClient } from "@/lib/supabase/client";
import { INITIAL_BASES, INITIAL_DRIVERS } from "@/lib/mock-data";
import { Base, Driver } from "@/types/database";

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

function getDemoDrivers(): Driver[] {
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
  if (error) throw new Error(error.code === "23505" ? "Esta matrícula já está cadastrada." : error.message);
  return data as Driver;
}

export async function updateDriver(id: string, input: DriverFormData, source: DriverCatalog["source"]): Promise<Driver> {
  if (source === "demo") {
    const updated = { ...getDemoDrivers().find((driver) => driver.id === id), ...input, id, updated_at: new Date().toISOString() } as Driver;
    saveDemoDrivers(getDemoDrivers().map((driver) => (driver.id === id ? updated : driver)));
    return updated;
  }

  const { data, error } = await createClient().from("drivers").update(input).eq("id", id).select().single();
  if (error) throw new Error(error.code === "23505" ? "Esta matrícula já está cadastrada." : error.message);
  return data as Driver;
}
