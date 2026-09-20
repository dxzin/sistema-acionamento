import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { validDashboardToken } from "@/lib/api/schedule-dashboard";
import { localBridgeTestEnabled, localBridgeToken } from "./local-bridge";
export function json(body: object, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie, Authorization" } }); }
export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Serviço não configurado.");
  return createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function sessionDb() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  return { db, user: error ? null : user };
}
export function bridgeAuth(request: Request) {
  const secret = localBridgeTestEnabled() ? localBridgeToken() : process.env.SIGHRA_BRIDGE_TOKEN;
  return Boolean(secret && secret.length >= 32 && validDashboardToken(request.headers.get("authorization"), secret));
}
export function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
