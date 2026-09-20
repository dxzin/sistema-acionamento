import { adminDb, json, sessionDb, validOrigin } from "@/lib/sighra/server";
import { validDate, validLogin } from "@/lib/sighra/queries";

export const runtime = "nodejs";

const OUTCOMES = new Set(["requested", "preview", "applied", "canceled", "blocked", "failed"]);
const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max ? value : null;

export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ erro: "Origem inválida." }, 403);
  const { user } = await sessionDb();
  if (!user) return json({ erro: "Faça login." }, 401);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 12_000) return json({ erro: "Mensagem muito grande." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ erro: "Mensagem inválida." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ erro: "Mensagem inválida." }, 400);
  const recordId = text(body.recordId, 36);
  const login = text(body.login, 20);
  const operationalDate = text(body.operationalDate, 10);
  const outcome = text(body.outcome, 20);
  const requestedAt = text(body.requestedAt, 40);
  if (!recordId || !/^[\da-f-]{36}$/i.test(recordId) || !validLogin(login) || !validDate(operationalDate) ||
    !outcome || !OUTCOMES.has(outcome) || !requestedAt || !Number.isFinite(Date.parse(requestedAt))) {
    return json({ erro: "Auditoria inválida." }, 400);
  }
  const metadata = {
    source: "sighra",
    login,
    operational_date: operationalDate,
    shift: text(body.shift, 20),
    dispatch_status: text(body.status, 40),
    requested_at: requestedAt,
    outcome,
    result: text(body.result, 500),
    start_timestamp: text(body.startTimestamp, 40),
    end_timestamp: text(body.endTimestamp, 40),
    start_macro_id: text(body.startMacroId, 180),
    end_macro_id: text(body.endMacroId, 180),
    query_id: text(body.queryId, 180),
    reason: text(body.reason, 1000),
  };
  try {
    const db = adminDb();
    const { data: dispatch, error: dispatchError } = await db.from("dispatches").select("id").eq("id", recordId).maybeSingle();
    if (dispatchError) throw dispatchError;
    if (!dispatch) return json({ erro: "Registro não encontrado." }, 404);
    const { error } = await db.from("audit_logs").insert({
      user_id: user.id,
      entity_name: "sighra_journey",
      entity_id: recordId,
      action: "CREATE",
      old_values: null,
      new_values: metadata,
    });
    if (error) throw error;
    return json({ registrado: true }, 201);
  } catch {
    return json({ erro: "Não foi possível registrar a auditoria." }, 503);
  }
}
