import { NextRequest } from "next/server";
import { noStoreJson as json, readAuthenticatedJson } from "@/lib/api/authenticated-json";
import {
  INVALID_LOCATION_MESSAGE,
  isValidLocationName,
  normalizeLocationName,
} from "@/lib/locations/location-name";

export async function POST(request: NextRequest) {
  const parsed = await readAuthenticatedJson(request);
  if (!parsed.ok) return parsed.response;
  const { body, adminClient } = parsed;
  if (body.name !== undefined && typeof body.name !== "string") {
    return json({ error: "Nome de destino inválido." }, 400);
  }
  const name = normalizeLocationName(body.name || "");
  if (!name) return json({ id: null });
  if (!isValidLocationName(name)) return json({ error: INVALID_LOCATION_MESSAGE }, 400);

  const { data: existing, error: lookupError } = await adminClient
    .from("locations")
    .select("id,is_active")
    .ilike("name", name)
    .maybeSingle();
  if (lookupError) {
    console.error("Falha ao consultar destino:", lookupError.code);
    return json({ error: "Não foi possível consultar o destino." }, 500);
  }
  if (existing) {
    if (!existing.is_active) {
      const { error: reactivateError } = await adminClient
        .from("locations")
        .update({ is_active: true })
        .eq("id", existing.id);
      if (reactivateError) {
        console.error("Falha ao reativar destino:", reactivateError.code);
        return json({ error: "Não foi possível reativar o destino." }, 500);
      }
    }
    return json({ id: existing.id });
  }

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
    if (concurrent) return json({ id: concurrent.id });
    console.error("Falha ao registrar destino:", createError.code);
    return json({ error: "Não foi possível registrar o destino." }, 500);
  }
  return json({ id: created.id });
}
