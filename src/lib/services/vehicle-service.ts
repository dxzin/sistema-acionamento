import { INITIAL_VEHICLES } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import { Vehicle } from "@/types/database";

export interface VehicleFormData {
  plate_code: string;
  vehicle_type: string;
  is_active: boolean;
}

export interface VehicleCatalog {
  vehicles: Vehicle[];
  source: "supabase" | "demo";
}

const STORAGE_KEY = "sistema_acionamento_vehicles";

function hasSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes("your-project") && !url.includes("placeholder"));
}

function getDemoVehicles(): Vehicle[] {
  if (typeof window === "undefined") return INITIAL_VEHICLES;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return INITIAL_VEHICLES;

  try {
    return JSON.parse(stored) as Vehicle[];
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return INITIAL_VEHICLES;
  }
}

function saveDemoVehicles(vehicles: Vehicle[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
}

export async function loadVehicleCatalog(): Promise<VehicleCatalog> {
  if (!hasSupabaseConfig()) {
    return { vehicles: getDemoVehicles(), source: "demo" };
  }

  const { data, error } = await createClient().from("vehicles").select("*").order("plate_code");
  if (error) throw new Error(error.message);
  return { vehicles: (data || []) as Vehicle[], source: "supabase" };
}

export async function createVehicle(input: VehicleFormData, source: VehicleCatalog["source"]): Promise<Vehicle> {
  if (source === "demo") {
    const vehicle: Vehicle = { id: crypto.randomUUID(), ...input, created_at: new Date().toISOString() };
    saveDemoVehicles([...getDemoVehicles(), vehicle]);
    return vehicle;
  }

  const { data, error } = await createClient().from("vehicles").insert(input).select().single();
  if (error) throw new Error(error.code === "23505" ? "Esta placa já está cadastrada." : error.message);
  return data as Vehicle;
}

export async function updateVehicle(id: string, input: VehicleFormData, source: VehicleCatalog["source"]): Promise<Vehicle> {
  if (source === "demo") {
    const current = getDemoVehicles();
    const updated = { ...current.find((vehicle) => vehicle.id === id), ...input, id } as Vehicle;
    saveDemoVehicles(current.map((vehicle) => vehicle.id === id ? updated : vehicle));
    return updated;
  }

  const { data, error } = await createClient().from("vehicles").update(input).eq("id", id).select().single();
  if (error) throw new Error(error.code === "23505" ? "Esta placa já está cadastrada." : error.message);
  return data as Vehicle;
}
