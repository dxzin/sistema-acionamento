import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { validDashboardToken } from "@/lib/api/schedule-dashboard";
import { localBridgeTestEnabled, localBridgeToken } from "./local-bridge";
export type SighraBridgeId = "empresa" | "notebook";
export type SighraBridgeAccess = {
  identity: SighraBridgeId | "local" | null;
  activeBridge: SighraBridgeId | "local";
  active: boolean;
};
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
export function defaultActiveBridgeId(): SighraBridgeId {
  return process.env.SIGHRA_ACTIVE_BRIDGE === "notebook" ? "notebook" : "empresa";
}
export async function activeBridgeId(): Promise<SighraBridgeId> {
  const { data, error } = await adminDb().from("sighra_bridge_config").select("active_bridge").eq("id", "active").maybeSingle();
  if (error) throw error;
  return data?.active_bridge === "notebook" || data?.active_bridge === "empresa"
    ? data.active_bridge
    : defaultActiveBridgeId();
}
export function bridgeIdentity(request: Request): SighraBridgeId | "local" | null {
  const authorization = request.headers.get("authorization");
  if (localBridgeTestEnabled()) {
    const secret = localBridgeToken();
    return secret && validDashboardToken(authorization, secret) ? "local" : null;
  }
  const notebookToken = process.env.SIGHRA_NOTEBOOK_BRIDGE_TOKEN;
  if (notebookToken && notebookToken.length >= 32 && validDashboardToken(authorization, notebookToken)) return "notebook";
  const companyToken = process.env.SIGHRA_BRIDGE_TOKEN;
  if (companyToken && companyToken.length >= 32 && validDashboardToken(authorization, companyToken)) return "empresa";
  return null;
}
export function bridgeIsActive(identity: SighraBridgeId | "local" | null, activeBridge: SighraBridgeId | "local") {
  return identity !== null && identity === activeBridge;
}
export async function bridgeAccess(request: Request): Promise<SighraBridgeAccess> {
  const identity = bridgeIdentity(request);
  if (localBridgeTestEnabled()) {
    return { identity, activeBridge: "local", active: bridgeIsActive(identity, "local") };
  }
  if (!identity || identity === "local") {
    return { identity: null, activeBridge: defaultActiveBridgeId(), active: false };
  }
  const activeBridge = await activeBridgeId();
  return { identity, activeBridge, active: bridgeIsActive(identity, activeBridge) };
}
export async function bridgeAuth(request: Request) {
  return (await bridgeAccess(request)).active;
}
export function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
