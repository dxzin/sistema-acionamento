import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/v1/escala/route";

type Row = Record<string, unknown>;
type Fixture = Record<string, Row[]>;

function fixture(months: string[], driverCount = 2): Fixture {
  const drivers = Array.from({ length: driverCount }, (_, i) => ({
    id: `driver-${String(i).padStart(3, "0")}`, name: `Condutor ${i}`, login_matricula: String(1000 + i),
    base_id: "base-sp", default_shift: "A", default_start_time: "04:00", is_active: true,
  }));
  const schedules = months.map((month) => ({
    id: `schedule-${month}`, year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)), region: "SP",
  }));
  const entries = schedules.flatMap((schedule) => drivers.flatMap((driver) =>
    Array.from({ length: new Date(Date.UTC(schedule.year, schedule.month, 0)).getUTCDate() }, (_, i) => ({
      id: `${schedule.id}-${driver.id}-${String(i + 1).padStart(2, "0")}`,
      schedule_id: schedule.id, driver_id: driver.id, day_of_month: i + 1, scale_code: "3",
      shift_letter: null, shift_time: null, updated_at: "2026-09-01T00:00:00Z",
      notes: "Informação interna que não compõe a resposta. ".repeat(20),
    }))));
  return {
    bases: [{ id: "base-sp", code: "LP", name: "Nome não utilizado", interjornada_minutes: 670 }],
    drivers, monthly_schedules: schedules, monthly_schedule_entries: entries,
    daily_sheets: [], dispatches: [], locations: [],
  };
}

// Exercita o handler e o cliente Supabase reais, simulando apenas o transporte HTTP.
// Aplica os filtros antes da resposta, para detectar transferência de dias excedentes.
function database(t: TestContext, tables: Fixture) {
  const keys = ["DASHBOARD_API_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const originals = keys.map((key) => process.env[key]);
  process.env.DASHBOARD_API_TOKEN = "dashboard-test-only";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-only";
  t.after(() => keys.forEach((key, index) => {
    if (originals[index] === undefined) delete process.env[key];
    else process.env[key] = originals[index];
  }));
  const calls: { table: string; url: URL; rows: Row[] }[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, "https://database.test");
    assert.equal(init?.method || "GET", "GET");
    const table = url.pathname.split("/").at(-1)!;
    assert.ok(tables[table], `Tabela inesperada: ${table}`);
    let rows = [...tables[table]];
    for (const [column, expression] of url.searchParams) {
      if (["select", "order", "offset", "limit"].includes(column)) continue;
      if (expression.startsWith("eq.")) rows = rows.filter((row) => String(row[column]) === expression.slice(3));
      else if (expression.startsWith("in.(")) {
        const values = expression.slice(4, -1).split(",").map((value) => value.replace(/^"|"$/g, ""));
        rows = rows.filter((row) => values.includes(String(row[column])));
      } else if (expression.startsWith("gte.") || expression.startsWith("lte.")) {
        const lower = expression.startsWith("gte.");
        rows = rows.filter((row) => {
          const value = row[column] as string | number;
          const bound = typeof value === "number" ? Number(expression.slice(4)) : expression.slice(4);
          return lower ? value >= bound : value <= bound;
        });
      } else assert.fail(`Filtro inesperado: ${expression}`);
    }
    const total = rows.length;
    const order = url.searchParams.get("order")?.split(".")[0];
    if (order) rows.sort((a, b) => String(a[order]).localeCompare(String(b[order])));
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 1000);
    rows = rows.slice(offset, offset + limit);
    const columns = url.searchParams.get("select") || "*";
    if (columns !== "*") rows = rows.map((row) => Object.fromEntries(columns.split(",").map((column) => [column, row[column]])));
    calls.push({ table, url, rows });
    return Response.json(rows, { headers: { "Content-Range": `${offset}-${offset + rows.length - 1}/${total}` } });
  });
  return calls;
}

