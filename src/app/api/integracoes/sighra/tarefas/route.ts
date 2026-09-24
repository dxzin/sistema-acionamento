import { adminDb, bridgeAccess, json } from "@/lib/sighra/server";
import { parseResult } from "@/lib/sighra/queries";
import { claimLocalBridgeJob, completeLocalBridgeJob, localBridgeTestEnabled } from "@/lib/sighra/local-bridge";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const access = await bridgeAccess(request);
  if (!access.identity) return json({ erro: "Credencial inválida." }, 401);
  if (localBridgeTestEnabled()) {
    const job = claimLocalBridgeJob();
    return json({ job: job ? { id: job.id, login: job.login, since_date: job.sinceDate, lease_token: job.leaseToken } : null });
  }
  if (!access.active) return json({ job: null, ponte_ativa: false });
  try {
    const { data, error } = await adminDb().rpc("claim_sighra_query");
    if (error) throw error;
    const job = data?.[0];
    return json({ job: job ? { id: job.id, login: job.login, since_date: job.since_date, lease_token: job.lease_token } : null });
  } catch { return json({ erro: "Fila indisponível." }, 503); }
}
export async function PATCH(request: Request) {
  const access = await bridgeAccess(request);
  if (!access.identity) return json({ erro: "Credencial inválida." }, 401);
  if (!access.active) return json({ erro: "A ponte ativa foi trocada antes da entrega deste resultado." }, 409);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 100_000) return json({ erro: "Resultado muito grande." }, 413);
    body = JSON.parse(raw);
  } catch { return json({ erro: "Mensagem inválida." }, 400); }
  if (!body || !/^[\da-f-]{36}$/i.test(body.id ?? "") || !/^[\da-f-]{36}$/i.test(body.lease_token ?? "")) return json({ erro: "Tarefa inválida." }, 400);
  if (localBridgeTestEnabled()) {
    try {
      const updated = completeLocalBridgeJob(body.id, body.lease_token, body.result, body.error === true);
      return updated ? json({ recebido: true }) : json({ erro: "Tarefa expirada ou já respondida." }, 409);
    } catch { return json({ erro: "Resultado inválido." }, 400); }
  }
  try {
    const db = adminDb();
    const { data: job, error } = await db.from("sighra_query_jobs").select("id,login,since_date").eq("id", body.id).eq("lease_token", body.lease_token).eq("status", "running").gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw error;
    if (!job) return json({ erro: "Tarefa expirada ou já respondida." }, 409);
    let result = null;
    if (body.error !== true) {
      try { result = parseResult(body.result, job.login, job.since_date); } catch { return json({ erro: "Resultado inválido." }, 400); }
    }
    const { data: updated, error: updateError } = await db.from("sighra_query_jobs").update({
      status: body.error === true ? "failed" : "completed", result,
      error: body.error === true ? "Não foi possível consultar as macros. Confira o acesso ao banco no PC da empresa." : null,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id).eq("lease_token", body.lease_token).eq("status", "running").gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (updateError) throw updateError;
    return updated ? json({ recebido: true }) : json({ erro: "Tarefa expirada ou já respondida." }, 409);
  } catch { return json({ erro: "Não foi possível receber o resultado." }, 503); }
}
