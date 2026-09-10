import { createClient } from "@/lib/supabase/client";
import { Base, Dispatch, Driver, Location, Vehicle } from "@/types/database";
import { DispatchRowModel } from "@/types/domain";
import { calculateJornada } from "../calculations/jornada";
import { calculateNextForecast } from "../calculations/interjornada";
import {
  INITIAL_BASES,
  INITIAL_DISPATCHES,
  INITIAL_DRIVERS,
  INITIAL_LOCATIONS,
  INITIAL_VEHICLES,
} from "../mock-data";

class DispatchService {
  private localDispatches: Dispatch[] = [...INITIAL_DISPATCHES];
  private localDrivers: Driver[] = [...INITIAL_DRIVERS];
  private localVehicles: Vehicle[] = [...INITIAL_VEHICLES];
  private localLocations: Location[] = [...INITIAL_LOCATIONS];
  private localBases: Base[] = [...INITIAL_BASES];

  private isSupabaseConfigured(): boolean {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    return Boolean(url && key && !url.includes("placeholder") && !key.includes("placeholder"));
  }

  async getBases(): Promise<Base[]> {
    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("bases").select("*").order("name");
        if (!error && data) return data;
      } catch (e) {
        console.warn("Falha ao buscar bases do Supabase, usando dados locais:", e);
      }
    }
    return this.localBases;
  }

  async getLocations(): Promise<Location[]> {
    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("locations").select("*").order("name");
        if (!error && data) return data;
      } catch (e) {
        console.warn("Falha ao buscar locais do Supabase, usando dados locais:", e);
      }
    }
    return this.localLocations;
  }

  async getVehicles(): Promise<Vehicle[]> {
    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("vehicles").select("*").order("plate_code");
        if (!error && data) return data;
      } catch (e) {
        console.warn("Falha ao buscar frotas do Supabase, usando dados locais:", e);
      }
    }
    return this.localVehicles;
  }

  async getDrivers(): Promise<Driver[]> {
    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("drivers").select("*").order("name");
        if (!error && data) return data;
      } catch (e) {
        console.warn("Falha ao buscar condutores do Supabase, usando dados locais:", e);
      }
    }
    return this.localDrivers;
  }

  async getDispatchesForSheet(date: string, region: string = "SP"): Promise<DispatchRowModel[]> {
    let rawDispatches: Dispatch[] = [];

    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        // Busca a folha diária ou cria se não existir
        const { data: sheet } = await supabase
          .from("daily_sheets")
          .select("id")
          .eq("date", date)
          .eq("region", region)
          .maybeSingle();

        if (sheet) {
          const { data, error } = await supabase
            .from("dispatches")
            .select("*")
            .eq("daily_sheet_id", sheet.id)
            .order("created_at");

          if (!error && data && data.length > 0) {
            rawDispatches = data;
          }
        }
      } catch (e) {
        console.warn("Falha ao carregar despachos do Supabase:", e);
      }
    }

    if (rawDispatches.length === 0) {
      rawDispatches = this.localDispatches;
    }

    const drivers = await this.getDrivers();
    const bases = await this.getBases();
    const vehicles = await this.getVehicles();
    const locations = await this.getLocations();

    const driversMap = new Map(drivers.map((d) => [d.id, d]));
    const basesMap = new Map(bases.map((b) => [b.id, b]));
    const vehiclesMap = new Map(vehicles.map((v) => [v.id, v]));
    const locationsMap = new Map(locations.map((l) => [l.id, l]));

    return rawDispatches.map((disp) => {
      const driver = driversMap.get(disp.driver_id) || {
        id: disp.driver_id,
        name: "Condutor Não Identificado",
        login_matricula: "-----",
        base_id: "b1",
        is_active: true,
        created_at: "",
        updated_at: "",
      };

      const base = basesMap.get(driver.base_id);
      const vehicle = disp.vehicle_id ? vehiclesMap.get(disp.vehicle_id) : undefined;
      const originLoc = disp.origin_location_id ? locationsMap.get(disp.origin_location_id) : undefined;
      const destLoc = disp.destination_location_id ? locationsMap.get(disp.destination_location_id) : undefined;
      const finalDestLoc = disp.final_destination_location_id ? locationsMap.get(disp.final_destination_location_id) : undefined;

      // Cálculo de jornada
      const jornada = calculateJornada(disp.entry_time, disp.exit_time);

      return {
        ...disp,
        driver,
        base,
        vehicle,
        origin_location: originLoc,
        destination_location: destLoc,
        final_destination_location: finalDestLoc,
        formatted_worked_time: jornada.formatted,
        is_overnight: jornada.isOvernight,
        is_ongoing: jornada.isOngoing,
      };
    });
  }

  async updateDispatch(id: string, updates: Partial<Dispatch>): Promise<Dispatch | null> {
    // Recalcular jornada e próxima previsão se os horários foram alterados
    const processedUpdates = { ...updates };

    if ("entry_time" in updates || "exit_time" in updates) {
      const existing = this.localDispatches.find((d) => d.id === id);
      const entryTime = "entry_time" in updates ? updates.entry_time : existing?.entry_time;
      const exitTime = "exit_time" in updates ? updates.exit_time : existing?.exit_time;

      const jornada = calculateJornada(entryTime, exitTime);
      processedUpdates.total_worked_minutes = jornada.minutes;
      processedUpdates.next_day_forecast_time = calculateNextForecast(exitTime);
    }

    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("dispatches")
          .update(processedUpdates)
          .eq("id", id)
          .select()
          .single();

        if (!error && data) {
          // Atualiza cache local
          this.localDispatches = this.localDispatches.map((d) => (d.id === id ? { ...d, ...data } : d));
          return data;
        }
      } catch (e) {
        console.warn("Falha ao salvar despacho no Supabase:", e);
      }
    }

    // Atualização local
    const index = this.localDispatches.findIndex((d) => d.id === id);
    if (index !== -1) {
      this.localDispatches[index] = {
        ...this.localDispatches[index],
        ...processedUpdates,
        updated_at: new Date().toISOString(),
      };
      return this.localDispatches[index];
    }

    return null;
  }

  async createDispatch(dispatch: Omit<Dispatch, "id" | "created_at" | "updated_at">): Promise<Dispatch> {
    const newRecord: Dispatch = {
      ...dispatch,
      id: `disp-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("dispatches").insert(dispatch).select().single();
        if (!error && data) {
          this.localDispatches.push(data);
          return data;
        }
      } catch (e) {
        console.warn("Falha ao criar despacho no Supabase:", e);
      }
    }

    this.localDispatches.push(newRecord);
    return newRecord;
  }
}

export const dispatchService = new DispatchService();
