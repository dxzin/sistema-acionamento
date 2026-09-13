import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MAX_BODY_BYTES = 2_048;

function json(payload: object, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];

  if (!url || !anonKey || !serviceKey || !token) {
    return json({ error: "Configuração ou sessão ausente." }, 401);
  }

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return json({ error: "Sessão inválida." }, 401);

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Conteúdo JSON obrigatório." }, 415);
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json({ error: "Requisição excede o limite permitido." }, 413);
  }
  let body: { fleetCode?: unknown };
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_BODY");
    body = parsed as { fleetCode?: unknown };
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }
  if (body.fleetCode !== undefined && typeof body.fleetCode !== "string") {
    return json({ error: "Código de frota inválido." }, 400);
  }
  const fleetCode = (body.fleetCode || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  if (!fleetCode) return json({ id: null });

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: existing, error: lookupError } = await adminClient.from("vehicles").select("id").eq("plate_code", fleetCode).maybeSingle();
  if (lookupError) {
    console.error("Falha ao consultar frota:", lookupError.code);
    return json({ error: "Não foi possível consultar a frota." }, 500);
  }
  if (existing) return json({ id: existing.id });

  const { data: created, error: createError } = await adminClient.from("vehicles").insert({ plate_code: fleetCode, vehicle_type: "CAVALO_MECANICO", is_active: true }).select("id").single();
  if (createError?.code === "23505") {
    const { data: raced } = await adminClient.from("vehicles").select("id").eq("plate_code", fleetCode).single();
    if (raced) return json({ id: raced.id });
  }
  if (createError) {
    console.error("Falha ao registrar frota:", createError.code);
    return json({ error: "Não foi possível registrar a frota." }, 500);
  }
  return json({ id: created.id });
}
