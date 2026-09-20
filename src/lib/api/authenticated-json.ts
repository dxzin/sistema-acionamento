import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const MAX_BODY_BYTES = 2_048;

export function noStoreJson(payload: object, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

type AuthenticatedJson =
  | { ok: true; body: Record<string, unknown>; adminClient: SupabaseClient }
  | { ok: false; response: NextResponse };

export async function readAuthenticatedJson(request: NextRequest): Promise<AuthenticatedJson> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];

  if (!url || !anonKey || !serviceKey || !token) {
    return { ok: false, response: noStoreJson({ error: "Configuração ou sessão ausente." }, 401) };
  }

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) {
    return { ok: false, response: noStoreJson({ error: "Sessão inválida." }, 401) };
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: noStoreJson({ error: "Conteúdo JSON obrigatório." }, 415) };
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: noStoreJson({ error: "Requisição excede o limite permitido." }, 413) };
  }

  try {
    const body = JSON.parse(rawBody) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_BODY");
    return {
      ok: true,
      body: body as Record<string, unknown>,
      adminClient: createClient(url, serviceKey, { auth: { persistSession: false } }),
    };
  } catch {
    return { ok: false, response: noStoreJson({ error: "JSON inválido." }, 400) };
  }
}
