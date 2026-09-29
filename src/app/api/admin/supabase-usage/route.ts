import { createClient } from "@/lib/supabase/server";
import { databaseUsage, performanceUsage } from "@/lib/supabase/usage";

export async function GET() {
  const headers = { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" };
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return Response.json({ erro: "Faça login para consultar o consumo." }, { status: 401, headers });
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["admin", "supervisor"].includes(profile.role)) return Response.json({ erro: "Acesso restrito." }, { status: 403, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ erro: "Consulta de consumo não configurada." }, { status: 503, headers });
  try {
    const response = await fetch(`${url}/customer/v1/privileged/metrics`, {
      headers: { Authorization: `Basic ${Buffer.from(`service_role:${key}`).toString("base64")}` },
      next: { revalidate: 300 }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Métricas indisponíveis.");
    const metrics = await response.text();
    return Response.json({ database: databaseUsage(metrics), performance: performanceUsage(metrics), checkedAt: new Date().toISOString(), dashboardUrl: `https://supabase.com/dashboard/project/${new URL(url).hostname.split(".")[0]}/reports/database` }, { headers });
  } catch {
    return Response.json({ erro: "Não foi possível consultar o consumo. Tente novamente ou confira o painel do Supabase." }, { status: 503, headers });
  }
}
