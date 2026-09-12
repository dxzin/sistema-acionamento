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

  const body = await request.json() as { name?: string };
  const name = (body.name || "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, 100);
  if (!name) return NextResponse.json({ id: null });

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: existing, error: lookupError } = await adminClient
    .from("locations")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (existing) return NextResponse.json({ id: existing.id });

  const { data: created, error: createError } = await adminClient
    .from("locations")
    .insert({ name, is_active: true })
    .select("id")
    .single();
  if (createError) {
    // Outra linha da mesma colagem pode ter criado este destino entre a busca
    // e o insert. Nesse caso, reutiliza o registro que acabou de ser criado.
    const { data: concurrent } = await adminClient
      .from("locations")
      .select("id")
      .ilike("name", name)
      .maybeSingle();
    if (concurrent) return NextResponse.json({ id: concurrent.id });
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }
  return NextResponse.json({ id: created.id });
}
