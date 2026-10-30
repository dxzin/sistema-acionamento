import assert from "node:assert/strict";
import test from "node:test";
import { mergeRealtimeDispatchUpdate } from "../src/lib/realtime/dispatch-update";
import type { Dispatch, Location } from "../src/types/database";
import type { DispatchRowModel } from "../src/types/domain";

const locations: Location[] = [
  { id: "origem", name: "Origem", is_active: true, created_at: "2026-01-01" },
  { id: "destino", name: "Destino", is_active: true, created_at: "2026-01-01" },
];

const current: DispatchRowModel = {
  id: "despacho", daily_sheet_id: "folha", driver_id: "condutor", dispatch_status: "PENDENTE",
  origin_location_id: "origem", origin_source: "BASE", destination_location_id: null,
  final_destination_location_id: null, vehicle_id: "veiculo", entry_time: null, exit_time: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", scale_day_status: "T",
  driver: { id: "condutor", name: "Ana", login_matricula: "1", base_id: "base", is_active: true,
    created_at: "2026-01-01", updated_at: "2026-01-01" },
  fleet_code: "ABC1D23", origin_location: locations[0], origin_name: "Origem",
};

test("Realtime atualiza a linha e recalcula campos derivados", () => {
  const incoming: Dispatch = { ...current, dispatch_status: "ACIONADO", destination_location_id: "destino",
    entry_time: "22:00:00", exit_time: "02:00:00", updated_at: "2026-01-02T00:00:00Z" };
  const result = mergeRealtimeDispatchUpdate(current, incoming, locations);
  assert.equal(result?.destination_name, "Destino");
  assert.equal(result?.formatted_worked_time, "04:00");
  assert.equal(result?.is_overnight, true);
  assert.equal(result?.scale_day_status, "T");
});

test("Realtime preserva origem automática calculada", () => {
  const incoming: Dispatch = { ...current, origin_location_id: null, origin_source: "SCHEDULE" };
  const result = mergeRealtimeDispatchUpdate(current, incoming, locations);
  assert.equal(result?.origin_location_id, "origem");
  assert.equal(result?.origin_name, "Origem");
});

test("mudança de catálogo usa recarga completa", () => {
  assert.equal(mergeRealtimeDispatchUpdate(current, { ...current, vehicle_id: "outro-veiculo" }, locations), null);
  assert.equal(mergeRealtimeDispatchUpdate(current, { ...current, destination_location_id: "local-novo" }, locations), null);
});
