import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { validDashboardToken } from "@/lib/api/schedule-dashboard";
import { getLocalBridgeStatus, localBridgeTestEnabled, localBridgeToken, touchLocalBridge } from "@/lib/sighra/local-bridge";
import { activeBridgeId, bridgeIdentity, json, validOrigin } from "@/lib/sighra/server";

export const runtime = "nodejs";

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export async function POST(request: Request) {
  const configured = localBridgeTestEnabled()
    ? Boolean(localBridgeToken())
    : Boolean(process.env.SIGHRA_BRIDGE_TOKEN || process.env.SIGHRA_NOTEBOOK_BRIDGE_TOKEN);
  if (!configured) return json({ erro: "Ponte não configurada." }, 503);
  const identity = bridgeIdentity(request);
  if (!identity) return json({ erro: "Credencial inválida." }, 401);
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
  const bridgeId = identity === "notebook" ? "notebook" : "empresa";
  const row = { id: bridgeId, last_seen_at: now, database_ok: body.database_ok, query_enabled: body.query_enabled === true,
    ...(body.database_ok ? { last_database_ok_at: now } : {}) };
  const { error } = await db.from("sighra_bridge_status").upsert(row);
  if (error) return json({ erro: "Não foi possível registrar o sinal." }, 503);
  const selectedBridge = await activeBridgeId();
  return json({ recebido_em: now, ambiente: bridgeId, ativa: bridgeId === selectedBridge });
}

function localStatusResponse() {
  const data = getLocalBridgeStatus();
  if (!localBridgeToken()) return json({ status: "nao_configurada" });
  const online = data.lastSeenAt && Date.now() - Date.parse(data.lastSeenAt) < 210_000;
  const status = !online ? "offline" : data.databaseOk ? "online" : "sem_banco";
  const notebook = { status, ultimo_sinal: data.lastSeenAt, ultimo_acesso_banco: data.lastDatabaseOkAt, query_enabled: data.queryEnabled };
  return json({ ...notebook, ambiente: data.simulation ? "simulacao-local" : "notebook-teste", active_bridge: "notebook",
    bridges: { notebook }, selection_enabled: false, simulation: data.simulation });
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
  const db = database();
  if (!db) return json({ erro: "Serviço não configurado." }, 503);
  const bridgeId = await activeBridgeId();
  const { data, error } = await db.from("sighra_bridge_status").select("id,last_seen_at,database_ok,last_database_ok_at,query_enabled").in("id", ["empresa", "notebook"]);
  if (error) return json({ erro: "Status indisponível." }, 503);
  const rows = new Map((data || []).map(row => [row.id, row]));
  const statusFor = (id: "empresa" | "notebook") => {
    const token = id === "notebook" ? process.env.SIGHRA_NOTEBOOK_BRIDGE_TOKEN : process.env.SIGHRA_BRIDGE_TOKEN;
    const configured = Boolean(token && token.length >= 32);
    const row = rows.get(id);
    const online = Boolean(row && Date.now() - Date.parse(row.last_seen_at) < 210_000);
    return { status: !configured ? "nao_configurada" : !online ? "offline" : row?.database_ok ? "online" : "sem_banco",
      ultimo_sinal: row?.last_seen_at ?? null, ultimo_acesso_banco: row?.last_database_ok_at ?? null,
      query_enabled: row?.query_enabled ?? false };
  };
  const bridges = { empresa: statusFor("empresa"), notebook: statusFor("notebook") };
  return json({ ...bridges[bridgeId], ambiente: bridgeId, active_bridge: bridgeId, bridges, selection_enabled: true });
}

export async function PATCH(request: Request) {
  if (!validOrigin(request)) return json({ erro: "Origem inválida." }, 403);
  if (localBridgeTestEnabled()) return json({ erro: "A seleção de ponte está disponível somente no ambiente publicado." }, 409);
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) return json({ erro: "Faça login." }, 401);
  const { data: profile } = await session.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["admin", "supervisor"].includes(profile.role)) return json({ erro: "Acesso restrito." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ erro: "Mensagem inválida." }, 400); }
  if (!body || !["empresa", "notebook"].includes(body.active_bridge) || Object.keys(body).some(key => key !== "active_bridge")) {
    return json({ erro: "Selecione a ponte do PC da empresa ou do notebook." }, 400);
  }
  const bridgeId = body.active_bridge as "empresa" | "notebook";
  const configured = bridgeId === "notebook" ? process.env.SIGHRA_NOTEBOOK_BRIDGE_TOKEN : process.env.SIGHRA_BRIDGE_TOKEN;
  if (!configured || configured.length < 32) return json({ erro: "A ponte selecionada ainda não possui uma chave configurada no servidor." }, 409);
  const db = database();
  if (!db) return json({ erro: "Serviço não configurado." }, 503);
  const { error } = await db.from("sighra_bridge_config").upsert({
    id: "active", active_bridge: bridgeId, updated_by: user.id, updated_at: new Date().toISOString(),
  });
  if (error) return json({ erro: "Não foi possível trocar a ponte ativa." }, 503);
  return json({ active_bridge: bridgeId });
}
