import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { parseDashboardFilters, restAvailability, validDashboardToken } from "@/lib/api/schedule-dashboard";
import { addCalendarDays } from "@/lib/dates/operational-date";
import type { Base, Driver, Dispatch, MonthlyScheduleEntry, MonthlySchedule } from "@/types/database";

export const runtime = "nodejs";

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Vary": "Authorization" } });
}

async function allRows<T>(read: (start: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const result = await read(start);
    if (result.error) throw new Error(result.error.message);
    const page = (result.data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.DASHBOARD_API_TOKEN;
  if (!secret) return json({ erro: "API de consulta não configurada." }, 503);
  if (!validDashboardToken(request.headers.get("authorization"), secret)) return json({ erro: "Credencial inválida ou ausente." }, 401);
  let filters: ReturnType<typeof parseDashboardFilters>;
  try { filters = parseDashboardFilters(request.nextUrl.searchParams); }
  catch (error) { return json({ erro: (error as Error).message }, 400); }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ erro: "Banco de dados não configurado." }, 503);

  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const basesResult = await db.from("bases").select("id,code,name,interjornada_minutes");
    if (basesResult.error) throw basesResult.error;
    const bases = basesResult.data as Base[];
    let driversQuery = db.from("drivers").select("id,name,login_matricula,base_id,default_shift,default_start_time", { count: "exact" });
    if (filters.matricula) driversQuery = driversQuery.eq("login_matricula", filters.matricula);
    if (filters.base) {
      const base = bases.find((item) => item.code === filters.base);
      if (!base) return json({ erro: "Base não encontrada." }, 400);
      driversQuery = driversQuery.eq("base_id", base.id);
    }
    const offset = (filters.pagina - 1) * filters.limite;
    const driversResult = await driversQuery.order("id").range(offset, offset + filters.limite - 1);
    if (driversResult.error) throw driversResult.error;
    const drivers = driversResult.data as Driver[];
    const data: { data: string; condutor: { id: string; nome: string; matricula: string }; [key: string]: unknown }[] = [];
    if (drivers.length) {
      const ids = drivers.map((driver) => driver.id);
      const sheets = await allRows<{ id: string; date: string; region: string }>((start) => db.from("daily_sheets").select("id,date,region").gte("date", filters.inicio).lte("date", filters.fim).order("id").range(start, start + 999));
      const dispatches = sheets.length ? await allRows<Dispatch>((start) => db.from("dispatches").select("*").in("daily_sheet_id", sheets.map((sheet) => sheet.id)).in("driver_id", ids).order("id").range(start, start + 999)) : [];
      const locationIds = [...new Set(dispatches.flatMap((row) => [row.origin_location_id, row.destination_location_id, row.final_destination_location_id]).filter((id): id is string => Boolean(id)))];
      const locationRows: { id: string; name: string }[] = [];
      for (let start = 0; start < locationIds.length; start += 100) {
        const result = await db.from("locations").select("id,name").in("id", locationIds.slice(start, start + 100));
        if (result.error) throw result.error;
        locationRows.push(...result.data);
      }
      const locations = new Map(locationRows.map((item) => [item.id, item.name]));
      const schedules: MonthlySchedule[] = [];
      const entries: MonthlyScheduleEntry[] = [];
      const months = new Set<string>();
      for (let date = filters.inicio; date <= filters.fim; date = addCalendarDays(date, 1)) months.add(date.slice(0, 7));
      for (const month of months) {
        const result = await db.from("monthly_schedules").select("id,month,year,region").eq("year", Number(month.slice(0, 4))).eq("month", Number(month.slice(5, 7)));
        if (result.error) throw result.error;
        schedules.push(...result.data as MonthlySchedule[]);
        if (result.data.length) entries.push(...await allRows<MonthlyScheduleEntry>((start) => db.from("monthly_schedule_entries").select("*").in("schedule_id", result.data.map((item) => item.id)).in("driver_id", ids).order("id").range(start, start + 999)));
      }
      for (const entry of entries) {
        const schedule = schedules.find((item) => item.id === entry.schedule_id)!;
        const date = `${schedule.year}-${String(schedule.month).padStart(2, "0")}-${String(entry.day_of_month).padStart(2, "0")}`;
        if (date < filters.inicio || date > filters.fim) continue;
        const driver = drivers.find((item) => item.id === entry.driver_id)!;
        const base = bases.find((item) => item.id === driver.base_id);
        const sheet = sheets.find((item) => item.date === date && item.region === schedule.region);
        const dispatch = dispatches.find((item) => item.driver_id === driver.id && item.daily_sheet_id === sheet?.id);
        data.push({
          data: date, regiao: schedule.region, condutor: { id: driver.id, nome: driver.name, matricula: driver.login_matricula },
          base: base?.code ?? null, escala: entry.scale_code, turno: entry.shift_letter ?? driver.default_shift ?? null,
          horario_escala: entry.shift_time ?? driver.default_start_time ?? null,
          inicio_previsto: dispatch?.forecast_start_time ?? null, inicio_jornada: dispatch?.entry_time ?? null,
          fim_jornada: dispatch?.exit_time ?? null, situacao_acionamento: dispatch?.dispatch_status ?? null,
          origem: locations.get(dispatch?.origin_location_id ?? "") ?? null,
          destino: locations.get(dispatch?.destination_location_id ?? "") ?? null,
          destino_final: locations.get(dispatch?.final_destination_location_id ?? "") ?? null,
          disponibilidade_prevista_apos_descanso: base && dispatch ? restAvailability(date, dispatch.entry_time, dispatch.exit_time, base.interjornada_minutes) : null,
          previsao_proximo_dia: dispatch?.next_day_forecast_time ?? null,
          atualizado_em: [entry.updated_at, dispatch?.updated_at].filter(Boolean).sort().at(-1) ?? null,
        });
      }
    }
    data.sort((a, b) => a.data.localeCompare(b.data) || a.condutor.id.localeCompare(b.condutor.id));
    const total = driversResult.count ?? 0;
    return json({ versao: "1", consultado_em: new Date().toISOString(), fuso_horario: "America/Sao_Paulo", periodo: { inicio: filters.inicio, fim: filters.fim }, paginacao: { pagina: filters.pagina, limite_condutores: filters.limite, total_condutores: total, proxima_pagina: offset + filters.limite < total ? filters.pagina + 1 : null }, dados: data });
  } catch {
    return json({ erro: "Falha ao consultar a escala. Tente novamente." }, 500);
  }
}
