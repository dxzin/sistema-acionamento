import { adminDb, json, sessionDb, validOrigin } from "@/lib/sighra/server";
import { exitTime, parseResult, validDate } from "@/lib/sighra/queries";
import { addCalendarDays } from "@/lib/dates/operational-date";
import { calculateJornada } from "@/lib/calculations/jornada";
import { calculateNextForecast } from "@/lib/calculations/interjornada";
export const runtime = "nodejs";

async function prepare(userId: string, queryId: unknown, date: unknown, region: unknown) {
  if (typeof queryId !== "string" || !/^[\da-f-]{36}$/i.test(queryId) || !validDate(date) || !["SP", "UBJP", "MS"].includes(String(region))) return json({ erro: "Selecione a consulta, o dia e a região." }, 400);
  const db = adminDb();
  const { data: job, error: jobError } = await db.from("sighra_query_jobs").select("login,status,result,since_date,completed_at").eq("id", queryId).eq("requested_by", userId).maybeSingle();
  if (jobError) throw jobError;
  if (!job || job.status !== "completed") return json({ erro: "Consulta não concluída." }, 404);
  if (Date.now() - Date.parse(job.completed_at) > 86_400_000) return json({ erro: "Faça uma nova consulta antes de preencher." }, 409);
  const end = parseResult(job.result, job.login, job.since_date).last_end;
  if (!end) return json({ erro: "Não há fim de jornada para preencher." }, 400);
  const eventDate = end.gps_at.slice(0, 10);
  if (date !== eventDate && addCalendarDays(date, 1) !== eventDate) return json({ erro: "Escolha o dia da macro ou o dia anterior, se a jornada atravessou a meia-noite." }, 400);
  const { data: drivers, error: driverError } = await db.from("drivers").select("id,name").eq("login_matricula", job.login);
  if (driverError) throw driverError;
  if (drivers?.length !== 1) return json({ erro: "Não foi possível identificar um único condutor por esse login na planilha." }, 404);
  const { data: rows, error: rowError } = await db.from("dispatches").select("id,entry_time,exit_time,updated_at,daily_sheets!inner(date,region,status)").eq("driver_id", drivers[0].id).eq("daily_sheets.date", date).eq("daily_sheets.region", region);
  if (rowError) throw rowError;
  if (rows?.length !== 1) return json({ erro: "Condutor não encontrado na folha escolhida." }, 404);
  const row = rows[0];
  const sheet = row.daily_sheets as unknown as { status: string };
  if (sheet.status !== "OPEN") return json({ erro: "A folha está fechada e não aceita alterações." }, 409);
  const time = exitTime(end);
  if (date !== eventDate && row.entry_time && time >= row.entry_time) return json({ erro: "Confira a data: esse intervalo excede 24 horas e não pode ser representado nessa folha." }, 400);
  return { row, time, driver: drivers[0], date, region };
}

export async function GET(request: Request) {
  const { user } = await sessionDb();
  if (!user) return json({ erro: "Faça login." }, 401);
  const params = new URL(request.url).searchParams;
  try {
    const value = await prepare(user.id, params.get("consulta"), params.get("data"), params.get("regiao"));
    if (value instanceof Response) return value;
    return json({ condutor: value.driver.name, data: value.date, regiao: value.region, entrada: value.row.entry_time,
      saida_atual: value.row.exit_time, saida_sighra: value.time, updated_at: value.row.updated_at });
  } catch { return json({ erro: "Não foi possível conferir a folha." }, 503); }
}
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ erro: "Origem inválida." }, 403);
  const { db, user } = await sessionDb();
  if (!user) return json({ erro: "Faça login." }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ erro: "Mensagem inválida." }, 400); }
  if (typeof body?.updated_at !== "string" || !Number.isFinite(Date.parse(body.updated_at))) return json({ erro: "Confira a folha antes de preencher." }, 400);
  try {
    const value = await prepare(user.id, body.consulta, body.data, body.regiao);
    if (value instanceof Response) return value;
    const { error } = await db.rpc("update_dispatch_with_audit", {
      p_dispatch_id: value.row.id, p_expected_updated_at: body.updated_at,
      p_changes: { exit_time: value.time, total_worked_minutes: calculateJornada(value.row.entry_time, value.time).minutes,
        next_day_forecast_time: calculateNextForecast(value.time) },
    });
    if (error) {
      if (error.message.includes("DISPATCH_CONFLICT")) return json({ erro: "A linha foi alterada por outra pessoa. Confira novamente antes de preencher." }, 409);
      if (error.message.includes("DAILY_SHEET_CLOSED")) return json({ erro: "A folha foi fechada e não aceita alterações." }, 409);
      throw error;
    }
    return json({ salvo: true, saida: value.time });
  } catch { return json({ erro: "Não foi possível preencher a saída." }, 503); }
}
