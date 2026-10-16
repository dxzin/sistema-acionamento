import assert from "node:assert/strict";
import test from "node:test";
import { journeyEventsFromResult } from "../src/lib/sighra/journey-provider";
import { buildJourneyPreview, resolveJourneyForRecord, type JourneyRecordSnapshot } from "../src/lib/sighra/journey";
import type { SighraMacro, SighraResult } from "../src/lib/sighra/queries";

const record: JourneyRecordSnapshot = {
  recordId: "row", login: "45864", driverName: "Condutor", operationalDate: "2026-09-28",
  shift: "00:00:00", status: "ACIONADO", entryTime: null, exitTime: null,
  fleetCode: null, plannedEndLocation: null, updatedAt: "2026-09-28T01:00:00Z",
};

function macro(name: string, gps_at: string, plate: string | null): SighraMacro {
  return { id: `${name}:${gps_at}`, login: "45864", name, gps_at, inserted_at: gps_at, vehicle: "220842", plate };
}

const start = macro("INICIO DE JORNADA GA", "2026-09-28 00:55:36", "MLT-1234");
const oldRestart = macro("REINICIO DE VIAGEM", "2026-09-25 17:01:02", "SJE-7G26");

function preview(result: SighraResult) {
  return buildJourneyPreview(record, resolveJourneyForRecord(journeyEventsFromResult(result), record));
}

test("ponte atual usa as últimas dez macros quando o início também está na janela", () => {
  const first = macro("REINICIO DE VIAGEM", "2026-09-28 01:05:00", null);
  const second = macro("REINICIO DE VIAGEM", "2026-09-28 01:10:00", "ABC1D23");
  const result = { macros: [second, first, start, oldRestart], last_end: null, journey_events: [start] };
  assert.deepEqual(preview(result).changes, { entry_time: "00:55:00", fleet_code: "ABC1D23" });
});

test("reinício anterior ao início da imagem não fornece placa à nova jornada", () => {
  const result = { macros: [start, oldRestart], last_end: null, journey_events: [start] };
  assert.deepEqual(preview(result).changes, { entry_time: "00:55:00" });
});

test("se o início saiu das últimas dez, não presume que um reinício visível é o primeiro", () => {
  const laterRestart = macro("REINICIO DE VIAGEM", "2026-09-28 02:10:00", "ABC1D23");
  const result = { macros: [laterRestart], last_end: null, journey_events: [start] };
  assert.deepEqual(preview(result).changes, { entry_time: "00:55:00" });
  assert.deepEqual(preview({ ...result, restart_events: [laterRestart] }).changes, { entry_time: "00:55:00", fleet_code: "ABC1D23" });
});