async function query(params: string) {
  const response = await GET(new NextRequest(`http://localhost/api/v1/escala?${params}`, {
    headers: { Authorization: "Bearer dashboard-test-only" },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}

test("consulta de um dia transfere só esse dia e mantém todos os campos da resposta", async (t) => {
  const tables = fixture(["2026-09"]);
  tables.daily_sheets.push({ id: "sheet", date: "2026-09-28", region: "SP" });
  tables.dispatches.push({
    id: "dispatch", daily_sheet_id: "sheet", driver_id: "driver-000",
    forecast_start_time: "21:00", entry_time: "22:00", exit_time: "06:00",
    dispatch_status: "ACIONADO", abono_reason: "Motivo de teste", origin_location_id: "origin",
    destination_location_id: "destination", final_destination_location_id: "destination",
    next_day_forecast_time: "18:00", updated_at: "2026-09-29T10:00:00Z",
    observations: "Observação interna que não é exposta por esta API.", vehicle_id: "vehicle", total_worked_minutes: 480,
  });
  tables.locations.push({ id: "origin", name: "ORIGEM" }, { id: "destination", name: "DESTINO" });
  const secondEntry = tables.monthly_schedule_entries.find((row) => row.driver_id === "driver-001" && row.day_of_month === 28)!;
  secondEntry.shift_letter = "VF";
  secondEntry.shift_time = "VF";
  secondEntry.updated_at = "2026-09-28T12:00:00Z";
  const calls = database(t, tables);
  const result = await query("data=2026-09-28&base=LP");
  assert.deepEqual(result.periodo, { inicio: "2026-09-28", fim: "2026-09-28" });
  assert.equal(result.dados.length, 2);
  assert.deepEqual(result.dados[0], {
    data: "2026-09-28", regiao: "SP", condutor: { id: "driver-000", nome: "Condutor 0", matricula: "1000" },
    base: "LP", escala: "3", turno: "A", horario_escala: "04:00", inicio_previsto: "21:00",
    inicio_jornada: "22:00", fim_jornada: "06:00", situacao_acionamento: "ACIONADO", motivo_abono: "Motivo de teste",
    origem: "ORIGEM", destino: "DESTINO", destino_final: "DESTINO",
    disponibilidade_prevista_apos_descanso: "2026-09-29T20:10:00.000Z",
    previsao_proximo_dia: "18:00", atualizado_em: "2026-09-29T10:00:00Z",
  });
  assert.equal(result.dados[1].turno, "VF");
  assert.equal(result.dados[1].horario_escala, "VF");
  assert.equal(result.dados[1].inicio_jornada, null);
  assert.equal(result.dados[1].atualizado_em, "2026-09-28T12:00:00Z");
  assert.equal(calls.filter((call) => call.table === "monthly_schedule_entries").flatMap((call) => call.rows).length, 2);
  assert.equal(calls.some((call) => call.url.searchParams.get("select") === "*"), false);
  assert.equal(calls.find((call) => call.table === "dispatches")!.rows[0].observations, undefined);
  assert.equal(calls.find((call) => call.table === "monthly_schedule_entries")!.rows[0].notes, undefined);
});

test("condutores da escala MG recebem os campos operacionais da folha UBJP", async (t) => {
  const tables = fixture(["2026-09"]);
  tables.monthly_schedules[0].region = "MG";
  tables.daily_sheets.push({ id: "sheet-ubjp", date: "2026-09-29", region: "UBJP" });
  tables.dispatches.push({
    id: "dispatch-mg", daily_sheet_id: "sheet-ubjp", driver_id: "driver-000",
    forecast_start_time: "04:00", entry_time: "04:15", exit_time: "15:30",
    dispatch_status: "ACIONADO", abono_reason: null, origin_location_id: "origin-mg",
    destination_location_id: "destination-mg", final_destination_location_id: "destination-mg",
    next_day_forecast_time: "04:00", updated_at: "2026-09-29T15:31:00Z",
  });
  tables.locations.push({ id: "origin-mg", name: "UBERABA" }, { id: "destination-mg", name: "JUIZ DE FORA" });
  database(t, tables);
  const result = await query("data=2026-09-29&matricula=1000");
  assert.equal(result.dados.length, 1);
  assert.equal(result.dados[0].regiao, "MG");
  assert.equal(result.dados[0].situacao_acionamento, "ACIONADO");
  assert.equal(result.dados[0].inicio_jornada, "04:15");
  assert.equal(result.dados[0].fim_jornada, "15:30");
  assert.equal(result.dados[0].origem, "UBERABA");
  assert.equal(result.dados[0].destino, "JUIZ DE FORA");
});

for (const [start, end, months, expectedDates] of [
  ["2026-09-29", "2026-10-02", ["2026-09", "2026-10"], ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]],
  ["2026-12-31", "2027-01-01", ["2026-12", "2027-01"], ["2026-12-31", "2027-01-01"]],
  ["2028-02-28", "2028-03-01", ["2028-02", "2028-03"], ["2028-02-28", "2028-02-29", "2028-03-01"]],
] as const) {
  test(`período ${start} a ${end} preserva as datas e filtra cada mês no banco`, async (t) => {
    const calls = database(t, fixture([...months]));
    const result = await query(`inicio=${start}&fim=${end}&matricula=1000`);
    assert.deepEqual(result.dados.map((row: { data: string }) => row.data), expectedDates);
    const entries = calls.filter((call) => call.table === "monthly_schedule_entries").flatMap((call) => call.rows);
    assert.equal(entries.length, expectedDates.length, "O banco deve enviar somente as células do período");
    assert.ok(entries.every((row) => row.driver_id === "driver-000"));
  });
}

test("paginação mantém todas as células de 31 dias e somente os condutores da página", async (t) => {
  const calls = database(t, fixture(["2026-10"], 90));
  const result = await query("inicio=2026-10-01&fim=2026-10-31&pagina=2&limite=40");
  assert.equal(result.dados.length, 40 * 31);
  assert.deepEqual(result.paginacao, { pagina: 2, limite_condutores: 40, total_condutores: 90, proxima_pagina: 3 });
  assert.deepEqual([...new Set(result.dados.map((row: { condutor: { id: string } }) => row.condutor.id))],
    Array.from({ length: 40 }, (_, i) => `driver-${String(i + 40).padStart(3, "0")}`));
  assert.deepEqual(calls.filter((call) => call.table === "monthly_schedule_entries").map((call) => call.rows.length), [1000, 240]);
});

test("período sem células retorna lista vazia e preserva a paginação de condutores", async (t) => {
  const tables = fixture(["2026-09"]);
  tables.monthly_schedule_entries = tables.monthly_schedule_entries.filter((row) => row.day_of_month !== 28);
  const calls = database(t, tables);
  const result = await query("data=2026-09-28");
  assert.deepEqual(result.dados, []);
  assert.equal(result.paginacao.total_condutores, 2);
  assert.equal(calls.filter((call) => call.table === "monthly_schedule_entries").flatMap((call) => call.rows).length, 0);
});
