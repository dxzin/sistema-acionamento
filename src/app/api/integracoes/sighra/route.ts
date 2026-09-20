import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { validDashboardToken } from "@/lib/api/schedule-dashboard";
import { getLocalBridgeStatus, localBridgeTestEnabled, localBridgeToken, touchLocalBridge } from "@/lib/sighra/local-bridge";

export const runtime = "nodejs";

function json(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie, Authorization" } });
}

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export async function POST(request: Request) {
  const secret = localBridgeTestEnabled() ? localBridgeToken() : process.env.SIGHRA_BRIDGE_TOKEN;
  if (!secret || secret.length < 32) return json({ erro: "Ponte não configurada." }, 503);
  if (!validDashboardToken(request.headers.get("authorization"), secret)) return json({ erro: "Credencial inválida." }, 401);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return json({ erro: "Mensagem muito grande." }, 413);
    body = JSON.parse(raw);
  } catch { return json({ erro: "Mensagem inválida." }, 400); }
  if (!body || typeof body.database_ok !== "boolean" || (body.query_enabled !== undefined && typeof body.query_enabled !== "boolean") || (body.simulation !== undefined && typeof body.simulation !== "boolean") || Object.keys(body).some(key => !["database_ok", "query_enabled", "simulation"].includes(key))) {
    return json({ erro: "Informe database_ok." }, 400);
  }
  if (localBridgeTestEnabled()) {
    const status = touchLocalBridge(body.database_ok, body.query_enabled === true, body.simulation === true);
    return json({ recebido_em: status.lastSeenAt, ambiente: status.simulation ? "simulacao-local" : "notebook-teste" });
  }
  const db = database();
  if (!db) return json({ erro: "Serviço não configurado." }, 503);
  const now = new Date().toISOString();
  const row = { id: "empresa", last_seen_at: now, database_ok: body.database_ok, query_enabled: body.query_enabled === true,
    ...(body.database_ok ? { last_database_ok_at: now } : {}) };
  const { error } = await db.from("sighra_bridge_status").upsert(row);
  if (error) return json({ erro: "Não foi possível registrar o sinal." }, 503);
  return json({ recebido_em: now });
}

function localStatusResponse() {
  const data = getLocalBridgeStatus();
  if (!localBridgeToken()) return json({ status: "nao_configurada" });
  const online = data.lastSeenAt && Date.now() - Date.parse(data.lastSeenAt) < 120_000;
  return json({ status: !online ? "offline" : data.databaseOk ? "online" : "sem_banco",
    ultimo_sinal: data.lastSeenAt, ultimo_acesso_banco: data.lastDatabaseOkAt, query_enabled: data.queryEnabled,
    ambiente: data.simulation ? "simulacao-local" : "notebook-teste", simulation: data.simulation });
}

export async function GET(request: Request) {
  if (localBridgeTestEnabled() && validDashboardToken(request.headers.get("authorization"), localBridgeToken() || "")) {
    return localStatusResponse();
  }
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) return json({ erro: "Faça login." }, 401);
  if (localBridgeTestEnabled()) {
    return localStatusResponse();
  }
  if (!process.env.SIGHRA_BRIDGE_TOKEN) return json({ status: "nao_configurada" });
  const db = database();
  if (!db) return json({ erro: "Serviço não configurado." }, 503);
  const { data, error } = await db.from("sighra_bridge_status").select("last_seen_at,database_ok,last_database_ok_at,query_enabled").eq("id", "empresa").maybeSingle();
  if (error) return json({ erro: "Status indisponível." }, 503);
  const online = data && Date.now() - Date.parse(data.last_seen_at) < 120_000;
  return json({ status: !online ? "offline" : data.database_ok ? "online" : "sem_banco",
    ultimo_sinal: data?.last_seen_at ?? null, ultimo_acesso_banco: data?.last_database_ok_at ?? null, query_enabled: data?.query_enabled ?? false });
}
