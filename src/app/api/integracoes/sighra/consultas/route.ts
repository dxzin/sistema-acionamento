import { activeBridgeId, adminDb, json, sessionDb, validOrigin } from "@/lib/sighra/server";
import { jobView, validDate, validLogin } from "@/lib/sighra/queries";
import { addCalendarDays, currentDateInBrasilia } from "@/lib/dates/operational-date";
import { enqueueLocalBridgeJob, getLocalBridgeJob, getLocalBridgeStatus, localBridgeTestEnabled } from "@/lib/sighra/local-bridge";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ erro: "Origem inválida." }, 403);
  const { user } = await sessionDb();
  if (!user) return json({ erro: "Faça login." }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ erro: "Mensagem inválida." }, 400); }
  const login = typeof body?.login === "string" ? body.login.trim() : null;
  if (!validLogin(login)) return json({ erro: "Informe um login numérico de até 20 dígitos." }, 400);
  const since = body?.since === undefined ? addCalendarDays(currentDateInBrasilia(), -30) : body.since;
  if (!validDate(since)) return json({ erro: "Informe uma data operacional válida." }, 400);
  if (localBridgeTestEnabled()) {
    const bridge = getLocalBridgeStatus();
    if (!bridge.lastSeenAt || Date.now() - Date.parse(bridge.lastSeenAt) >= 120_000) return json({ erro: "A ponte de teste do notebook está offline." }, 503);
    if (!bridge.queryEnabled) return json({ erro: "A ponte de teste não habilitou consultas." }, 503);
    if (!bridge.databaseOk) return json({ erro: "O notebook está sem acesso ao SIGhRA. Confira a VPN." }, 503);
    return json(jobViewLocal(enqueueLocalBridgeJob(user.id, login, since, bridge.simulation)), 202);
  }
  try {
    const db = adminDb();
    const bridgeId = await activeBridgeId();
    const bridgeLabel = bridgeId === "notebook" ? "notebook" : "PC da empresa";
    const { data: bridge, error: bridgeError } = await db.from("sighra_bridge_status").select("database_ok,last_seen_at,query_enabled").eq("id", bridgeId).maybeSingle();
    if (bridgeError) throw bridgeError;
    if (!bridge || Date.now() - Date.parse(bridge.last_seen_at) >= 120_000) return json({ erro: `A ponte selecionada (${bridgeLabel}) está offline.` }, 503);
    if (!bridge.query_enabled) return json({ erro: `A ponte selecionada (${bridgeLabel}) ainda não habilitou consultas.` }, 503);
    if (!bridge.database_ok) return json({ erro: `A ponte selecionada (${bridgeLabel}) está sem acesso ao SIGhRA. Confira a VPN.` }, 503);
    const { data, error } = await db.rpc("enqueue_sighra_query", { p_user: user.id, p_login: login, p_since: since }).single();
    if (error) {
      if (error.message.includes("QUERY_RATE_LIMIT")) return json({ erro: "Aguarde as consultas anteriores antes de consultar novamente." }, 429);
      throw error;
    }
    if (!data) throw new Error("Consulta não enfileirada.");
    if (String((data as { since_date?: string }).since_date).slice(0, 10) !== since) {
      return json({ erro: "Já existe uma consulta desse login para outra data. Aguarde a conclusão e tente novamente." }, 409);
    }
    return json(jobView(data as Parameters<typeof jobView>[0]), 202);
  } catch { return json({ erro: "Não foi possível solicitar a consulta." }, 503); }
}
export async function GET(request: Request) {
  const { user } = await sessionDb();
  if (!user) return json({ erro: "Faça login." }, 401);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[\da-f-]{36}$/i.test(id)) return json({ erro: "Consulta inválida." }, 400);
  if (localBridgeTestEnabled()) {
    const job = getLocalBridgeJob(id, user.id);
    return job ? json(jobViewLocal(job)) : json({ erro: "Consulta não encontrada." }, 404);
  }
  try {
    const { data, error } = await adminDb().from("sighra_query_jobs").select("id,login,status,created_at,expires_at,since_date,result,error").eq("id", id).eq("requested_by", user.id).maybeSingle();
    if (error) throw error;
    return data ? json(jobView(data)) : json({ erro: "Consulta não encontrada." }, 404);
  } catch { return json({ erro: "Consulta indisponível." }, 503); }
}

function jobViewLocal(job: ReturnType<typeof enqueueLocalBridgeJob>) {
  return { ...jobView({ id: job.id, login: job.login, status: job.status, created_at: job.createdAt,
    expires_at: job.expiresAt, since_date: job.sinceDate, result: job.result, error: job.error }), simulation: job.simulation };
}
