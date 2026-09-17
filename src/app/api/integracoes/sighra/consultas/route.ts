import { adminDb, json, sessionDb, validOrigin } from "@/lib/sighra/server";
import { jobView, validLogin } from "@/lib/sighra/queries";
import { addCalendarDays, currentDateInBrasilia } from "@/lib/dates/operational-date";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ erro: "Origem inválida." }, 403);
  const { user } = await sessionDb();
  if (!user) return json({ erro: "Faça login." }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ erro: "Mensagem inválida." }, 400); }
  const login = typeof body?.login === "string" ? body.login.trim() : null;
  if (!validLogin(login)) return json({ erro: "Informe um login numérico de até 20 dígitos." }, 400);
  try {
    const db = adminDb();
    const { data: bridge, error: bridgeError } = await db.from("sighra_bridge_status").select("database_ok,last_seen_at,query_enabled").eq("id", "empresa").maybeSingle();
    if (bridgeError) throw bridgeError;
    if (!bridge || Date.now() - Date.parse(bridge.last_seen_at) >= 120_000) return json({ erro: "A ponte está offline. Confira o PC e a VPN." }, 503);
    if (!bridge.query_enabled) return json({ erro: "Atualize os scripts no PC da empresa e reinicie a ponte para habilitar consultas." }, 503);
    if (!bridge.database_ok) return json({ erro: "A ponte está sem acesso ao Sighra. Confira a VPN." }, 503);
    const { data, error } = await db.rpc("enqueue_sighra_query", { p_user: user.id, p_login: login, p_since: addCalendarDays(currentDateInBrasilia(), -30) }).single();
    if (error) {
      if (error.message.includes("QUERY_RATE_LIMIT")) return json({ erro: "Aguarde as consultas anteriores antes de consultar novamente." }, 429);
      throw error;
    }
    return json(jobView(data as Parameters<typeof jobView>[0]), 202);
  } catch { return json({ erro: "Não foi possível solicitar a consulta." }, 503); }
}
export async function GET(request: Request) {
  const { user } = await sessionDb();
  if (!user) return json({ erro: "Faça login." }, 401);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[\da-f-]{36}$/i.test(id)) return json({ erro: "Consulta inválida." }, 400);
  try {
    const { data, error } = await adminDb().from("sighra_query_jobs").select("id,login,status,created_at,expires_at,since_date,result,error").eq("id", id).eq("requested_by", user.id).maybeSingle();
    if (error) throw error;
    return data ? json(jobView(data)) : json({ erro: "Consulta não encontrada." }, 404);
  } catch { return json({ erro: "Consulta indisponível." }, 503); }
}
