import { createClient } from "@/lib/supabase/client";
import { Base, DailySheet, Dispatch, Driver, Location, OperatorPresence, SheetStatus, Vehicle } from "@/types/database";
import { DispatchRowModel } from "@/types/domain";
import { calculateJornada } from "../calculations/jornada";
import { calculateNextForecast } from "../calculations/interjornada";
import { isAwaitingPreviousExit, resolveDayContinuity } from "../calculations/continuity";
import { resolveFirstDayForecast } from "../calculations/first-day-origin";
import { canCreateDailySheet } from "../dates/operational-date";
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

const DISPATCH_EXCLUDED_SCALE_CODES = new Set(["F", "FE", "AF", "DES", "DESL"]);

export function isDispatchExcludedScaleCode(scaleCode: string | null | undefined): boolean {
  return DISPATCH_EXCLUDED_SCALE_CODES.has(String(scaleCode || "").trim().toUpperCase());
}

export function isDriverActiveForDispatch(driver: Pick<Driver, "is_active"> | null | undefined): boolean {
  return driver?.is_active === true;
}

class DispatchService {
  private localDispatches: Dispatch[] = [...INITIAL_DISPATCHES];
  private localDrivers: Driver[] = [...INITIAL_DRIVERS];
  private localVehicles: Vehicle[] = [...INITIAL_VEHICLES];
  private localLocations: Location[] = [...INITIAL_LOCATIONS];
  private localBases: Base[] = [...INITIAL_BASES];
  private catalogLoadedAt = { bases: 0, locations: 0, vehicles: 0, drivers: 0 };
  private readonly catalogTtlMs = 30_000;

  private catalogIsFresh(key: "bases" | "locations" | "vehicles" | "drivers"): boolean {
    return Date.now() - this.catalogLoadedAt[key] < this.catalogTtlMs;
  }

  private isSupabaseConfigured(): boolean {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    return Boolean(url && key && !url.includes("placeholder") && !key.includes("placeholder"));
  }

