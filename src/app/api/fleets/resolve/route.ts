import { NextRequest } from "next/server";
import { noStoreJson as json, readAuthenticatedJson } from "@/lib/api/authenticated-json";

export async function POST(request: NextRequest) {
  const parsed = await readAuthenticatedJson(request);
  if (!parsed.ok) return parsed.response;
  const { body, adminClient } = parsed;
  if (body.fleetCode !== undefined && typeof body.fleetCode !== "string") {
    return json({ error: "Código de frota inválido." }, 400);
  }
  const fleetCode = (body.fleetCode || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  if (!fleetCode) return json({ id: null });

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
