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

test("ponte anterior reutiliza o último fim com local sem exigir atualização", () => {
  const restart = macro("REINICIO DE VIAGEM", "2026-09-28 01:10:00", "ABC1D23");
  const finish = {
    ...macro("FIM DE JORNADA", "2026-09-28 09:05:00", null),
    point: "BELLO PARKING",
    city: "Uberaba",
    state: "MG",
  };
  const legacyResult: SighraResult = { macros: [restart, start], last_end: finish };
  const legacyRecord = { ...record, plannedEndLocation: "UBERABA" };
  const resultPreview = buildJourneyPreview(
    legacyRecord,
    resolveJourneyForRecord(journeyEventsFromResult(legacyResult), legacyRecord)
  );

  assert.equal(resultPreview.resolution.status, "safe");
  assert.deepEqual(resultPreview.changes, {
    entry_time: "00:55:00",
    exit_time: "09:05:00",
    fleet_code: "ABC1D23",
  });
  assert.deepEqual(resultPreview.endLocationComparison, {
    status: "matched",
    expected: "UBERABA",
    actual: "BELLO PARKING · Uberaba / MG",
  });
});

test("lote da ponte anterior usa o primeiro início quando há GA e padrão", () => {
  const firstGa = macro("INICIO DE JORNADA GA", "2026-09-28 00:55:36", null);
  const waiting = macro("AGUARDANDO FROTA", "2026-09-28 00:55:48", null);
  const standard = macro("INICIO DE JORNADA", "2026-09-28 05:40:00", null);
  const finish = macro("FIM DE JORNADA", "2026-09-28 09:05:00", null);
  const resultPreview = preview({
    macros: [finish, standard, waiting, firstGa],
    last_end: finish,
  });

  assert.equal(resultPreview.resolution.status, "safe");
  if (resultPreview.resolution.status === "safe") {
    assert.equal(resultPreview.resolution.pair.start.occurredAt, "2026-09-28T00:55:36");
  }
  assert.deepEqual(resultPreview.changes, { entry_time: "00:55:00", exit_time: "09:05:00" });
});