  async getBases(): Promise<Base[]> {
    if (this.isSupabaseConfigured()) {
      if (this.catalogIsFresh("bases")) return this.localBases;
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("bases").select("*").order("name");
        if (error) throw new Error(error.message);
        this.localBases = data || [];
        this.catalogLoadedAt.bases = Date.now();
        return this.localBases;
      } catch (e) {
        console.error("Falha ao buscar bases do Supabase:", e);
        throw e;
      }
    }
    return this.localBases;
  }

  async getLocations(): Promise<Location[]> {
    if (this.isSupabaseConfigured()) {
      if (this.catalogIsFresh("locations")) return this.localLocations;
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("locations").select("*").order("name");
        if (error) throw new Error(error.message);
        this.localLocations = data || [];
        this.catalogLoadedAt.locations = Date.now();
        return this.localLocations;
      } catch (e) {
        console.error("Falha ao buscar locais do Supabase:", e);
        throw e;
      }
    }
    return this.localLocations;
  }

  async getVehicles(): Promise<Vehicle[]> {
    if (this.isSupabaseConfigured()) {
      if (this.catalogIsFresh("vehicles")) return this.localVehicles;
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("vehicles").select("*").order("plate_code");
        if (error) throw new Error(error.message);
        this.localVehicles = data || [];
        this.catalogLoadedAt.vehicles = Date.now();
        return this.localVehicles;
      } catch (e) {
        console.error("Falha ao buscar frotas do Supabase:", e);
        throw e;
      }
    }
    return this.localVehicles;
  }

  async getDrivers(): Promise<Driver[]> {
    if (this.isSupabaseConfigured()) {
      if (this.catalogIsFresh("drivers")) return this.localDrivers;
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("drivers").select("*").order("name");
        if (error) throw new Error(error.message);
        this.localDrivers = data || [];
        this.catalogLoadedAt.drivers = Date.now();
        return this.localDrivers;
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

  async getDailySheet(date: string, region: string = "SP"): Promise<DailySheet | null> {
    if (!this.isSupabaseConfigured()) return null;
    const normalizedRegion = region === "ALL" ? "SP" : region;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("daily_sheets")
      .select("*")
      .eq("date", date)
      .eq("region", normalizedRegion)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async getDailySheetSyncToken(date: string, region: string = "SP"): Promise<string | null> {
    if (!this.isSupabaseConfigured()) return null;
    const normalizedRegion = region === "ALL" ? "SP" : region;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_daily_sheet_sync_token", {
      p_date: date,
      p_region: normalizedRegion,
    });
    if (error) throw new Error(error.message);
    return typeof data === "string" ? data : null;
  }

  async setDailySheetStatus(id: string, status: Extract<SheetStatus, "OPEN" | "CLOSED">): Promise<DailySheet> {
    if (!this.isSupabaseConfigured()) throw new Error("Fechamento disponível somente com o banco conectado.");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("set_daily_sheet_status", {
      p_sheet_id: id,
      p_status: status,
    }).single();
    if (error) throw new Error(error.message);
    return data as DailySheet;
  }

  async touchOperatorPresence(
    date: string,
    region: string,
    activeDispatchId: string | null,
    displayName: string,
    email: string
  ): Promise<void> {
    if (!this.isSupabaseConfigured()) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("touch_operator_presence", {
      p_sheet_date: date,
      p_region: region === "ALL" ? "SP" : region,
      p_active_dispatch_id: activeDispatchId,
      p_display_name: displayName,
      p_email: email,
    });
    if (error) throw new Error(error.message);
  }

  async getOperatorPresence(date: string, region: string): Promise<OperatorPresence[]> {
    if (!this.isSupabaseConfigured()) return [];
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_operator_presence", {
      p_sheet_date: date,
      p_region: region === "ALL" ? "SP" : region,
    });
    if (error) throw new Error(error.message);
    return (data || []) as OperatorPresence[];
  }

  async touchAndGetOperatorPresence(
    date: string,
    region: string,
    activeDispatchId: string | null,
    displayName: string,
    email: string
  ): Promise<OperatorPresence[]> {
    if (!this.isSupabaseConfigured()) return [];
    const supabase = createClient();
    const { data, error } = await supabase.rpc("touch_and_list_operator_presence", {
      p_sheet_date: date,
      p_region: region === "ALL" ? "SP" : region,
      p_active_dispatch_id: activeDispatchId,
      p_display_name: displayName,
      p_email: email,
    });
    if (error) throw new Error(error.message);
    return (data || []) as OperatorPresence[];
  }

  async clearOperatorPresence(userId: string): Promise<void> {
    if (!this.isSupabaseConfigured()) return;
    const supabase = createClient();
    await supabase.from("operator_presence").delete().eq("user_id", userId);
  }

  async getDispatchesForSheet(date: string, region: string = "SP"): Promise<DispatchRowModel[]> {
    let rawDispatches: Dispatch[] = [];
    const scheduleEntriesByDriver = new Map<string, { scale_code: string; shift_letter?: string | null; shift_time?: string | null }>();
    const normalizedRegion = region === "ALL" ? "SP" : region;

    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        
        // 1. Busca a folha diária existente
        const { data: sheet } = await supabase
          .from("daily_sheets")
          .select("id,status")
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

          }
        }

        // Confere a escala mensal mesmo quando a folha diária já existia.
        // Assim uma correção posterior para F, FE, AF, DES ou DESL também remove o condutor da tela.
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
          const { data: dayEntries } = await supabase
            .from("monthly_schedule_entries")
            .select("driver_id,scale_code,shift_letter,shift_time")
            .eq("schedule_id", currentSchedule.id)
            .eq("day_of_month", Number(dayText));
          for (const entry of dayEntries || []) {
            const scaleCode = String(entry.scale_code || "").trim().toUpperCase();
            scheduleEntriesByDriver.set(entry.driver_id, entry);
          }
        }

        // 2. Cria a folha quando necessário e inclui condutores que passaram de
        // F/FE/AF/DES/DESL para um dia trabalhado, sem sobrescrever linhas já preenchidas.
        // Consultar datas antigas ou mais distantes nunca pode criar dados.
        // Uma folha ausente pode ser preparada para hoje ou para o próximo dia operacional.
        const existingDriverIds = new Set(rawDispatches.map((dispatch) => dispatch.driver_id));
        const missingScheduledDriverIds = [...scheduleEntriesByDriver.entries()]
          .filter(([driverId, entry]) => {
            const code = String(entry.scale_code || "").trim().toUpperCase();
            return !existingDriverIds.has(driverId) && !isDispatchExcludedScaleCode(code);
          })
          .map(([driverId]) => driverId);
        const shouldCreateSheet = !sheet && canCreateDailySheet(date);
        const shouldReconcileOpenSheet = sheet?.status === "OPEN" && missingScheduledDriverIds.length > 0;

        if (shouldCreateSheet || shouldReconcileOpenSheet) {
          const targetBases = REGION_BASES[normalizedRegion] || ["LP", "CASTILHO"];
          const [{ data: bases }, { data: baseLocations }] = await Promise.all([
            supabase.from("bases").select("id,code").in("code", targetBases),
            supabase.from("locations").select("id,name").eq("is_active", true),
          ]);
          const baseIds = (bases || []).map((b) => b.id);
          const baseCodeById = new Map((bases || []).map((base) => [base.id, base.code.toUpperCase()]));
          const baseLocationByName = new Map((baseLocations || []).map((location) => [location.name.trim().toUpperCase(), location.id]));

          if (baseIds.length > 0) {
            let activeDriversQuery = supabase
              .from("drivers")
              .select("*")
              .in("base_id", baseIds)
              .eq("is_active", true);
            if (!shouldCreateSheet) {
              activeDriversQuery = activeDriversQuery.in("id", missingScheduledDriverIds);
            }
            const { data: activeDrivers, error: driversError } = await activeDriversQuery.order("name");
            if (driversError) throw new Error(driversError.message);

            if (activeDrivers && activeDrivers.length > 0) {
              // Uma folha existente nunca é regravada durante uma simples leitura.
              // O upsert só é usado na criação inicial para tratar acessos simultâneos.
              let targetSheet = sheet;
              if (!targetSheet) {
                const { data: createdSheet, error: sheetErr } = await supabase
                  .from("daily_sheets")
                  .upsert({ date, region: normalizedRegion, status: "OPEN" }, { onConflict: "date,region" })
                  .select("id,status")
                  .single();
                if (sheetErr) throw new Error(sheetErr.message);
                targetSheet = createdSheet;
              }

              if (targetSheet) {
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

                // Montar despachos somente para condutores ainda ausentes.
                const newDispatchesPayload = activeDrivers.flatMap((d) => {
                  if (existingDriverIds.has(d.id)) return [];
                  const schedEntry = scheduleEntriesByDriver.get(d.id);
                  const prevDisp = prevDispatchesByDriver.get(d.id);
                  const continuity = resolveDayContinuity(d.id, prevDisp);
                  const awaitingPreviousExit = isAwaitingPreviousExit(prevDisp);
                  const scaleCode = (schedEntry?.scale_code || "").trim().toUpperCase();
                  if (isDispatchExcludedScaleCode(scaleCode)) return [];
                  const firstDayForecast = !prevDisp
                    ? resolveFirstDayForecast(scaleCode, schedEntry?.shift_time || d.default_start_time)
                    : null;
                  const baseOrigin = !prevDisp && scaleCode === "1"
                    ? baseLocationByName.get(baseCodeById.get(d.base_id) || "") || null
                    : null;
                  return [{
                    daily_sheet_id: targetSheet.id,
                    driver_id: d.id,
                    scale_day_status: scaleCode || null,
                    forecast_start_time: awaitingPreviousExit
                      ? null
                      : continuity.forecastStartTime || firstDayForecast || schedEntry?.shift_time || d.default_start_time || null,
                    forecast_source: awaitingPreviousExit || continuity.forecastStartTime ? "CONTINUITY" : "SCHEDULE",
                    // O status é uma decisão do operador e começa vazio.
                    dispatch_status: "",
                    abono_reason: null,
                    origin_location_id: continuity.originLocationId || baseOrigin,
                    origin_source: continuity.originLocationId ? "CONTINUITY" : baseOrigin ? "BASE" : "SCHEDULE",
                  }];
                });

                if (newDispatchesPayload.length > 0) {
                  const { data: inserted, error: insertErr } = await supabase
                    .from("dispatches")
                    .upsert(newDispatchesPayload, { onConflict: "daily_sheet_id,driver_id" })
                    .select();

                  if (insertErr) throw new Error(insertErr.message);
                  if (inserted && inserted.length > 0) {
                    rawDispatches = [...rawDispatches, ...inserted];
                  }
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
    const drivers = await this.getDrivers();
    const bases = await this.getBases();
    const vehicles = await this.getVehicles();
    const locations = await this.getLocations();

    const driversMap = new Map(drivers.map((d) => [d.id, d]));
    const basesMap = new Map(bases.map((b) => [b.id, b]));
    const vehiclesMap = new Map(vehicles.map((v) => [v.id, v]));
    const locationsMap = new Map(locations.map((l) => [l.id, l]));

    if (this.isSupabaseConfigured()) {
      this.localDispatches = [...rawDispatches];
    }

    return rawDispatches.filter((disp) => {
      const driver = driversMap.get(disp.driver_id);
      const currentScaleCode = scheduleEntriesByDriver.get(disp.driver_id)?.scale_code;
      const scaleCode = (currentScaleCode ?? disp.scale_day_status ?? "").trim().toUpperCase();
      return isDriverActiveForDispatch(driver) && !isDispatchExcludedScaleCode(scaleCode);
    }).map((disp) => {
      const currentScaleCode = scheduleEntriesByDriver.get(disp.driver_id)?.scale_code;
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
        scale_day_status: currentScaleCode ?? disp.scale_day_status,
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

  private async prepareDispatchUpdates(id: string, updates: Partial<DispatchRowModel>): Promise<Partial<Dispatch>> {
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
    if ("origin_location_id" in updates) {
      processedUpdates.origin_source = "MANUAL";
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
      if (!this.localLocations.some((location) => location.id === result.id)) {
        this.localLocations.push({ id: result.id, name, is_active: true, created_at: new Date().toISOString() });
      }
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
          if (!this.localVehicles.some((vehicle) => vehicle.id === result.id)) {
            this.localVehicles.push({ id: result.id, plate_code: normalizedFleet, vehicle_type: "CAVALO_MECANICO", is_active: true, created_at: new Date().toISOString() });
          }
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

    return processedUpdates;
  }

  private translateMutationError(message: string): Error {
    if (message.includes("DISPATCH_CONFLICT")) {
      return new Error("Conflito: uma das linhas foi alterada por outra pessoa. Os dados foram recarregados; confira antes de tentar novamente.");
    }
    if (message.includes("DAILY_SHEET_CLOSED")) {
      return new Error("Esta folha está fechada e não aceita alterações.");
    }
    if (message.includes("INVALID_BATCH_SIZE")) {
      return new Error("A seleção deve conter entre 1 e 500 linhas.");
    }
    return new Error(message);
  }

  async updateDispatch(id: string, updates: Partial<DispatchRowModel>, expectedUpdatedAt?: string): Promise<Dispatch | null> {
    const processedUpdates = await this.prepareDispatchUpdates(id, updates);

    if (this.isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("update_dispatch_with_audit", {
          p_dispatch_id: id,
          p_expected_updated_at: expectedUpdatedAt || null,
          p_changes: processedUpdates,
        }).single();

        if (error) {
          throw this.translateMutationError(error.message);
        }
        if (data) {
          const saved = data as Dispatch;
          this.localDispatches = this.localDispatches.map((d) => (d.id === id ? { ...d, ...saved } : d));
          return saved;
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

  async updateDispatchBatch(
    updates: Array<{ id: string; changes: Partial<DispatchRowModel>; expectedUpdatedAt?: string }>
  ): Promise<Dispatch[]> {
    if (!updates.length) return [];
    const prepared = await Promise.all(updates.map(async (item) => ({
      id: item.id,
      expected_updated_at: item.expectedUpdatedAt || null,
      changes: await this.prepareDispatchUpdates(item.id, item.changes),
    })));

    if (this.isSupabaseConfigured()) {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("update_dispatch_batch_with_audit", {
        p_updates: prepared,
      });
      if (error) throw this.translateMutationError(error.message);
      const saved = (data || []) as Dispatch[];
      const savedIds = new Set(saved.map((row) => row.id));
      const missingIds = prepared.filter((item) => !savedIds.has(item.id)).map((item) => item.id);
      if (missingIds.length) {
        throw new Error(`O banco não confirmou ${missingIds.length} linha(s) do lote. Nenhuma edição local foi descartada.`);
      }
      const savedById = new Map(saved.map((row) => [row.id, row]));
      this.localDispatches = this.localDispatches.map((row) => savedById.get(row.id) || row);
      return saved;
    }

    const now = new Date().toISOString();
    const preparedById = new Map(prepared.map((item) => [item.id, item.changes]));
    this.localDispatches = this.localDispatches.map((row) => {
      const changes = preparedById.get(row.id);
      return changes ? { ...row, ...changes, updated_at: now } : row;
    });
    return this.localDispatches.filter((row) => preparedById.has(row.id));
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
