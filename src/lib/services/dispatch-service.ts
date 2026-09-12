import { createClient } from "@/lib/supabase/client";
import { Base, Dispatch, Driver, Location, Vehicle } from "@/types/database";
import { DispatchRowModel } from "@/types/domain";
import { calculateJornada } from "../calculations/jornada";
import { calculateNextForecast } from "../calculations/interjornada";
import { resolveDayContinuity } from "../calculations/continuity";
import { canCreateDailySheet, currentDateInBrasilia } from "../dates/operational-date";
import {
  INITIAL_BASES,
  INITIAL_DISPATCHES,
  INITIAL_DRIVERS,
  INITIAL_LOCATIONS,
  INITIAL_VEHICLES,
} from "../mock-data";

const REGION_BASES: Record<string, string[]> = {
  SP: ["LP", "CASTILHO"],
  UBJP: ["UB", "LZ", "JP"],
  MG: ["UB", "LZ", "JP"],
  MS: ["MS"],
};

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

  async recordDispatchAudit(
    id: string,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>
  ): Promise<void> {
    if (!this.isSupabaseConfigured()) return;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão ausente para registrar a auditoria.");

    const { error } = await supabase.from("audit_logs").insert({
      user_id: user.id,
      entity_name: "dispatches",
      entity_id: id,
      action: "UPDATE",
      old_values: oldValues,
      new_values: newValues,
    });
    if (error) throw new Error(error.message);
  }

  async getBases(): Promise<Base[]> {
    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("bases").select("*").order("name");
        if (error) throw new Error(error.message);
        return data || [];
      } catch (e) {
        console.error("Falha ao buscar bases do Supabase:", e);
        throw e;
      }
    }
    return this.localBases;
  }

  async getLocations(): Promise<Location[]> {
    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("locations").select("*").order("name");
        if (error) throw new Error(error.message);
        return data || [];
      } catch (e) {
        console.error("Falha ao buscar locais do Supabase:", e);
        throw e;
      }
    }
    return this.localLocations;
  }

  async getVehicles(): Promise<Vehicle[]> {
    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("vehicles").select("*").order("plate_code");
        if (error) throw new Error(error.message);
        return data || [];
      } catch (e) {
        console.error("Falha ao buscar frotas do Supabase:", e);
        throw e;
      }
    }
    return this.localVehicles;
  }

  async getDrivers(): Promise<Driver[]> {
    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("drivers").select("*").order("name");
        if (error) throw new Error(error.message);
        return data || [];
      } catch (e) {
        console.error("Falha ao buscar condutores do Supabase:", e);
        throw e;
      }
    }
    return this.localDrivers;
  }

  private getPreviousDate(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split("T")[0];
  }

  async getDispatchesForSheet(date: string, region: string = "SP"): Promise<DispatchRowModel[]> {
    let rawDispatches: Dispatch[] = [];
    const restDriverIds = new Set<string>();
    const normalizedRegion = region === "ALL" ? "SP" : region;

    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        
        // 1. Busca a folha diária existente
        const { data: sheet } = await supabase
          .from("daily_sheets")
          .select("id")
          .eq("date", date)
          .eq("region", normalizedRegion)
          .maybeSingle();

        if (sheet) {
          const { data, error } = await supabase
            .from("dispatches")
            .select("*")
            .eq("daily_sheet_id", sheet.id)
            .order("created_at");

          if (!error && data && data.length > 0) {
            rawDispatches = data;

            // Folhas já criadas também recebem a continuidade de D-1. Campos
            // preenchidos manualmente são preservados.
            const previousDate = this.getPreviousDate(date);
            const { data: previousSheet } = await supabase
              .from("daily_sheets")
              .select("id")
              .eq("date", previousDate)
              .eq("region", normalizedRegion)
              .maybeSingle();

            if (previousSheet) {
              const { data: previousRows } = await supabase
                .from("dispatches")
                .select("driver_id,final_destination_location_id,next_day_forecast_time")
                .eq("daily_sheet_id", previousSheet.id);
              const previousByDriver = new Map((previousRows || []).map((row) => [row.driver_id, row]));

              const canRefreshForecast = date === currentDateInBrasilia() || canCreateDailySheet(date);
              const continuityUpdates = rawDispatches.flatMap((row) => {
                const previous = previousByDriver.get(row.driver_id);
                const updates: Partial<Dispatch> = {};
                if (!row.origin_location_id && previous?.final_destination_location_id) {
                  updates.origin_location_id = previous.final_destination_location_id;
                }
                if (
                  canRefreshForecast &&
                  row.forecast_source !== "MANUAL" &&
                  previous?.next_day_forecast_time &&
                  row.forecast_start_time !== previous.next_day_forecast_time
                ) {
                  updates.forecast_start_time = previous.next_day_forecast_time;
                  updates.forecast_source = "CONTINUITY";
                }
                return Object.keys(updates).length ? [{ id: row.id, updates }] : [];
              });

              if (continuityUpdates.length) {
                await Promise.all(continuityUpdates.map(({ id, updates }) =>
                  supabase.from("dispatches").update(updates).eq("id", id)
                ));
                const updatesById = new Map(continuityUpdates.map((item) => [item.id, item.updates]));
                rawDispatches = rawDispatches.map((row) => ({
                  ...row,
                  ...(updatesById.get(row.id) || {}),
                }));
              }
            }
          }
        }

        // Confere a escala mensal mesmo quando a folha diária já existia.
        // Assim uma correção posterior de F/FE também remove o condutor da tela.
        const [yearText, monthText, dayText] = date.split("-");
        const scheduleRegion = normalizedRegion === "UBJP" ? "MG" : normalizedRegion;
        const { data: currentSchedule } = await supabase
          .from("monthly_schedules")
          .select("id")
          .eq("month", Number(monthText))
          .eq("year", Number(yearText))
          .eq("region", scheduleRegion)
          .maybeSingle();

        if (currentSchedule) {
          const { data: restEntries } = await supabase
            .from("monthly_schedule_entries")
            .select("driver_id,scale_code")
            .eq("schedule_id", currentSchedule.id)
            .eq("day_of_month", Number(dayText))
            .in("scale_code", ["F", "FE"]);
          for (const entry of restEntries || []) restDriverIds.add(entry.driver_id);
        }

        // 2. Se a folha diária ainda não existir ou não tiver despachos, gera automaticamente
        // Consultar datas antigas ou mais distantes nunca pode criar dados.
        // Uma folha ausente só é preparada para o próximo dia operacional.
        if (rawDispatches.length === 0 && canCreateDailySheet(date)) {
          const targetBases = REGION_BASES[normalizedRegion] || ["LP", "CASTILHO"];
          const { data: bases } = await supabase.from("bases").select("id,code").in("code", targetBases);
          const baseIds = (bases || []).map((b) => b.id);

          if (baseIds.length > 0) {
            const { data: activeDrivers } = await supabase
              .from("drivers")
              .select("*")
              .in("base_id", baseIds)
              .eq("is_active", true)
              .order("name");

            if (activeDrivers && activeDrivers.length > 0) {
              // Cria ou obtém a folha diária
              const { data: newSheet, error: sheetErr } = await supabase
                .from("daily_sheets")
                .upsert({ date, region: normalizedRegion, status: "OPEN" }, { onConflict: "date,region" })
                .select("id")
                .single();

              if (!sheetErr && newSheet) {
                // Obter dia, mês e ano da data selecionada
                const [yStr, mStr, dStr] = date.split("-");
                const dayNum = parseInt(dStr, 10);
                const monthNum = parseInt(mStr, 10);
                const yearNum = parseInt(yStr, 10);
                const scheduleRegion = normalizedRegion === "UBJP" ? "MG" : normalizedRegion;

                // Buscar escalas mensais do dia
                const { data: sched } = await supabase
                  .from("monthly_schedules")
                  .select("id")
                  .eq("month", monthNum)
                  .eq("year", yearNum)
                  .eq("region", scheduleRegion)
                  .maybeSingle();

                let scheduleEntriesByDriver = new Map<string, { scale_code: string; shift_letter?: string | null; shift_time?: string | null }>();
                if (sched) {
                  const { data: entries } = await supabase
                    .from("monthly_schedule_entries")
                    .select("driver_id,scale_code,shift_letter,shift_time")
                    .eq("schedule_id", sched.id)
                    .eq("day_of_month", dayNum);

                  if (entries) {
                    for (const e of entries) {
                      scheduleEntriesByDriver.set(e.driver_id, e);
                    }
                  }
                }

                // Buscar despachos de D-1 para continuidade
                const prevDate = this.getPreviousDate(date);
                const { data: prevSheet } = await supabase
                  .from("daily_sheets")
                  .select("id")
                  .eq("date", prevDate)
                  .eq("region", normalizedRegion)
                  .maybeSingle();

                let prevDispatchesByDriver = new Map<string, Dispatch>();
                if (prevSheet) {
                  const { data: prevDispatches } = await supabase
                    .from("dispatches")
                    .select("*")
                    .eq("daily_sheet_id", prevSheet.id);

                  if (prevDispatches) {
                    for (const p of prevDispatches) {
                      prevDispatchesByDriver.set(p.driver_id, p);
                    }
                  }
                }

                // Montar novos despachos para cada condutor ativo
                const newDispatchesPayload = activeDrivers.flatMap((d) => {
                  const schedEntry = scheduleEntriesByDriver.get(d.id);
                  const prevDisp = prevDispatchesByDriver.get(d.id);
                  const continuity = resolveDayContinuity(d.id, prevDisp);

                  const scaleCode = (schedEntry?.scale_code || "").trim().toUpperCase();
                  if (["F", "FE"].includes(scaleCode)) return [];
                  return [{
                    daily_sheet_id: newSheet.id,
                    driver_id: d.id,
                    scale_day_status: scaleCode || null,
                    forecast_start_time: continuity.forecastStartTime || schedEntry?.shift_time || d.default_start_time || null,
                    forecast_source: continuity.forecastStartTime ? "CONTINUITY" : "SCHEDULE",
                    // O status é uma decisão do operador e começa vazio.
                    dispatch_status: "",
                    abono_reason: null,
                    origin_location_id: continuity.originLocationId || null,
                  }];
                });

                const { data: inserted, error: insertErr } = await supabase
                  .from("dispatches")
                  .upsert(newDispatchesPayload, { onConflict: "daily_sheet_id,driver_id" })
                  .select();

                if (!insertErr && inserted && inserted.length > 0) {
                  rawDispatches = inserted;
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Falha ao carregar despachos do Supabase:", e);
        throw e;
      }
    }

    // Dados de demonstração só existem no desenvolvimento sem Supabase.
    // Uma folha remota vazia deve permanecer vazia, nunca mostrar registros fictícios.
    if (rawDispatches.length === 0 && !this.isSupabaseConfigured()) {
      rawDispatches = this.localDispatches;
    }

    // Mantém a mesma fotografia carregada pela grade como base das edições.
    // Assim, alterar somente ENTRADA ou somente SAÍDA ainda usa o outro horário
    // já salvo para recalcular jornada e próxima previsão corretamente.
    if (this.isSupabaseConfigured()) {
      this.localDispatches = [...rawDispatches];
    }

    const drivers = await this.getDrivers();
    const bases = await this.getBases();
    const vehicles = await this.getVehicles();
    const locations = await this.getLocations();

    const driversMap = new Map(drivers.map((d) => [d.id, d]));
    const basesMap = new Map(bases.map((b) => [b.id, b]));
    const vehiclesMap = new Map(vehicles.map((v) => [v.id, v]));
    const locationsMap = new Map(locations.map((l) => [l.id, l]));

    return rawDispatches.filter((disp) => {
      const scaleCode = (disp.scale_day_status || "").trim().toUpperCase();
      return !restDriverIds.has(disp.driver_id) && !["F", "FE"].includes(scaleCode);
    }).map((disp) => {
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

      const jornada = calculateJornada(disp.entry_time, disp.exit_time);

      return {
        ...disp,
        driver,
        base,
        vehicle,
        fleet_code: vehicle?.plate_code || "",
        origin_location: originLoc,
        destination_location: destLoc,
        final_destination_location: finalDestLoc,
        destination_name: destLoc?.name || "",
        final_destination_name: finalDestLoc?.name || "",
        formatted_worked_time: jornada.formatted,
        is_overnight: jornada.isOvernight,
        is_ongoing: jornada.isOngoing,
      };
    });
  }

  async updateDispatch(id: string, updates: Partial<DispatchRowModel>): Promise<Dispatch | null> {
    const {
      fleet_code,
      driver: _driver,
      base: _base,
      vehicle: _vehicle,
      origin_location: _origin,
      destination_location: _destination,
      final_destination_location: _finalDestination,
      destination_name,
      final_destination_name,
      formatted_worked_time: _formatted,
      is_overnight: _overnight,
      is_ongoing: _ongoing,
      ...dispatchUpdates
    } = updates;
    const processedUpdates: Partial<Dispatch> = { ...dispatchUpdates };

    if ("forecast_start_time" in updates) {
      processedUpdates.forecast_source = "MANUAL";
    }

    const resolveLocationId = async (rawName: string): Promise<string | null> => {
      const name = rawName.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 100);
      if (!name) return null;

      const localMatch = this.localLocations.find((location) => location.name.toUpperCase() === name);
      if (!this.isSupabaseConfigured()) {
        if (localMatch) return localMatch.id;
        const location: Location = {
          id: crypto.randomUUID(),
          name,
          is_active: true,
          created_at: new Date().toISOString(),
        };
        this.localLocations.push(location);
        return location.id;
      }

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (localMatch) return localMatch.id;
        throw new Error("Sessão ausente para registrar o destino.");
      }

      const response = await fetch("/api/locations/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name }),
      });
      const result = await response.json() as { id?: string | null; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "Falha ao registrar o destino digitado.");
      return result.id;
    };

    if (destination_name !== undefined) {
      processedUpdates.destination_location_id = await resolveLocationId(destination_name);
    }
    if (final_destination_name !== undefined) {
      processedUpdates.final_destination_location_id = await resolveLocationId(final_destination_name);
    }

    if (fleet_code !== undefined) {
      const normalizedFleet = fleet_code.trim().toUpperCase();
      if (!normalizedFleet) {
        processedUpdates.vehicle_id = null;
      } else if (this.isSupabaseConfigured()) {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const response = await fetch("/api/fleets/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ fleetCode: normalizedFleet }),
          });
          const result = await response.json() as { id?: string; error?: string };
          if (!response.ok || !result.id) throw new Error(result.error || "Falha ao registrar a frota digitada.");
          processedUpdates.vehicle_id = result.id;
        } else {
          let vehicle = this.localVehicles.find((item) => item.plate_code === normalizedFleet);
          if (!vehicle) {
            vehicle = { id: crypto.randomUUID(), plate_code: normalizedFleet, vehicle_type: "CAVALO_MECANICO", is_active: true, created_at: new Date().toISOString() };
            this.localVehicles.push(vehicle);
          }
          processedUpdates.vehicle_id = vehicle.id;
        }
      } else {
        let vehicle = this.localVehicles.find((item) => item.plate_code === normalizedFleet);
        if (!vehicle) {
          vehicle = { id: crypto.randomUUID(), plate_code: normalizedFleet, vehicle_type: "CAVALO_MECANICO", is_active: true, created_at: new Date().toISOString() };
          this.localVehicles.push(vehicle);
        }
        processedUpdates.vehicle_id = vehicle.id;
      }
    }

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

        if (error) throw new Error(error.message);
        if (data) {
          this.localDispatches = this.localDispatches.map((d) => (d.id === id ? { ...d, ...data } : d));
          return data;
        }
      } catch (e) {
        console.error("Falha ao salvar despacho no Supabase:", e);
        throw e;
      }
    }

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
