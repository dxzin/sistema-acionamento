import { activeBridgeId, adminDb, json, sessionDb, validOrigin } from "@/lib/sighra/server";
import { jobView, validDate, validLogin, type SighraResult } from "@/lib/sighra/queries";
import {
  cancelLocalBridgeBatch,
  enqueueLocalBridgeBatch,
  getLocalBridgeBatch,
  getLocalBridgeStatus,
  localBridgeTestEnabled,
  type LocalBridgeJob,
} from "@/lib/sighra/local-bridge";

export const runtime = "nodejs";

type StoredJob = {
  id: string;
  batch_id: string | null;
  login: string;
  status: string;
  created_at: string;
  expires_at: string;
  since_date: string;
  result: SighraResult | null;
  error: string | null;
};

const batchIdFromUrl = (request: Request) => new URL(request.url).searchParams.get("id");
const validBatchId = (value: string | null): value is string => Boolean(value && /^[\da-f-]{36}$/i.test(value));

function localJobView(job: LocalBridgeJob) {
  return {
    ...jobView({
      id: job.id,
      login: job.login,
      status: job.status,
      created_at: job.createdAt,
      expires_at: job.expiresAt,
      since_date: job.sinceDate,
      result: job.result,
      error: job.error,
    }),
    simulation: job.simulation,
  };
}

async function bridgeUnavailableMessage() {
  if (localBridgeTestEnabled()) {
    const bridge = getLocalBridgeStatus();
    if (!bridge.lastSeenAt || Date.now() - Date.parse(bridge.lastSeenAt) >= 120_000) return "A ponte de teste do notebook está offline.";
    if (!bridge.queryEnabled) return "A ponte de teste não habilitou consultas.";
    if (!bridge.databaseOk) return "O notebook está sem acesso ao SIGhRA. Confira a VPN.";
    return null;
  }
  const db = adminDb();
  const bridgeId = await activeBridgeId();
  const bridgeLabel = bridgeId === "notebook" ? "notebook" : "PC da empresa";
  const { data: bridge, error } = await db.from("sighra_bridge_status")
    .select("database_ok,last_seen_at,query_enabled")
    .eq("id", bridgeId)
    .maybeSingle();
  if (error) throw error;
  if (!bridge || Date.now() - Date.parse(bridge.last_seen_at) >= 120_000) return `A ponte selecionada (${bridgeLabel}) está offline.`;
  if (!bridge.query_enabled) return `A ponte selecionada (${bridgeLabel}) ainda não habilitou consultas.`;
  if (!bridge.database_ok) return `A ponte selecionada (${bridgeLabel}) está sem acesso ao SIGhRA. Confira a VPN.`;
  return null;
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ erro: "Origem inválida." }, 403);
  const { user } = await sessionDb();
  if (!user) return json({ erro: "Faça login." }, 401);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8_000) return json({ erro: "Lote muito grande." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ erro: "Mensagem inválida." }, 400);
  }
  const since = body?.since;
  const rawLogins = body?.logins;
  if (!validDate(since) || !Array.isArray(rawLogins)) return json({ erro: "Informe a data e os logins do lote." }, 400);
  const logins = [...new Set(rawLogins.map((value) => typeof value === "string" ? value.trim() : ""))];
  if (logins.length < 1 || logins.length > 50 || logins.some((login) => !validLogin(login))) {
    return json({ erro: "Selecione entre 1 e 50 condutores com login numérico válido." }, 400);
  }
  try {
    const unavailable = await bridgeUnavailableMessage();
    if (unavailable) return json({ erro: unavailable }, 503);
    if (localBridgeTestEnabled()) {
      const bridge = getLocalBridgeStatus();
      const batch = enqueueLocalBridgeBatch(user.id, logins, since, bridge.simulation);
      return json({ id: batch.batchId, jobs: batch.jobs.map(localJobView) }, 202);
    }
    const { data, error } = await adminDb().rpc("enqueue_sighra_query_batch", {
      p_user: user.id,
      p_logins: logins,
      p_since: since,
    });
    if (error) {
      if (error.message.includes("BATCH_IN_PROGRESS")) return json({ erro: "Já existe uma consulta em lote em andamento para este usuário." }, 409);
      throw error;
    }
    const jobs = (data || []) as StoredJob[];
    const batchId = jobs[0]?.batch_id;
    if (!batchId || jobs.length !== logins.length) throw new Error("Lote incompleto.");
    return json({ id: batchId, jobs: jobs.map(jobView) }, 202);
  } catch (error) {
    if (error instanceof Error && error.message === "BATCH_IN_PROGRESS") {
      return json({ erro: "Já existe uma consulta em lote em andamento para este usuário." }, 409);
    }
    return json({ erro: "Não foi possível iniciar a consulta em lote." }, 503);
  }
}

export async function GET(request: Request) {
  const { user } = await sessionDb();
  if (!user) return json({ erro: "Faça login." }, 401);
  const batchId = batchIdFromUrl(request);
  if (!validBatchId(batchId)) return json({ erro: "Lote inválido." }, 400);
  if (localBridgeTestEnabled()) {
    const jobs = getLocalBridgeBatch(batchId, user.id);
    return jobs.length ? json({ id: batchId, jobs: jobs.map(localJobView) }) : json({ erro: "Lote não encontrado." }, 404);
  }
  try {
    const { data, error } = await adminDb().from("sighra_query_jobs")
      .select("id,batch_id,login,status,created_at,expires_at,since_date,result,error")
      .eq("batch_id", batchId)
      .eq("requested_by", user.id)
      .order("created_at");
    if (error) throw error;
    const jobs = (data || []) as StoredJob[];
    return jobs.length ? json({ id: batchId, jobs: jobs.map(jobView) }) : json({ erro: "Lote não encontrado." }, 404);
  } catch {
    return json({ erro: "Não foi possível acompanhar a consulta em lote." }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!validOrigin(request)) return json({ erro: "Origem inválida." }, 403);
  const { user } = await sessionDb();
  if (!user) return json({ erro: "Faça login." }, 401);
  const batchId = batchIdFromUrl(request);
  if (!validBatchId(batchId)) return json({ erro: "Lote inválido." }, 400);
  if (localBridgeTestEnabled()) return json({ canceladas: cancelLocalBridgeBatch(batchId, user.id) });
  try {
    const { data, error } = await adminDb().from("sighra_query_jobs")
      .update({ status: "failed", error: "Consulta em lote cancelada pelo operador.", completed_at: new Date().toISOString() })
      .eq("batch_id", batchId)
      .eq("requested_by", user.id)
      .in("status", ["queued", "running"])
      .select("id");
    if (error) throw error;
    return json({ canceladas: data?.length || 0 });
  } catch {
    return json({ erro: "Não foi possível cancelar a consulta em lote." }, 503);
  }
}
