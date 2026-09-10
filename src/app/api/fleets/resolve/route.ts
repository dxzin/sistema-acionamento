import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!url || !anonKey || !serviceKey || !token) {
    return NextResponse.json({ error: "Configuração ou sessão ausente." }, { status: 401 });
  }

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const body = await request.json() as { fleetCode?: string };
  const fleetCode = (body.fleetCode || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  if (!fleetCode) return NextResponse.json({ id: null });

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: existing, error: lookupError } = await adminClient.from("vehicles").select("id").eq("plate_code", fleetCode).maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (existing) return NextResponse.json({ id: existing.id });

  const { data: created, error: createError } = await adminClient.from("vehicles").insert({ plate_code: fleetCode, vehicle_type: "CAVALO_MECANICO", is_active: true }).select("id").single();
  if (createError?.code === "23505") {
    const { data: raced } = await adminClient.from("vehicles").select("id").eq("plate_code", fleetCode).single();
    if (raced) return NextResponse.json({ id: raced.id });
  }
  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
  return NextResponse.json({ id: created.id });
}
